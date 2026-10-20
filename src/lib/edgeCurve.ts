import type { XY } from '../types';

/**
 * 关系曲线的纯几何（M4 人工验收 A3 曲率手柄 / D37 延期项）。
 *
 * 约定：`CaseEdge.controlPoints[0]` 存的是**曲线中点相对两端锚点中点的偏移**
 * （世界坐标 / flow 坐标），不是绝对坐标。这样节点被拖动、缩放后曲线仍然跟着走，
 * 也不会因为画布平移而错位。
 *
 * 三次贝塞尔在 t=0.5 处只走到控制点的 3/4，所以控制点要乘 4/3 才能让曲线中点
 * 正好落在手柄位置。两个控制点取同一点（退化成二次曲线形状），视觉最可控。
 */

/** 手柄落点 → 控制点增益：让曲线中点精确落在手柄处 */
export const CURVE_GAIN = 4 / 3;
/** 偏移长度上限（世界坐标），防止手柄被拖到画布外后曲线不可见 */
export const CURVE_MAX = 1600;
/** 小于这个长度的偏移视为「没有弯曲」（双击复位后不会留下抖动值） */
export const CURVE_MIN = 2;

export function clampCurveOffset(offset: XY): XY {
  const x = Number.isFinite(offset.x) ? offset.x : 0;
  const y = Number.isFinite(offset.y) ? offset.y : 0;
  const length = Math.hypot(x, y);
  if (length <= CURVE_MAX) return { x, y };
  const ratio = CURVE_MAX / length;
  return { x: x * ratio, y: y * ratio };
}

export interface CurveGeometry {
  s: XY;
  t: XY;
  /** 两端锚点中点 */
  mid: XY;
  c1: XY;
  c2: XY;
  /** 曲线中点（t=0.5），也是曲率手柄的落点 */
  handle: XY;
}

export function curveGeometry(s: XY, t: XY, offset: XY): CurveGeometry {
  const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  const clamped = clampCurveOffset(offset);
  const control = { x: mid.x + clamped.x * CURVE_GAIN, y: mid.y + clamped.y * CURVE_GAIN };
  return { s, t, mid, c1: control, c2: control, handle: { x: mid.x + clamped.x, y: mid.y + clamped.y } };
}

