/**
 * M18：关系线的自动梳理（锚点 + 贝塞尔形状）。
 *
 * 用户反馈两件事：
 * 1. 手动拉出来的关系线也应该被自动梳理照顾到（不只是自动布局之后）；
 * 2. 自动布局之后线还是会在图上交叉、压在卡片上，所以除了挑锚点，还要挑曲线的弯法。
 *
 * 这个模块只做「算」：给一份文档算出每条边理想的锚点与曲率，并报告梳理前后的
 * 「压到卡片数」与「互相交叉数」。写回 Model 由命令层负责（见 `edgeGeometryCommand`）。
 */
import {
  CURVATURE_MAX,
  CURVATURE_OPTIONS,
  EDGE_GEOMETRY_SAMPLES,
  anchorPoint,
  bestAnchors,
  clampCurvature,
  curvatureOffset,
  isEdgeAnchor,
  nearbyRects,
  nearbyRectsOf,
  pickAnchorPair,
  polylinesIntersect,
  polylineHitsRect,
  rectOf,
  sampleCurve,
  type AnchorPair,
  type RectLike,
} from './edgeCurve';
import type { CaseDoc, CaseEdge, XY } from '../types';

/** 一条边压在卡片上的代价（远大于交叉，先保证不压卡） */
export const EDGE_NODE_PENALTY = 1200;
/** 与别的边交叉一次的代价 */
export const EDGE_CROSS_PENALTY = 320;
/** 每 0.1 曲率的轻微惩罚：能直就直，不要无理由掰弯 */
export const CURVATURE_PENALTY = 6;
/** 障碍预筛选的包围盒外扩量 */
export const OBSTACLE_PAD = 80;
/**
 * M18 复验 R7：判定范围严格等于卡片边框本身（四边 + 四角），不再外扩 2 px。
 * 预筛仍在折线自身包围盒上外扩，防止曲线鼓出去的部分漏判。
 */
export const EDGE_JUDGE_PAD = 0;

/** 候选曲率最远能鼓出多少：曲率上限 × 弦长 × 0.25，用它给锚点挑选做保守预筛 */
export function obstacleReach(from: XY, to: XY): number {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  return OBSTACLE_PAD + Math.round(span * 0.25 * CURVATURE_MAX);
}

export interface EdgeGeometry {
  id: string;
  anchors: AnchorPair;
  /** 标量曲率；手调过 controlPoints 的边保持原样，回传现值 */
  curvature: number;
}

export interface EdgeOptimizeResult {
  geometries: EdgeGeometry[];
  nodeHitsBefore: number;
  nodeHitsAfter: number;
  crossingsBefore: number;
  crossingsAfter: number;
  /** 参与梳理的边数 */
  optimized: number;
  /** 被用户锁住的边数（autoAnchor === false） */
  locked: number;
}

interface RectEntry {
  id: string;
  rect: RectLike;
}

function rectsOf(doc: CaseDoc): Map<string, RectLike> {
  const out = new Map<string, RectLike>();
  for (const node of doc.nodes) out.set(node.id, rectOf(node));
  return out;
}

function entriesOf(rects: Map<string, RectLike>): RectEntry[] {
  const out: RectEntry[] = [];
  for (const [id, rect] of rects) out.push({ id, rect });
  return out;
}

/** 现用曲率：显式 curvature 优先；手调过 controlPoints 的边不再自动改曲率 */
export function edgeCurvatureOf(edge: CaseEdge): number {
  if (edge.controlPoints && edge.controlPoints.length > 0) return 0;
  return clampCurvature(edge.curvature ?? 0);
}

/** 现用锚点：显式 handle 优先，否则按相对位置兜底 */
export function edgeAnchorsOf(edge: CaseEdge, source: RectLike, target: RectLike): AnchorPair {
  const fallback = bestAnchors(source, target);
  return {
    source: isEdgeAnchor(edge.sourceHandle) ? edge.sourceHandle : fallback.source,
    target: isEdgeAnchor(edge.targetHandle) ? edge.targetHandle : fallback.target,
  };
}

interface EdgeLine {
  id: string;
  from: XY;
  to: XY;
  points: XY[];
  sourceId: string;
  targetId: string;
}

