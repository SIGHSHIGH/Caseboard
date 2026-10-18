import { create } from 'zustand';
import type { XY } from '../types';

export type CanvasMode = 'select' | 'lasso';

interface UiStore {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  /** 拖拽中的临时位置：不进 doc，松手才落 MoveNode 命令，避免污染撤销栈 */
  dragPos: Record<string, XY>;
  /** 左栏点类型按钮后置位，由 Board 换算成画布坐标后消费 */
  addRequest: string | null;
  /** 左栏「新建矩形组 / 圈选成组」请求，由 Board 消费（需要视口信息） */
  groupRequest: 'rect' | 'lasso' | null;
  /** 画布交互模式：默认选择，圈选时临时进入 lasso */
  mode: CanvasMode;
  requestAdd: (type: string) => void;
  consumeAdd: () => void;
  requestGroup: (kind: 'rect' | 'lasso') => void;
  consumeGroup: () => void;
  setMode: (mode: CanvasMode) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  clearSelection: () => void;
  setDragPos: (id: string, pos: XY | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedGroupId: null,
  dragPos: {},
  addRequest: null,
  groupRequest: null,
  mode: 'select',
  requestAdd: (type) => set({ addRequest: type }),
  consumeAdd: () => set({ addRequest: null }),
  requestGroup: (kind) => set({ groupRequest: kind }),
  consumeGroup: () => set({ groupRequest: null }),
  setMode: (mode) => set({ mode }),
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null, selectedGroupId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null, selectedGroupId: null }),
  selectGroup: (id) => set({ selectedGroupId: id, selectedNodeId: null, selectedEdgeId: null }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null, selectedGroupId: null }),
  setDragPos: (id, pos) =>
    set((state) => {
      const next = { ...state.dragPos };
      if (pos === null) delete next[id];
      else next[id] = pos;
      return { dragPos: next };
    }),
}));
