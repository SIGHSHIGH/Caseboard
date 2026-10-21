import { create } from 'zustand';
import type { AlignGuide } from '../lib/imageNode';
import type { XY } from '../types';

export type CanvasMode = 'select' | 'lasso';
/** 左栏四个标签：对象类型 / 素材库 / 分组 / 分析（M5-2 过滤与聚焦） */
export type LeftTab = 'nodes' | 'assets' | 'groups' | 'analysis';

interface UiStore {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  selectedAssetId: string | null;
  selectedImageId: string | null;
  /** 多选自由图片：Shift 点选累加，整体拖动/对齐都作用在这组上 */
  selectedImageIds: string[];
  /** 多选实体卡片（框选 / Ctrl 点选）：selectedNodeId 是其中的主选中项，供右栏显示 */
  selectedNodeIds: string[];
  /** 拖动图片时命中的对齐参考线（不进 doc，松手即清空） */
  guides: AlignGuide[];
  /** 正在被拖到卡片上的图片所指向的目标节点，用于高亮吸附 */
  attachTargetId: string | null;
  /** 悬停的实体：用于高亮它在图片里的区域锚点（M7-2） */
  hoverNodeId: string | null;
  /** 从右栏「关联图片区域」跳转到素材库时要聚焦的框 */
  anchorFocus: { assetId: string; annotationId: string } | null;
  setHoverNode: (id: string | null) => void;
  setAnchorFocus: (focus: { assetId: string; annotationId: string } | null) => void;
  setGuides: (guides: AlignGuide[]) => void;
  setAttachTarget: (id: string | null) => void;
  selectImage: (id: string | null, additive?: boolean) => void;
  /** 拖拽中的临时位置：不进 doc，松手才落 MoveNode 命令，避免污染撤销栈 */
  dragPos: Record<string, XY>;
  /** 左栏点类型按钮后置位，由 Board 换算成画布坐标后消费 */
  addRequest: string | null;
  /** 代码视图选中实体 → 请求画布把它滚动到视野中心（nonce 保证重复点同一对象也能触发） */
  focusRequest: { id: string; kind: 'node' | 'edge' | 'group'; nonce: number } | null;
  /** 左栏「新建矩形组 / 圈选成组」请求，由 Board 消费（需要视口信息） */
  groupRequest: 'rect' | 'lasso' | null;
  /** A5：双击画布空白 → 记住世界坐标并弹出「新建节点」对话框（选类型 + 标题） */
  newNodeAt: XY | null;
  /** 画布交互模式：默认选择，圈选时临时进入 lasso */
  mode: CanvasMode;
  leftTab: LeftTab;
  setLeftTab: (tab: LeftTab) => void;
  requestAdd: (type: string) => void;
  focusEntity: (id: string, kind: 'node' | 'edge' | 'group') => void;
  consumeAdd: () => void;
  requestGroup: (kind: 'rect' | 'lasso') => void;
  consumeGroup: () => void;
  requestNewNode: (at: XY) => void;
  consumeNewNode: () => void;
  setMode: (mode: CanvasMode) => void;
  selectNode: (id: string | null) => void;
  /** 框选 / 多选统一入口：一次写入整组实体 id */
  setNodeSelection: (ids: string[]) => void;
  /** 框选带来的图片选中变化（不改动实体选中） */
  applyImageSelection: (id: string, selected: boolean) => void;
  selectEdge: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  selectAsset: (id: string | null) => void;
  clearSelection: () => void;
  setDragPos: (id: string, pos: XY | null) => void;
  /**
   * 素材库 → 画布的触屏拖拽（H5）。HTML5 拖放不会由手指触发（Chromium 只从鼠标事件
   * 起 dragstart），所以触屏下改走「长按起拖 + 跟手缩略图影 + 松手落点」，
   * 拖影位置是客户端坐标（clientX/clientY），不进 doc。
   */
  assetDrag: { assetId: string; x: number; y: number } | null;
  /** 松手落点请求：nonce 保证同一素材连续拖两次都能被 Board 各自消费 */
  assetDrop: { assetId: string; clientX: number; clientY: number; nonce: number } | null;
  startAssetDrag: (assetId: string, x: number, y: number) => void;
  moveAssetDrag: (x: number, y: number) => void;
  endAssetDrag: (clientX: number, clientY: number) => void;
  cancelAssetDrag: () => void;
  consumeAssetDrop: () => void;
}

const NO_SELECTION = {
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedGroupId: null,
  selectedAssetId: null,
  selectedImageId: null,
  selectedImageIds: [] as string[],
  selectedNodeIds: [] as string[],
} as const;

export const useUiStore = create<UiStore>((set) => ({
  ...NO_SELECTION,
  guides: [],
  attachTargetId: null,
  hoverNodeId: null,
  anchorFocus: null,
  dragPos: {},
  addRequest: null,
  focusRequest: null,
  groupRequest: null,
  newNodeAt: null,
  mode: 'select',
  leftTab: 'nodes',
  setLeftTab: (leftTab) => set({ leftTab }),
  setGuides: (guides) => set({ guides }),
  setAttachTarget: (attachTargetId) => set({ attachTargetId }),
  setHoverNode: (hoverNodeId) => set({ hoverNodeId }),
  setAnchorFocus: (anchorFocus) => set({ anchorFocus }),
  requestAdd: (type) => set({ addRequest: type }),
  focusEntity: (id, kind) => set((state) => ({ focusRequest: { id, kind, nonce: (state.focusRequest?.nonce ?? 0) + 1 } })),
  consumeAdd: () => set({ addRequest: null }),
  requestGroup: (kind) => set({ groupRequest: kind }),
  consumeGroup: () => set({ groupRequest: null }),
  requestNewNode: (at) => set({ newNodeAt: at }),
  consumeNewNode: () => set({ newNodeAt: null }),
  setMode: (mode) => set({ mode }),
  selectNode: (id) => set({ ...NO_SELECTION, selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),
  setNodeSelection: (ids) =>
    set((state) => {
      const next = ids.filter((id, index) => ids.indexOf(id) === index);
      const primary = next.length === 0 ? null : next.includes(state.selectedNodeId ?? '') ? state.selectedNodeId : next[next.length - 1];
      return { ...NO_SELECTION, selectedNodeId: primary, selectedNodeIds: next };
    }),
  applyImageSelection: (id, selected) =>
    set((state) => {
      const exists = state.selectedImageIds.includes(id);
      if (selected === exists) return {};
      const next = selected
        ? [...state.selectedImageIds, id]
        : state.selectedImageIds.filter((item) => item !== id);
      return { selectedImageIds: next, selectedImageId: next.length > 0 ? next[next.length - 1] : null };
    }),
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
  assetDrag: null,
  assetDrop: null,
  startAssetDrag: (assetId, x, y) => set({ assetDrag: { assetId, x, y } }),
  moveAssetDrag: (x, y) => set((state) => (state.assetDrag ? { assetDrag: { ...state.assetDrag, x, y } } : {})),
  endAssetDrag: (clientX, clientY) =>
    set((state) => {
      if (!state.assetDrag) return {};
      return {
        assetDrag: null,
        assetDrop: {
          assetId: state.assetDrag.assetId,
          clientX,
          clientY,
          nonce: (state.assetDrop?.nonce ?? 0) + 1,
        },
      };
    }),
  cancelAssetDrag: () => set({ assetDrag: null }),
  consumeAssetDrop: () => set({ assetDrop: null }),
}));