function lineOf(edge: CaseEdge, rects: Map<string, RectLike>): EdgeLine | null {
  const source = rects.get(edge.source);
  const target = rects.get(edge.target);
  if (!source || !target) return null;
  const anchors = edgeAnchorsOf(edge, source, target);
  const from = anchorPoint(source, anchors.source);
  const to = anchorPoint(target, anchors.target);
  const offset = edge.controlPoints && edge.controlPoints.length > 0
    ? edge.controlPoints[0]
    : curvatureOffset(from, to, edgeCurvatureOf(edge));
  return {
    id: edge.id,
    from,
    to,
    points: sampleCurve(from, to, offset, EDGE_GEOMETRY_SAMPLES),
    sourceId: edge.source,
    targetId: edge.target,
  };
}

/** 同一条线不算交叉：两条边共用一个端点时，端点处的接触是几何必然 */
function sharesEndpoint(a: EdgeLine, b: EdgeLine): boolean {
  return (
    a.sourceId === b.sourceId ||
    a.sourceId === b.targetId ||
    a.targetId === b.sourceId ||
    a.targetId === b.targetId
  );
}

/** 统计「压到卡片」与「互相交叉」的条数（M18 的「自动检测」就是这两个数） */
export function countEdgeConflicts(
  lines: ReadonlyArray<EdgeLine>,
  rects: ReadonlyArray<RectEntry>,
  endpointsOf: (line: EdgeLine) => ReadonlyArray<string>,
): { nodeHits: number; crossings: number } {
  let nodeHits = 0;
  for (const line of lines) {
    const skip = new Set(endpointsOf(line));
    const obstacles = nearbyRectsOf(line.points, rects, EDGE_JUDGE_PAD, Array.from(skip));
    if (obstacles.some((rect) => polylineHitsRect(line.points, rect, 0))) nodeHits += 1;
  }
  let crossings = 0;
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (sharesEndpoint(lines[i], lines[j])) continue;
      if (polylinesIntersect(lines[i].points, lines[j].points)) crossings += 1;
    }
  }
  return { nodeHits, crossings };
}

/** 给一条边挑「最理想的锚点 + 曲率」：先避卡片，再避交叉，最后尽量少弯 */
function bestGeometry(
  edge: CaseEdge,
  from: XY,
  to: XY,
  rects: Map<string, RectLike>,
  entries: RectEntry[],
  placed: ReadonlyArray<EdgeLine>,
): { anchors: AnchorPair; curvature: number; points: XY[] } {
  const source = rects.get(edge.source) as RectLike;
  const target = rects.get(edge.target) as RectLike;
  const obstacles = nearbyRects(entries, from, to, obstacleReach(from, to), [edge.source, edge.target]);
  const anchors = obstacles.length > 0
    ? pickAnchorPair(source, target, obstacles)
    : bestAnchors(source, target);
  const sourcePoint = anchorPoint(source, anchors.source);
  const targetPoint = anchorPoint(target, anchors.target);
  const manual = edge.controlPoints && edge.controlPoints.length > 0;
  if (manual) {
    const points = sampleCurve(sourcePoint, targetPoint, edge.controlPoints![0], EDGE_GEOMETRY_SAMPLES);
    return { anchors, curvature: edgeCurvatureOf(edge), points };
  }
  let bestCurve = 0;
  let bestPoints = sampleCurve(sourcePoint, targetPoint, { x: 0, y: 0 }, EDGE_GEOMETRY_SAMPLES);
  let bestCost = Infinity;
  for (const candidate of CURVATURE_OPTIONS) {
    const offset = curvatureOffset(sourcePoint, targetPoint, candidate);
    const points = sampleCurve(sourcePoint, targetPoint, offset, EDGE_GEOMETRY_SAMPLES);
    let hits = 0;
    for (const rect of obstacles) {
      if (polylineHitsRect(points, rect, 0)) hits += 1;
    }
    const line: EdgeLine = {
      id: edge.id,
      from: sourcePoint,
      to: targetPoint,
      points,
      sourceId: edge.source,
      targetId: edge.target,
    };
    let crossings = 0;
    for (const other of placed) {
      if (sharesEndpoint(line, other)) continue;
      if (polylinesIntersect(line.points, other.points)) crossings += 1;
    }
    const cost =
      hits * EDGE_NODE_PENALTY + crossings * EDGE_CROSS_PENALTY + Math.abs(candidate) * 100 * (CURVATURE_PENALTY / 10);
    if (cost < bestCost) {
      bestCost = cost;
      bestCurve = candidate;
      bestPoints = points;
    }
  }
  return { anchors, curvature: bestCurve, points: bestPoints };
}

