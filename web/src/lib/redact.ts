/**
 * 脱敏与马赛克：纯像素函数，不依赖 canvas，便于自动化验收（验收 6「马赛克不可逆」）。
 *
 * 输入是 RGBA 原始像素（与 canvas ImageData.data 同构），区域坐标是归一化 0–1
 * （与 src/lib/annotation.ts 的标注几何一致），所以同一份标注可以复用到任意分辨率。
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** 长度必须是 width * height * 4 */
  data: Uint8ClampedArray;
}

export interface RedactRegion {
  /** 归一化左边界 0–1 */
  x: number;
  /** 归一化上边界 0–1 */
  y: number;
  /** 归一化宽度 0–1 */
  w: number;
  /** 归一化高度 0–1 */
  h: number;
  /** 可选：指定马赛克格子大小（像素），默认 8 */
  cell?: number;
}

export const REDACT_DEFAULT_CELL = 8;

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : min);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/** 把归一化区域换算成像素矩形，越界部分夹到图像内。 */
export function regionToPixels(
  image: { width: number; height: number },
  region: RedactRegion,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const left = clampInt(region.x * image.width, 0, image.width);
  const top = clampInt(region.y * image.height, 0, image.height);
  const right = clampInt((region.x + region.w) * image.width, left, image.width);
  const bottom = clampInt((region.y + region.h) * image.height, top, image.height);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * 对一块区域做马赛克：按 cell 像素分格取平均色并整格填充。
 * 返回被改写的像素数量，便于验收断言「确实改了像素」。
 */
export function mosaicRegion(image: RgbaImage, region: RedactRegion): number {
  const rect = regionToPixels(image, region);
  if (rect.width <= 0 || rect.height <= 0) return 0;
  const cell = clampInt(region.cell ?? REDACT_DEFAULT_CELL, 1, Math.max(rect.width, rect.height));
  let touched = 0;
  const data = image.data;
  for (let cy = rect.top; cy < rect.bottom; cy += cell) {
    for (let cx = rect.left; cx < rect.right; cx += cell) {
      const maxY = Math.min(cy + cell, rect.bottom);
      const maxX = Math.min(cx + cell, rect.right);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let y = cy; y < maxY; y += 1) {
        for (let x = cx; x < maxX; x += 1) {
          const index = (y * image.width + x) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count += 1;
        }
      }
      if (count === 0) continue;
      const avgR = Math.round(r / count);
      const avgG = Math.round(g / count);
      const avgB = Math.round(b / count);
      const avgA = Math.round(a / count);
      for (let y = cy; y < maxY; y += 1) {
        for (let x = cx; x < maxX; x += 1) {
          const index = (y * image.width + x) * 4;
          data[index] = avgR;
          data[index + 1] = avgG;
          data[index + 2] = avgB;
          data[index + 3] = avgA;
          touched += 1;
        }
      }
    }
  }
  return touched;
}

/** 批量脱敏：返回 (区域数, 改写像素数)。 */
export function applyRedactions(image: RgbaImage, regions: RedactRegion[]): { regions: number; pixels: number } {
  let pixels = 0;
  let applied = 0;
  for (const region of regions) {
    const touched = mosaicRegion(image, region);
    if (touched > 0) {
      applied += 1;
      pixels += touched;
    }
  }
  return { regions: applied, pixels };
}

/**
 * 不可逆自检：区域内每个 cell 的颜色必须完全一致，且原图不同像素已被抹平。
 * 验收 6 用它替代肉眼检查（像素级断言）。
 */
export function isRegionFlattened(image: RgbaImage, region: RedactRegion): boolean {
  const rect = regionToPixels(image, region);
  if (rect.width <= 0 || rect.height <= 0) return false;
  const cell = clampInt(region.cell ?? REDACT_DEFAULT_CELL, 1, Math.max(rect.width, rect.height));
  const data = image.data;
  for (let cy = rect.top; cy < rect.bottom; cy += cell) {
    for (let cx = rect.left; cx < rect.right; cx += cell) {
      const maxY = Math.min(cy + cell, rect.bottom);
      const maxX = Math.min(cx + cell, rect.right);
      const first = (cy * image.width + cx) * 4;
      for (let y = cy; y < maxY; y += 1) {
        for (let x = cx; x < maxX; x += 1) {
          const index = (y * image.width + x) * 4;
          if (
            data[index] !== data[first] ||
            data[index + 1] !== data[first + 1] ||
            data[index + 2] !== data[first + 2] ||
            data[index + 3] !== data[first + 3]
          ) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/** 由标注列表构造脱敏区域（只取用户显式标记为脱敏的标注）。 */
export function redactRegionsFromAnnotations(
  annotations: Array<{ geom: { x: number; y: number; w: number; h: number }; redact?: boolean; shape?: string }>,
): RedactRegion[] {
  const regions: RedactRegion[] = [];
  for (const annotation of annotations) {
    if (!annotation.redact) continue;
    if (annotation.shape === 'anchor') continue;
    const { x, y, w, h } = annotation.geom;
    if (w <= 0 || h <= 0) continue;
    regions.push({ x, y, w, h });
  }
  return regions;
}
