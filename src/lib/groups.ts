import type { CaseDoc, CaseEdge, CaseNode, Group, LineStyle } from '../types';

/**
 * 分组渲染与层级聚合（M2-2）。
 *
 * 只做纯计算，不碰 store：输入 CaseDoc，输出「本次该画什么」。
 * 规则：
 * - 组内成员通过 CaseNode.groupId 归属；嵌套通过 Group.parentId；
 * - 组折叠后，成员节点与其内部连线隐藏，组变成超级节点；
 * - 折叠组与外部的多条关系聚合成一条，线型取最弱（实线 < 虚线 < 点线），置信度取最低。
 */

export const SUPER_NODE_PREFIX = '__group:';
export const AGG_EDGE_PREFIX = '__agg:';
/** 超级节点固定尺寸，避免折叠前后占位差异过大 */
export const SUPER_W = 236;
export const SUPER_H = 92;

export function superNodeId(groupId: string): string {
  return SUPER_NODE_PREFIX + groupId;
}

export function isSuperId(id: string): boolean {
  return id.startsWith(SUPER_NODE_PREFIX);
}

export function isAggEdgeId(id: string): boolean {
  return id.startsWith(AGG_EDGE_PREFIX);
}

export function groupIdOfSuper(id: string): string {
  return id.slice(SUPER_NODE_PREFIX.length);
}

export interface ParsedBoardNodeId {
  kind: 'node' | 'super' | 'agg';
  /** 去掉合成前缀后的原始 id（组 id / 聚合键） */
  raw: string;
  groupId?: string;
}

/** 统一解析画布上的合成 id：普通节点 / 折叠超级节点 / 聚合连线 */
export function parseBoardNodeId(id: string): ParsedBoardNodeId {
  if (id.startsWith(SUPER_NODE_PREFIX)) {
    const groupId = groupIdOfSuper(id);
    return { kind: 'super', raw: groupId, groupId };
  }
  if (id.startsWith(AGG_EDGE_PREFIX)) {
    return { kind: 'agg', raw: id.slice(AGG_EDGE_PREFIX.length) };
  }
  return { kind: 'node', raw: id };
}

export function findGroup(doc: CaseDoc, groupId: string): Group | undefined {
  return doc.groups.find((group) => group.id === groupId);
}

/**
 * 从某个组自身开始向上找最外层的折叠组。
 * 返回的组就是「这一支当前该显示的那个超级节点」；没有折叠则返回 null。
 */
export function outermostCollapsedAncestor(doc: CaseDoc, groupId: string): Group | null {
  const byId = new Map(doc.groups.map((group) => [group.id, group]));
  const seen = new Set<string>();
  let current = byId.get(groupId);
  let host: Group | null = null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.collapsed) host = current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return host;
}

/** 节点所属分组链上最外层的折叠组（该组会把节点吸收成超级节点） */
export function collapsedHostOfNode(doc: CaseDoc, node: CaseNode): Group | null {
  return node.groupId ? outermostCollapsedAncestor(doc, node.groupId) : null;
}

/** 只依赖 id/parentId 的最小结构，命令层可以直接传 immer draft.groups */
export interface GroupLike {
  id: string;
  parentId?: string;
}

export function descendantGroupIdsOf(groups: readonly GroupLike[], groupId: string): string[] {
  const result: string[] = [];
  const queue = [groupId];
  const seen = new Set<string>([groupId]);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const group of groups) {
      if (group.parentId === current && !seen.has(group.id)) {
        seen.add(group.id);
        result.push(group.id);
        queue.push(group.id);
      }
    }
  }
  return result;
}

export function descendantGroupIds(doc: CaseDoc, groupId: string): string[] {
  return descendantGroupIdsOf(doc.groups, groupId);
}

/** 组内节点（默认含子孙组的节点） */
export function memberNodeIds(doc: CaseDoc, groupId: string, includeDescendants = true): string[] {
  const ids = new Set<string>([groupId]);
  if (includeDescendants) for (const child of descendantGroupIdsOf(doc.groups, groupId)) ids.add(child);
  return doc.nodes.filter((node) => node.groupId !== undefined && ids.has(node.groupId)).map((node) => node.id);
}

/** 节点是否落在某个组（含其子孙组）里 */
export function groupContainsNode(doc: CaseDoc, groupId: string, node: CaseNode): boolean {
  if (!node.groupId) return false;
  if (node.groupId === groupId) return true;
  return descendantGroupIdsOf(doc.groups, groupId).includes(node.groupId);
}

export function groupMemberCount(doc: CaseDoc, groupId: string): number {
  return memberNodeIds(doc, groupId).length;
}

export function directChildGroupCount(doc: CaseDoc, groupId: string): number {
  return doc.groups.filter((group) => group.parentId === groupId).length;
}

/** 矩形与节点是否相交（按节点中心判定，圈选与建组共用） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nodeCenterInside(node: CaseNode, rect: Rect): boolean {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
}

export function nodeIdsInRect(nodes: CaseNode[], rect: Rect): string[] {
  return nodes.filter((node) => nodeCenterInside(node, rect)).map((node) => node.id);
}

const STYLE_WEAKNESS: Record<LineStyle, number> = { solid: 0, dashed: 1, dotted: 2 };

/** 线型取最弱：一条实线 + 一条点线聚合成点线（保守语义，不夸大证据强度） */
export function weakestStyle(styles: LineStyle[]): LineStyle {
  let worst: LineStyle = 'solid';
  for (const style of styles) {
    if (STYLE_WEAKNESS[style] > STYLE_WEAKNESS[worst]) worst = style;
  }
  return worst;
}