/**
 * 算出整份文档的关系线理想几何。
 * `onlyIds` 给定时只梳理这几条边（右栏「立即优化此线」用）。
 * 锁定的边（`autoAnchor === false`）不参与改写，但计入 locked。
 */
export function optimizeDocEdges(doc: CaseDoc, options: { onlyIds?: readonly string[] } = {}): EdgeOptimizeResult {
  const rects = rectsOf(doc);
  const entries = entriesOf(rects);
  const only = options.onlyIds ? new Set(options.onlyIds) : null;

  const before: EdgeLine[] = [];
  for (const edge of doc.edges) {
    const line = lineOf(edge, rects);
    if (line) before.push(line);
  }
  const beforeCounts = countEdgeConflicts(before, entries, (line) => [line.sourceId, line.targetId]);

  const geometries: EdgeGeometry[] = [];
  const after: EdgeLine[] = [];
  let locked = 0;
  for (const edge of doc.edges) {
    const line = before.find((item) => item.id === edge.id) ?? null;
    if (!line) continue;
    if (only && !only.has(edge.id)) {
      after.push(line);
      continue;
    }
    const sourceRect = rects.get(edge.source);
    const targetRect = rects.get(edge.target);
    if (!sourceRect || !targetRect) continue;
    if (edge.autoAnchor === false) {
      locked += 1;
      after.push(line);
      geometries.push({ id: edge.id, anchors: edgeAnchorsOf(edge, sourceRect, targetRect), curvature: edgeCurvatureOf(edge) });
      continue;
    }
    const next = bestGeometry(edge, line.from, line.to, rects, entries, after);
    after.push({
      id: edge.id,
      from: anchorPoint(sourceRect, next.anchors.source),
      to: anchorPoint(targetRect, next.anchors.target),
      points: next.points,
      sourceId: edge.source,
      targetId: edge.target,
    });
    geometries.push({ id: edge.id, anchors: next.anchors, curvature: next.curvature });
  }
  const afterCounts = countEdgeConflicts(after, entries, (line) => [line.sourceId, line.targetId]);

  return {
    geometries,
    nodeHitsBefore: beforeCounts.nodeHits,
    nodeHitsAfter: afterCounts.nodeHits,
    crossingsBefore: beforeCounts.crossings,
    crossingsAfter: afterCounts.crossings,
    optimized: geometries.length - locked,
    locked,
  };
}

/**
 * 画布即时渲染用的轻量版：只看「有没有压到卡片」，不比其它边。
 * 正式梳理（命令层）才会把交叉也算进去——渲染时对每条边做 O(E) 的交叉比较太贵。
 */
export function pickEdgeCurvature(from: XY, to: XY, obstacles: ReadonlyArray<RectLike>): number {
  if (obstacles.length === 0) return 0;
  let best = 0;
  let bestHits = Infinity;
  for (const candidate of CURVATURE_OPTIONS) {
    const offset = curvatureOffset(from, to, candidate);
    const points = sampleCurve(from, to, offset, EDGE_GEOMETRY_SAMPLES);
    let hits = 0;
    for (const rect of obstacles) {
      if (polylineHitsRect(points, rect, 0)) hits += 1;
    }
    if (hits === 0) return candidate;
    if (hits < bestHits || (hits === bestHits && Math.abs(candidate) < Math.abs(best))) {
      bestHits = hits;
      best = candidate;
    }
  }
  return best;
}

/** 只做检测、不改任何东西：自动检验面板用这个 */export function detectEdgeConflicts(doc: CaseDoc): { nodeHits: number; crossings: number; nodeHitEdgeIds: string[] } {
  const rects = rectsOf(doc);
  const entries = entriesOf(rects);
  const lines: EdgeLine[] = [];
  for (const edge of doc.edges) {
    const line = lineOf(edge, rects);
    if (line) lines.push(line);
  }
  const counts = countEdgeConflicts(lines, entries, (line) => [line.sourceId, line.targetId]);
  const hitIds: string[] = [];
  for (const line of lines) {
    const obstacles = nearbyRectsOf(line.points, entries, EDGE_JUDGE_PAD, [line.sourceId, line.targetId]);
    if (obstacles.some((rect) => polylineHitsRect(line.points, rect, 0))) hitIds.push(line.id);
  }
  return { nodeHits: counts.nodeHits, crossings: counts.crossings, nodeHitEdgeIds: hitIds };
}
