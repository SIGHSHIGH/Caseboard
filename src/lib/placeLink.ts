/**
 * 地点字段自动连线（M12 / K15，纯函数）。
 *
 * 用户在「发生时刻」那一行右侧的「地点」里填了一个名字，如果这名字正好是
 * 已经建好的地点/单位实体，就顺手连一条关系线——但必须是「推测」的写法
 * （虚线 + 置信度 50），不能冒充已证实（Gate 0-3）。
 */
import type { CaseDoc, CaseNode } from '../types';

/** 地点字段认这两种类型的实体 */
export const PLACE_TYPES: CaseNode['type'][] = ['place', 'org'];

/**
 * 找出该实体应该自动连到哪个已有地点。
 * - 只认标题完全相同（忽略大小写与首尾空白）；
 * - 不看自己；
 * - 两端已经有任何关系时返回 null（不重复连线）。
 */
export function matchPlaceForNode(doc: CaseDoc, nodeId: string, text: string): CaseNode | null {
  const target = text.trim().toLowerCase();
  if (!target) return null;
  const hit = doc.nodes.find(
    (node) =>
      node.id !== nodeId &&
      PLACE_TYPES.includes(node.type) &&
      node.title.trim().toLowerCase() === target,
  );
  if (!hit) return null;
  const linked = doc.edges.some(
    (edge) =>
      (edge.source === nodeId && edge.target === hit.id) ||
      (edge.source === hit.id && edge.target === nodeId),
  );
  return linked ? null : hit;
}

/** 地点自动连线的固定关系参数（虚线 = 推测，置信度 50 表示只是字段推断） */
export const PLACE_LINK_EDGE = {
  relType: 'related',
  label: '地点',
  directed: false,
  style: 'dashed' as const,
  confidence: 50,
};
