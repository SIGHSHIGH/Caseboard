import { create } from 'zustand';
import { EMPTY_FILTER, type FilterMode, type FocusState, type ViewFilter } from '../lib/filter';
import type { NodeType, Status } from '../types';

/**
 * 分析视图状态（M5-2）：过滤条件 + 聚焦集合。
 * 只存「用户意图」，命中结果由 src/lib/filter.ts 每次从文档现算，
 * 因此撤销 / 导入 / 代码视图改模型后过滤结果会自动跟着更新。
 */
interface ViewStore {
  filter: ViewFilter;
  focus: FocusState | null;
  setFilter: (patch: Partial<ViewFilter>) => void;
  setMode: (mode: FilterMode) => void;
  toggleNodeType: (type: NodeType) => void;
  toggleStatus: (status: Status) => void;
  toggleTag: (tag: string) => void;
  toggleRelType: (relType: string) => void;
  resetFilter: () => void;
  setFocus: (seeds: string[], depth?: number) => void;
  setFocusDepth: (depth: number) => void;
  clearFocus: () => void;
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export const useViewStore = create<ViewStore>((set) => ({
  filter: { ...EMPTY_FILTER },
  focus: null,
  setFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  setMode: (mode) => set((state) => ({ filter: { ...state.filter, mode } })),
  toggleNodeType: (type) => set((state) => ({ filter: { ...state.filter, nodeTypes: toggleIn(state.filter.nodeTypes, type) } })),
  toggleStatus: (status) => set((state) => ({ filter: { ...state.filter, statuses: toggleIn(state.filter.statuses, status) } })),
  toggleTag: (tag) => set((state) => ({ filter: { ...state.filter, tags: toggleIn(state.filter.tags, tag) } })),
  toggleRelType: (relType) => set((state) => ({ filter: { ...state.filter, relTypes: toggleIn(state.filter.relTypes, relType) } })),
  resetFilter: () => set({ filter: { ...EMPTY_FILTER } }),
  setFocus: (seeds, depth = 1) => set({ focus: { seeds: seeds.filter((id, index) => seeds.indexOf(id) === index), depth } }),
  setFocusDepth: (depth) => set((state) => (state.focus ? { focus: { ...state.focus, depth } } : {})),
  clearFocus: () => set({ focus: null }),
}));
