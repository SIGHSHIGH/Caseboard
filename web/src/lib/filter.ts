/**
 * 过滤器与聚焦（M5-2）：把「当前该重点看什么」算成三组 id 集合，交给画布渲染。
 *
 * 口径：
 * - 条件之间是**与**：类型 / 状态 / 标签 / 关系类别 / 最低置信度 / 文本 / 时间窗
 *   全部满足才算命中。
 * - 模式的差别只在于「未命中项」怎么处理：
 *   dim  = 未命中淡化（默认，画布仍完整）
 *   show = 只显示命中（未命中隐藏）
 *   hide = 隐藏命中（保留未命中，用于排除法）
 * - 聚焦（focus）是独立的第二层：聚焦节点集合之外的实体**只淡化不隐藏**，
 *   避免用户丢掉上下文；聚焦与过滤同时生效，取交集。
 * - 纯函数：同一份文档 + 同一组条件永远得到同一结果（可直接单测）。
 */
import type { CaseDoc, CaseEdge, CaseNode, NodeType, Status } from '../types';
import { buildGraph, neighborsWithin } from './graph';
import { nodeTimeRange, parseTimelineTime } from './timeline';

export type FilterMode = 'dim' | 'show' | 'hide';

export interface ViewFilter {
  nodeTypes: NodeType[];
  statuses: Status[];
  tags: string[];
  relTypes: string[];
  /** 0 表示不限制 */
  minConfidence: number;
  query: string;
  /** 时间窗（墙上时间文本，空表示不限） */
  timeFrom: string;
  timeTo: string;
  mode: FilterMode;
}

export const EMPTY_FILTER: ViewFilter = {
  nodeTypes: [],
  statuses: [],
  tags: [],
  relTypes: [],
  minConfidence: 0,
  query: '',
  timeFrom: '',
  timeTo: '',
  mode: 'dim',
};

export interface FocusState {
  seeds: string[];
  /** 聚焦跳数，1–3；默认 1 */
  depth: number;
}

export interface ViewResult {
  hiddenNodes: Set<string>;
  dimNodes: Set<string>;
  hiddenEdges: Set<string>;
  dimEdges: Set<string>;
  matchedNodes: Set<string>;
  matchedEdges: Set<string>;
  totalNodes: number;
  visibleNodeCount: number;
  filterActive: boolean;
  focusActive: boolean;
}

/** 条件是否为空（空条件不淡化也不隐藏任何东西） */
export function isEmptyFilter(filter: ViewFilter): boolean {
  return (
    filter.nodeTypes.length === 0 &&
    filter.statuses.length === 0 &&
    filter.tags.length === 0 &&
    filter.relTypes.length === 0 &&
    filter.minConfidence <= 0 &&
    filter.query.trim() === '' &&
    filter.timeFrom.trim() === '' &&
    filter.timeTo.trim() === ''
  );
}

function textMatches(haystacks: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystacks.some((text) => (text ?? '').toLowerCase().includes(needle));
}

function fieldsText(node: CaseNode): string[] {
  const result: string[] = [];
  for (const [key, value] of Object.entries(node.fields)) {
    result.push(key);
    result.push(String(value));
  }
  return result;
}

/** 文档里出现过的标签（左栏标签筛选的候选项），按使用次数降序、同频按字典序 */
export function collectTags(doc: CaseDoc): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const node of doc.nodes) {
    for (const tag of node.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag < b.tag ? -1 : 1));
}

interface WindowRange {
  from: number | null;
  to: number | null;
}

function windowRange(filter: ViewFilter): WindowRange {
  return {
    from: parseTimelineTime(filter.timeFrom),
    to: parseTimelineTime(filter.timeTo),
  };
}

function inTimeWindow(range: { start: number; end: number } | null, window: WindowRange): boolean {
  if (window.from === null && window.to === null) return true;
  if (!range) return false;
  if (window.from !== null && range.end < window.from) return false;
  if (window.to !== null && range.start > window.to) return false;
  return true;
}