function n(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** 生成 SVG path 的 d 属性；导出（SVG/PNG）与画布共用同一套控制点语义 */
export function curvePath(geometry: CurveGeometry): string {
  const { s, c1, c2, t } = geometry;
  return 'M ' + n(s.x) + ' ' + n(s.y) + ' C ' + n(c1.x) + ' ' + n(c1.y) + ', ' + n(c2.x) + ' ' + n(c2.y) + ', ' + n(t.x) + ' ' + n(t.y);
}

/** 手柄落点 → 要写回模型的偏移（相对中点） */
export function curveOffsetFromHandle(mid: XY, handle: XY): XY {
  return clampCurveOffset({ x: handle.x - mid.x, y: handle.y - mid.y });
}

/** 读取模型里的偏移：只认有限数值，否则视为没有弯曲 */
export function curveOffsetOf(edge: { controlPoints?: XY[] }): XY | null {
  const point = edge.controlPoints?.[0];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const offset = clampCurveOffset(point);
  if (Math.hypot(offset.x, offset.y) < CURVE_MIN) return null;
  return offset;
}

/** 迁移旧存档用：把任意形状的 controlPoints 收敛成 [XY] 或 undefined */
export function normalizeControlPoints(raw: unknown): XY[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const points: XY[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : null;
    const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : null;
    if (x === null || y === null) continue;
    points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    if (points.length >= 2) break;
  }
  return points.length > 0 ? points : undefined;
}

/* ===== M9 / S3：连接点（handle）按相对位置自动选择 ===== */

/** 卡片上的连接点，名字与 React Flow 的 handle id 一致。
 *  M10：四边中点之外再加四个角（tl/tr/br/bl），斜向关系可以走角，线不再被挤在四条边上。 */
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left' | 'tl' | 'tr' | 'br' | 'bl';
export const ANCHORS: EdgeAnchor[] = ['top', 'right', 'bottom', 'left', 'tr', 'br', 'bl', 'tl'];
/** 只有四边中点（老数据/老 handle 的合法取值） */
export const SIDE_ANCHORS: EdgeAnchor[] = ['top', 'right', 'bottom', 'left'];
/** 只有四角 */
export const CORNER_ANCHORS: EdgeAnchor[] = ['tl', 'tr', 'br', 'bl'];

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectOf(node: RectLike): RectLike {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

/** 某条边/某个角上的连接点坐标（世界坐标） */
export function anchorPoint(rect: RectLike, anchor: EdgeAnchor): XY {
  switch (anchor) {
    case 'top':
      return { x: rect.x + rect.w / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
    case 'left':
      return { x: rect.x, y: rect.y + rect.h / 2 };
    case 'right':
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
    case 'tl':
      return { x: rect.x, y: rect.y };
    case 'tr':
      return { x: rect.x + rect.w, y: rect.y };
    case 'br':
      return { x: rect.x + rect.w, y: rect.y + rect.h };
    case 'bl':
      return { x: rect.x, y: rect.y + rect.h };
    default:
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
  }
}

/**
 * 按两个矩形的相对位置挑「面对面」的连接点。
 * 横向/纵向距离明显占优就用左右或上下；两个方向分量接近（斜向排列）就用对角，
 * 布局后节点位置大变时连线也不会绕到卡片背后，也就不会出现线穿卡片和交叉。
 */
export function bestAnchors(source: RectLike, target: RectLike): { source: EdgeAnchor; target: EdgeAnchor } {
  const dx = target.x + target.w / 2 - (source.x + source.w / 2);
  const dy = target.y + target.h / 2 - (source.y + source.h / 2);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  // 斜向判定：短边分量超过长边的 45% 时认为是对角关系，走角上的连接点
  if (Math.min(ax, ay) > Math.max(ax, ay) * 0.45) {
    const nearX = dx >= 0 ? 'r' : 'l';
    const nearY = dy >= 0 ? 'b' : 't';
    const farX = dx >= 0 ? 'l' : 'r';
    const farY = dy >= 0 ? 't' : 'b';
    return {
      source: `${nearY}${nearX}` as EdgeAnchor,
      target: `${farY}${farX}` as EdgeAnchor,
    };
  }
  if (ax >= ay) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

/** 单个矩形朝另一个矩形方向的连接点（画吸附线、聚合边用） */
export function facingAnchor(rect: RectLike, other: RectLike): EdgeAnchor {
  return bestAnchors(rect, other).source;
}

/** handle id 是否是我们认识的连接点（老文档里可能有别的值） */
export function isEdgeAnchor(value: unknown): value is EdgeAnchor {
  return typeof value === 'string' && (ANCHORS as string[]).includes(value);
}

/** 每个连接点的外法线（判断「从背面出线」用） */
const ANCHOR_NORMAL: Record<EdgeAnchor, XY> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  tl: { x: -0.71, y: -0.71 },
  tr: { x: 0.71, y: -0.71 },
  br: { x: 0.71, y: 0.71 },
  bl: { x: -0.71, y: 0.71 },
};

/**
 * 线段是否穿过矩形（Liang–Barsky 裁剪）。
 * M17：用它给「线穿过别的卡片」打分，布局后重算锚点时优先避让。
 */
export function segmentHitsRect(a: XY, b: XY, rect: RectLike, pad = 0): boolean {
  const minX = rect.x - pad;
  const maxX = rect.x + rect.w + pad;
  const minY = rect.y - pad;
  const maxY = rect.y + rect.h + pad;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - minX) &&
    clip(dx, maxX - a.x) &&
    clip(-dy, a.y - minY) &&
    clip(dy, maxY - a.y) &&
    t1 - t0 >= 0
  );
}

export interface AnchorPair {
  source: EdgeAnchor;
  target: EdgeAnchor;
}

/** 穿越障碍的惩罚（远大于一般距离差，保证「不穿卡片」优先） */
export const ANCHOR_BLOCK_PENALTY = 4000;
/** 从背面出线/进线的惩罚 */
export const ANCHOR_BACK_PENALTY = 900;

/**
 * 在 8×8 个锚点组合里挑代价最小的那对。
 * 代价 = 线段长度 + 背向出线惩罚 + 穿过其他卡片的惩罚，并对几何最优解略微加权以避免抖动。
 * `obstacles` 传其他节点的矩形（调用方负责排除两端自己）。
 */
export function pickAnchorPair(source: RectLike, target: RectLike, obstacles: RectLike[] = []): AnchorPair {
  const fallback = bestAnchors(source, target);
  let best: AnchorPair = fallback;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const s of ANCHORS) {
    const from = anchorPoint(source, s);
    for (const t of ANCHORS) {
      const to = anchorPoint(target, t);
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      const dx = span === 0 ? 0 : (to.x - from.x) / span;
      const dy = span === 0 ? 0 : (to.y - from.y) / span;
      let cost = span;
      const out = ANCHOR_NORMAL[s];
      const into = ANCHOR_NORMAL[t];
      if (dx * out.x + dy * out.y <= 0) cost += ANCHOR_BACK_PENALTY;
      if (dx * into.x + dy * into.y >= 0) cost += ANCHOR_BACK_PENALTY;
      for (const rect of obstacles) {
        if (segmentHitsRect(from, to, rect, 10)) {
          cost += ANCHOR_BLOCK_PENALTY;
          break;
        }
      }
      if (s === fallback.source && t === fallback.target) cost -= 40;
      if (cost < bestCost) {
        bestCost = cost;
        best = { source: s, target: t };
      }
    }
  }
  return best;
}

