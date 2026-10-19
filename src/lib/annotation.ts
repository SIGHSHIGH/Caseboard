/**
 * 标注层几何（M2-5，纯函数，无 DOM）。
 *
 * 约定（D17）：所有几何都用**归一化坐标**（0–1，相对素材宽高）。
 * 缩略图 256、预览 1024、导出原图三者共用同一份数据，换尺寸不重算。
 */
import type { Annotation, AnnotationGeom, AnnotationShape, Asset, CaseDoc, XY } from '../types';
import { newId } from './id';

export const ANNOTATION_SHAPES: AnnotationShape[] = ['rect', 'arrow', 'pen', 'text', 'anchor', 'mosaic'];

export const SHAPE_LABELS: Record<AnnotationShape, string> = {
  rect: '矩形框',
  arrow: '箭头',
  pen: '手绘',
  text: '文字',
  anchor: '区域锚点',
  mosaic: '马赛克',
};

export const SHAPE_HINTS: Record<AnnotationShape, string> = {
  rect: '拖出方框圈住画面区域',
  arrow: '从起点拖到指向位置',
  pen: '按住自由描绘轮廓',
  text: '点一下位置再输入文字',
  anchor: '拖出区域并关联到某个实体',
  mosaic: '拖出需要遮挡的范围',
};

export const ANNOTATION_COLORS = ['#C0392B', '#2E7D64', '#8C7A2E', '#2E6DA4', '#6E6862', '#2B2B2B'];
export const DEFAULT_ANNOTATION_COLOR = '#C0392B';
export const MOSAIC_COLS = 8;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 归一化一个可能来自旧存档 / 用户输入的几何体：坐标夹到 0–1，宽高非负 */
export function normalizeGeom(input: Partial<AnnotationGeom> | null | undefined): AnnotationGeom {
  const raw = input ?? {};
  const x = clamp01(Number(raw.x ?? 0));
  const y = clamp01(Number(raw.y ?? 0));
  const w = clamp01(Number(raw.w ?? 0));
  const h = clamp01(Number(raw.h ?? 0));
  const geom: AnnotationGeom = {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  };
  if (Array.isArray(raw.points) && raw.points.length > 0) {
    const points: XY[] = [];
    for (const point of raw.points) {
      if (!point || typeof point !== 'object') continue;
      points.push({ x: clamp01(Number(point.x)), y: clamp01(Number(point.y)) });
    }
    if (points.length > 0) geom.points = points;
  }
  return geom;
}

/** 两个对角点（拖动起止）生成矩形几何 */
export function rectFromPoints(from: XY, to: XY): AnnotationGeom {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return normalizeGeom({ x, y, w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) });
}

export interface CreateAnnotationOptions {
  id?: string;
  text?: string;
  color?: string;
  linkedNodeId?: string;
}

export function createAnnotation(
  shape: AnnotationShape,
  geom: AnnotationGeom | Partial<AnnotationGeom>,
  options: CreateAnnotationOptions = {},
): Annotation {
  const annotation: Annotation = {
    id: options.id ?? newId('an'),
    shape,
    geom: normalizeGeom(geom),
    color: options.color || DEFAULT_ANNOTATION_COLOR,
  };
  const text = options.text?.trim();
  if (text) annotation.text = text;
  if (options.linkedNodeId) annotation.linkedNodeId = options.linkedNodeId;
  return annotation;
}

export interface NormBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 标注的外接框：折线类按点集算，其余按 geom */
export function annotationBBox(annotation: Annotation): NormBBox {
  const points = annotation.geom.points;
  if (points && points.length > 0) {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: annotation.geom.x, y: annotation.geom.y, w: annotation.geom.w, h: annotation.geom.h };
}

/** 点是否命中标注（默认容差 2% 边长，便于手指/鼠标点中细线） */
export function hitAnnotation(annotation: Annotation, point: XY, tolerance = 0.02): boolean {
  const box = annotationBBox(annotation);
  return (
    point.x >= box.x - tolerance &&
    point.x <= box.x + box.w + tolerance &&
    point.y >= box.y - tolerance &&
    point.y <= box.y + box.h + tolerance
  );
}

