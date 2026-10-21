/**
 * 标注渲染与导出（M2-5）。
 *
 * 同一份几何既画在编辑画布上，也画在导出图上（D17），所以绘制逻辑只写这一份。
 * 所有坐标都是归一化的，这里统一乘目标像素尺寸。
 */
import type { Annotation } from '../types';
import { mosaicCells, normalizeGeom, toPixelPoints } from '../lib/annotation';
import { hexToRgba } from '../lib/theme';

export interface DrawOptions {
  /** 是否画区域锚点/文字标签（导出默认开，编辑画布也开） */
  labels?: boolean;
  /** 选中标注：额外描一层高亮 */
  selectedId?: string | null;
  /** 线条基准宽度（像素）；目标尺寸越大按比例加粗 */
  baseWidth?: number;
}

/** 把一组归一化标注画到 canvas 上；源图可选（只有马赛克需要） */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: readonly Annotation[],
  width: number,
  height: number,
  source?: CanvasImageSource | null,
  options: DrawOptions = {},
): void {
  const labels = options.labels !== false;
  const scale = Math.max(0.6, Math.min(3, Math.min(width, height) / 480));
  const lineWidth = Math.max(1.5, (options.baseWidth ?? 2.4) * scale);
  const fontSize = Math.max(11, 13 * scale);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'top';
  ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;

  for (const annotation of annotations) {
    const geom = normalizeGeom(annotation.geom);
    const color = annotation.color || '#C0392B';
    const box = { x: geom.x * width, y: geom.y * height, w: geom.w * width, h: geom.h * height };
    const points = geom.points ? toPixelPoints(geom.points, width, height) : [];
    const isSelected = options.selectedId === annotation.id;

    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = 'rgba(192, 57, 43, 0.45)';
      ctx.lineWidth = lineWidth + 5;
      if (annotation.shape === 'pen' && points.length > 1) {
        ctx.beginPath();
        points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
        ctx.stroke();
      } else {
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
      ctx.restore();
    }

    if (annotation.shape === 'mosaic') {
      if (!source) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.restore();
        continue;
      }
      const cells = mosaicCells(geom, 8);
      if (cells.length === 0) continue;
      const cols = 8;
      const rows = Math.max(1, Math.ceil(cells.length / cols));
      const regionW = Math.max(1, Math.round(geom.w * width));
      const regionH = Math.max(1, Math.round(geom.h * height));
      const small = document.createElement('canvas');
      small.width = cols;
      small.height = rows;
      const smallCtx = small.getContext('2d');
      if (!smallCtx) continue;
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(source, box.x, box.y, regionW, regionH, 0, 0, cols, rows);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cols, rows, box.x, box.y, regionW, regionH);
      ctx.restore();
      continue;
    }

    if (annotation.shape === 'rect' || annotation.shape === 'anchor') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (annotation.shape === 'anchor') ctx.setLineDash([7, 5]);
      ctx.fillStyle = hexToRgba(color, 0.08);
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      if (annotation.shape === 'anchor' && labels) {
        const caption = annotation.linkedNodeId ? '区域锚点 · 已关联' : '区域锚点';
        drawChip(ctx, caption, box.x, Math.max(0, box.y - fontSize - 6), color, fontSize);
      }
      ctx.restore();
      continue;
    }

    if (annotation.shape === 'arrow') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineWidth;
      const start = points[0] ?? { x: box.x, y: box.y };
      const end = points[points.length - 1] ?? { x: box.x + box.w, y: box.y + box.h };
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      /** 箭头两翼直接在像素空间算，避免与归一化辅助函数混用单位 */
      const headSize = Math.max(lineWidth * 3, Math.min(width, height) * 0.028);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const spread = Math.PI / 7;
      const headA = { x: end.x - headSize * Math.cos(angle - spread), y: end.y - headSize * Math.sin(angle - spread) };
      const headB = { x: end.x - headSize * Math.cos(angle + spread), y: end.y - headSize * Math.sin(angle + spread) };
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(headA.x, headA.y);
      ctx.lineTo(headB.x, headB.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (annotation.shape === 'pen') {
      if (points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (annotation.shape === 'text') {
      const text = annotation.text?.trim() || '文字';
      const anchorX = box.w > 0 ? box.x : box.x + 4;
      const anchorY = box.h > 0 ? box.y : box.y;
      const padding = 5;
      const textWidth = ctx.measureText(text).width;
      ctx.save();
      ctx.fillStyle = 'rgba(20, 20, 20, 0.62)';
      ctx.fillRect(anchorX, anchorY, textWidth + padding * 2, fontSize + padding * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, anchorX + padding, anchorY + padding);
      ctx.restore();
      continue;
    }
  }
  ctx.restore();
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
): void {
  const padding = 4;
  const textWidth = ctx.measureText(text).width;
  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.9);
  ctx.fillRect(x, y, textWidth + padding * 2, fontSize + padding * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padding, y + padding);
  ctx.restore();
}

export interface RenderAnnotatedOptions {
  /** 长边上限（导出默认 2048，避免超大图卡顿） */
  maxEdge?: number;
}

/** 把原图 + 标注合成为 PNG Blob（M2-5「随素材导出」） */
export async function renderAnnotatedBlob(
  source: Blob,
  annotations: readonly Annotation[],
  options: RenderAnnotatedOptions = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const maxEdge = options.maxEdge ?? 2048;
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前环境无法创建画布，标注图导出失败');
    ctx.drawImage(bitmap, 0, 0, width, height);
    drawAnnotations(ctx, annotations, width, height, canvas);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('标注图编码失败'));
      }, 'image/png');
    });
  } finally {
    bitmap.close();
  }
}