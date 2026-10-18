import { create } from 'zustand';
import type { AlignGuide } from '../lib/imageNode';
import type { XY } from '../types';

export type CanvasMode = 'select' | 'lasso';
/** 左栏三个标签：对象类型 / 素材库 / 分组 */
export type LeftTab = 'nodes' | 'assets' | 'groups';

interface UiStore {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  selectedAssetId: string | null;
  selectedImageId: string | null;
  /** 多选自由图片：Shift 点选累加，整体拖动/对齐都作用在这组上 */
  selectedImageIds: string[];
  /** 拖动图片时命中的对齐参考线（不进 doc，松手即清空） */
  guides: AlignGuide[];
  /** 正在被拖到卡片上的图片所指向的目标节点，用于高亮吸附 */
  attachTargetId: string | null;
  setGuides: (guides: AlignGuide[]) => void;
  setAttachTarget: (id: string | null) => void;
  selectImage: (id: string | null, additive?: boolean) => void;
  /** 拖拽中的临时位置：不进 doc，松手才落 MoveNode 命令，避免污染撤销栈 */
  dragPos: Record<string, XY>;
  /** 左栏点类型按钮后置位，由 Board 换算成画布坐标后消费 */
  addRequest: string | null;
  /** 左栏「新建矩形组 / 圈选成组」请求，由 Board 消费（需要视口信息） */
  groupRequest: 'rect' | 'lasso' | null;
  /** 画布交互模式：默认选择，圈选时临时进入 lasso */
  mode: CanvasMode;
  leftTab: LeftTab;
  setLeftTab: (tab: LeftTab) => void;
  requestAdd: (type: string) => void;
  consumeAdd: () => void;
  requestGroup: (kind: 'rect' | 'lasso') => void;
  consumeGroup: () => void;
  setMode: (mode: CanvasMode) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  selectAsset: (id: string | null) => void;
  clearSelection: () => void;
  setDragPos: (id: string, pos: XY | null) => void;
}

const NO_SELECTION = {
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedGroupId: null,
  selectedAssetId: null,
  selectedImageId: null,
  selectedImageIds: [] as string[],
} as const;

export const useUiStore = create<UiStore>((set) => ({
  ...NO_SELECTION,
  guides: [],
  attachTargetId: null,
  dragPos: {},
  addRequest: null,
  groupRequest: null,
  mode: 'select',
  leftTab: 'nodes',
  setLeftTab: (leftTab) => set({ leftTab }),
  setGuides: (guides) => set({ guides }),
  setAttachTarget: (attachTargetId) => set({ attachTargetId }),
  requestAdd: (type) => set({ addRequest: type }),
  consumeAdd: () => set({ addRequest: null }),
  requestGroup: (kind) => set({ groupRequest: kind }),
  consumeGroup: () => set({ groupRequest: null }),
  setMode: (mode) => set({ mode }),
  selectNode: (id) => set({ ...NO_SELECTION, selectedNodeId: id }),
  selectEdge: (id) => set({ ...NO_SELECTION, selectedEdgeId: id }),
  selectGroup: (id) => set({ ...NO_SELECTION, selectedGroupId: id }),
  selectAsset: (id) => set({ ...NO_SELECTION, selectedAssetId: id }),
  selectImage: (id, additive = false) =>
    set((state) => {
      if (id === null) return { ...NO_SELECTION, leftTab: state.leftTab };
      if (!additive) return { ...NO_SELECTION, selectedImageId: id, selectedImageIds: [id] };
      const exists = state.selectedImageIds.includes(id);
      const next = exists ? state.selectedImageIds.filter((item) => item !== id) : [...state.selectedImageIds, id];
      return {
        ...NO_SELECTION,
        selectedImageId: next.length > 0 ? next[next.length - 1] : null,
        selectedImageIds: next,
      };
    }),
  clearSelection: () => set({ ...NO_SELECTION }),
  setDragPos: (id, pos) =>
    set((state) => {
      const next = { ...state.dragPos };
      if (pos === null) delete next[id];
      else next[id] = pos;
      return { dragPos: next };
    }),
}));
