import type { CaseEdge, LineStyle } from '../types';
import { newId } from '../lib/id';
import type { Command } from './types';

export interface AddEdgeInput {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  relType?: string;
  label?: string;
  directed?: boolean;
  style?: LineStyle;
  confidence?: number;
  weight?: number;
  /** 线宽像素（M17） */
  thickness?: number;
  /** 是否允许自动梳理改写连接点（M18） */
  autoAnchor?: boolean;
  /** 自动梳理挑出的曲率（M18） */
  curvature?: number;
  color?: string;
  time?: { start: string; end?: string };
  evidenceIds?: string[];
  id?: string;
}

export function addEdge(input: AddEdgeInput): Command {
  const relType = input.relType ?? 'related';
  return {
    label: `新增关系：${input.label ?? relType}`,
    apply(draft) {
      const edge: CaseEdge = {
        id: input.id ?? newId('edge'),
        source: input.source,
        target: input.target,
        sourceHandle: input.sourceHandle,
        targetHandle: input.targetHandle,
        path: 'bezier',
        relType,
        directed: input.directed ?? true,
        style: input.style ?? 'dotted',
        confidence: input.confidence ?? 40,
        evidenceIds: input.evidenceIds ?? [],
      };
      if (input.label !== undefined) edge.label = input.label;
      if (input.weight !== undefined) edge.weight = input.weight;
      if (input.thickness !== undefined) edge.thickness = input.thickness;
      if (input.autoAnchor === false) edge.autoAnchor = false;
      if (input.curvature !== undefined) edge.curvature = input.curvature;
      if (input.color !== undefined) edge.color = input.color;
      if (input.time !== undefined) edge.time = input.time;
      draft.edges.push(edge);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function updateEdge(id: string, patch: Partial<Omit<CaseEdge, 'id'>>): Command {
  return {
    label: '修改关系属性',
    apply(draft) {
      const edge = draft.edges.find((e) => e.id === id);
      if (!edge) return;
      Object.assign(edge, patch);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 从回收站恢复关系：按原 id 放回，两端节点缺失时不恢复（避免悬空边）。 */
export function restoreEdge(edge: CaseEdge): Command {
  const copy = JSON.parse(JSON.stringify(edge)) as CaseEdge;
  return {
    label: `恢复关系：${copy.label ?? copy.relType}`,
    apply(draft) {
      if (draft.edges.some((e) => e.id === copy.id)) return;
      const hasSource = draft.nodes.some((n) => n.id === copy.source);
      const hasTarget = draft.nodes.some((n) => n.id === copy.target);
      if (!hasSource || !hasTarget) return;
      draft.edges.push(copy);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function deleteEdge(id: string): Command {
  return {
    label: '删除关系',
    apply(draft) {
      const index = draft.edges.findIndex((e) => e.id === id);
      if (index < 0) return;
      draft.edges.splice(index, 1);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
