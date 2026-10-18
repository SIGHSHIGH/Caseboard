import { memo, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { updateEdge } from '../../commands';
import { LINE_STYLE_META, relColor } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import type { CaseEdge } from '../../types';

export type CaseEdgeData = { edge: CaseEdge };
export type CaseFlowEdge = Edge<CaseEdgeData, 'bezier'>;

function weightToWidth(weight?: number): number {
  if (!weight || weight <= 0) return 1.6;
  const scaled = 1.4 + Math.log10(weight) * 0.45;
  return Math.max(1.4, Math.min(4.5, scaled));
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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(edge?.label ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!edge) return null;

  const lineStyle = LINE_STYLE_META[edge.style];
  const stroke = edge.color ?? relColor(edge.relType);
  const dash = lineStyle.dash;

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
          strokeWidth: selected ? weightToWidth(edge.weight) + 1 : weightToWidth(edge.weight),
          strokeDasharray: dash,
          opacity: selected ? 1 : 0.88,
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
          className={`cb-edge-label${selected ? ' is-selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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
    </>
  );
}

export const BezierEdge = memo(BezierEdgeInner);
