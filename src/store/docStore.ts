import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { create } from 'zustand';
import { deleteEdge, deleteNode, type Command } from '../commands';
import { createDemoDoc } from '../data/demo';
import { loadAutosave } from './persist';
import { createSnapshot, listSnapshotsInStorage, loadDocFromStorage, pushTrashToStorage, saveDocToStorage } from '../services/storage';
import type { CaseDoc } from '../types';
import type { TrashItem } from '../services/db/repo';

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

const MAX_HISTORY = 200;
/** 编辑后延迟多久落库：连续拖动/改名只写一次，避免每次按键都开事务。 */
const SAVE_DEBOUNCE_MS = 400;
/** 自动版本快照的最小间隔（与 repo.ts 的 SNAPSHOT_INTERVAL_MS 保持一致）。 */
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000;
/** 上次写快照的时间戳；启动时为 0，第一次落库就会补一份。 */
let lastSnapshotAt = 0;

/** 撤销栈基于 immer patches，必须先启用插件（漏掉会在第一次命令时抛错）。 */
enablePatches();

export type StorageBackend = 'sqlite' | 'local';

interface DocStore {
  doc: CaseDoc;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** 是否已完成启动水合（M4：SQLite 读盘是异步的） */
  ready: boolean;
  backend: StorageBackend;
  lastSavedAt: string | null;
  dispatch: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  /** 用外部文档替换当前文档并清空历史（打开文件 / 启动水合） */
  hydrate: (doc: CaseDoc) => void;
  flush: () => Promise<void>;
  /**
   * 删除节点 / 关系，并把删掉的东西写进回收站（桌面端 SQLite）。
   * 删除本身仍然是普通命令，所以撤销栈照常工作；回收站是「撤销栈溢出之后」的第二道保险。
   */
  removeWithTrash: (kind: 'node' | 'edge', ids: string[]) => void;
}

function initialDoc(): CaseDoc {
  const saved = loadAutosave();
  if (saved) return saved;
  // 验收脚本用 ?demo-image=1 打开带自由图片节点的演示文档（正常启动不带）
  const withImage =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo-image');
  return createDemoDoc(withImage);
}

let pendingDoc: CaseDoc | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(doc: CaseDoc): void {
  pendingDoc = doc;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPending();
  }, SAVE_DEBOUNCE_MS);
}

async function flushPending(): Promise<void> {
  if (!pendingDoc) return;
  const doc = pendingDoc;
  pendingDoc = null;
  try {
    const result = await saveDocToStorage(doc);
    useDocStore.setState({ lastSavedAt: result.savedAt });
    void maybeSnapshot(doc, result.backend);
  } catch (error) {
    // 落库失败不阻断编辑，但留下可诊断的痕迹
    console.error('[caseboard] 保存失败', error);
  }
}

/**
 * 自动版本快照（M4 人工验收 A6 修复）：桌面端每 5 分钟最多一份，
 * 保证「历史」面板即便用户从没点过「立即快照」也有可恢复的节点。
 */
async function maybeSnapshot(doc: CaseDoc, backend: StorageBackend): Promise<void> {
  if (backend !== 'sqlite') return;
  const now = Date.now();
  if (now - lastSnapshotAt < AUTO_SNAPSHOT_MS) return;
  lastSnapshotAt = now;
  try {
    await createSnapshot(doc, '自动快照');
  } catch (error) {
    // 快照只是保险，失败不能影响正在进行的编辑
    console.error('[caseboard] 自动快照失败', error);
  }
}

export const useDocStore = create<DocStore>((set, get) => ({
  doc: initialDoc(),
  past: [],
  future: [],
  ready: false,
  backend: 'local',
  lastSavedAt: null,

  dispatch: (command) => {
    const { doc, past } = get();
    const [next, patches, inverse] = produceWithPatches(doc, (draft) => {
      command.apply(draft as Draft<CaseDoc>);
    });
    if (patches.length === 0) return;
    const entry: HistoryEntry = { label: command.label, patches, inverse };
    set({ doc: next, past: [...past, entry].slice(-MAX_HISTORY), future: [] });
    scheduleSave(next);
  },

  undo: () => {
    const { doc, past, future } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    const next = applyPatches(doc, entry.inverse);
    set({ doc: next, past: past.slice(0, -1), future: [entry, ...future] });
    scheduleSave(next);
  },

  redo: () => {
    const { doc, past, future } = get();
    const entry = future[0];
    if (!entry) return;
    const next = applyPatches(doc, entry.patches);
    set({ doc: next, past: [...past, entry], future: future.slice(1) });
    scheduleSave(next);
  },

  hydrate: (doc) => {
    pendingDoc = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ doc, past: [], future: [], ready: true });
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await flushPending();
  },

  removeWithTrash: (kind, ids) => {
    const state = get();
    const caseId = state.doc.meta.id;
    const items: TrashItem[] = [];
    for (const id of ids) {
      if (kind === 'node') {
        const node = state.doc.nodes.find((n) => n.id === id);
        if (!node) continue;
        items.push({ kind: 'node', entityId: node.id, label: node.title, payload: node });
        // deleteNode 会连带删掉挂在它身上的边，这些边也一起进回收站，恢复节点后再恢复边即可
        for (const edge of state.doc.edges) {
          if (edge.source !== node.id && edge.target !== node.id) continue;
          items.push({ kind: 'edge', entityId: edge.id, label: edgeLabelText(edge), payload: edge });
        }
        state.dispatch(deleteNode(node.id));
      } else {
        const edge = state.doc.edges.find((e) => e.id === id);
        if (!edge) continue;
        items.push({ kind: 'edge', entityId: edge.id, label: edgeLabelText(edge), payload: edge });
        state.dispatch(deleteEdge(edge.id));
      }
    }
    if (items.length > 0) {
      // 回收站写入失败不影响删除本身，留下可诊断的日志
      void pushTrashToStorage(caseId, items).catch((error: unknown) => {
        console.error('[caseboard] 写入回收站失败', error);
      });
    }
  },
}));

function edgeLabelText(edge: CaseDoc['edges'][number]): string {
  return edge.label ?? edge.relType;
}

/**
 * 启动水合：Tauri 里从 SQLite 读回最近案件；网页里 localStorage 已由 initialDoc 处理。
 * 失败时保持演示数据可用，并把 ready 置真，避免界面永久停在加载态。
 */
export async function bootstrapDoc(): Promise<StorageBackend> {
  const { doc, backend } = await loadDocFromStorage();
  const state = useDocStore.getState();
  if (doc) state.hydrate(doc);
  else useDocStore.setState({ ready: true });
  useDocStore.setState({ backend });
  if (backend === 'sqlite') {
    // 首次启动（或历史被清空）时补一份启动快照，历史面板不再显示 0 份
    try {
      const caseId = useDocStore.getState().doc.meta.id;
      const existing = await listSnapshotsInStorage(caseId);
      if (existing.length === 0) await createSnapshot(useDocStore.getState().doc, '启动快照');
    } catch (error) {
      console.error('[caseboard] 启动快照失败', error);
    }
  }
  return backend;
}

export const useDoc = () => useDocStore((s) => s.doc);
export const useCanUndo = () => useDocStore((s) => s.past.length > 0);
export const useCanRedo = () => useDocStore((s) => s.future.length > 0);
export const useReady = () => useDocStore((s) => s.ready);
export const useBackend = () => useDocStore((s) => s.backend);
export const useLastSavedAt = () => useDocStore((s) => s.lastSavedAt);