/** 挑锚点并返回代价（测试与调参用） */
export function pickAnchorPairWithCost(
  source: RectLike,
  target: RectLike,
  obstacles: RectLike[] = [],
): { pair: AnchorPair; cost: number } {
  const pair = pickAnchorPair(source, target, obstacles);
  const from = anchorPoint(source, pair.source);
  const to = anchorPoint(target, pair.target);
  let cost = Math.hypot(to.x - from.x, to.y - from.y);
  for (const rect of obstacles) {
    if (segmentHitsRect(from, to, rect, 10)) cost += ANCHOR_BLOCK_PENALTY;
  }
  return { pair, cost };
}

/* ===== M9 / S3：标签避让 ===== */

/** 标签去重用的网格边长（世界坐标）：同一格里的标签视为会重叠 */
export const LABEL_CELL = 120;
/** 每个重叠标签向下错开的像素 */
export const LABEL_STEP = 16;

/**
 * 标签避让：把落点映射到网格，同一格里的第 n 个标签向下挪 n*LABEL_STEP。
 * 只做纵向错开，横向仍贴曲线中点，视觉上不会离关系太远。
 */
export function fanOutLabels(points: Array<{ id: string; x: number; y: number }>): Map<string, number> {
  const cells = new Map<string, string[]>();
  const out = new Map<string, number>();
  for (const point of points) {
    const key = `${Math.round(point.x / LABEL_CELL)}:${Math.round(point.y / LABEL_CELL)}`;
    const list = cells.get(key);
    if (list) {
      list.push(point.id);
    } else {
      cells.set(key, [point.id]);
    }
  }
  for (const ids of cells.values()) {
    ids.forEach((id, index) => out.set(id, index * LABEL_STEP));
  }
  return out;
}


/** M17：同一对实体之间的多条关系线互相错开（避免完全重叠） */
export const PARALLEL_EDGE_GAP = 34;

/**
 * 给同一对实体之间的平行关系线分配横向错开量。
 * 第 i 条（共 n 条）偏移 `(i - (n-1)/2) * PARALLEL_EDGE_GAP`，单条为 0。
 */
