import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  deleteGroup,
  deleteImageNode,
  moveGroup,
  moveImageNode,
  moveImageNodes,
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
import { newId } from '../../lib/id';
import { fitImageSize, snapImageRect, type AlignGuide } from '../../lib/imageNode';
import { BOARD_GRID } from '../../lib/themeMode';
import { NODE_TYPE_META } from '../../lib/theme';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodeStore } from '../../store/codeStore';
import { useDocStore } from '../../store/docStore';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import { useViewStore } from '../../store/viewStore';
import type { CaseNode, Group, ImageNode, XY } from '../../types';
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
  const setMode = useUiStore((s) => s.setMode);
  const setNodeSelection = useUiStore((s) => s.setNodeSelection);
  const applyImageSelection = useUiStore((s) => s.applyImageSelection);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setDragPos = useUiStore((s) => s.setDragPos);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const graphLocked = useCodeStore((s) => s.state === 'error');
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // 代码侧请求居中时用 nonce 去重：文档后续变化不该把视口抢回去
  const lastFocusNonce = useRef(0);
  const [pending, setPending] = useState<Connection | null>(null);
  const themeMode = useThemeStore((s) => s.mode);
  const grid = BOARD_GRID[themeMode] ?? BOARD_GRID.board;

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
        style: { width: node.w },
        };
      });

    // 自由图片节点：不依附卡片，层级由自身 zIndex 决定（可压住/被压住）
    const imageNodes: BoardFlowNode[] = doc.imageNodes.map((image) => ({
      id: image.id,
      type: 'freeImage',
      position: dragPos[image.id] ?? { x: image.x, y: image.y },
      data: {
        image,
        asset: doc.assets.find((item) => item.id === image.assetId),
        attachTarget: attachTargetId === image.id,
      },
      selected: selectedImageIds.includes(image.id),
      zIndex: image.zIndex,
      style: { width: image.w, height: image.h },
    }));

    // 组矩形永远排在前面，保证 zIndex -1 生效时不被节点层打乱
    return [...groupNodes, ...baseNodes, ...superNodes, ...imageNodes];
  }, [
    model,
    dragPos,
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
        return {
          id: edge.id,
          type: 'bezier' as const,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? 'right',
          targetHandle: edge.targetHandle ?? 'left',
          data: { edge, dimmed, highlighted: highlight.edges.has(edge.id) },
          selected: edge.id === selectedEdgeId,
          markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
        };
      });
  }, [model.edges, selectedEdgeId, view, memberState, doc, highlight]);

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
      if (node.type !== 'freeImage') return;
      const image = doc.imageNodes.find((item) => item.id === node.id);
      if (!image) return;
      const moving = { x: node.position.x, y: node.position.y, w: image.w, h: image.h };
      const result = snapImageRect(moving, otherRectsFor(image.id));
      setGuides(result.guides);
      // 图片中心落到某张卡片上 → 高亮，松手吸附为头像/附件
      const centerX = moving.x + moving.w / 2;
      const centerY = moving.y + moving.h / 2;
      const hit = model.nodes.find(
        (item) => centerX >= item.x && centerX <= item.x + item.w && centerY >= item.y && centerY <= item.y + item.h,
      );
      setAttachTarget(hit ? hit.id : null);
    },
    [doc.imageNodes, model.nodes, otherRectsFor, setAttachTarget, setGuides],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: BoardFlowNode) => {
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
          if (companions.length > 0) {
            dispatch(
              moveImageNodes([
                { id: node.id, x: result.rect.x, y: result.rect.y },
                ...companions.map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy })),
              ]),
            );
          } else {
            dispatch(moveImageNode(node.id, result.rect.x, result.rect.y));
          }
          if (attachTargetId && attachTargetId !== image.linkedNodeId) {
            dispatch(attachImageNode(node.id, attachTargetId));
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
      if (selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)) {
        const positions = selectedNodeIds
          .map((id) => doc.nodes.find((item) => item.id === id))
          .filter((item): item is CaseNode => item !== undefined)
          .map((item) => {
            const pending = dragPos[item.id];
            return { id: item.id, x: Math.round(pending ? pending.x : item.x), y: Math.round(pending ? pending.y : item.y) };
          });
        dispatch(moveNodes(positions));
        for (const position of positions) setDragPos(position.id, null);
        return;
      }
      dispatch(moveNode(node.id, Math.round(node.position.x), Math.round(node.position.y)));
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
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        dispatch(
          addNode({
            type: 'note',
            title: '新便签',
            x: Math.round(position.x - 104),
            y: Math.round(position.y - 48),
          }),
        );
        return;
      }
      clearSelection();
    },
    [clearSelection, dispatch, mode, screenToFlowPosition],
  );

  const onConnect = useCallback((connection: Connection) => {
    setPending(connection);
  }, []);

  // 素材库拖入画布 → 在落点中心生成自由图片节点
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const assetId = event.dataTransfer.getData(ASSET_DND_TYPE);
      if (!assetId) return;
      event.preventDefault();
      const asset = doc.assets.find((item) => item.id === assetId);
      if (!asset) return;
      const size = fitImageSize(asset.width, asset.height);
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = newId('img');
      dispatch(
        addImageNode({
          id,
          assetId,
          x: Math.round(point.x - size.w / 2),
          y: Math.round(point.y - size.h / 2),
          w: size.w,
          h: size.h,
          siblings: doc.imageNodes,
        }),
      );
      selectImage(id);
    },
    [dispatch, doc.assets, doc.imageNodes, screenToFlowPosition, selectImage],
  );

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
    const jitter = Math.round((Math.random() - 0.5) * 48);
    dispatch(
      addNode({
        type: addRequest as CaseNode['type'],
        x: Math.round(center.x - 104 + jitter),
        y: Math.round(center.y - 48 + jitter),
      }),
    );
    consumeAdd();
  }, [addRequest, consumeAdd, dispatch, screenToFlowPosition]);

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

  return (
    <div className="cb-canvas" ref={wrapperRef} onDrop={onDrop} onDragOver={onDragOver}>
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
          // 卡片与图片的选中态由 select 变更驱动（支持框选与 Ctrl 多选），这里只补组
          const group = groupOfBoardNode(node);
          if (group) selectGroup(group.id);
        }}
        onEdgeClick={(_event, edge) => {
          if (parseBoardNodeId(edge.id).kind === 'agg') return;
          selectEdge(edge.id);
        }}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        selectionOnDrag
        selectionMode={SelectionMode.Full}
        panOnDrag={[1, 2]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={['Meta', 'Control']}
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} color={grid.dot} />
        <Background id="cb-grid" variant={BackgroundVariant.Lines} gap={80} size={0.6} color={grid.line} />
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
          style={{ background: 'var(--cb-panel)', border: '1px solid var(--cb-border)' }}
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
    </div>
  );
}