export interface RenderGroup {
  group: Group;
  memberCount: number;
  childCount: number;
}

export interface RenderSuperNode {
  node: CaseNode;
  group: Group;
  memberCount: number;
  childCount: number;
}

export interface RenderModel {
  /** 普通节点（已被折叠组吸收的节点不在其中） */
  nodes: CaseNode[];
  /** 折叠组生成的超级节点 */
  superNodes: RenderSuperNode[];
  /** 连线（含聚合后的合成连线） */
  edges: CaseEdge[];
  /** 需要绘制矩形的组（折叠组画成超级节点，不再画矩形；子孙组一并隐藏） */
  groups: RenderGroup[];
}

interface Endpoint {
  id: string;
  group: Group | null;
}

function endpointOf(doc: CaseDoc, nodeId: string): Endpoint {
  const node = doc.nodes.find((item) => item.id === nodeId);
  if (!node) return { id: nodeId, group: null };
  const host = collapsedHostOfNode(doc, node);
  return host ? { id: superNodeId(host.id), group: host } : { id: node.id, group: null };
}

interface AggregateBucket {
  edges: CaseEdge[];
  source: string;
  target: string;
}

export function buildRenderModel(doc: CaseDoc): RenderModel {
  const superNodes: RenderSuperNode[] = [];
  const groups: RenderGroup[] = [];
  const visibleNodes: CaseNode[] = [];

  for (const node of doc.nodes) {
    if (!collapsedHostOfNode(doc, node)) visibleNodes.push(node);
  }

  for (const group of doc.groups) {
    const collapsedAncestor = group.parentId ? outermostCollapsedAncestor(doc, group.parentId) : null;
    // 自己在更外层折叠组里 → 整组隐藏（连矩形都不画）
    if (collapsedAncestor) continue;
    if (group.collapsed) {
      superNodes.push({
        group,
        memberCount: groupMemberCount(doc, group.id),
        childCount: directChildGroupCount(doc, group.id),
        node: {
          id: superNodeId(group.id),
          type: 'note',
          title: group.title,
          x: group.bounds.x,
          y: group.bounds.y,
          w: SUPER_W,
          h: SUPER_H,
          fields: { 组内对象: groupMemberCount(doc, group.id) },
          tags: [],
          status: 'todo',
          confidence: 0,
          attachments: [],
        },
      });
    } else {
      groups.push({
        group,
        memberCount: groupMemberCount(doc, group.id),
        childCount: directChildGroupCount(doc, group.id),
      });
    }
  }

  const plainEdges: CaseEdge[] = [];
  const buckets = new Map<string, AggregateBucket>();

  for (const edge of doc.edges) {
    if (!doc.nodes.some((node) => node.id === edge.source)) continue;
    if (!doc.nodes.some((node) => node.id === edge.target)) continue;
    const source = endpointOf(doc, edge.source);
    const target = endpointOf(doc, edge.target);
    // 同一折叠组内部的关系直接隐藏
    if (source.id === target.id) continue;
    if (!source.group && !target.group) {
      plainEdges.push(edge);
      continue;
    }
    const key = `${source.id}->${target.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.edges.push(edge);
    else buckets.set(key, { source: source.id, target: target.id, edges: [edge] });
  }

  const aggregated: CaseEdge[] = [];
  for (const [key, bucket] of buckets) {
    const styles = bucket.edges.map((edge) => edge.style);
    const relTypes = Array.from(new Set(bucket.edges.map((edge) => edge.relType)));
    const labels = Array.from(new Set(bucket.edges.map((edge) => edge.label).filter((label): label is string => Boolean(label))));
    const weightSum = bucket.edges.reduce((sum, edge) => sum + (edge.weight ?? 0), 0);
    const synthetic: CaseEdge = {
      id: AGG_EDGE_PREFIX + key,
      source: bucket.source,
      target: bucket.target,
      path: 'bezier',
      relType: relTypes.length === 1 ? relTypes[0] : 'other',
      directed: true,
      style: weakestStyle(styles),
      confidence: Math.min(...bucket.edges.map((edge) => edge.confidence)),
      evidenceIds: [],
    };
    if (bucket.edges.length > 1) synthetic.label = `${bucket.edges.length} 条关系`;
    else if (labels.length === 1) synthetic.label = labels[0];
    if (weightSum > 0) synthetic.weight = weightSum;
    synthetic.notes = `聚合自 ${bucket.edges.map((edge) => edge.id).join('、')}`;
    aggregated.push(synthetic);
  }

  return { nodes: visibleNodes, superNodes, edges: [...plainEdges, ...aggregated], groups };
}

/** 供 UI 显示：某个节点/组是否被折叠吸收 */
export function isHiddenByCollapse(doc: CaseDoc, node: CaseNode): boolean {
  return collapsedHostOfNode(doc, node) !== null;
}
