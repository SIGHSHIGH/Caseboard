import type { CaseEdge, CaseNode } from '../types';
import type { Command } from './types';

export interface RestoreEntitiesInput {
  nodes?: CaseNode[];
  edges?: CaseEdge[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 从回收站整批恢复：实体与它的关系在同一个命令里落盘，
 * 这样 Ctrl+Z 只需按一次就能把「恢复」整体撤回（M4 修复：恢复实体时关系丢失）。
 */
export function restoreEntities(input: RestoreEntitiesInput): Command {
  const nodes = (input.nodes ?? []).map(clone);
  const edges = (input.edges ?? []).map(clone);
  const label =
    nodes.length > 0 && edges.length > 0
      ? '恢复实体与关系（' + nodes.length + ' 实体 / ' + edges.length + ' 关系）'
      : nodes.length > 0
        ? '恢复实体：' + (nodes[0].title || nodes[0].id)
        : '恢复关系：' + (edges[0]?.label ?? edges[0]?.relType ?? '');
  return {
    label,
    apply(draft) {
      let changed = false;
      for (const node of nodes) {
        if (draft.nodes.some((item) => item.id === node.id)) continue;
        draft.nodes.push(clone(node));
        changed = true;
      }
      for (const edge of edges) {
        if (draft.edges.some((item) => item.id === edge.id)) continue;
        const hasSource = draft.nodes.some((item) => item.id === edge.source);
        const hasTarget = draft.nodes.some((item) => item.id === edge.target);
        if (!hasSource || !hasTarget) continue;
        draft.edges.push(clone(edge));
        changed = true;
      }
      if (changed) draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
