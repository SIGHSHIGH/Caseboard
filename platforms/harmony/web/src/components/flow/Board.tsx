import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useViewport,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import {
  addGroup,
  addImageNode,
  addNode,
  attachImageNode,
  attachImageToCluster,
  addEdge,
  composeCommands,
  deleteGroup,
  deleteImageNode,
  deleteNode,
  detachImageFromCluster,
  moveGroup,
  moveImageNode,
  moveImageNodes,
  moveClusterBy,
  moveNode,
  moveNodes,
} from '../../commands';
import { worldToScreen } from '../../lib/coords';
import { ASSET_DND_TYPE } from '../../lib/dnd';
import { centralityMap } from '../../lib/analysis';
import { applyView } from '../../lib/filter';
import {
  buildRenderModel,
  descendantGroupIdsOf,
  groupIdOfSuper,
  isAggEdgeId,
  isSuperId,
  memberNodeIds,
  nodeIdsInRect,
  parseBoardNodeId,
} from '../../lib/groups';
import {
  anchorPoint,
  bestAnchors,
  fanOutLabels,
  nearbyRects,
  parallelSpreads,
  pickAnchorPair,
  type EdgeAnchor,
  type RectLike,
} from '../../lib/edgeCurve';
import { obstacleReach, pickEdgeCurvature } from '../../lib/edgeOptimize';
import { newId } from '../../lib/id';
import {
  CARD_LAYER_Z,
  DOCK_TOLERANCE,
  IMAGE_DOT_SIZE,
  fitImageSize,
  findDockTarget,
  snapImageRect,
  type AlignGuide,
} from '../../lib/imageNode';
import { canvasGrid, DEFAULT_CANVAS, normalizeCanvasSkin, showsCanvasGrid } from '../../lib/canvasSkin';
import { CLUSTER_PIN_Z, clusterMemberZ, findClusterTarget, memberPosition, offsetForCluster } from '../../lib/clusterPin';
import { NODE_TYPE_META } from '../../lib/theme';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodeStore } from '../../store/codeStore';
import { useDocStore } from '../../store/docStore';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import { useViewStore } from '../../store/viewStore';
import { assetFileUrl, usesNativeAssetStore } from '../../services/platform';
import type { CaseNode, Group, ImageNode, XY } from '../../types';
import { useAssetThumb } from '../hooks/useAssetThumb';
import { ConnectDialog } from '../panels/ConnectDialog';
import { BaseNode, type BaseFlowNode } from './BaseNode';
import { BezierEdge, type CaseFlowEdge } from './BezierEdge';
import { FreeImageNode, type FreeImageFlowNode } from './FreeImageNode';
import { GroupNode, type GroupFlowNode } from './GroupNode';
import { GroupRectNode, type GroupRectFlowNode } from './GroupRectNode';
import { LassoOverlay } from './LassoOverlay';

/** 展开态分组在 React Flow 里的节点 id 前缀（与折叠超级节点区分） */
export const RECT_NODE_PREFIX = '__rect:';

export function rectNodeId(groupId: string): string {
  return RECT_NODE_PREFIX + groupId;
}

type BoardFlowNode = BaseFlowNode | GroupFlowNode | GroupRectFlowNode | FreeImageFlowNode;

const nodeTypes = { base: BaseNode, group: GroupNode, groupRect: GroupRectNode, freeImage: FreeImageNode };

function rectOfImage(image: ImageNode): { x: number; y: number; w: number; h: number } {
  return { x: image.x, y: image.y, w: image.w, h: image.h };
}
const edgeTypes = { bezier: BezierEdge };

const DEFAULT_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6E6862' } as const;

function groupOfBoardNode(node: BoardFlowNode): Group | null {
  if (node.type === 'groupRect') return node.data.group;
  if (node.type === 'group') return node.data.superNode.group;
  return null;
}

/** 对齐参考线：世界坐标经 useViewport 换算成屏幕像素后画在画布覆盖层上 */
function GuideOverlay({ guides }: { guides: AlignGuide[] }) {
  const viewport = useViewport();
  if (guides.length === 0) return null;
  return (
    <div className="cb-guides" aria-hidden>
      {guides.map((guide, index) => {
        if (guide.axis === 'x') {
          const point = worldToScreen({ x: guide.pos, y: guide.from }, viewport);
          const end = worldToScreen({ x: guide.pos, y: guide.to }, viewport);
          return (
            <span
              key={`x-${index}`}
              className="cb-guides__line cb-guides__line--v"
              style={{ left: point.x, top: point.y, height: Math.max(0, end.y - point.y) }}
            />
          );
        }
        const point = worldToScreen({ x: guide.from, y: guide.pos }, viewport);
        const end = worldToScreen({ x: guide.to, y: guide.pos }, viewport);
        return (
          <span
            key={`y-${index}`}
            className="cb-guides__line cb-guides__line--h"
            style={{ top: point.y, left: point.x, width: Math.max(0, end.x - point.x) }}
          />
        );
      })}
    </div>
  );
}

