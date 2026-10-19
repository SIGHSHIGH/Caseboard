import type { DockCorner, ImageNode } from '../types';
import type { Rect } from './groups';

/**
 * 自由图片节点的纯几何与层级运算（M2-4）。
 *
 * 这一层只算数，不碰 store、不碰 DOM：
 * 旋转吸附、等比缩放、层级重排、对齐参考线与网格吸附、多选对齐与等距分布。
 * 画布组件拿结果去渲染/派发命令，验收脚本（scripts/smoke.cjs）直接测这里。
 */

/** 图片节点最小边长（世界坐标），再小就没法点中手柄 */
export const IMAGE_MIN_SIZE = 40;
/** 从素材库拖上画布时的默认尺寸上限 */
export const IMAGE_DEFAULT_MAX_W = 320;
export const IMAGE_DEFAULT_MAX_H = 320;
export const IMAGE_DEFAULT_W = 320;
export const IMAGE_DEFAULT_H = 240;
/** 旋转吸附：吸附到 15° 的整数倍（规格要求 0°/15°/90°） */
export const ROTATION_SNAP_STEP = 15;
export const ROTATION_SNAP_THRESHOLD = 4;
/** 网格吸附步长与对齐参考线命中阈值（世界坐标像素） */
export const GRID_SIZE = 8;
export const ALIGN_THRESHOLD = 6;

