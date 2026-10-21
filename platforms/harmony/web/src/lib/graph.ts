/**
 * 图分析内核（M5-1）：把 CaseDoc 抽成邻接表，供路径 / 中心度 / 聚焦共用。
 *
 * 设计约束：
 * - 纯函数、无 DOM、无随机源：同一份文档永远得到同一组结果（M5 验收 1、2）。
 * - 关系按**无向**遍历（资金往来、亲属、同伙在本工具里都是双向可走）；
 *   需要方向时由调用方自行过滤 `CaseEdge.directed`。
 * - 邻接表按 id 升序，BFS/DFS 的遍历顺序因此完全确定。
 */
import type { CaseDoc, CaseNode } from '../types';

export interface GraphEdgeRef {
  id: string;
  source: string;
  target: string;
  directed: boolean;
}

export interface GraphIndex {
  nodes: Map<string, CaseNode>;
  /** id → 升序邻居 id */
  adjacency: Map<string, string[]>;
  edges: GraphEdgeRef[];
  /** 无向边对索引，key 由 `pairKey(a, b)` 生成（a < b） */
  edgeByPair: Map<string, GraphEdgeRef>;
}

/** 无向边对的稳定 key：永远把字典序小的放前面 */
export function pairKey(a: string, b: string): string {
  return a < b ? a + '\u0000' + b : b + '\u0000' + a;
}

export function buildGraph(doc: CaseDoc): GraphIndex {
  const nodes = new Map<string, CaseNode>();
  for (const node of doc.nodes) nodes.set(node.id, node);
  const adjacency = new Map<string, string[]>();
  for (const node of doc.nodes) adjacency.set(node.id, []);
  const edges: GraphEdgeRef[] = [];
  const edgeByPair = new Map<string, GraphEdgeRef>();
  for (const edge of doc.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const ref: GraphEdgeRef = { id: edge.id, source: edge.source, target: edge.target, directed: edge.directed };
    edges.push(ref);
    edgeByPair.set(pairKey(edge.source, edge.target), ref);
    const sourceList = adjacency.get(edge.source);
    const targetList = adjacency.get(edge.target);
    if (sourceList && !sourceList.includes(edge.target)) sourceList.push(edge.target);
    if (targetList && !targetList.includes(edge.source)) targetList.push(edge.source);
  }
  for (const list of adjacency.values()) list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, adjacency, edges, edgeByPair };
}

export function neighborIds(graph: GraphIndex, id: string): string[] {
  return graph.adjacency.get(id) ?? [];
}

