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

/** 卡片四条边上的连接点，名字与 React Flow 的 handle id 一致 */
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left';
export const ANCHORS: EdgeAnchor[] = ['top', 'right', 'bottom', 'left'];

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectOf(node: RectLike): RectLike {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

/** 某条边上的连接点坐标（世界坐标） */
export function anchorPoint(rect: RectLike, anchor: EdgeAnchor): XY {
  switch (anchor) {
    case 'top':
      return { x: rect.x + rect.w / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
    case 'left':
      return { x: rect.x, y: rect.y + rect.h / 2 };
    case 'right':
    default:
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
  }
}

/**
 * 按两个矩形的相对位置挑「面对面」的连接点。
 * 横向距离更大就用左右，否则用上下——布局后节点位置大变时连线不会绕到卡片背后，
 * 也就不会出现线穿卡片和交叉。
 */
export function bestAnchors(source: RectLike, target: RectLike): { source: EdgeAnchor; target: EdgeAnchor } {
  const dx = target.x + target.w / 2 - (source.x + source.w / 2);
  const dy = target.y + target.h / 2 - (source.y + source.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

/** 单个矩形朝另一个矩形方向的连接点（画吸附线、聚合边用） */
export function facingAnchor(rect: RectLike, other: RectLike): EdgeAnchor {
  return bestAnchors(rect, other).source;
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

