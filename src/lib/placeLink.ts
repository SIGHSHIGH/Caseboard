/**
 * 地点字段自动连线（M12 / K15，纯函数）。
 *
 * 用户在「发生时刻」那一行右侧的「地点」里填了一个名字，如果这名字正好是
 * 已经建好的地点/单位实体，就顺手连一条关系线——但必须是「推测」的写法
 * （虚线 + 置信度 50），不能冒充已证实（Gate 0-3）。
 */
import type { CaseDoc, CaseEdge, CaseNode } from '../types';

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

/** 这条关系线是不是「地点」字段自动生成的（人工建的关系线标签不会是「地点」） */
export function isPlaceLinkEdge(edge: CaseEdge): boolean {
  return edge.label === PLACE_LINK_EDGE.label;
}

/** 该实体与地点/单位之间由「地点」字段自动生成的关系线 */
export function placeLinkEdges(doc: CaseDoc, nodeId: string): CaseEdge[] {
  return doc.edges.filter((edge) => {
    if (!isPlaceLinkEdge(edge)) return false;
    const otherId =
      edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
    if (!otherId) return false;
    const other = doc.nodes.find((node) => node.id === otherId);
    return other !== undefined && PLACE_TYPES.includes(other.type);
  });
}

export interface PlaceRelinkPlan {
  /** 需要断开的旧自动关系线（改地点或清空地点时） */
  removeEdgeIds: string[];
  /** 新值命中的地点/单位；已经连着或已有其它关系线时为 null */
  addTarget: CaseNode | null;
}

/**
 * 改动「地点」字段时该怎么重连（M13 / L9）。
 *
 * - 旧的自动关系线要断开，包括把地点整段清空的情况；
 * - 新值命中地点/单位就连新的；
 * - 目标没变（同一条线还在）则既不删也不加，避免每次失焦都重建；
 * - 两端已有别的关系线（人工建的）时不再新增，尊重人工判断。
 */
export function planPlaceRelink(doc: CaseDoc, nodeId: string, text: string): PlaceRelinkPlan {
  const target = text.trim().toLowerCase();
  const hit = target
    ? doc.nodes.find(
        (node) =>
          node.id !== nodeId &&
          PLACE_TYPES.includes(node.type) &&
          node.title.trim().toLowerCase() === target,
      ) ?? null
    : null;
  const edges = placeLinkEdges(doc, nodeId);
  const removeEdgeIds: string[] = [];
  let kept = false;
  for (const edge of edges) {
    const otherId = edge.source === nodeId ? edge.target : edge.source;
    if (hit && otherId === hit.id) {
      kept = true;
      continue;
    }
    removeEdgeIds.push(edge.id);
  }
  if (kept) return { removeEdgeIds, addTarget: null };
  const blocked = hit
    ? doc.edges.some((edge) => {
        if (removeEdgeIds.includes(edge.id)) return false;
        return (
          (edge.source === nodeId && edge.target === hit.id) ||
          (edge.target === nodeId && edge.source === hit.id)
        );
      })
    : false;
  return { removeEdgeIds, addTarget: blocked ? null : hit };
}