/** 马赛克网格：把区域切成 cols 列的小块（归一化），渲染层按块涂黑 */
export function mosaicCells(geom: AnnotationGeom, cols = MOSAIC_COLS): NormBBox[] {
  const box = normalizeGeom(geom);
  if (box.w <= 0 || box.h <= 0) return [];
  const columnCount = Math.max(1, Math.min(32, Math.round(cols)));
  const cellW = box.w / columnCount;
  const cellH = cellW;
  const rowCount = Math.max(1, Math.ceil(box.h / cellH));
  const cells: NormBBox[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const x = box.x + column * cellW;
      const y = box.y + row * cellH;
      const w = Math.min(cellW, box.x + box.w - x);
      const h = Math.min(cellH, box.y + box.h - y);
      if (w <= 0 || h <= 0) continue;
      cells.push({ x, y, w, h });
    }
  }
  return cells;
}

/** 箭头两翼顶点（归一化空间，size 以较短边为基准） */
export function arrowHeadPoints(from: XY, to: XY, size = 0.03): [XY, XY] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

/** 归一化矩形 → 目标像素矩形（渲染与导出共用） */
export function toPixelRect(geom: NormBBox, width: number, height: number): NormBBox {
  return { x: geom.x * width, y: geom.y * height, w: geom.w * width, h: geom.h * height };
}

/** 归一化点集 → 像素点集 */
export function toPixelPoints(points: readonly XY[], width: number, height: number): XY[] {
  return points.map((point) => ({ x: point.x * width, y: point.y * height }));
}

/**
 * 区域锚点增强（M7-2，验收 2）：找出绑定到某个节点的所有图片区域。
 * 悬停/选中节点时，素材库与右栏据此高亮对应框；返回按素材编号、标注顺序稳定排序。
 */
export interface NodeAnchorRef {
  assetId: string;
  assetName: string;
  assetNo?: string;
  annotationId: string;
  shape: AnnotationShape;
  color: string;
  text?: string;
}

export function annotationsForNode(doc: CaseDoc, nodeId: string): NodeAnchorRef[] {
  const refs: NodeAnchorRef[] = [];
  for (const asset of doc.assets) {
    asset.annotations.forEach((annotation) => {
      if (annotation.linkedNodeId !== nodeId) return;
      const ref: NodeAnchorRef = {
        assetId: asset.id,
        assetName: asset.name ?? asset.no ?? asset.id,
        annotationId: annotation.id,
        shape: annotation.shape,
        color: annotation.color ?? DEFAULT_ANNOTATION_COLOR,
      };
      if (asset.no) ref.assetNo = asset.no;
      if (annotation.text) ref.text = annotation.text;
      refs.push(ref);
    });
  }
  return refs.sort((a, b) =>
    (a.assetNo ?? a.assetName).localeCompare(b.assetNo ?? b.assetName, 'zh') || a.annotationId.localeCompare(b.annotationId),
  );
}

export function countAnchorsForNode(doc: CaseDoc, nodeId: string): number {
  let count = 0;
  for (const asset of doc.assets) {
    for (const annotation of asset.annotations) if (annotation.linkedNodeId === nodeId) count += 1;
  }
  return count;
}

/** 某素材上被锚定到节点的框（素材详情高亮用） */
export function anchoredAnnotationsOf(asset: Asset): Annotation[] {
  return asset.annotations.filter((annotation) => Boolean(annotation.linkedNodeId));
}

/** 标注摘要文案：右栏与素材库共用（如「矩形框 · 2 处标注」由调用方拼） */
export function describeAnnotation(annotation: Annotation): string {
  const label = SHAPE_LABELS[annotation.shape];
  if (annotation.shape === 'text' && annotation.text) return `${label}：${annotation.text}`;
  if (annotation.shape === 'anchor' && annotation.linkedNodeId) return `${label} → ${annotation.linkedNodeId}`;
  return label;
}
