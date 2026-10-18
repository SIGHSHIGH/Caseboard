import { memo, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { updateEdge } from '../../commands';
import { CURVE_MIN, curveGeometry, curveOffsetFromHandle, curveOffsetOf, curvePath } from '../../lib/edgeCurve';
import { LINE_STYLE_META, relColor } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import type { CaseEdge, XY } from '../../types';

export type CaseEdgeData = {
  edge: CaseEdge;
  dimmed?: boolean;
  /** 落在当前高亮路径上（M5-3） */
  highlighted?: boolean;
};
export type CaseFlowEdge = Edge<CaseEdgeData, 'bezier'>;

function weightToWidth(weight?: number): number {
  if (!weight || weight <= 0) return 1.6;
  const scaled = 1.4 + Math.log10(weight) * 0.45;
  return Math.max(1.4, Math.min(4.5, scaled));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function BezierEdgeInner({
  id,
  data,
  selected,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<CaseFlowEdge>) {
  const edge = data?.edge;
  const dispatch = useDocStore((s) => s.dispatch);
  const { screenToFlowPosition } = useReactFlow();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(edge?.label ?? '');
  const [dragging, setDragging] = useState(false);
  const [previewOffset, setPreviewOffset] = useState<XY | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 默认走 React Flow 的贝塞尔；一旦有了曲率偏移就改用自绘三次贝塞尔 */
  const [basePath, baseLabelX, baseLabelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const mid = { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
  const storedOffset = edge ? curveOffsetOf(edge) : null;
  const offset = previewOffset ?? storedOffset;
  const geometry = offset ? curveGeometry({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, offset) : null;
  const path = geometry ? curvePath(geometry) : basePath;
  const handleX = geometry ? geometry.handle.x : baseLabelX;
  const handleY = geometry ? geometry.handle.y : baseLabelY;

  const midRef = useRef(mid);
  const previewRef = useRef<XY | null>(previewOffset);
  midRef.current = mid;
  previewRef.current = previewOffset;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  /** 曲率手柄：按下后监听 window，拖到哪曲线就弯到哪；松手才压一次撤销 */
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setPreviewOffset(curveOffsetFromHandle(midRef.current, point));
    };
    const finish = () => {
      const next = previewRef.current;
      setDragging(false);
      setPreviewOffset(null);
      if (!next) return;
      const tiny = Math.hypot(next.x, next.y) < CURVE_MIN;
      dispatch(
        updateEdge(id, {
          controlPoints: tiny ? undefined : [{ x: round1(next.x), y: round1(next.y) }],
        }),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragging, dispatch, id, screenToFlowPosition]);

  if (!edge) return null;

  const lineStyle = LINE_STYLE_META[edge.style];
  const stroke = edge.color ?? relColor(edge.relType);
  const dash = lineStyle.dash;
  const highlighted = data?.highlighted === true;
  const width = weightToWidth(edge.weight) + (selected ? 1 : 0) + (highlighted ? 1.8 : 0);

  const commitLabel = () => {
    const label = draft.trim();
    if (label !== (edge.label ?? '')) {
      dispatch(updateEdge(id, { label: label.length > 0 ? label : undefined }));
    }
    setEditing(false);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: width,
          strokeDasharray: dash,
          opacity: data?.dimmed ? 0.16 : selected || highlighted ? 1 : 0.88,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: 'pointer' }}
        className="cb-edge-hit"
      />
      <EdgeLabelRenderer>
        <div
          className={`cb-edge-label${selected ? ' is-selected' : ''}${highlighted ? ' is-path' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${handleX}px, ${handleY}px)`,
            borderColor: stroke,
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            setDraft(edge.label ?? '');
            setEditing(true);
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              className="cb-edge-label__input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitLabel();
                if (event.key === 'Escape') {
                  setDraft(edge.label ?? '');
                  setEditing(false);
                }
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="cb-edge-label__text">
              {edge.label ?? edge.relType}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
      {selected ? (
        <EdgeLabelRenderer>
          <div
            className={`cb-curve-handle nodrag nopan${dragging ? ' is-dragging' : ''}`}
            title="拖动调整曲线弧度（双击复位）"
            style={{ transform: `translate(-50%, -50%) translate(${handleX}px, ${handleY}px)` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setPreviewOffset(offset ?? { x: 0, y: 0 });
              setDragging(true);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              dispatch(updateEdge(id, { controlPoints: undefined }));
            }}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const BezierEdge = memo(BezierEdgeInner);