export function parallelSpreads(
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`;
    const list = groups.get(key);
    if (list) list.push(edge.id);
    else groups.set(key, [edge.id]);
  }
  const out = new Map<string, number>();
  for (const ids of groups.values()) {
    if (ids.length < 2) {
      for (const id of ids) out.set(id, 0);
      continue;
    }
    ids.forEach((id, index) => {
      out.set(id, Math.round((index - (ids.length - 1) / 2) * PARALLEL_EDGE_GAP * 10) / 10);
    });
  }
  return out;
}

/* ===== M18：贝塞尔形状自动优化与交叉检测 ===== */

/** 曲率取值范围：-0.9（向左弯）~ 0.9（向右弯），0 是直线贝塞尔 */
export const CURVATURE_MIN = -0.9;
export const CURVATURE_MAX = 0.9;

/** 自动梳理时依次试的曲率候选（0 最优先，避免无理由把线掰弯） */
export const CURVATURE_OPTIONS: number[] = [0, 0.35, -0.35, 0.6, -0.6];

/** 检测交叉时把曲线切成几段（8 段足够抓住压卡与交叉，再细只是变慢） */
export const EDGE_GEOMETRY_SAMPLES = 8;

export function clampCurvature(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(CURVATURE_MIN, Math.min(CURVATURE_MAX, value));
  return Math.round(clamped * 100) / 100;
}

/** 把标量曲率换成控制点偏移：垂直于连线方向按长度比例外推 */
export function curvatureOffset(from: XY, to: XY, curvature: number): XY {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const curve = clampCurvature(curvature);
  if (len === 0 || curve === 0) return { x: 0, y: 0 };
  const amount = curve * len * 0.25;
  return { x: (-dy / len) * amount, y: (dx / len) * amount };
}

/** 采样三次贝塞尔：两个控制点 = 端点 + 同一偏移（与 curveGeometry 的几何一致） */
export function sampleCurve(from: XY, to: XY, offset: XY, samples = 8): XY[] {
  const c1 = { x: from.x + offset.x, y: from.y + offset.y };
  const c2 = { x: to.x + offset.x, y: to.y + offset.y };
  const out: XY[] = [];
  const steps = Math.max(2, Math.round(samples));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push({
      x: a * from.x + b * c1.x + c * c2.x + d * to.x,
      y: a * from.y + b * c1.y + c * c2.y + d * to.y,
    });
  }
  return out;
}

export function polylineHitsRect(points: XY[], rect: RectLike, pad = 0): boolean {
  for (let i = 0; i + 1 < points.length; i += 1) {
    if (segmentHitsRect(points[i], points[i + 1], rect, pad)) return true;
  }
  return false;
}

function orientation(a: XY, b: XY, c: XY): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 两条线段是否真正相交（含端点接触与共线重叠） */
export function segmentsIntersect(a1: XY, a2: XY, b1: XY, b2: XY): boolean {
  const eps = 1e-6;
  const d1 = orientation(b1, b2, a1);
  const d2 = orientation(b1, b2, a2);
  const d3 = orientation(a1, a2, b1);
  const d4 = orientation(a1, a2, b2);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    return true;
  }
  const on = (p: XY, q: XY, r: XY): boolean =>
    Math.abs(orientation(p, q, r)) <= eps &&
    r.x >= Math.min(p.x, q.x) - eps && r.x <= Math.max(p.x, q.x) + eps &&
    r.y >= Math.min(p.y, q.y) - eps && r.y <= Math.max(p.y, q.y) + eps;
  return on(b1, b2, a1) || on(b1, b2, a2) || on(a1, a2, b1) || on(a1, a2, b2);
}

/** 两条折线是否交叉（调用方保证是两条不同的边，否则端点必然「相交」） */
export function polylinesIntersect(a: XY[], b: XY[]): boolean {
  for (let i = 0; i + 1 < a.length; i += 1) {
    for (let j = 0; j + 1 < b.length; j += 1) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

/** 折线包围盒（统一成 {x,y,w,h}） */
export function boundsOfPoints(points: XY[], pad = 0): RectLike {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/**
 * 只挑出「可能挡路」的障碍：先用连线的包围盒筛一遍。
 * 不做这一步时锚点评分会对全图每个矩形各算一次，1000 节点会明显卡。
 */
export function nearbyRects(
  entries: ReadonlyArray<{ id: string; rect: RectLike }>,
  from: XY,
  to: XY,
  pad = 80,
  exclude: ReadonlyArray<string> = [],
): RectLike[] {
  const box = boundsOfPoints([from, to], pad);
  const skip = new Set(exclude);
  const out: RectLike[] = [];
  for (const entry of entries) {
    if (skip.has(entry.id)) continue;
    if (rectsIntersect(box, entry.rect)) out.push(entry.rect);
  }
  return out;
}
