import { useEffect, useRef } from 'react';
import {
  autocompletion,
  closeBrackets,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, syntaxTree } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { keywordHighlighter } from '../../dsl/highlight';
import { caseboardLanguageSupport } from '../../dsl/language';
import { declIdAtPosition, findDeclRange } from '../../dsl/locate';
import { parseDsl } from '../../dsl/parse';
import { dslNameTable } from '../../dsl/serialize';
import { NODE_TYPE_META, REL_PRESETS, STATUS_META } from '../../lib/theme';
import { formatCode, syncCodeText, useCodeStore } from '../../store/codeStore';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseDoc } from '../../types';

/**
 * M3-4 代码视图：CodeMirror 6 + 同一份 Lezer 语法。
 *
 * 光标 / 滚动保护（验收 5）：
 * - 图形 → 代码的刷新只替换「公共前后缀之间」的片段，选区由事务自动映射，不整份重建；
 * - 图形变化发生在用户编辑中时不抢光标，面板顶部亮「图形有更新，点击合并」。
 */
let externalEdit = false;

const setTargetEffect = StateEffect.define<{ from: number; to: number } | null>();

const targetField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setTargetEffect)) continue;
      next = effect.value
        ? Decoration.set([Decoration.mark({ class: 'cb-code-target' }).range(effect.value.from, effect.value.to)])
        : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', color: '#2B2B2B', backgroundColor: '#FBFAF7', fontSize: '13px' },
    '.cm-scroller': { fontFamily: '"Cascadia Mono", Consolas, "Microsoft YaHei", monospace', lineHeight: '1.65' },
    '.cm-content': { padding: '10px 0' },
    '.cm-gutters': { backgroundColor: '#F5F3EF', color: '#8C8578', border: 'none', borderRight: '1px solid #E2DED5' },
    '.cm-activeLine': { backgroundColor: 'rgba(192, 57, 43, 0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(192, 57, 43, 0.08)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(192, 57, 43, 0.16)' },
    '.cb-code-target': { backgroundColor: 'rgba(192, 57, 43, 0.10)', boxShadow: 'inset 2px 0 0 #C0392B' },
    '.cb-tok-keyword': { color: '#8C4A3C', fontWeight: '600' },
    '.cb-tok-keyword *': { color: '#8C4A3C', fontWeight: '600' },
    '.cm-tooltip': { border: '1px solid #E2DED5', backgroundColor: '#FFFFFF' },
    '.cm-panels': { backgroundColor: '#F5F3EF' },
  },
  { dark: false },
);

const dslLinter = linter(
  (view) => {
    const { diagnostics } = parseDsl(view.state.doc.toString());
    return diagnostics.map<Diagnostic>((item) => ({
      from: item.from,
      to: Math.max(item.to, item.from + 1),
      severity: item.severity,
      message: item.hint ? `${item.message} — ${item.hint}` : item.message,
    }));
  },
  { delay: 350 },
);

function infoDom(title: string, lines: string[]): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cb-code-hover';
  const head = document.createElement('div');
  head.className = 'cb-code-hover__title';
  head.textContent = title;
  dom.appendChild(head);
  for (const line of lines) {
    const item = document.createElement('div');
    item.className = 'cb-code-hover__line';
    item.textContent = line;
    dom.appendChild(item);
  }
  return dom;
}

function nodeInfo(doc: CaseDoc, id: string): { title: string; lines: string[] } | null {
  const node = doc.nodes.find((item) => item.id === id);
  if (node) {
    const meta = NODE_TYPE_META[node.type];
    return {
      title: node.title,
      lines: [
        `${meta.label} · ${STATUS_META[node.status].label} · 置信度 ${node.confidence}`,
        `id: ${node.id}${node.aliases && node.aliases.length > 0 ? ` · 别名 ${node.aliases.join('、')}` : ''}`,
        node.notes ? node.notes : '（没有备注）',
      ],
    };
  }
  const group = doc.groups.find((item) => item.id === id);
  if (group) return { title: group.title, lines: [`分组 · ${group.bounds.w}×${group.bounds.h}`, `id: ${group.id}`] };
  const edge = doc.edges.find((item) => item.id === id);
  if (edge) {
    const source = doc.nodes.find((item) => item.id === edge.source)?.title ?? edge.source;
    const target = doc.nodes.find((item) => item.id === edge.target)?.title ?? edge.target;
    return {
      title: edge.label ?? '关系',
      lines: [`${source} → ${target}`, `关系类型：${edge.relType} · 线型：${edge.style}`, `置信度 ${edge.confidence}`],
    };
  }
  const view = doc.views.find((item) => item.id === id);
  if (view) return { title: view.name, lines: [`视图 · ${view.kind}`, `id: ${view.id}`] };
  return null;
}

const dslHover = hoverTooltip((view, pos) => {
  const tree = syntaxTree(view.state);
  const inner = tree.resolveInner(pos, 1);
  const name = inner.name;
  if (name !== 'Ident' && name !== 'QuotedString') return null;
  const raw = view.state.doc.sliceString(inner.from, inner.to);
  let id = raw;
  if (name === 'QuotedString') {
    try {
      id = JSON.parse(raw) as string;
    } catch {
      id = raw.replace(/^"|"$/g, '');
    }
  } else {
    const reverse = dslNameTable(useDocStore.getState().doc).reverse;
    id = reverse.get(raw) ?? raw;
  }
  const info = nodeInfo(useDocStore.getState().doc, id);
  if (!info) return null;
  return { pos: inner.from, end: inner.to, above: true, create: () => ({ dom: infoDom(info.title, info.lines) }) };
});