export function Board() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const removeWithTrash = useDocStore((s) => s.removeWithTrash);
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const dragPos = useUiStore((s) => s.dragPos);
  const addRequest = useUiStore((s) => s.addRequest);
  const groupRequest = useUiStore((s) => s.groupRequest);
  const mode = useUiStore((s) => s.mode);
  const selectedImageIds = useUiStore((s) => s.selectedImageIds);
  const guides = useUiStore((s) => s.guides);
  const attachTargetId = useUiStore((s) => s.attachTargetId);
  const setGuides = useUiStore((s) => s.setGuides);
  const setAttachTarget = useUiStore((s) => s.setAttachTarget);
  const selectImage = useUiStore((s) => s.selectImage);
  const consumeAdd = useUiStore((s) => s.consumeAdd);
  const consumeGroup = useUiStore((s) => s.consumeGroup);
  const assetDrop = useUiStore((s) => s.assetDrop);
  const consumeAssetDrop = useUiStore((s) => s.consumeAssetDrop);
  const requestNewNode = useUiStore((s) => s.requestNewNode);
  const setMode = useUiStore((s) => s.setMode);
  const setNodeSelection = useUiStore((s) => s.setNodeSelection);
  const multiSelect = useUiStore((s) => s.multiSelect);
  const toggleMultiSelect = useUiStore((s) => s.toggleMultiSelect);
  const enterMultiSelect = useUiStore((s) => s.enterMultiSelect);
  const redLineFrom = useUiStore((s) => s.redLineFrom);
  const startRedLine = useUiStore((s) => s.startRedLine);
  const cancelRedLine = useUiStore((s) => s.cancelRedLine);
  const pushNotice = useUiStore((s) => s.pushNotice);
  const applyImageSelection = useUiStore((s) => s.applyImageSelection);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const selectNode = useUiStore((s) => s.selectNode);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setDragPos = useUiStore((s) => s.setDragPos);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const graphLocked = useCodeStore((s) => s.state === 'error');
  const { screenToFlowPosition, setCenter, setViewport, getViewport } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // 代码侧请求居中时用 nonce 去重：文档后续变化不该把视口抢回去
  const lastFocusNonce = useRef(0);
  const [pending, setPending] = useState<Connection | null>(null);
  /** M17：右键菜单（clientX/Y 定位，flowX/Y 决定新节点落点） */
  const [ctxMenu, setCtxMenu] = useState<{
    clientX: number;
    clientY: number;
    flowX: number;
    flowY: number;
    nodeId: string | null;
  } | null>(null);
  // H5.4：菜单在屏幕边缘会被切掉/压到栏外，实测后按视口夹一次位置
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);
  const [ctxPos, setCtxPos] = useState<{ left: number; top: number } | null>(null);
  // M11（J6）：卡片拖动时吸附在它上面的图片实时跟随（松手再落库，拖动过程中不再「等一等」
  const [dockPreview, setDockPreview] = useState<Record<string, { x: number; y: number }>>({});
  const themeMode = useThemeStore((s) => s.mode);
  // M14：画布底衬可切纸张 / 软木板 / 黑板，纸张跟随界面主题
  const canvasConfig = doc.settings.canvas ?? DEFAULT_CANVAS;
  const canvasSkin = normalizeCanvasSkin(canvasConfig.skin);
  const grid = canvasGrid(canvasSkin, themeMode);
  const canvasBg = canvasConfig.assetId ? doc.assets.find((item) => item.id === canvasConfig.assetId) : undefined;
  // M15（N7/N8/N12）：背景图以前用 useAssetThumb(id, 1600)，而缩略图只按 256/1024 两个
  // 固定尺寸生成，1600 永远查不到 ⇒ <img> 拿不到 src、背景图从不显示。
  // 现在「素材落在沙箱文件里」的环境（桌面 Tauri / 鸿蒙 ArkWeb）直接走原件 URL，缩略图只在纯浏览器兜底。
  // H5 修正：原来这里判 `isTauri()`，鸿蒙也跌进缩略图分支、assetFileUrl() 的鸿蒙实现从不执行。
  // 现在改判 usesNativeAssetStore()（桌面 Tauri + 鸿蒙 ArkWeb 都算）。
  // 注意：背景图空白**不是**自定义 scheme 的问题——scheme 里的图片能正常解码；
  // 真凶是 Web 组件上的 .onlineImageAccess(false)，它把 ArkWeb 图片加载整体关掉
  // （连 data: 图片都 complete=false）。该开关已在 Index.ets 摘除并写明原因。
  const canvasThumbUrl = useAssetThumb(canvasBg?.id, 1024);
  const canvasBgUrl = canvasBg && usesNativeAssetStore() ? assetFileUrl(canvasBg.path) : canvasThumbUrl;

  const filter = useViewStore((s) => s.filter);
  const focus = useViewStore((s) => s.focus);
  const centrality = useAnalysisStore((s) => s.centrality);
  const pathResult = useAnalysisStore((s) => s.result);
  const activePath = useAnalysisStore((s) => s.activePath);

  // 折叠 / 聚合后的渲染模型（单一数据源的派生视图，不写回 doc）
  const model = useMemo(() => buildRenderModel(doc), [doc]);

  // 过滤 / 聚焦结果：只影响渲染，不动 Model（M5-2）
  const view = useMemo(() => applyView(doc, filter, focus), [doc, filter, focus]);

  // 中心度热力（0–1）与当前高亮路径：都只用于渲染
  const heat = useMemo(() => centralityMap(doc, centrality), [doc, centrality]);
  const highlight = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (!pathResult?.found) return { nodes, edges };
    const picks = activePath === -1 ? pathResult.paths : [pathResult.paths[activePath]].filter((item) => item !== undefined);
    for (const path of picks) {
      for (const id of path.nodes) nodes.add(id);
      for (const id of path.edges) edges.add(id);
    }
    return { nodes, edges };
  }, [pathResult, activePath]);

  /** 组或超级节点按成员状态聚合：全部隐藏才隐藏，有任一淡化就淡化 */
  const memberState = useCallback(
    (ids: string[]): { hidden: boolean; dim: boolean } => ({
      hidden: ids.length > 0 && ids.every((id) => view.hiddenNodes.has(id)),
      dim: ids.some((id) => view.dimNodes.has(id)),
    }),
    [view],
  );

  // 正在拖动的组矩形 → 位移；成员节点与超级节点用它做跟手预览
  const groupDragOffsets = useMemo(() => {
    const offsets: Record<string, XY> = {};
    for (const group of doc.groups) {
      const pos = dragPos[rectNodeId(group.id)];
      if (!pos) continue;
      offsets[group.id] = { x: pos.x - group.bounds.x, y: pos.y - group.bounds.y };
    }
    return offsets;
  }, [doc.groups, dragPos]);

  const offsetOfGroup = useCallback(
    (startGroupId: string | undefined): XY | null => {
      if (!startGroupId) return null;
      const seen = new Set<string>();
      let current: string | undefined = startGroupId;
      while (current && !seen.has(current)) {
        seen.add(current);
        const offset = groupDragOffsets[current];
        if (offset) return offset;
        current = doc.groups.find((group) => group.id === current)?.parentId;
      }
      return null;
    },
    [doc.groups, groupDragOffsets],
  );

  const offsetOfNode = useCallback(
    (node: CaseNode): XY | null => offsetOfGroup(node.groupId),
    [offsetOfGroup],
  );

  const nodes = useMemo<BoardFlowNode[]>(() => {
    const groupNodes: BoardFlowNode[] = model.groups
      .filter(({ group }) => !memberState(memberNodeIds(doc, group.id)).hidden)
      .map(({ group, memberCount, childCount }) => ({
      id: rectNodeId(group.id),
      type: 'groupRect',
      position: dragPos[rectNodeId(group.id)] ?? { x: group.bounds.x, y: group.bounds.y },
      data: { group, memberCount, childCount },
      selected: group.id === selectedGroupId,
      selectable: false,
      zIndex: -1,
      style: { width: group.bounds.w, height: group.bounds.h },
      }));

    const superNodes: BoardFlowNode[] = model.superNodes
      .filter((superNode) => !memberState(memberNodeIds(doc, superNode.group.id)).hidden)
      .map((superNode) => {
      const offset = offsetOfGroup(superNode.group.parentId);
      return {
        id: superNode.node.id,
        type: 'group',
        position: {
          x: superNode.node.x + (offset?.x ?? 0),
          y: superNode.node.y + (offset?.y ?? 0),
        },
        data: { superNode },
        selected: superNode.group.id === selectedGroupId,
        selectable: false,
        style: { width: superNode.node.w },
      };
    });

    const baseNodes: BoardFlowNode[] = model.nodes
      .filter((node) => !view.hiddenNodes.has(node.id))
      .map((node) => {
      const own = dragPos[node.id];
      const offset = own ? null : offsetOfNode(node);
      return {
        id: node.id,
        type: 'base',
        position: own ?? { x: node.x + (offset?.x ?? 0), y: node.y + (offset?.y ?? 0) },
        data: {
          node,
          attachTarget: attachTargetId === node.id,
          dimmed: view.dimNodes.has(node.id),
          heat: heat.get(node.id) ?? 0,
          onPath: highlight.nodes.has(node.id),
        },
        selected: selectedNodeIds.includes(node.id),
        // M10：卡片也进层级空间（固定 CARD_LAYER_Z），图片才能真的被压到卡片下面
        // H5.3：集中钉子固定压在钉集之上，不跟卡片抢层级
        zIndex: node.type === 'clusterPin' ? CLUSTER_PIN_Z : (node.zIndex ?? CARD_LAYER_Z),
        style: { width: node.w },
        };
      });

    // 自由图片节点：不依附卡片，层级由自身 zIndex 决定（可压住/被压住）
    // H5.3：钉集成员的坐标由「钉子位置 + clusterOffset」推导，层级也走集内独立空间（对外永远置顶）
    const imageNodes: BoardFlowNode[] = doc.imageNodes.map((image) => {
      const pin = image.clusterId
        ? model.nodes.find((item) => item.id === image.clusterId && item.type === 'clusterPin')
        : undefined;
      const derived = pin ? memberPosition(pin, image.clusterOffset ?? { x: 0, y: 0 }, { w: image.w, h: image.h }) : null;
      // H5.6：拖拽预览要压过「钉集推导坐标」，否则拖成员时它自己被 derived 钉在原地、
      // 只有钉子和其它成员在动，松手后相对位置就跳了。
      const preview = dockPreview[image.id] ?? dragPos[image.id];
      return {
        id: image.id,
        type: 'freeImage',
        position: preview ?? derived ?? { x: image.x, y: image.y },
        data: {
          image,
          asset: doc.assets.find((item) => item.id === image.assetId),
          attachTarget: attachTargetId === image.id,
        },
        selected: selectedImageIds.includes(image.id),
        zIndex: pin ? clusterMemberZ(doc.imageNodes, pin.id, image.id) : image.zIndex,
        // M11（I6）：小圆点模式只占 26×26，方便拖到卡片角吸附
        style: image.dotMode
          ? { width: IMAGE_DOT_SIZE, height: IMAGE_DOT_SIZE }
          : { width: image.w, height: image.h },
      };
    });

    // 组矩形永远排在前面，保证 zIndex -1 生效时不被节点层打乱；
    // M11（I1）：整体按 zIndex 升序排一次，DOM 顺序与层级一致，点「上移/下移/置顶/置底」立刻看到效果
    const all = [...groupNodes, ...baseNodes, ...superNodes, ...imageNodes];
    all.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    return all;
  }, [
    model,
    dragPos,
    dockPreview,
    selectedNodeIds,
    selectedGroupId,
    selectedImageIds,
    attachTargetId,
    doc.imageNodes,
    doc.assets,
    offsetOfGroup,
    offsetOfNode,
    view,
    memberState,
    doc,
    heat,
    highlight,
  ]);

  /**
   * S3：没有显式锚点的关系按两端相对位置挑「面对面」的连接点，布局后也不会绕到卡片背后。
   * M17：把其他卡片当障碍一起评分（避免线穿卡片）。
   * M18：「手动拉出来的线」也一起照顾——只要 `autoAnchor !== false`，画布就用算出来的锚点，
   * 不再退回到拖拽时随手落下的那个 handle；曲率有存值就用存值，没有才即时挑一个。
   */
  const autoAnchors = useMemo(() => {
    const rects = new Map<string, RectLike>(
      doc.nodes.map((node) => [node.id, { x: node.x, y: node.y, w: node.w, h: node.h }]),
    );
    const entries = Array.from(rects, ([id, rect]) => ({ id, rect }));
    const out = new Map<string, { source: EdgeAnchor; target: EdgeAnchor; curvature: number }>();
    for (const edge of model.edges) {
      const source = rects.get(edge.source);
      const target = rects.get(edge.target);
      if (!source || !target) continue;
      const from = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
      const to = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
      const others = nearbyRects(entries, from, to, obstacleReach(from, to), [edge.source, edge.target]);
      const anchors = others.length > 0 ? pickAnchorPair(source, target, others) : bestAnchors(source, target);
      const sourcePoint = anchorPoint(source, anchors.source);
      const targetPoint = anchorPoint(target, anchors.target);
      const stored = edge.curvature;
      const curvature = stored !== undefined ? stored : pickEdgeCurvature(sourcePoint, targetPoint, others);
      out.set(edge.id, { ...anchors, curvature });
    }
    return out;
  }, [doc.nodes, model.edges]);

  /** M17：同一对实体之间的多条关系线错开，避免「线叠在一起」 */
  const spreadByEdge = useMemo(() => parallelSpreads(model.edges), [model.edges]);

  /** S3 标签避让：曲线中点落在同一格的标签按序号向下错开 */
  const labelDys = useMemo(() => {
    const centers = new Map(doc.nodes.map((node) => [node.id, { x: node.x + node.w / 2, y: node.y + node.h / 2 }]));
    const points: Array<{ id: string; x: number; y: number }> = [];
    for (const edge of model.edges) {
      const source = centers.get(edge.source);
      const target = centers.get(edge.target);
      if (!source || !target) continue;
      points.push({ id: edge.id, x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 });
    }
    return fanOutLabels(points);
  }, [doc.nodes, model.edges]);

  const edges = useMemo<CaseFlowEdge[]>(() => {
    const stateOf = (id: string): { hidden: boolean; dim: boolean } =>
      isSuperId(id)
        ? memberState(memberNodeIds(doc, groupIdOfSuper(id)))
        : { hidden: view.hiddenNodes.has(id), dim: view.dimNodes.has(id) };
    return model.edges
      .filter((edge) => {
        const source = stateOf(edge.source);
        const target = stateOf(edge.target);
        if (source.hidden || target.hidden) return false;
        return isAggEdgeId(edge.id) ? true : !view.hiddenEdges.has(edge.id);
      })
      .map((edge) => {
        const dimmed =
          view.dimEdges.has(edge.id) || stateOf(edge.source).dim || stateOf(edge.target).dim;
        const auto = autoAnchors.get(edge.id);
        // 集中钉子只有两个固定 handle（source: right / target: right-in），
        // 自动锚点算出的 left/top/bottom 在它身上并不存在，React Flow 会算不出端点而直接不画线。
        const isPin = (id: string): boolean =>
          (doc.nodes.find((node) => node.id === id)?.type ?? '') === 'clusterPin';
        // M18：用户在右栏钉住连接点（autoAnchor === false）时只认存下来的 handle
        const pinned = edge.autoAnchor === false;
        const sourceHandle = isPin(edge.source)
          ? (edge.sourceHandle ?? 'right')
          : pinned
            ? (edge.sourceHandle ?? auto?.source ?? 'right')
            : (auto?.source ?? edge.sourceHandle ?? 'right');
        const targetHandle = isPin(edge.target)
          ? (edge.targetHandle ?? 'right-in')
          : pinned
            ? (edge.targetHandle ?? auto?.target ?? 'left')
            : (auto?.target ?? edge.targetHandle ?? 'left');
        const curvature = edge.curvature ?? (pinned ? 0 : (auto?.curvature ?? 0));
        return {
          id: edge.id,
          type: 'bezier' as const,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          targetHandle,
          data: {
            edge,
            dimmed,
            highlighted: highlight.edges.has(edge.id),
            labelDy: labelDys.get(edge.id) ?? 0,
            spread: spreadByEdge.get(edge.id) ?? 0,
            curvature,
          },
          selected: edge.id === selectedEdgeId,
          markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
        };
      });
  }, [model.edges, selectedEdgeId, view, memberState, doc, highlight, autoAnchors, labelDys]);

  const onNodesChange = useCallback(
    (changes: NodeChange<BoardFlowNode>[]) => {
      const selectChanges: Array<{ id: string; selected: boolean }> = [];
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          setDragPos(change.id, change.position);
        } else if (change.type === 'select') {
          selectChanges.push({ id: change.id, selected: change.selected });
        }
      }
      if (selectChanges.length === 0) return;
      // 框选与 Ctrl 点选都由 React Flow 产生 select 变更，这里统一回写到界面状态
      const store = useUiStore.getState();
      const imageIds = new Set(doc.imageNodes.map((item) => item.id));
      const images: Array<{ id: string; selected: boolean }> = [];
      // 触屏多选态（H5-5）由 BaseNode 长按 + onNodeClick 的 toggle 独占：
      // React Flow 的「点一张卡就把其它卡全取消选中」会和 toggle 互相打架（点第二张卡反而清空选择），
      // 所以多选态下忽略卡片的 select 变更，只放图片的。
      if (store.multiSelect) {
        for (const change of selectChanges) if (imageIds.has(change.id)) images.push(change);
        for (const change of images) applyImageSelection(change.id, change.selected);
        return;
      }
      let nodeIds = [...store.selectedNodeIds];
      for (const change of selectChanges) {
        if (imageIds.has(change.id)) {
          images.push(change);
          continue;
        }
        if (change.selected) {
          if (!nodeIds.includes(change.id)) nodeIds.push(change.id);
        } else {
          nodeIds = nodeIds.filter((id) => id !== change.id);
        }
      }
      if (nodeIds.length !== store.selectedNodeIds.length || nodeIds.some((id) => !store.selectedNodeIds.includes(id))) {
        setNodeSelection(nodeIds);
      }
      for (const change of images) applyImageSelection(change.id, change.selected);
    },
    [applyImageSelection, doc.imageNodes, setDragPos, setNodeSelection],
  );

  /** 拖动图片时的其它矩形（卡片 + 未被一起拖动的图片），用于对齐吸附 */
  const otherRectsFor = useCallback(
    (imageId: string): Array<{ x: number; y: number; w: number; h: number }> => {
      const rects = model.nodes.map((node) => ({ x: node.x, y: node.y, w: node.w, h: node.h }));
      for (const image of doc.imageNodes) {
        if (image.id === imageId || selectedImageIds.includes(image.id)) continue;
        rects.push(rectOfImage(image));
      }
      return rects;
    },
    [doc.imageNodes, model.nodes, selectedImageIds],
  );

  const onNodeDrag = useCallback(
    (_event: unknown, node: BoardFlowNode) => {
      // H5.3：钉集整体跟手——拖钉子时成员实时跟随；拖集内任一图片也等价于拖钉子
      if (node.type === 'base' && node.data.node.type === 'clusterPin') {
        const pin = node.data.node;
        const dx = node.position.x - pin.x;
        const dy = node.position.y - pin.y;
        const next: Record<string, { x: number; y: number }> = {};
        for (const member of doc.imageNodes) {
          if (member.clusterId !== pin.id) continue;
          const base = memberPosition(pin, member.clusterOffset ?? { x: 0, y: 0 }, { w: member.w, h: member.h });
          next[member.id] = { x: base.x + dx, y: base.y + dy };
        }
        if (Object.keys(next).length > 0) setDockPreview(next);
        return;
      }
      if (node.type === 'freeImage') {
        const member = doc.imageNodes.find((item) => item.id === node.id);
        const clusterPin = member?.clusterId
          ? model.nodes.find((item) => item.id === member.clusterId && item.type === 'clusterPin')
          : undefined;
        if (member && clusterPin) {
          const base = memberPosition(clusterPin, member.clusterOffset ?? { x: 0, y: 0 }, { w: member.w, h: member.h });
          const peerDx = node.position.x - base.x;
          const peerDy = node.position.y - base.y;
          setDragPos(clusterPin.id, { x: clusterPin.x + peerDx, y: clusterPin.y + peerDy });
          // H5.6：拖动中的这张图片也必须进预览表——否则它被「钉子位置 + 偏移」的推导坐标钉在原地，
          // 只有钉子和同伴在跑，松手后整集平移，相对位置看起来就变了。
          const next: Record<string, { x: number; y: number }> = { [member.id]: { x: node.position.x, y: node.position.y } };
          for (const peer of doc.imageNodes) {
            if (peer.clusterId !== clusterPin.id || peer.id === member.id) continue;
            const peerBase = memberPosition(clusterPin, peer.clusterOffset ?? { x: 0, y: 0 }, { w: peer.w, h: peer.h });
            next[peer.id] = { x: peerBase.x + peerDx, y: peerBase.y + peerDy };
          }
          if (Object.keys(next).length > 0) setDockPreview(next);
          return;
        }
      }
      if (node.type === 'freeImage') {
        const image = doc.imageNodes.find((item) => item.id === node.id);
        if (!image) return;
        const moving = { x: node.position.x, y: node.position.y, w: image.w, h: image.h };
        const result = snapImageRect(moving, otherRectsFor(image.id));
        setGuides(result.guides);
        // 吸附（M10）：判定外扩到卡片外围一圈，并给出建议的角落位置，偏移一点也能吸住
        const dock = findDockTarget(moving, model.nodes, DOCK_TOLERANCE);
        setAttachTarget(dock ? dock.nodeId : null);
        return;
      }
      if (node.type !== 'base') return;
      // M11（J6）：卡片被拖动时，吸附在它上面的图片实时跟着走，不用等松手
      const anchor = doc.nodes.find((item) => item.id === node.id);
      if (!anchor) return;
      const dx = Math.round(node.position.x) - anchor.x;
      const dy = Math.round(node.position.y) - anchor.y;
      if (dx === 0 && dy === 0) {
        if (Object.keys(dockPreview).length > 0) setDockPreview({});
        return;
      }
      const next: Record<string, { x: number; y: number }> = {};
      for (const image of doc.imageNodes) {
        if (image.linkedNodeId !== node.id) continue;
        next[image.id] = { x: image.x + dx, y: image.y + dy };
      }
      setDockPreview(next);
    },
    [doc, model.nodes, dockPreview, otherRectsFor, setAttachTarget, setGuides],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: BoardFlowNode) => {
      // 松手后位置由命令落库，实时预览清掉，避免和 Model 里的坐标打架
      setDockPreview({});
      // H5.3：钉集只能整体移动——拖钉子本身或拖集内任意图片，都换算成整集平移
      if (node.type === 'base') {
        const pin = node.data.node;
        if (pin.type === 'clusterPin') {
          const dx = Math.round(node.position.x - pin.x);
          const dy = Math.round(node.position.y - pin.y);
          if (dx !== 0 || dy !== 0) dispatch(moveClusterBy(pin.id, dx, dy));
          // H5.6：钉子自身的拖拽预览（dragPos）也要清，否则圆点会停在松手点
          setDragPos(pin.id, null);
          return;
        }
      }
      if (node.type === 'freeImage') {
        const dragged = doc.imageNodes.find((item) => item.id === node.id);
        if (dragged?.clusterId) {
          const pin = model.nodes.find((item) => item.id === dragged.clusterId && item.type === 'clusterPin');
          if (pin) {
            const base = memberPosition(pin, dragged.clusterOffset ?? { x: 0, y: 0 }, { w: dragged.w, h: dragged.h });
            const dx = Math.round(node.position.x - base.x);
            const dy = Math.round(node.position.y - base.y);
            if (dx !== 0 || dy !== 0) dispatch(moveClusterBy(pin.id, dx, dy));
            // H5.6：预览残留会让图片停在松手点、和推导坐标打架，两条分支都要清干净
            setDragPos(node.id, null);
            setDragPos(pin.id, null);
            return;
          }
        }
      }
      if (node.type === 'freeImage') {
        const image = doc.imageNodes.find((item) => item.id === node.id);
        if (image) {
          const pos = dragPos[node.id] ?? node.position;
          const moving = { x: pos.x, y: pos.y, w: image.w, h: image.h };
          const result = snapImageRect(moving, otherRectsFor(image.id));
          const dx = result.rect.x - image.x;
          const dy = result.rect.y - image.y;
          const companions = selectedImageIds
            .filter((id) => id !== node.id)
            .map((id) => doc.imageNodes.find((item) => item.id === id))
            .filter((item): item is ImageNode => item !== undefined);
          // A4：混合多选（图片 + 卡片）一起拖动时，位移必须合成一条命令，撤销才是「一步退回」
          const mixedNodes = selectedNodeIds
            .map((id) => doc.nodes.find((item) => item.id === id))
            .filter((item): item is CaseNode => item !== undefined)
            .map((item) => {
              const pending = dragPos[item.id];
              return {
                id: item.id,
                x: Math.round((pending ? pending.x : item.x) + dx),
                y: Math.round((pending ? pending.y : item.y) + dy),
              };
            });
          const docking = findDockTarget(result.rect, model.nodes, DOCK_TOLERANCE);
          // H5.3：拖到集中钉子上松手 → 收进钉集（之后只能整体移动、绕钉子转）
          const imageCenter = { x: result.rect.x + image.w / 2, y: result.rect.y + image.h / 2 };
          const clusterPin = image.clusterId ? null : findClusterTarget(model.nodes, imageCenter);
          if (clusterPin) {
            dispatch(attachImageToCluster(node.id, clusterPin.id, offsetForCluster(clusterPin, imageCenter)));
            setDragPos(node.id, null);
            setGuides([]);
            setAttachTarget(null);
            return;
          }
          // 卡片被一起拖动时，吸在它们身上的图片由命令层随动，这里必须排除，否则位移两次
          const mixedNodeIds = new Set(mixedNodes.map((item) => item.id));
          const followIds = new Set(
            doc.imageNodes
              .filter((item) => item.linkedNodeId && mixedNodeIds.has(item.linkedNodeId))
              .map((item) => item.id),
          );
          const soloMoves = [
            { id: node.id, x: result.rect.x, y: result.rect.y },
            ...companions
              .filter((item) => !followIds.has(item.id))
              .map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy })),
          ];
          const imageCmd =
            soloMoves.length > 1
              ? moveImageNodes(soloMoves)
              : moveImageNode(node.id, result.rect.x, result.rect.y);
          if (mixedNodes.length > 0) {
            dispatch(composeCommands('移动所选（图片 + 实体）', [imageCmd, moveNodes(mixedNodes)]));
            for (const position of mixedNodes) setDragPos(position.id, null);
          } else {
            dispatch(imageCmd);
          }
          // 吸附（M10）：记录吸附到哪张卡片的哪个角 + 相对偏移；
          // 拖离所有卡片时取消吸附（只有「拖上去过」的角吸附才自动解绑，普通关联保留）
          if (docking && docking.nodeId !== image.linkedNodeId) {
            dispatch(
              attachImageNode(node.id, docking.nodeId, {
                corner: docking.corner,
                offsetX: docking.offsetX,
                offsetY: docking.offsetY,
              }),
            );
          } else if (!docking && image.dockCorner) {
            dispatch(attachImageNode(node.id, null));
          }
          setDragPos(node.id, null);
          setGuides([]);
          setAttachTarget(null);
          return;
        }
      }
      const group = groupOfBoardNode(node);
      if (group) {
        // 组矩形与超级节点的位移统一交给 moveGroup：成员节点一起动，一条命令进撤销栈
        dispatch(moveGroup(group.id, node.position.x - group.bounds.x, node.position.y - group.bounds.y));
        setDragPos(node.id, null);
        for (const childId of descendantGroupIdsOf(doc.groups, group.id)) {
          setDragPos(rectNodeId(childId), null);
        }
        return;
      }
      const multi = selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id);
      const movingNodeIds = multi ? selectedNodeIds : [node.id];
      const positions = movingNodeIds
        .map((id) => doc.nodes.find((item) => item.id === id))
        .filter((item): item is CaseNode => item !== undefined)
        .map((item) => {
          const pending = dragPos[item.id];
          return { id: item.id, x: Math.round(pending ? pending.x : item.x), y: Math.round(pending ? pending.y : item.y) };
        });
      const anchor = doc.nodes.find((item) => item.id === node.id);
      const dx = anchor ? Math.round(node.position.x) - anchor.x : 0;
      const dy = anchor ? Math.round(node.position.y) - anchor.y : 0;
      // A4：卡片被拖动时，选中的图片要跟着一起走，并且与卡片位移合成同一条命令；
      // M10：吸在本次移动卡片上的图片由命令层随动，这里排除掉避免位移两次
      const movingIdSet = new Set(movingNodeIds);
      const mixedImages = selectedImageIds
        .map((id) => doc.imageNodes.find((item) => item.id === id))
        .filter((item): item is ImageNode => item !== undefined)
        .filter((item) => !(item.linkedNodeId && movingIdSet.has(item.linkedNodeId)))
        .map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy }));
      const nodeCmd =
        positions.length > 1
          ? moveNodes(positions)
          : moveNode(node.id, Math.round(node.position.x), Math.round(node.position.y));
      if (mixedImages.length > 0) {
        dispatch(composeCommands('移动所选（实体 + 图片）', [nodeCmd, moveImageNodes(mixedImages)]));
      } else {
        dispatch(nodeCmd);
      }
      for (const position of positions) setDragPos(position.id, null);
      setDragPos(node.id, null);
    },
    [
      attachTargetId,
      dispatch,
      doc.groups,
      doc.imageNodes,
      doc.nodes,
      dragPos,
      otherRectsFor,
      selectedImageIds,
      selectedNodeIds,
      setAttachTarget,
      setDragPos,
      setGuides,
    ],
  );

  const onNodesDelete = useCallback(
    (deleted: BoardFlowNode[]) => {
      for (const node of deleted) {
        if (node.type === 'freeImage') {
          dispatch(deleteImageNode(node.id));
          continue;
        }
        const group = groupOfBoardNode(node);
        if (group) dispatch(deleteGroup(group.id));
        else removeWithTrash('node', [node.id]);
      }
    },
    [dispatch, removeWithTrash],
  );

  const onEdgesDelete = useCallback(
    (deleted: CaseFlowEdge[]) => {
      for (const edge of deleted) {
        if (parseBoardNodeId(edge.id).kind === 'agg') continue;
        removeWithTrash('edge', [edge.id]);
      }
    },
    [dispatch, removeWithTrash],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (mode === 'lasso') return;
      if (event.detail === 2) {
        // A5：双击空白不再直接插便签，而是记下落点的世界坐标并弹「新建节点」对话框
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        requestNewNode({ x: Math.round(position.x), y: Math.round(position.y) });
        return;
      }
      // clearSelection 同时会退出多选态（点空白即散选，符合触屏直觉）
      clearSelection();
    },
    [clearSelection, mode, requestNewNode, screenToFlowPosition],
  );

  /**
   * A5：双击空白弹「新建节点」对话框（兜底通道）。
   * React Flow 的 onPaneClick 依赖完整的指针序列（pointerdown → pointerup → click），
   * 自动化环境或某些触控板手势下可能只给到 dblclick；这里在画布容器上再判一次，
   * 目标必须落在画布本身，命中节点 / 连线 / 控制条时一律不动，避免误建。
   */
  const onCanvasDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mode === 'lasso') return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const blocked = '.react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, .cb-toolbar';
      if (target.closest(blocked)) return;
      if (!target.closest('.react-flow__pane') && !target.closest('.react-flow__renderer')) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      requestNewNode({ x: Math.round(position.x), y: Math.round(position.y) });
    },
    [mode, requestNewNode, screenToFlowPosition],
  );

  const onConnect = useCallback((connection: Connection) => {
    setPending(connection);
  }, []);

  /**
   * M17：右键新建。
   * 空白处右键 → 新建节点对话框 / 关系气泡；
   * 卡片上右键 → 直接建一个关系气泡并连到这张卡片（复合关系最常用的入口）。
   */
  const openContextMenu = useCallback(
    (clientX: number, clientY: number, nodeId: string | null) => {
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      setCtxMenu({
        clientX,
        clientY,
        flowX: Math.round(position.x),
        flowY: Math.round(position.y),
        nodeId,
      });
    },
    [screenToFlowPosition],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      openContextMenu(event.clientX, event.clientY, null);
    },
    [openContextMenu],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string; type?: string }) => {
      event.preventDefault();
      // 组矩形/超级节点/图片节点不提供「建关系气泡」入口，避免连出无意义的关系
      const usable = node.type === 'base';
      openContextMenu(event.clientX, event.clientY, usable ? node.id : null);
    },
    [openContextMenu],
  );

  const closeContextMenu = useCallback(() => setCtxMenu(null), []);

  // H5.4：长按菜单贴着屏幕边缘时会有一半跑到视口外（平板右下角尤其明显），
  // 所以渲染后量一次真实尺寸再夹进视口，留 8px 安全边。
  // 两趟：第一趟用 offsetWidth/offsetHeight，第二趟在下一帧用真实 rect 再夹一次
  //（文本换行 / 字体度量可能让最终宽度比首帧量到的大，实测在右下角会贴到屏幕边）。
  useLayoutEffect(() => {
    if (!ctxMenu) {
      setCtxPos(null);
      return;
    }
    const VIEWPORT_MARGIN = 8;
    // ArkWeb 里 window.innerWidth 在首帧可能比布局视口大几个像素（实测 1448 对 1440），
    // 只信 innerWidth 会让菜单贴死在屏幕右边，所以取两者较小值。
    const viewport = () => ({
      w: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
      h: Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight),
    });
    const clampTo = (x: number, y: number, width: number, height: number) => {
      const view = viewport();
      return {
        left: Math.min(Math.max(x, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, view.w - width - VIEWPORT_MARGIN)),
        top: Math.min(Math.max(y, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, view.h - height - VIEWPORT_MARGIN)),
      };
    };
    const el = ctxMenuRef.current;
    setCtxPos(clampTo(ctxMenu.clientX, ctxMenu.clientY, el?.offsetWidth ?? 240, el?.offsetHeight ?? 220));
    const frame = window.requestAnimationFrame(() => {
      const node = ctxMenuRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const next = clampTo(ctxMenu.clientX, ctxMenu.clientY, rect.width, rect.height);
      setCtxPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
    });
    // 再来一趟：视口尺寸 / 文本换行稳定之后校正一次，避免首帧量到的是过渡尺寸。
    const settle = window.setTimeout(() => {
      const node = ctxMenuRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const next = clampTo(ctxMenu.clientX, ctxMenu.clientY, rect.width, rect.height);
      setCtxPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
    }, 260);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [ctxMenu]);

  /* ---------------------------------------------------------------------------
     H3：拖拽惯性。
     平板上「一划到底就立刻停」很别扭——手指松开后视口应该按末段速度再滑一小段，
     然后指数衰减停下（原生地图的手感）。只在触控模式下启用：
     鼠标手势保持原样，桌面版不会出现「松手还在飘」的怪手感。

     三个坑：
       1) 惯性是靠 setViewport 驱动的，而 setViewport 又会回调 onMove，
          所以必须能区分「用户划的」和「我们自己推的」，否则第一帧就把自己停掉；
          这里用 appliedRef 记住上一帧推到的位置，位置对得上就跳过采样。
       2) 速度只能用最近 120ms 的样本算：整段拖拽的平均速度会把末速算低，甩不起来。
       3) τ 用指数衰减积分（v·τ·(1−e^{−Δt/τ})），这样帧率高低不影响滑行距离。
     --------------------------------------------------------------------------- */
  const inertiaRef = useRef<{ raf: number; vx: number; vy: number } | null>(null);
  const panSamplesRef = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const appliedRef = useRef<{ x: number; y: number } | null>(null);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current.raf);
      inertiaRef.current = null;
    }
    appliedRef.current = null;
  }, []);

  useEffect(() => stopInertia, [stopInertia]);

  const onBoardMoveStart = useCallback(() => {
    panSamplesRef.current = [];
    stopInertia();
  }, [stopInertia]);

  const onBoardMove = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      const applied = appliedRef.current;
      // 自己推的那一帧：位置对得上就当作噪声，别停惯性
      if (applied && Math.abs(applied.x - viewport.x) < 0.6 && Math.abs(applied.y - viewport.y) < 0.6) return;
      appliedRef.current = null;
      if (inertiaRef.current) stopInertia();
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const samples = panSamplesRef.current;
      samples.push({ t: now, x: viewport.x, y: viewport.y });
      while (samples.length > 8) samples.shift();
    },
    [stopInertia],
  );

  const onBoardMoveEnd = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      const samples = panSamplesRef.current;
      panSamplesRef.current = [];
      // 只给触控手势惯性；鼠标/触控笔保持桌面手感
      if (typeof document !== 'undefined' && document.documentElement.dataset.input !== 'touch') return;
      if (samples.length < 2) return;
      const last = samples[samples.length - 1];
      const recent = samples.filter((s) => last.t - s.t <= 120);
      if (recent.length < 2) return;
      const first = recent[0];
      const dt = last.t - first.t;
      if (dt <= 0) return;
      let vx = (last.x - first.x) / dt;
      let vy = (last.y - first.y) / dt;
      const speed = Math.hypot(vx, vy);
      const TAU = 190; // ms，速度衰减时间常数
      if (speed < 0.12) return; // 慢慢挪一下不该起飞
      if (speed > 3.2) {
        // 超快多数是拖拽抖动或误触，压到上限，别让整块画布飞出去
        const k = 3.2 / speed;
        vx *= k;
        vy *= k;
      }
      void viewport;
      let prev = last.t;
      const step = (now: number) => {
        const cur = inertiaRef.current;
        if (!cur) return;
        const elapsed = Math.max(1, Math.min(48, now - prev));
        prev = now;
        const decay = Math.exp(-elapsed / TAU);
        const dx = cur.vx * TAU * (1 - decay);
        const dy = cur.vy * TAU * (1 - decay);
        cur.vx *= decay;
        cur.vy *= decay;
        const current = getViewport();
        const next = { x: current.x + dx, y: current.y + dy, zoom: current.zoom };
        appliedRef.current = { x: next.x, y: next.y };
        void setViewport(next, { duration: 0 });
        if (Math.hypot(cur.vx, cur.vy) < 0.004) {
          stopInertia();
          return;
        }
        cur.raf = requestAnimationFrame(step);
      };
      inertiaRef.current = { raf: 0, vx, vy };
      inertiaRef.current.raf = requestAnimationFrame(step);
    },
    [getViewport, setViewport, stopInertia],
  );

  /**
   * 容器级右键兜底：与双击一样，React Flow 的 onPaneContextMenu 依赖完整的指针序列，
   * 自动化环境或部分输入设备只给到 contextmenu 事件，这里在画布容器上再判一次。
   */
  const onCanvasContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.react-flow__node, .react-flow__edge')) return;
      event.preventDefault();
      openContextMenu(event.clientX, event.clientY, null);
    },
    [openContextMenu],
  );

  const addRelationBubble = useCallback(
    (fromNodeId: string | null) => {
      if (!ctxMenu) return;
      const id = newId('relation');
      const box = { w: 168, h: 64 };
      const nodeCmd = addNode({
        id,
        type: 'relation',
        title: '关系气泡',
        x: ctxMenu.flowX - Math.round(box.w / 2),
        y: ctxMenu.flowY - Math.round(box.h / 2),
        w: box.w,
        h: box.h,
        status: 'checking',
        confidence: 40,
      });
      if (fromNodeId) {
        const source = doc.nodes.find((item) => item.id === fromNodeId);
        const edgeCmd = addEdge({
          source: fromNodeId,
          target: id,
          relType: 'related',
          label: '多方关系',
          directed: false,
          style: 'dotted',
          confidence: 40,
        });
        dispatch(composeCommands(`新建关系气泡并连到「${source?.title ?? '实体'}」`, [nodeCmd, edgeCmd]));
      } else {
        dispatch(nodeCmd);
      }
      selectNode(id);
      setCtxMenu(null);
    },
    [ctxMenu, dispatch, doc.nodes, selectNode],
  );

  const createPlainNode = useCallback(() => {
    if (!ctxMenu) return;
    requestNewNode({ x: ctxMenu.flowX, y: ctxMenu.flowY });
    setCtxMenu(null);
  }, [ctxMenu, requestNewNode]);

  // 素材落点 → 自由图片节点（桌面走 HTML5 拖放的 onDrop，触屏走 uiStore 的落点请求，共用此处）
  const dropAssetOnCanvas = useCallback(
    (assetId: string, clientX: number, clientY: number) => {
      const asset = doc.assets.find((item) => item.id === assetId);
      if (!asset) return;
      const size = fitImageSize(asset.width, asset.height);
      const point = screenToFlowPosition({ x: clientX, y: clientY });
      const id = newId('img');
      const x = Math.round(point.x - size.w / 2);
      const y = Math.round(point.y - size.h / 2);
      dispatch(
        addImageNode({
          id,
          assetId,
          x,
          y,
          w: size.w,
          h: size.h,
          siblings: doc.imageNodes,
        }),
      );
      // H5.3：素材直接落在集中钉子上 → 建好即入钉集（右栏提示的「拖到钉子本体上松手」就是这条）
      const center = { x: x + size.w / 2, y: y + size.h / 2 };
      const pin = findClusterTarget(model.nodes, center);
      if (pin) dispatch(attachImageToCluster(id, pin.id, offsetForCluster(pin, center)));
      selectImage(id);
    },
    [dispatch, doc.assets, doc.imageNodes, model.nodes, screenToFlowPosition, selectImage],
  );

  // 素材库拖入画布 → 在落点中心生成自由图片节点
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const assetId = event.dataTransfer.getData(ASSET_DND_TYPE);
      if (!assetId) return;
      event.preventDefault();
      dropAssetOnCanvas(assetId, event.clientX, event.clientY);
    },
    [dropAssetOnCanvas],
  );

  // H5：触屏长按起拖后的落点请求（手指不会产生 HTML5 dragstart，改由 AssetTile 上报坐标）
  const handledAssetDropRef = useRef(0);
  useEffect(() => {
    if (!assetDrop || assetDrop.nonce === handledAssetDropRef.current) return;
    handledAssetDropRef.current = assetDrop.nonce;
    dropAssetOnCanvas(assetDrop.assetId, assetDrop.clientX, assetDrop.clientY);
    consumeAssetDrop();
  }, [assetDrop, consumeAssetDrop, dropAssetOnCanvas]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(ASSET_DND_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // 左栏「节点类型」按钮 → 落在画布可视中心
  useEffect(() => {
    if (!addRequest) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 320, y: 240 };
    // 集中钉子要先问「要不要便利贴」，所以借弹窗创建；其余类型仍然一键落在画布中心
    if (addRequest === 'clusterPin') {
      requestNewNode({ x: Math.round(center.x), y: Math.round(center.y) }, 'clusterPin');
      consumeAdd();
      return;
    }
    const jitter = Math.round((Math.random() - 0.5) * 48);
    dispatch(
      addNode({
        type: addRequest as CaseNode['type'],
        x: Math.round(center.x - 104 + jitter),
        y: Math.round(center.y - 48 + jitter),
      }),
    );
    consumeAdd();
  }, [addRequest, consumeAdd, dispatch, screenToFlowPosition, requestNewNode]);

  // 代码侧点击声明 → 画布居中到对应实体（同一 nonce 只消费一次）
  useEffect(() => {
    if (!focusRequest) return;
    if (lastFocusNonce.current === focusRequest.nonce) return;
    lastFocusNonce.current = focusRequest.nonce;
    let cx = 0;
    let cy = 0;
    if (focusRequest.kind === 'node') {
      const node = doc.nodes.find((item) => item.id === focusRequest.id);
      if (!node) return;
      cx = node.x + node.w / 2;
      cy = node.y + node.h / 2;
    } else if (focusRequest.kind === 'group') {
      const group = doc.groups.find((item) => item.id === focusRequest.id);
      if (!group) return;
      cx = group.bounds.x + group.bounds.w / 2;
      cy = group.bounds.y + group.bounds.h / 2;
    } else {
      const edge = doc.edges.find((item) => item.id === focusRequest.id);
      if (!edge) return;
      const source = doc.nodes.find((item) => item.id === edge.source);
      const target = doc.nodes.find((item) => item.id === edge.target);
      if (!source || !target) return;
      cx = (source.x + source.w / 2 + target.x + target.w / 2) / 2;
      cy = (source.y + source.h / 2 + target.y + target.h / 2) / 2;
    }
    setCenter(cx, cy, { zoom: 1, duration: 300 });
  }, [doc, focusRequest, setCenter]);

  // 左栏「新建矩形组 / 圈选成组」→ 需要视口信息，所以在这里消费
  useEffect(() => {
    if (!groupRequest) return;
    if (groupRequest === 'lasso') {
      setMode('lasso');
      consumeGroup();
      return;
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 320, y: 240 };
    const id = newId('g');
    dispatch(
      addGroup({
        id,
        title: `分组 ${doc.groups.length + 1}`,
        x: Math.round(center.x - 180),
        y: Math.round(center.y - 130),
        w: 360,
        h: 260,
      }),
    );
    selectGroup(id);
    consumeGroup();
  }, [consumeGroup, dispatch, doc.groups.length, groupRequest, screenToFlowPosition, selectGroup, setMode]);

  // Esc 取消圈选
  useEffect(() => {
    if (mode !== 'lasso') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('select');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, setMode]);

  const finishLasso = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const nodeIds = nodeIdsInRect(model.nodes, rect);
      const id = newId('g');
      dispatch(
        addGroup({
          id,
          title: `分组 ${doc.groups.length + 1}`,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.w),
          h: Math.round(rect.h),
          nodeIds,
        }),
      );
      selectGroup(id);
      setMode('select');
    },
    [dispatch, doc.groups.length, model.nodes, selectGroup, setMode],
  );

  /** H5.6.1：红线待连接态下用一块全画布热区接管下一次点击。
      钉子中心那颗连线手柄会吃掉 onNodeClick（实测点第二颗钉子只是发起了一次拖线，
      连不成红线），所以这里按坐标反查最近的钉子，不依赖手柄命中。 */
  const finishRedLineAt = useCallback(
    (clientX: number, clientY: number) => {
      const from = redLineFrom;
      if (!from) return;
      const point = screenToFlowPosition({ x: clientX, y: clientY });
      let bestId = '';
      let bestDist = Number.POSITIVE_INFINITY;
      for (const item of model.nodes) {
        if (item.type !== 'clusterPin') continue;
        // 起点那颗不参与「最近钉子」竞争：脏案卷里多颗钉子常常叠得很近，
        // 若把起点算进来，点第二颗也会被判成「又点了自己」而取消。
        if (item.id === from) continue;
        const dx = item.x + item.w / 2 - point.x;
        const dy = item.y + item.h / 2 - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = item.id;
        }
      }
      if (!bestId || bestDist > 90) {
        // 探针诊断用：点偏了/没点到钉子时能看出是哪一种
        console.log(`[diag] redline tap x=${Math.round(clientX)} y=${Math.round(clientY)} best=${bestId} dist=${Math.round(bestDist)} from=${from}`);
        cancelRedLine();
        return;
      }
      console.log(`[diag] redline connect from=${from} to=${bestId} dist=${Math.round(bestDist)}`);
      dispatch(
        addEdge({
          source: from,
          target: bestId,
          sourceHandle: 'right',
          targetHandle: 'right-in',
          relType: 'related',
          label: '红线',
          style: 'solid',
          color: '#C0392B',
          thickness: 4,
          directed: false,
          confidence: 60,
        }),
      );
      cancelRedLine();
      pushNotice('已用红线连起两颗集中钉子');
      {
        // 探针诊断：确认这条边真的进了文档，以及两端节点是否都在渲染集合里
        const docNow = useDocStore.getState().doc;
        const last = docNow?.edges[docNow.edges.length - 1];
        const inNodes = (id: string | undefined) => (id ? docNow?.nodes.some((n) => n.id === id) : false);
        console.log(`[diag] redline added edges=${docNow?.edges.length ?? -1} id=${last?.id ?? 'none'} src=${last?.source ?? ''}(${inNodes(last?.source)}) tgt=${last?.target ?? ''}(${inNodes(last?.target)})`);
      }
    },
    [cancelRedLine, dispatch, model.nodes, pushNotice, redLineFrom, screenToFlowPosition],
  );

  return (
    <div
      className={'cb-canvas cb-canvas--' + canvasSkin}
      ref={wrapperRef}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDoubleClick={onCanvasDoubleClick}
      onContextMenu={onCanvasContextMenu}
    >
      {canvasBgUrl ? (
        <img
          className="cb-canvas__bg"
          src={canvasBgUrl}
          alt=""
          aria-hidden="true"
          style={{ opacity: canvasConfig.opacity ?? 0.35 }}
          draggable={false}
        />
      ) : null}
      <ReactFlow<BoardFlowNode, CaseFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDrag={onNodeDrag}
        onNodeClick={(_event, node) => {
          // H5.6：红线待连接态——点第二颗集中钉子就成线
          if (redLineFrom) {
            const target = model.nodes.find((item) => item.id === node.id);
            if (target?.type === 'clusterPin') {
              if (target.id === redLineFrom) {
                cancelRedLine();
                return;
              }
              dispatch(
                addEdge({
                  source: redLineFrom,
                  target: target.id,
                  sourceHandle: 'right',
                  targetHandle: 'right-in',
                  relType: 'related',
                  label: '红线',
                  style: 'solid',
                  color: '#C0392B',
                  thickness: 4,
                  directed: false,
                  confidence: 60,
                }),
              );
              cancelRedLine();
              pushNotice('已用红线连起两颗集中钉子');
              return;
            }
            cancelRedLine();
            return;
          }
          // 长按进了多选态：点卡片是加选/减选（触屏没有 Ctrl，靠这条补上）
          if (multiSelect) {
            if (parseBoardNodeId(node.id).kind === 'node') toggleMultiSelect(node.id);
            return;
          }
          // 卡片与图片的选中态由 select 变更驱动（支持框选与 Ctrl 多选），这里只补组
          const group = groupOfBoardNode(node);
          if (group) selectGroup(group.id);
        }}
        onEdgeClick={(_event, edge) => {
          if (parseBoardNodeId(edge.id).kind === 'agg') return;
          selectEdge(edge.id);
        }}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onMoveStart={onBoardMoveStart}
        onMove={onBoardMove}
        onMoveEnd={onBoardMoveEnd}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        // A5：双击缩放交给我们自己的「新建节点」对话框，画布双击不再变焦
        zoomOnDoubleClick={false}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={['Meta', 'Control']}
        // H5.3：钉集要求「对外永远置顶」，层级只能由我们算——关掉 React Flow 选中自动抬层
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        nodesDraggable={!graphLocked}
        nodesConnectable={!graphLocked}
        nodesFocusable={!graphLocked}
        edgesFocusable={!graphLocked}
        deleteKeyCode={graphLocked ? null : ['Delete', 'Backspace']}
        defaultEdgeOptions={{ type: 'bezier', markerEnd: DEFAULT_MARKER }}
        connectionLineStyle={{ stroke: '#C0392B', strokeWidth: 1.6, strokeDasharray: '4 4' }}
        minZoom={0.25}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        onInit={(instance) => {
          instance.fitView({ padding: 0.25 });
        }}
      >
        {/* M15：去掉原点矩阵（点阵），只留很淡的 80px 线条；软木板 / 黑板有自带纹理，不再叠网格 */}
        {showsCanvasGrid(canvasSkin) ? (
          <Background id="cb-grid" variant={BackgroundVariant.Lines} gap={80} size={0.6} color={grid.line} />
        ) : null}
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(node) => {
            const flow = node as BoardFlowNode;
            if (flow.type === 'groupRect') return flow.data.group.color;
            if (flow.type === 'group') return flow.data.superNode.group.color;
            if (flow.type === 'freeImage') return '#8C7A2E';
            return NODE_TYPE_META[flow.data.node.type]?.color ?? '#6E6862';
          }}
          maskColor={grid.mask}
          style={{ width: 150, height: 100, background: 'var(--cb-panel)', border: '1px solid var(--cb-border)' }}
        />
      </ReactFlow>

      {graphLocked ? (
        <div className="cb-canvas__lock" role="status">
          代码有语法错误，图形暂为只读
        </div>
      ) : null}

      <GuideOverlay guides={guides} />

      {mode === 'lasso' ? (
        <LassoOverlay onFinish={finishLasso} onCancel={() => setMode('select')} />
      ) : null}

      {pending ? <ConnectDialog connection={pending} onClose={() => setPending(null)} /> : null}

      {ctxMenu ? (
        <>
          <div className="cb-ctxmenu__mask" onPointerDown={closeContextMenu} onContextMenu={(event) => event.preventDefault()} />
          <div
            ref={ctxMenuRef}
            className="cb-ctxmenu"
            role="menu"
            aria-label="画布右键菜单"
            style={{ left: ctxPos?.left ?? ctxMenu.clientX, top: ctxPos?.top ?? ctxMenu.clientY }}
          >
            <button type="button" className="cb-ctxmenu__item" role="menuitem" onClick={createPlainNode}>
              新建节点…
            </button>
            <button
              type="button"
              className="cb-ctxmenu__item"
              role="menuitem"
              onClick={() => addRelationBubble(null)}
            >
              新建关系气泡
            </button>
            {ctxMenu.nodeId ? (
              <button
                type="button"
                className="cb-ctxmenu__item"
                role="menuitem"
                onClick={() => addRelationBubble(ctxMenu.nodeId)}
              >
                新建关系气泡并连到此实体
              </button>
            ) : null}
            {ctxMenu.nodeId ? (
              (() => {
                const ctxNode = model.nodes.find((item) => item.id === ctxMenu.nodeId);
                return ctxNode?.type === 'clusterPin' ? (
                  <button
                    type="button"
                    className="cb-ctxmenu__item"
                    role="menuitem"
                    data-diag="ctx-redline"
                    onClick={() => {
                      const id = ctxMenu.nodeId;
                      closeContextMenu();
                      if (id) startRedLine(id);
                    }}
                  >
                    创建红线（点另一颗集中钉子连起来）
                  </button>
                ) : null;
              })()
            ) : null}
            {ctxMenu.nodeId ? (
              // 触屏上「长按卡片」被 ArkWeb 抢去弹系统/页面右键菜单（实测模拟器上长按卡片
              // 直接弹出这个菜单，BaseNode 自己的 480ms 计时器收不到完整的触摸序列），
              // 所以多选在这里给一个明确入口：长按 → 多选卡片 → 再点其它卡片加选。
              <button
                type="button"
                className="cb-ctxmenu__item"
                role="menuitem"
                data-diag="ctx-multiselect"
                onClick={() => {
                  const id = ctxMenu.nodeId;
                  closeContextMenu();
                  if (id) enterMultiSelect(id);
                }}
              >
                多选卡片（选多张一起加进组框）
              </button>
            ) : null}
            {ctxMenu.nodeId ? (
              <button
                type="button"
                className="cb-ctxmenu__item cb-ctxmenu__item--danger"
                role="menuitem"
                data-diag="ctx-delete"
                onClick={() => {
                  const id = ctxMenu.nodeId;
                  closeContextMenu();
                  if (!id) return;
                  const target = model.nodes.find((item) => item.id === id);
                  if (target?.type === 'clusterPin') {
                    // 删钉子前先把钉集成员放出来，免得留下指向已删钉子的悬空 clusterId
                    for (const image of doc.imageNodes.filter((item) => item.clusterId === id)) {
                      dispatch(detachImageFromCluster(image.id));
                    }
                  }
                  dispatch(deleteNode(id));
                  pushNotice(`已删除「${target?.title ?? '该节点'}」及其关系线（可撤销）`);
                }}
              >
                删除此节点（连带其关系线，可撤销）
              </button>
            ) : null}
            <div className="cb-ctxmenu__hint">关系气泡是圆角矩形，可以把多条关系线汇到它上面</div>
          </div>
        </>
      ) : null}
      {redLineFrom ? (
        <div
          className="cb-redline-layer"
          data-diag="redline-layer"
          onPointerDown={(event) => {
            event.preventDefault();
            finishRedLineAt(event.clientX, event.clientY);
          }}
        />
      ) : null}
      {redLineFrom ? (
        <div className="cb-redline-hint" role="status" data-diag="redline-hint">
          <span className="cb-redline-hint__text">红线：点另一颗集中钉子连起来</span>
          <button type="button" className="cb-btn" onClick={cancelRedLine}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