export function normAngle(deg: number): number {
  const value = Number.isFinite(deg) ? deg : 0;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** 接近整步时吸附，否则保留原角度（避免拖动手感被「黏住」） */
export function snapRotation(deg: number, step = ROTATION_SNAP_STEP, threshold = ROTATION_SNAP_THRESHOLD): number {
  const angle = normAngle(deg);
  const snapped = normAngle(Math.round(angle / step) * step);
  const diff = Math.abs(((angle - snapped + 540) % 360) - 180);
  return diff <= threshold ? snapped : Math.round(angle * 10) / 10;
}

/** 按素材原始比例算上板尺寸，短边不放大超过上限 */
export function fitImageSize(
  assetW: number | undefined,
  assetH: number | undefined,
  maxW = IMAGE_DEFAULT_MAX_W,
  maxH = IMAGE_DEFAULT_MAX_H,
): { w: number; h: number } {
  const width = Number.isFinite(assetW) && (assetW as number) > 0 ? (assetW as number) : IMAGE_DEFAULT_W;
  const height = Number.isFinite(assetH) && (assetH as number) > 0 ? (assetH as number) : IMAGE_DEFAULT_H;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  return {
    w: Math.max(IMAGE_MIN_SIZE, Math.round(width * ratio)),
    h: Math.max(IMAGE_MIN_SIZE, Math.round(height * ratio)),
  };
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeOptions {
  /** 等比缩放（Shift 或角手柄默认）：保持起点宽高比 */
  lockAspect?: boolean;
  /** 从中心对称缩放（Alt） */
  fromCenter?: boolean;
}

/**
 * 拖动手柄后的新矩形。dx/dy 是世界坐标下的指针位移。
 * 等比模式下以原始宽高比为准，宽/高取变化更大的一侧。
 */
export function resizeImageRect(start: Rect, handle: ResizeHandle, dx: number, dy: number, options: ResizeOptions = {}): Rect {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  if (east) w = start.w + dx;
  if (west) {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (south) h = start.h + dy;
  if (north) {
    h = start.h - dy;
    y = start.y + dy;
  }

  if (options.fromCenter) {
    // 对称缩放：位移翻倍，中心保持不变
    if (east) w = start.w + dx * 2;
    if (west) w = start.w - dx * 2;
    if (south) h = start.h + dy * 2;
    if (north) h = start.h - dy * 2;
    x = start.x + start.w / 2 - w / 2;
    y = start.y + start.h / 2 - h / 2;
  }

  if (options.lockAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    // 只拉宽或只拉高时，另一维按比例推导；两维都变时取变化更大的一侧
    if (east || west) {
      const candidateH = w / ratio;
      if (north || south) {
        h = Math.abs(h - start.h) > Math.abs(candidateH - start.h) ? h : candidateH;
        w = h * ratio;
      } else {
        h = candidateH;
      }
    } else if (north || south) {
      w = h * ratio;
    }
    if (north) y = start.y + start.h - h;
    if (west) x = start.x + start.w - w;
  }

  w = Math.max(IMAGE_MIN_SIZE, Math.round(w));
  h = Math.max(IMAGE_MIN_SIZE, Math.round(h));
  return { x: Math.round(x), y: Math.round(y), w, h };
}

export type LayerAction = 'front' | 'back' | 'up' | 'down';

/** 层级重排后每个图片节点的新 zIndex（画布上图片与卡片共用层级空间，见 CARD_LAYER_Z） */
export function reorderLayers(
  nodes: readonly Pick<ImageNode, 'id' | 'zIndex'>[],
  id: string,
  action: LayerAction,
): Record<string, number> {
  const ordered = [...nodes].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((item) => item.id === id);
  const result: Record<string, number> = {};
  if (index < 0) return result;
  const target = ordered[index];

  // 先用「远在带外」的临时值表达置顶/置底，再统一重排，避免和卡片层边界打架
  const moved: Record<string, number> = {};
  ordered.forEach((item) => {
    moved[item.id] = item.zIndex;
  });

  if (action === 'front') {
    moved[id] = Number.MAX_SAFE_INTEGER;
  } else if (action === 'back') {
    moved[id] = Number.MIN_SAFE_INTEGER;
  } else {
    const swapWith = action === 'up' ? index + 1 : index - 1;
    if (swapWith < 0 || swapWith >= ordered.length) {
      // 已经在最上层 / 最下层：只做一次归一化，顺序不变
      ordered.forEach((item, order) => {
        const below = ordered.filter((other) => other.zIndex < CARD_LAYER_Z).length;
        result[item.id] =
          order < below ? CARD_LAYER_Z - (below - order) : CARD_LAYER_Z + 1 + (order - below);
      });
      return result;
    }
    const other = ordered[swapWith];
    moved[other.id] = target.zIndex;
    moved[id] = other.zIndex;
  }

  const sorted = [...ordered].sort((a, b) => moved[a.id] - moved[b.id]);
  const belowCount = sorted.filter((item) => moved[item.id] < CARD_LAYER_Z).length;
  sorted.forEach((item, order) => {
    const z = order < belowCount ? CARD_LAYER_Z - (belowCount - order) : CARD_LAYER_Z + 1 + (order - belowCount);
    result[item.id] = Math.min(LAYER_Z_MAX, Math.max(LAYER_Z_MIN, z));
  });
  return result;
}

/**
 * 吸附随动（M10）：卡片移动时，吸附在它身上的图片要一起走。
 * 返回需要平移的图片动作；被显式选中拖动的那批图片由调用方排除，避免位移两次。
 */
export function dockedMoves(
  images: readonly ImageNode[],
  movedNodeIds: ReadonlySet<string>,
  dx: number,
  dy: number,
  excludeImageIds?: ReadonlySet<string>,
): Array<{ id: string; x: number; y: number }> {
  if (dx === 0 && dy === 0) return [];
  const moves: Array<{ id: string; x: number; y: number }> = [];
  for (const image of images) {
    const host = image.linkedNodeId;
    if (!host || !movedNodeIds.has(host)) continue;
    if (excludeImageIds?.has(image.id)) continue;
    moves.push({ id: image.id, x: image.x + dx, y: image.y + dy });
  }
  return moves;
}

/**
 * 拖到卡片四角附近时决定吸附到哪个角（M10）。
 * 判定用「图片中心相对卡片中心的方向」，比只看中心点是否落在矩形内宽松得多，
 * 差半张卡片也能吸住（原来的 bug：偏移一点就脱靶）。
 */
export interface DockTarget {
  nodeId: string;
  corner: DockCorner;
  /** 吸附后图片左上角应有的位置（世界坐标） */
  x: number;
  y: number;
  /** 相对卡片左上角的偏移，存进 dockOffset 供恢复 */
  offsetX: number;
  offsetY: number;
  /** 0–1，越大越靠近卡片 */
  distance: number;
}

export interface DockNodeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DOCK_CORNER_GAP = 6;

/** 吸附判定半径（世界坐标，M10）：卡片外围这么远之内都算「要吸附」 */
export const DOCK_TOLERANCE = 140;
/** M11（I6）：压缩成小圆点时的边长（世界坐标） */
export const IMAGE_DOT_SIZE = 26;

export function findDockTarget(
  image: { x: number; y: number; w: number; h: number },
  nodes: readonly DockNodeRect[],
  tolerance = DOCK_TOLERANCE,
): DockTarget | null {
  const cx = image.x + image.w / 2;
  const cy = image.y + image.h / 2;
  let best: DockTarget | null = null;
  for (const node of nodes) {
    const nx = node.x + node.w / 2;
    const ny = node.y + node.h / 2;
    const dx = cx - nx;
    const dy = cy - ny;
    // 到卡片边界的外扩距离：进到卡片内部算 0，越远越大
    const outX = Math.max(0, Math.abs(dx) - node.w / 2);
    const outY = Math.max(0, Math.abs(dy) - node.h / 2);
    const out = Math.max(outX, outY);
    if (out > tolerance) continue;
    const corner: DockCorner = dx >= 0 ? (dy >= 0 ? 'se' : 'ne') : dy >= 0 ? 'sw' : 'nw';
    const right = corner === 'ne' || corner === 'se';
    const bottom = corner === 'sw' || corner === 'se';
    const x = right ? node.x + node.w - image.w * 0.25 : node.x - image.w * 0.75;
    const y = bottom ? node.y + node.h - image.h * 0.25 : node.y - image.h * 0.75;
    const distance = Math.max(0, Math.min(1, 1 - out / tolerance));
    if (!best || distance > best.distance) {
      best = {
        nodeId: node.id,
        corner,
        x: Math.round(x + (right ? DOCK_CORNER_GAP : -DOCK_CORNER_GAP)),
        y: Math.round(y + (bottom ? DOCK_CORNER_GAP : -DOCK_CORNER_GAP)),
        offsetX: Math.round(x + (right ? DOCK_CORNER_GAP : -DOCK_CORNER_GAP) - node.x),
        offsetY: Math.round(y + (bottom ? DOCK_CORNER_GAP : -DOCK_CORNER_GAP) - node.y),
        distance,
      };
    }
  }
  return best;
}

/**
 * 卡片层的层级占位（M10）。
 * 卡片与自由图片共用同一个层级空间：卡片固定 100，图片在 1–99 表示「在卡片下面」、
 * 101–199 表示「在卡片上面」。之前只有图片带 zIndex、卡片没有，所以图片的
 * 「置底 / 下移」相对卡片永远无效（这正是 M10 反馈里「图片上下移没功能」的根因）。
 */
export const CARD_LAYER_Z = 100;
const LAYER_Z_MIN = 1;
const LAYER_Z_MAX = 199;

export function nextZIndex(nodes: readonly Pick<ImageNode, 'zIndex'>[]): number {
  const max = nodes.reduce((value, item) => Math.max(value, item.zIndex), CARD_LAYER_Z);
  return Math.min(LAYER_Z_MAX, Math.max(CARD_LAYER_Z + 1, max + 1));
}

export interface AlignGuide {
  axis: 'x' | 'y';
  /** 参考线所在的世界坐标（x 轴线段用 x，y 轴线段用 y） */
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  rect: Rect;
  guides: AlignGuide[];
  /** 命中的吸附来源：其它图片/卡片的边缘或中线，未命中则为网格 */
  snap: 'none' | 'align' | 'grid';
}

interface Candidates {
  x: Array<{ delta: number; pos: number; other: Rect }>;
  y: Array<{ delta: number; pos: number; other: Rect }>;
}

function candidateEdges(rect: Rect): { xs: number[]; ys: number[] } {
  return {
    xs: [rect.x, rect.x + rect.w / 2, rect.x + rect.w],
    ys: [rect.y, rect.y + rect.h / 2, rect.y + rect.h],
  };
}

/**
 * 拖动中的矩形吸附：优先对齐其它矩形的左/中/右与上/中/下，
 * 命中阈值内取最小位移；都没命中则退回网格吸附。
 */
export function snapImageRect(
  rect: Rect,
  others: readonly Rect[],
  options: { threshold?: number; grid?: number; enableAlign?: boolean; enableGrid?: boolean } = {},
): SnapResult {
  const threshold = options.threshold ?? ALIGN_THRESHOLD;
  const grid = options.grid ?? GRID_SIZE;
  const enableAlign = options.enableAlign !== false;
  const enableGrid = options.enableGrid !== false;
  const self = candidateEdges(rect);
  const candidates: Candidates = { x: [], y: [] };

  if (enableAlign) {
    for (const other of others) {
      const target = candidateEdges(other);
      for (const x of self.xs) {
        for (const tx of target.xs) {
          candidates.x.push({ delta: tx - x, pos: tx, other });
        }
      }
      for (const y of self.ys) {
        for (const ty of target.ys) {
          candidates.y.push({ delta: ty - y, pos: ty, other });
        }
      }
    }
  }

  const pick = (list: Candidates['x']): Candidates['x'][number] | null => {
    let best: Candidates['x'][number] | null = null;
    for (const item of list) {
      if (Math.abs(item.delta) > threshold) continue;
      if (!best || Math.abs(item.delta) < Math.abs(best.delta)) best = item;
    }
    return best;
  };

  const hitX = pick(candidates.x);
  const hitY = pick(candidates.y);

  let nextX = rect.x + (hitX ? hitX.delta : 0);
  let nextY = rect.y + (hitY ? hitY.delta : 0);
  let snapKind: SnapResult['snap'] = hitX || hitY ? 'align' : 'none';

  if (!hitX && !hitY && enableGrid) {
    nextX = Math.round(rect.x / grid) * grid;
    nextY = Math.round(rect.y / grid) * grid;
    snapKind = 'grid';
  }

  const guides: AlignGuide[] = [];
  if (hitX) {
    const other = hitX.other;
    guides.push({
      axis: 'x',
      pos: hitX.pos,
      from: Math.min(other.y, nextY),
      to: Math.max(other.y + other.h, nextY + rect.h),
    });
  }
  if (hitY) {
    const other = hitY.other;
    guides.push({
      axis: 'y',
      pos: hitY.pos,
      from: Math.min(other.x, nextX),
      to: Math.max(other.x + other.w, nextX + rect.w),
    });
  }

  return { rect: { ...rect, x: nextX, y: nextY }, guides, snap: snapKind };
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom';

/** 多选对齐：以选区外接框为准，返回每个矩形的新坐标 */
export function alignRects(rects: readonly Rect[], mode: AlignMode): Array<{ x: number; y: number }> {
  if (rects.length === 0) return [];
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return rects.map((rect) => {
    switch (mode) {
      case 'left':
        return { x: minX, y: rect.y };
      case 'centerX':
        return { x: Math.round((minX + maxX) / 2 - rect.w / 2), y: rect.y };
      case 'right':
        return { x: maxX - rect.w, y: rect.y };
      case 'top':
        return { x: rect.x, y: minY };
      case 'middleY':
        return { x: rect.x, y: Math.round((minY + maxY) / 2 - rect.h / 2) };
      case 'bottom':
        return { x: rect.x, y: maxY - rect.h };
      default:
        return { x: rect.x, y: rect.y };
    }
  });
}

/** 等距分布：按轴向中点排序后平均分配间距，返回每个矩形的新坐标 */
export function distributeRects(rects: readonly Rect[], axis: 'x' | 'y'): Array<{ x: number; y: number }> {
  if (rects.length < 3) return rects.map((rect) => ({ x: rect.x, y: rect.y }));
  const indexed = rects.map((rect, index) => ({ rect, index }));
  const size = (rect: Rect) => (axis === 'x' ? rect.w : rect.h);
  const start = (rect: Rect) => (axis === 'x' ? rect.x : rect.y);
  indexed.sort((a, b) => start(a.rect) - start(b.rect));
  const first = indexed[0].rect;
  const last = indexed[indexed.length - 1].rect;
  const span = start(last) + size(last) - start(first);
  const totalSize = indexed.reduce((sum, item) => sum + size(item.rect), 0);
  const gap = (span - totalSize) / (indexed.length - 1);
  const result = rects.map((rect) => ({ x: rect.x, y: rect.y }));
  let cursor = start(first);
  for (const item of indexed) {
    if (axis === 'x') result[item.index] = { x: Math.round(cursor), y: item.rect.y };
    else result[item.index] = { x: item.rect.x, y: Math.round(cursor) };
    cursor += size(item.rect) + gap;
  }
  return result;
}