const ENUM_OPTIONS: Record<string, Completion[]> = {
  status: (Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => ({
    label: key,
    type: 'enum',
    detail: STATUS_META[key].label,
  })),
  style: [
    { label: 'solid', type: 'enum', detail: '实线 · 已证实' },
    { label: 'dashed', type: 'enum', detail: '虚线 · 推测' },
    { label: 'dotted', type: 'enum', detail: '点线 · 待核实' },
  ],
  path: [
    { label: 'bezier', type: 'enum' },
    { label: 'straight', type: 'enum' },
    { label: 'step', type: 'enum' },
  ],
  rel: REL_PRESETS.map((preset) => ({ label: preset.value, type: 'enum', detail: preset.label })),
  kind: ['board', 'timeline', 'map', 'chain', 'presentation', 'scenario'].map((value) => ({
    label: value,
    type: 'enum',
  })),
};

const DECL_KEYWORDS = ['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note', 'group', 'view'];

function dslCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const word = /[\w\u4e00-\u9fa5]*$/.exec(before);
  if (!word) return null;
  const from = context.pos - word[0].length;
  const enumMatch = /(status|style|path|rel|kind)\s*:\s*"?[\w\u4e00-\u9fa5]*$/.exec(before);
  if (enumMatch) return { from, options: ENUM_OPTIONS[enumMatch[1]] ?? [], validFor: /^[\w\u4e00-\u9fa5]*$/ };

  const doc = useDocStore.getState().doc;
  const table = dslNameTable(doc);
  const names: Completion[] = [...table.reverse.keys()].map((value) => ({
    label: value,
    type: 'variable',
    detail: doc.nodes.some((node) => node.id === table.reverse.get(value)) ? '实体' : '分组',
  }));
  if (/nodes\s*:\s*\[[^\]]*$/.test(before) || /^\s*[\w\u4e00-\u9fa5]+\s+-?[\.-]/.test(before)) {
    return { from, options: names, validFor: /^[\w\u4e00-\u9fa5]*$/ };
  }
  if (/^\s*[\w\u4e00-\u9fa5]*$/.test(before)) {
    return {
      from,
      options: [...DECL_KEYWORDS.map((label) => ({ label, type: 'keyword' as const })), ...names],
      validFor: /^[\w\u4e00-\u9fa5]*$/,
    };
  }
  return null;
}

/** 只替换公共前后缀之间的部分：选区由事务映射，滚动位置手动还原。 */
function replacePreservingView(view: EditorView, next: string): void {
  const current = view.state.doc.toString();
  if (current === next) return;
  let start = 0;
  const minLength = Math.min(current.length, next.length);
  while (start < minLength && current[start] === next[start]) start += 1;
  let oldEnd = current.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && current[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const scrollTop = view.scrollDOM.scrollTop;
  const scrollLeft = view.scrollDOM.scrollLeft;
  externalEdit = true;
  try {
    view.dispatch({ changes: { from: start, to: oldEnd, insert: next.slice(start, newEnd) } });
  } finally {
    externalEdit = false;
  }
  view.scrollDOM.scrollTop = scrollTop;
  view.scrollDOM.scrollLeft = scrollLeft;
}

let lastFromCode: string | null = null;

export function CodeEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const text = useCodeStore((state) => state.text);
  const selectedNodeId = useUiStore((state) => state.selectedNodeId);
  const selectedEdgeId = useUiStore((state) => state.selectedEdgeId);
  const selectedGroupId = useUiStore((state) => state.selectedGroupId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({
      doc: useCodeStore.getState().text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        highlightActiveLine(),
        rectangularSelection(),
        crosshairCursor(),
        EditorView.lineWrapping,
        caseboardLanguageSupport,
        keywordHighlighter,
        targetField,
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [dslCompletions], activateOnTyping: true }),
        dslLinter,
        lintGutter(),
        dslHover,
        keymap.of([
          ...defaultKeymap,
          indentWithTab,
          {
            key: 'Mod-Shift-f',
            run: () => formatCode(),
          },
        ]),
        editorTheme,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && !externalEdit) syncCodeText(update.state.doc.toString());
          if (update.focusChanged) useCodeStore.getState().setFocused(update.view.hasFocus);
          if (update.selectionSet && update.view.hasFocus) {
            const doc = useDocStore.getState().doc;
            const found = declIdAtPosition(update.state.doc.toString(), doc, update.state.selection.main.head);
            if (!found) return;
            lastFromCode = found.id;
            const ui = useUiStore.getState();
            if (found.kind === 'node') ui.selectNode(found.id);
            else if (found.kind === 'edge') ui.selectEdge(found.id);
            else if (found.kind === 'group') ui.selectGroup(found.id);
            else return; // 视图没有画布位置，不做居中
            ui.focusEntity(found.id, found.kind);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    replacePreservingView(view, text);
  }, [text]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const targetId = selectedNodeId ?? selectedEdgeId ?? selectedGroupId;
    if (!targetId) {
      view.dispatch({ effects: setTargetEffect.of(null) });
      return;
    }
    if (targetId === lastFromCode) {
      lastFromCode = null;
      return;
    }
    const doc = useDocStore.getState().doc;
    const range = findDeclRange(view.state.doc.toString(), doc, targetId);
    if (!range) return;
    view.dispatch({
      selection: { anchor: range.nameFrom, head: range.nameTo },
      effects: [
        setTargetEffect.of({ from: range.from, to: range.to }),
        EditorView.scrollIntoView(range.from, { y: 'center' }),
      ],
    });
  }, [selectedNodeId, selectedEdgeId, selectedGroupId]);

  return <div className="cb-code__editor" ref={hostRef} />;
}
