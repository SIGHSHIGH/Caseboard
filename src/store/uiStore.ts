import { create } from 'zustand';
import type { XY } from '../types';

interface UiStore {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** 拖拽中的临时位置：不进 doc，松手才落 MoveNode 命令，避免污染撤销栈 */
  dragPos: Record<string, XY>;
  /** 左栏点类型按钮后置位，由 Board 换算成画布坐标后消费 */
  addRequest: string | null;
  requestAdd: (type: string) => void;
  consumeAdd: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;
  setDragPos: (id: string, pos: XY | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  dragPos: {},
  addRequest: null,
  requestAdd: (type) => set({ addRequest: type }),
  consumeAdd: () => set({ addRequest: null }),
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),
  setDragPos: (id, pos) =>
    set((state) => {
      const next = { ...state.dragPos };
      if (pos === null) delete next[id];
      else next[id] = pos;
      return { dragPos: next };
    }),
}));
