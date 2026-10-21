/**
 * 分析视图的派生层（M5-3）：把关系图算成「路径」和「中心度」两种可直接渲染的结果。
 *
 * - 路径：节点序列 + 每一跳对应的原始关系 id（并列边全部收进来，便于高亮）。
 * - 中心度：degree / betweenness，再归一化到 0–1 供画布做热力深浅。
 * 纯函数，不改 Model。
 */
import type { CaseDoc } from '../types';
import {
  allPaths,
  betweennessCentrality,
  buildGraph,
  degreeCentrality,
  shortestPath,
  type CentralityEntry,
  type GraphIndex,
} from './graph';

export type CentralityMetric = 'off' | 'degree' | 'betweenness';

export interface CentralityOption {
  id: CentralityMetric;
  label: string;
  hint: string;
}

export const CENTRALITY_OPTIONS: CentralityOption[] = [
  { id: 'off', label: '关闭', hint: '不显示中心度热力' },
  { id: 'degree', label: '度中心度', hint: '直接相连的对象数量，越高说明接触面越广' },
  { id: 'betweenness', label: '中介中心度', hint: '多少条最短路径穿过它，越高说明越像「桥梁」或中间人' },
];

export interface PathHit {
  nodes: string[];
  /** 路径上出现的全部关系 id */
  edges: string[];
  /** 逐跳关系 id，长度 = nodes.length - 1 */
  hopEdges: string[][];
}

export interface PathAnalysis {
  from: string;
  to: string;
  found: boolean;
  shortest: PathHit | null;
  paths: PathHit[];
  /** 命中 allPaths 上限被截断（只展示前 N 条） */
  truncated: boolean;
}

export interface PathOptions {
  maxPaths?: number;
  maxDepth?: number;
}

function edgeIdsBetween(doc: CaseDoc, a: string, b: string): string[] {
  const ids: string[] = [];
  for (const edge of doc.edges) {
    if ((edge.source === a && edge.target === b) || (edge.source === b && edge.target === a)) ids.push(edge.id);
  }
  return ids.sort();
}

export function toPathHit(doc: CaseDoc, nodes: string[]): PathHit {
  const hopEdges: string[][] = [];
  const edges: string[] = [];
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    const ids = edgeIdsBetween(doc, nodes[index], nodes[index + 1]);
    hopEdges.push(ids);
    for (const id of ids) if (!edges.includes(id)) edges.push(id);
  }
  return { nodes: nodes.slice(), edges, hopEdges };
}

export function analyzePaths(doc: CaseDoc, from: string, to: string, options: PathOptions = {}): PathAnalysis {
  const graph: GraphIndex = buildGraph(doc);
  const empty: PathAnalysis = { from, to, found: false, shortest: null, paths: [], truncated: false };
  if (!from || !to || from === to) return empty;
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return empty;
  const maxPaths = Math.max(1, options.maxPaths ?? 24);
  const rawShortest = shortestPath(graph, from, to);
  const rawPaths = allPaths(graph, from, to, { maxPaths, maxDepth: options.maxDepth ?? 6 });
  if (!rawShortest || rawPaths.length === 0) return empty;
  return {
    from,
    to,
    found: true,
    shortest: toPathHit(doc, rawShortest),
    paths: rawPaths.map((path) => toPathHit(doc, path)),
    truncated: rawPaths.length >= maxPaths,
  };
}

export function centralityScores(doc: CaseDoc, metric: CentralityMetric): CentralityEntry[] {
  if (metric === 'off') return [];
  const graph = buildGraph(doc);
  return metric === 'betweenness' ? betweennessCentrality(graph) : degreeCentrality(graph);
}

/** 0–1 归一化，最大值映射到 1；空图全 0 */
export function centralityMap(doc: CaseDoc, metric: CentralityMetric): Map<string, number> {
  const result = new Map<string, number>();
  if (metric === 'off') return result;
  const entries = centralityScores(doc, metric);
  const max = entries.reduce((peak, entry) => Math.max(peak, entry.score), 0);
  for (const entry of entries) result.set(entry.id, max > 0 ? Number((entry.score / max).toFixed(4)) : 0);
  return result;
}

export function formatCentralityScore(score: number, metric: CentralityMetric): string {
  if (metric === 'degree') return String(Math.round(score));
  return (score * 100).toFixed(1) + '%';
}

/** 取分数最高的若干实体（已按分数排序），供面板列出 */
export function topCentrality(doc: CaseDoc, metric: CentralityMetric, limit = 5): CentralityEntry[] {
  if (metric === 'off') return [];
  return centralityScores(doc, metric).slice(0, Math.max(1, limit));
}