export function nodeMatches(node: CaseNode, filter: ViewFilter, incidentRelTypes: string[]): boolean {
  if (filter.nodeTypes.length > 0 && !filter.nodeTypes.includes(node.type)) return false;
  if (filter.statuses.length > 0 && !filter.statuses.includes(node.status)) return false;
  if (filter.tags.length > 0 && !filter.tags.some((tag) => node.tags.includes(tag))) return false;
  if (filter.relTypes.length > 0 && !incidentRelTypes.some((relType) => filter.relTypes.includes(relType))) return false;
  if (filter.minConfidence > 0 && node.confidence < filter.minConfidence) return false;
  if (!textMatches([node.title, ...(node.aliases ?? []), ...node.tags, node.notes, ...fieldsText(node)], filter.query)) return false;
  if (!inTimeWindow(nodeTimeRange(node), windowRange(filter))) return false;
  return true;
}

export function edgeMatches(edge: CaseEdge, filter: ViewFilter): boolean {
  if (filter.relTypes.length > 0 && !filter.relTypes.includes(edge.relType)) return false;
  if (filter.minConfidence > 0 && edge.confidence < filter.minConfidence) return false;
  if (!textMatches([edge.label, edge.relType, edge.notes], filter.query)) return false;
  const range = parseTimelineTime(edge.time?.start) === null ? null : { start: parseTimelineTime(edge.time?.start) as number, end: parseTimelineTime(edge.time?.end) ?? (parseTimelineTime(edge.time?.start) as number) };
  return inTimeWindow(range, windowRange(filter));
}

/** 聚焦集合：空 seeds 返回 null（表示聚焦未生效） */
export function focusNodeIds(doc: CaseDoc, focus: FocusState | null): Set<string> | null {
  if (!focus || focus.seeds.length === 0) return null;
  const graph = buildGraph(doc);
  const found = neighborsWithin(graph, focus.seeds, Math.max(1, Math.min(3, focus.depth)));
  if (found.length === 0) return null;
  return new Set(found.map((item) => item.id));
}

export function applyView(doc: CaseDoc, filter: ViewFilter, focus: FocusState | null = null): ViewResult {
  const filterActive = !isEmptyFilter(filter);
  const focused = focusNodeIds(doc, focus);
  const focusActive = focused !== null;
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  const incident = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    for (const id of [edge.source, edge.target]) {
      const list = incident.get(id) ?? [];
      list.push(edge.relType);
      incident.set(id, list);
    }
  }

  const matchedNodes = new Set<string>();
  const matchedEdges = new Set<string>();
  for (const node of doc.nodes) {
    if (!filterActive || nodeMatches(node, filter, incident.get(node.id) ?? [])) matchedNodes.add(node.id);
  }
  for (const edge of doc.edges) {
    // 关系命中 = 关系自身满足条件 **且** 两端实体也命中；否则「只看人物」时
    // 人物到地点的边还会被算成命中，画布上就出现亮线接暗点。
    if (!filterActive || (edgeMatches(edge, filter) && matchedNodes.has(edge.source) && matchedNodes.has(edge.target))) {
      matchedEdges.add(edge.id);
    }
  }

  const hiddenNodes = new Set<string>();
  const dimNodes = new Set<string>();
  const hiddenEdges = new Set<string>();
  const dimEdges = new Set<string>();

  for (const node of doc.nodes) {
    const hit = matchedNodes.has(node.id);
    if (filterActive && filter.mode === 'show' && !hit) hiddenNodes.add(node.id);
    else if (filterActive && filter.mode === 'hide' && hit) hiddenNodes.add(node.id);
    else if (filterActive && filter.mode === 'dim' && !hit) dimNodes.add(node.id);
    if (focused && !hiddenNodes.has(node.id) && !focused.has(node.id)) dimNodes.add(node.id);
  }
  for (const edge of doc.edges) {
    const endpointsHidden = hiddenNodes.has(edge.source) || hiddenNodes.has(edge.target);
    if (endpointsHidden) {
      hiddenEdges.add(edge.id);
      continue;
    }
    const hit = matchedEdges.has(edge.id);
    if (filterActive && filter.mode === 'show' && !hit) hiddenEdges.add(edge.id);
    else if (filterActive && filter.mode === 'hide' && hit) hiddenEdges.add(edge.id);
    else if (filterActive && filter.mode === 'dim' && !hit) dimEdges.add(edge.id);
    if (focused && !hiddenEdges.has(edge.id) && (!focused.has(edge.source) || !focused.has(edge.target))) dimEdges.add(edge.id);
  }

  return {
    hiddenNodes,
    dimNodes,
    hiddenEdges,
    dimEdges,
    matchedNodes,
    matchedEdges,
    totalNodes: doc.nodes.length,
    visibleNodeCount: doc.nodes.length - hiddenNodes.size,
    filterActive,
    focusActive,
  };
}
