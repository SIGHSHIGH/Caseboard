/**
 * 演示视图的排序与关联（M5-5）：
 * - 讲解顺序按「实体类型（人物→组织→地点→物品→事件→证据→时间→笔记）→ 标题」，
 *   同一份案件在任何机器上顺序一致，便于按提纲讲。
 * - 关联关系双向收集，同一跳的并列关系按 id 排序，避免渲染顺序抖动。
 */
import { NODE_TYPE_ORDER } from './nodeTemplates';
import type { CaseDoc, CaseEdge, CaseNode, NodeType } from '../types';

export interface RelatedEntity {
  edge: CaseEdge;
  direction: 'out' | 'in' | 'both';
  other: CaseNode;
}

function typeRank(type: NodeType): number {
  const index = NODE_TYPE_ORDER.indexOf(type);
  return index < 0 ? NODE_TYPE_ORDER.length : index;
}

/** 演示顺序：先按实体类型，再按中文标题，最后按 id 兜底 */
export function presentationOrder(doc: CaseDoc): CaseNode[] {
  return [...doc.nodes].sort((a, b) => {
    const byType = typeRank(a.type) - typeRank(b.type);
    if (byType !== 0) return byType;
    const byTitle = a.title.localeCompare(b.title, 'zh-CN');
    if (byTitle !== 0) return byTitle;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 与某个实体相关的全部关系（出边、入边、自环），并带出对端实体 */
export function relatedOf(doc: CaseDoc, nodeId: string): RelatedEntity[] {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const list: RelatedEntity[] = [];
  for (const edge of doc.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    const direction: RelatedEntity['direction'] =
      edge.source === nodeId && edge.target === nodeId ? 'both' : edge.source === nodeId ? 'out' : 'in';
    const otherId = edge.source === nodeId ? edge.target : edge.source;
    const other = byId.get(otherId);
    if (!other) continue;
    list.push({ edge, direction, other });
  }
  return list.sort((a, b) => {
    const byTitle = a.other.title.localeCompare(b.other.title, 'zh-CN');
    if (byTitle !== 0) return byTitle;
    return a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0;
  });
}

/** 演示台上的一屏：实体 + 它的全部关联 */
export interface PresentSlide {
  node: CaseNode;
  related: RelatedEntity[];
}

export function presentationDeck(doc: CaseDoc): PresentSlide[] {
  return presentationOrder(doc).map((node) => ({ node, related: relatedOf(doc, node.id) }));
}