/** 最短路径（BFS，按邻居 id 升序访问，结果稳定）。找不到返回 null。 */
export function shortestPath(graph: GraphIndex, from: string, to: string): string[] | null {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  if (from === to) return [from];
  const parent = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of neighborIds(graph, current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, current);
      if (next === to) {
        const path = [to];
        let cursor = to;
        while (parent.has(cursor)) {
          cursor = parent.get(cursor) as string;
          path.unshift(cursor);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export interface AllPathsOptions {
  /** 最多返回多少条（默认 24）；超出按长度、字典序截断 */
  maxPaths?: number;
  /** 最长允许的跳数（默认 6）；避免爆炸式增长 */
  maxDepth?: number;
}

/**
 * 两节点间的全部**简单路径**（不重复经过同一节点）。
 * 结果先按长度升序、再按节点序列字典序排序，所以前 N 条是确定的。
 */
export function allPaths(graph: GraphIndex, from: string, to: string, options: AllPathsOptions = {}): string[][] {
  const maxPaths = Math.max(1, options.maxPaths ?? 24);
  const maxDepth = Math.max(1, options.maxDepth ?? 6);
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return [];
  if (from === to) return [[from]];
  const found: string[][] = [];
  const path: string[] = [from];
  const onPath = new Set<string>([from]);
  const walk = (current: string): void => {
    if (found.length >= maxPaths * 8) return;
    if (current === to) {
      found.push(path.slice());
      return;
    }
    if (path.length > maxDepth) return;
    for (const next of neighborIds(graph, current)) {
      if (onPath.has(next)) continue;
      path.push(next);
      onPath.add(next);
      walk(next);
      onPath.delete(next);
      path.pop();
    }
  };
  walk(from);
  found.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    const left = a.join('\u0001');
    const right = b.join('\u0001');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return found.slice(0, maxPaths);
}

export interface CentralityEntry {
  id: string;
  score: number;
}

/** 度中心性：邻居数量，降序、同分按 id 升序 */
export function degreeCentrality(graph: GraphIndex): CentralityEntry[] {
  const entries: CentralityEntry[] = [];
  for (const [id] of graph.nodes) entries.push({ id, score: neighborIds(graph, id).length });
  entries.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}

/**
 * 介数中心性（Brandes 算法，无向、无权、按节点去重）。
 * 归一化系数 = 2 / ((n-1)(n-2))，与常见实现口径一致；n < 3 时全为 0。
 */
export function betweennessCentrality(graph: GraphIndex): CentralityEntry[] {
  const ids: string[] = [];
  for (const [id] of graph.nodes) ids.push(id);
  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const scores = new Map<string, number>();
  for (const id of ids) scores.set(id, 0);
  for (const source of ids) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const distance = new Map<string, number>();
    for (const id of ids) {
      predecessors.set(id, []);
      sigma.set(id, 0);
      distance.set(id, -1);
    }
    sigma.set(source, 1);
    distance.set(source, 0);
    const queue: string[] = [source];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      stack.push(current);
      for (const next of neighborIds(graph, current)) {
        if ((distance.get(next) ?? -1) < 0) {
          queue.push(next);
          distance.set(next, (distance.get(current) ?? 0) + 1);
        }
        if ((distance.get(next) ?? 0) === (distance.get(current) ?? 0) + 1) {
          sigma.set(next, (sigma.get(next) ?? 0) + (sigma.get(current) ?? 0));
          (predecessors.get(next) as string[]).push(current);
        }
      }
    }
    const delta = new Map<string, number>();
    for (const id of ids) delta.set(id, 0);
    while (stack.length > 0) {
      const node = stack.pop() as string;
      const coefficient = (1 + (delta.get(node) ?? 0)) / (sigma.get(node) || 1);
      for (const previous of predecessors.get(node) ?? []) {
        delta.set(previous, (delta.get(previous) ?? 0) + (sigma.get(previous) ?? 0) * coefficient);
      }
      if (node !== source) scores.set(node, (scores.get(node) ?? 0) + (delta.get(node) ?? 0));
    }
  }
  const denominator = ids.length > 2 ? ((ids.length - 1) * (ids.length - 2)) / 2 : 0;
  const entries: CentralityEntry[] = ids.map((id) => {
    const raw = scores.get(id) ?? 0;
    const score = denominator > 0 ? raw / 2 / denominator : 0;
    return { id, score: Number(score.toFixed(6)) };
  });
  entries.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}

/** 聚焦模式用：距离 ids 不超过 depth 跳的节点，按（距离, id）升序 */
export function neighborsWithin(graph: GraphIndex, seeds: string[], depth = 1): Array<{ id: string; depth: number }> {
  const best = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [];
  for (const seed of seeds) {
    if (!graph.nodes.has(seed)) continue;
    if (best.has(seed)) continue;
    best.set(seed, 0);
    queue.push({ id: seed, depth: 0 });
  }
  while (queue.length > 0) {
    const current = queue.shift() as { id: string; depth: number };
    if (current.depth >= depth) continue;
    for (const next of neighborIds(graph, current.id)) {
      const nextDepth = current.depth + 1;
      const known = best.get(next);
      if (known !== undefined && known <= nextDepth) continue;
      best.set(next, nextDepth);
      queue.push({ id: next, depth: nextDepth });
    }
  }
  return Array.from(best.entries())
    .map(([id, value]) => ({ id, depth: value }))
    .sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 连通分量（孤立节点各算一份），用于「图是否成片」的健康检查与测试 */
export function components(graph: GraphIndex): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of Array.from(graph.nodes.keys()).sort()) {
    if (seen.has(id)) continue;
    const members: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      members.push(current);
      for (const next of neighborIds(graph, current)) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    members.sort();
    groups.push(members);
  }
  groups.sort((a, b) => (b.length !== a.length ? b.length - a.length : a[0] < b[0] ? -1 : 1));
  return groups;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  isolated: string[];
  componentCount: number;
}

export function graphStats(graph: GraphIndex): GraphStats {
  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.length;
  const isolated = Array.from(graph.nodes.keys())
    .filter((id) => neighborIds(graph, id).length === 0)
    .sort();
  const groups = components(graph);
  const maxEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;
  return {
    nodeCount,
    edgeCount,
    density: maxEdges > 0 ? Number((edgeCount / maxEdges).toFixed(4)) : 0,
    isolated,
    componentCount: groups.length,
  };
}
