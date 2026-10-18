import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { create } from 'zustand';
import type { Command } from '../commands';
import { createDemoDoc } from '../data/demo';
import { loadAutosave, saveAutosave } from './persist';
import type { CaseDoc } from '../types';

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

const MAX_HISTORY = 200;

/** 撤销栈基于 immer patches，必须先启用插件（漏掉会在第一次命令时抛错）。 */
enablePatches();

interface DocStore {
  doc: CaseDoc;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dispatch: (command: Command) => void;
  undo: () => void;
  redo: () => void;
}

function initialDoc(): CaseDoc {
  const saved = loadAutosave();
  if (saved) return saved;
  // 验收脚本用 ?demo-image=1 打开带自由图片节点的演示文档（正常启动不带）
  const withImage =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo-image');
  return createDemoDoc(withImage);
}

export const useDocStore = create<DocStore>((set, get) => ({
  doc: initialDoc(),
  past: [],
  future: [],

  dispatch: (command) => {
    const { doc, past } = get();
    const [next, patches, inverse] = produceWithPatches(doc, (draft) => {
      command.apply(draft as Draft<CaseDoc>);
    });
    if (patches.length === 0) return;
    const entry: HistoryEntry = { label: command.label, patches, inverse };
    set({ doc: next, past: [...past, entry].slice(-MAX_HISTORY), future: [] });
    saveAutosave(next);
  },

  undo: () => {
    const { doc, past, future } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    const next = applyPatches(doc, entry.inverse);
    set({ doc: next, past: past.slice(0, -1), future: [entry, ...future] });
    saveAutosave(next);
  },

  redo: () => {
    const { doc, past, future } = get();
    const entry = future[0];
    if (!entry) return;
    const next = applyPatches(doc, entry.patches);
    set({ doc: next, past: [...past, entry], future: future.slice(1) });
    saveAutosave(next);
  },
}));

export const useDoc = () => useDocStore((s) => s.doc);
export const useCanUndo = () => useDocStore((s) => s.past.length > 0);
export const useCanRedo = () => useDocStore((s) => s.future.length > 0);
