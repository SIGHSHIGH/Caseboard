import { create } from 'zustand';
import { applyDslChanges } from '../commands';
import { mergeDslEdit, type DocChange } from '../dsl/diff';
import { hasErrors, parseDsl, type DslDiagnostic } from '../dsl/parse';
import { serializeDoc } from '../dsl/serialize';
import type { CaseDoc } from '../types';
import { useDocStore } from './docStore';

/**
 * M3-4 同步状态机（docs/MILESTONES.md §3 M3）：
 * idle → 两侧一致；graphEditing → 图形变了、代码视图待刷新；
 * codeEditing → 代码正在改模型；conflict → 有字段冲突（保留画布值）；
 * error → 解析失败（模型不清空、图形只读 + 波浪线）。
 *
 * 所有代码 → 模型的写入都经 applyDslChanges（一条 Command、一次撤销），
 * 图形 → 代码永远重新序列化，绝不存在第二份数据（Gate 0-1）。
 */
export type CodeSyncState = 'idle' | 'graphEditing' | 'codeEditing' | 'conflict' | 'error';

interface CodeStore {
  /** 代码视图是否展开 */
  open: boolean;
  /** 代码视图当前文本（外部更新的唯一来源） */
  text: string;
  state: CodeSyncState;
  diagnostics: DslDiagnostic[];
  /** 最近一次合并中因图形侧已改而放弃的代码改动 */
  conflicts: DocChange[];
  /** 代码编辑中图形又变了 → 显示「图形有更新，点击合并」 */
  pendingGraph: boolean;
  /** 代码文本对应的文档快照（三方合并的 base） */
  baseline: CaseDoc | null;
  /** CodeMirror 是否聚焦（聚焦时不抢光标） */
  focused: boolean;
  setFocused: (focused: boolean) => void;
}

export const useCodeStore = create<CodeStore>((set, get) => ({
  open: false,
  text: '',
  state: 'idle',
  diagnostics: [],
  conflicts: [],
  pendingGraph: false,
  baseline: null,
  focused: false,
  setFocused: (focused) => {
    set({ focused });
    if (!focused && get().pendingGraph && get().state !== 'error') flushGraphToCode();
  },
}));

/** 代码 → 模型的 dispatch 期间置位，避免桥接层把这次变化当成「图形更新」再序列化回去。 */
let applyingCode = false;

export function isApplyingCode(): boolean {
  return applyingCode;
}

export function openCodeView(): void {
  const doc = useDocStore.getState().doc;
  if (useCodeStore.getState().open) return;
  const text = serializeDoc(doc);
  useCodeStore.setState({
    open: true,
    text,
    state: 'idle',
    diagnostics: parseDsl(text).diagnostics,
    conflicts: [],
    pendingGraph: false,
    baseline: doc,
  });
}

export function closeCodeView(): void {
  useCodeStore.setState({ open: false, focused: false });
}

/**
 * 代码视图文本变化：解析 → 有错就停在 error（不动模型）；没错就三方合并并落一条 Command。
 * 每次调用都会刷新 baseline，保证下一次 diff 只包含新增改动。
 */
export function syncCodeText(text: string): void {
  const before = useDocStore.getState().doc;
  const parsed = parseDsl(text);
  if (hasErrors(parsed.diagnostics)) {
    useCodeStore.setState({
      text,
      state: 'error',
      diagnostics: parsed.diagnostics,
      conflicts: [],
      pendingGraph: false,
    });
    return;
  }
  const baseline = useCodeStore.getState().baseline ?? before;
  const report = mergeDslEdit(baseline, parsed.doc, before);
  if (report.changes.length > 0) {
    applyingCode = true;
    try {
      useDocStore.getState().dispatch(applyDslChanges(report.changes));
    } finally {
      applyingCode = false;
    }
  }
  useCodeStore.setState({
    text,
    state: report.conflicts.length > 0 ? 'conflict' : 'codeEditing',
    diagnostics: parsed.diagnostics,
    conflicts: report.conflicts,
    pendingGraph: false,
    baseline: useDocStore.getState().doc,
  });
}

/** 图形 → 代码：重新序列化当前文档（200ms 防抖由桥接层负责）。 */
export function flushGraphToCode(): void {
  if (!useCodeStore.getState().open) return;
  const doc = useDocStore.getState().doc;
  const text = serializeDoc(doc);
  useCodeStore.setState({
    text,
    state: 'idle',
    diagnostics: parseDsl(text).diagnostics,
    conflicts: [],
    pendingGraph: false,
    baseline: doc,
  });
}

/** 桥接层在图形变化后调用：编辑中只亮提示，不抢光标。 */
export function noteGraphChange(): void {
  const state = useCodeStore.getState();
  if (!state.open) return;
  if (state.state === 'error') return;
  if (state.focused || state.state === 'codeEditing' || state.state === 'conflict') {
    useCodeStore.setState({ pendingGraph: true, state: 'graphEditing' });
    return;
  }
  flushGraphToCode();
}

/** 「图形有更新，点击合并」：显式把图形侧改动写回代码文本。 */
export function mergeGraphChanges(): void {
  if (useCodeStore.getState().state === 'error') return;
  flushGraphToCode();
}

/** 格式化：用当前模型重新序列化（等价于规范排版），不改模型、不占撤销栈。 */
export function formatCode(): boolean {
  const state = useCodeStore.getState();
  if (!state.open) return false;
  const parsed = parseDsl(state.text);
  if (hasErrors(parsed.diagnostics)) {
    useCodeStore.setState({ diagnostics: parsed.diagnostics, state: 'error' });
    return false;
  }
  const doc = useDocStore.getState().doc;
  useCodeStore.setState({
    text: serializeDoc(doc),
    state: 'idle',
    diagnostics: [],
    conflicts: [],
    pendingGraph: false,
    baseline: doc,
  });
  return true;
}
