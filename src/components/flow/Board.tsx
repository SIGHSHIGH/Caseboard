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
import { addNode, deleteEdge, deleteNode, moveNode } from '../../commands';
import { NODE_TYPE_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { NodeType } from '../../types';
import { ConnectDialog } from '../panels/ConnectDialog';
import { BaseNode, type BaseFlowNode } from './BaseNode';
import { BezierEdge, type CaseFlowEdge } from './BezierEdge';

const nodeTypes = { base: BaseNode };
const edgeTypes = { bezier: BezierEdge };

const DEFAULT_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6E6862' } as const;

export function Board() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const dragPos = useUiStore((s) => s.dragPos);
  const addRequest = useUiStore((s) => s.addRequest);
  const consumeAdd = useUiStore((s) => s.consumeAdd);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setDragPos = useUiStore((s) => s.setDragPos);
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Connection | null>(null);

  const nodes = useMemo<BaseFlowNode[]>(
    () =>
      doc.nodes.map((node) => ({
        id: node.id,
        type: 'base',
        position: dragPos[node.id] ?? { x: node.x, y: node.y },
        data: { node },
        selected: node.id === selectedNodeId,
        style: { width: node.w },
      })),
    [doc.nodes, dragPos, selectedNodeId],
  );

  const edges = useMemo<CaseFlowEdge[]>(
    () =>
      doc.edges.map((edge) => ({
        id: edge.id,
        type: 'bezier',
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? 'right',
        targetHandle: edge.targetHandle ?? 'left',
        data: { edge },
        selected: edge.id === selectedEdgeId,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      })),
    [doc.edges, selectedEdgeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BaseFlowNode>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          setDragPos(change.id, change.position);
        }
      }
    },
    [setDragPos],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: BaseFlowNode) => {
      dispatch(moveNode(node.id, Math.round(node.position.x), Math.round(node.position.y)));
      setDragPos(node.id, null);
    },
    [dispatch, setDragPos],
  );

  const onNodesDelete = useCallback(
    (deleted: BaseFlowNode[]) => {
      for (const node of deleted) dispatch(deleteNode(node.id));
    },
    [dispatch],
  );

  const onEdgesDelete = useCallback(
    (deleted: CaseFlowEdge[]) => {
      for (const edge of deleted) dispatch(deleteEdge(edge.id));
    },
    [dispatch],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
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
    [clearSelection, dispatch, screenToFlowPosition],
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
        type: addRequest as NodeType,
        x: Math.round(center.x - 104 + jitter),
        y: Math.round(center.y - 48 + jitter),
      }),
    );
    consumeAdd();
  }, [addRequest, consumeAdd, dispatch, screenToFlowPosition]);

  return (
    <div className="cb-canvas" ref={wrapperRef}>
      <ReactFlow<BaseFlowNode, CaseFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_event, node) => selectNode(node.id)}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
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
            const flow = node as BaseFlowNode;
            return NODE_TYPE_META[flow.data.node.type]?.color ?? '#6E6862';
          }}
          maskColor="rgba(245, 243, 239, 0.75)"
          style={{ background: '#FBFAF7', border: '1px solid #E2DED5' }}
        />
      </ReactFlow>

      {pending ? (
        <ConnectDialog connection={pending} onClose={() => setPending(null)} />
      ) : null}
    </div>
  );
}
