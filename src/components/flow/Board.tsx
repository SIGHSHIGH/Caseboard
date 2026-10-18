import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import {
  addGroup,
  addNode,
  deleteEdge,
  deleteGroup,
  deleteNode,
  moveGroup,
  moveNode,
} from '../../commands';
import { buildRenderModel, descendantGroupIdsOf, nodeIdsInRect, parseBoardNodeId } from '../../lib/groups';
import { newId } from '../../lib/id';
import { NODE_TYPE_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseNode, Group, XY } from '../../types';
import { ConnectDialog } from '../panels/ConnectDialog';
import { BaseNode, type BaseFlowNode } from './BaseNode';
import { BezierEdge, type CaseFlowEdge } from './BezierEdge';
import { GroupNode, type GroupFlowNode } from './GroupNode';
import { GroupRectNode, type GroupRectFlowNode } from './GroupRectNode';
import { LassoOverlay } from './LassoOverlay';

/** 展开态分组在 React Flow 里的节点 id 前缀（与折叠超级节点区分） */
export const RECT_NODE_PREFIX = '__rect:';

export function rectNodeId(groupId: string): string {
  return RECT_NODE_PREFIX + groupId;
}

type BoardFlowNode = BaseFlowNode | GroupFlowNode | GroupRectFlowNode;

const nodeTypes = { base: BaseNode, group: GroupNode, groupRect: GroupRectNode };
const edgeTypes = { bezier: BezierEdge };

const DEFAULT_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6E6862' } as const;

function groupOfBoardNode(node: BoardFlowNode): Group | null {
  if (node.type === 'groupRect') return node.data.group;
  if (node.type === 'group') return node.data.superNode.group;
  return null;
}

export function Board() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const dragPos = useUiStore((s) => s.dragPos);
  const addRequest = useUiStore((s) => s.addRequest);
  const groupRequest = useUiStore((s) => s.groupRequest);
  const mode = useUiStore((s) => s.mode);
  const consumeAdd = useUiStore((s) => s.consumeAdd);
  const consumeGroup = useUiStore((s) => s.consumeGroup);
  const setMode = useUiStore((s) => s.setMode);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setDragPos = useUiStore((s) => s.setDragPos);
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Connection | null>(null);

  // 折叠 / 聚合后的渲染模型（单一数据源的派生视图，不写回 doc）
  const model = useMemo(() => buildRenderModel(doc), [doc]);

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
    const groupNodes: BoardFlowNode[] = model.groups.map(({ group, memberCount, childCount }) => ({
      id: rectNodeId(group.id),
      type: 'groupRect',
      position: dragPos[rectNodeId(group.id)] ?? { x: group.bounds.x, y: group.bounds.y },
      data: { group, memberCount, childCount },
      selected: group.id === selectedGroupId,
      zIndex: -1,
      style: { width: group.bounds.w, height: group.bounds.h },
    }));

    const superNodes: BoardFlowNode[] = model.superNodes.map((superNode) => {
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
        style: { width: superNode.node.w },
      };
    });

    const baseNodes: BoardFlowNode[] = model.nodes.map((node) => {
      const own = dragPos[node.id];
      const offset = own ? null : offsetOfNode(node);
      return {
        id: node.id,
        type: 'base',
        position: own ?? { x: node.x + (offset?.x ?? 0), y: node.y + (offset?.y ?? 0) },
        data: { node },
        selected: node.id === selectedNodeId,
        style: { width: node.w },
      };
    });

    // 组矩形永远排在前面，保证 zIndex -1 生效时不被节点层打乱
    return [...groupNodes, ...baseNodes, ...superNodes];
  }, [model, dragPos, selectedNodeId, selectedGroupId, offsetOfGroup, offsetOfNode]);

  const edges = useMemo<CaseFlowEdge[]>(
    () =>
      model.edges.map((edge) => ({
        id: edge.id,
        type: 'bezier',
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? 'right',
        targetHandle: edge.targetHandle ?? 'left',
        data: { edge },
        selected: edge.id === selectedEdgeId,
        markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
      })),
    [model.edges, selectedEdgeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BoardFlowNode>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          setDragPos(change.id, change.position);
        }
      }
    },
    [setDragPos],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: BoardFlowNode) => {
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
      dispatch(moveNode(node.id, Math.round(node.position.x), Math.round(node.position.y)));
      setDragPos(node.id, null);
    },
    [dispatch, doc.groups, setDragPos],
  );

  const onNodesDelete = useCallback(
    (deleted: BoardFlowNode[]) => {
      for (const node of deleted) {
        const group = groupOfBoardNode(node);
        if (group) dispatch(deleteGroup(group.id));
        else dispatch(deleteNode(node.id));
      }
    },
    [dispatch],
  );

  const onEdgesDelete = useCallback(
    (deleted: CaseFlowEdge[]) => {
      for (const edge of deleted) {
        if (parseBoardNodeId(edge.id).kind === 'agg') continue;
        dispatch(deleteEdge(edge.id));
      }
    },
    [dispatch],
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
    <div className="cb-canvas" ref={wrapperRef}>
      <ReactFlow<BoardFlowNode, CaseFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_event, node) => {
          const group = groupOfBoardNode(node);
          if (group) selectGroup(group.id);
          else selectNode(node.id);
        }}
        onEdgeClick={(_event, edge) => {
          if (parseBoardNodeId(edge.id).kind === 'agg') return;
          selectEdge(edge.id);
        }}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Delete', 'Backspace']}
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} color="#D9D4CA" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(node) => {
            const flow = node as BoardFlowNode;
            if (flow.type === 'groupRect') return flow.data.group.color;
            if (flow.type === 'group') return flow.data.superNode.group.color;
            return NODE_TYPE_META[flow.data.node.type]?.color ?? '#6E6862';
          }}
          maskColor="rgba(245, 243, 239, 0.75)"
          style={{ background: '#FBFAF7', border: '1px solid #E2DED5' }}
        />
      </ReactFlow>

      {mode === 'lasso' ? (
        <LassoOverlay onFinish={finishLasso} onCancel={() => setMode('select')} />
      ) : null}

      {pending ? <ConnectDialog connection={pending} onClose={() => setPending(null)} /> : null}
    </div>
  );
}
