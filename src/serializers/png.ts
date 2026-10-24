/**
 * 整板 PNG 导出：与 svg.ts 同一套坐标系与排版，改用 Canvas 2D 绘制。
 *
 * 为什么模型驱动而不是截屏：与 SVG 同理（D9 无头浏览器被宿主拦截），
 * 而且 PDF 导出需要位图，直接复用这里的 canvas 比再挂一个 DOM 转图库更可控。
 * 绘制顺序：背景 → 网格 → 标题块 → 组 → 边 → 图片节点 → 卡片 → 图例 → footer。
 */
import type { Asset, CaseDoc, CaseEdge, CaseNode, Group, ImageNode } from '../types';
import { curveGeometry, curveOffsetOf } from '../lib/edgeCurve';
import { COLORS, LINE_STYLE_META, NODE_TYPE_META, STATUS_META, relColor, relLabel } from '../lib/theme';
import { boardLayout, textWidth } from './svg';

export interface BoardPngOptions {
  padding?: number;
  grid?: boolean;
  legend?: boolean;
  titleBlock?: boolean;
  footer?: string;
  /** 输出像素倍率（默认 2，导出更清晰） */
  pixelRatio?: number;
  /** 已预加载的图片：assetId → 可绘制对象（缺省画占位块） */
  images?: Map<string, CanvasImageSource>;
  /** 背景色（默认 COLORS.bg） */
  background?: string;
}

export interface BoardPngResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  bounds: { x: number; y: number; w: number; h: number };
}

const FONT = "'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif";
const MONO = "'Cascadia Mono',Consolas,'Courier New',monospace";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function font(size: number, weight = 400, family = FONT): string {
  return weight + ' ' + size + 'px ' + family;
}

function dashOf(style: CaseEdge['style']): number[] {
  if (style === 'dashed') return [9, 6];
  if (style === 'dotted') return [2, 5];
  return [];
}

interface Point {
  x: number;
  y: number;
}

function edgeGeometry(edge: CaseEdge, nodes: Map<string, CaseNode>, images: Map<string, ImageNode>): { s: Point; t: Point } | null {
  const centerOf = (id: string): Point | null => {
    const node = nodes.get(id);
    if (node) return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    const image = images.get(id);
    if (image) return { x: image.x + image.w / 2, y: image.y + image.h / 2 };
    return null;
  };
  const s = centerOf(edge.source);
  const t = centerOf(edge.target);
  if (!s || !t) return null;
  return { s, t };
}

/** 三次贝塞尔的控制点与 svg.ts 完全一致，保证两种导出视觉相同。 */
function controlPoints(s: Point, t: Point, offset?: { x: number; y: number } | null): [Point, Point] {
  if (offset) {
    const geometry = curveGeometry(s, t, offset);
    return [geometry.c1, geometry.c2];
  }
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  return [
    { x: s.x + dx * 0.4, y: s.y + dy * 0.05 },
    { x: s.x + dx * 0.6, y: s.y + dy * 0.95 },
  ];
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, lineWidth: number): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(7, lineWidth * 4);
  const spread = Math.PI / 7;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - spread), to.y - size * Math.sin(angle - spread));
  ctx.lineTo(to.x - size * Math.cos(angle + spread), to.y - size * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGroup(ctx: CanvasRenderingContext2D, group: Group): void {
  const { x, y, w, h } = group.bounds;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = group.color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = group.color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = group.color;
  ctx.font = font(14, 600);
  ctx.fillText(group.title, x + 14, y + 24);
  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, edge: CaseEdge, geometry: { s: Point; t: Point }): void {
  const color = edge.color ?? relColor(edge.relType);
  const width = edge.weight && edge.weight > 0 ? Math.min(4.5, Math.max(1.4, 1.4 + Math.log10(edge.weight) * 0.45)) : 1.6;
  const offset = curveOffsetOf(edge);
  const [c1, c2] = controlPoints(geometry.s, geometry.t, offset);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashOf(edge.style));
  ctx.beginPath();
  ctx.moveTo(geometry.s.x, geometry.s.y);
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, geometry.t.x, geometry.t.y);
  ctx.stroke();
  ctx.restore();
  if (edge.directed) drawArrowHead(ctx, c2, geometry.t, color, width);

  const label = edge.label && edge.label.trim().length > 0 ? edge.label : relLabel(edge.relType);
  if (!label) return;
  const fontSize = 11;
  const lx = (geometry.s.x + geometry.t.x) / 2 + (offset ? offset.x : 0);
  const ly = (geometry.s.y + geometry.t.y) / 2 + (offset ? offset.y : 0);
  const boxW = textWidth(label, fontSize) + 12;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(lx - boxW / 2, ly - 9, boxW, 18, 5);
  ctx.fillStyle = 'rgba(251, 250, 247, 0.92)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font(fontSize);
  ctx.textAlign = 'center';
  ctx.fillText(label, lx, ly + 4);
  ctx.restore();
}

/** 集中钉子（H5.12）：30px 圆点 + 可选黄色便签；导出里也要和画布长得一样 */
function drawClusterPin(ctx: CanvasRenderingContext2D, node: CaseNode): void {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  // 老文档里的钉子可能是 168×132，半径夹在 9–15，导出才是「圆点」而不是大红球
  const r = Math.max(9, Math.min(15, Math.min(node.w, node.h) / 2));
  // 便签先画，圆点压在上面
  const paper = String(node.fields['显示便利贴'] ?? '隐藏') === '显示';
  const text = String(node.fields['便利贴文字'] ?? '').trim();
  if (paper) {
    const pw = 200;
    const ph = 84;
    const px = cx - pw / 2;
    const py = node.y + node.h + 10;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 4);
    ctx.fillStyle = '#FFE9A8';
    ctx.fill();
    ctx.strokeStyle = '#E4CE86';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (text) {
      ctx.fillStyle = '#4A3B12';
      ctx.font = font(12, 500);
      const lines: string[] = [];
      for (let i = 0; i < text.length && lines.length < 4; i += 13) lines.push(text.slice(i, i + 13));
      lines.forEach((line, index) => ctx.fillText(line, px + 10, py + 20 + index * 17));
    }
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#C0392B';
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawNode(ctx: CanvasRenderingContext2D, node: CaseNode): void {
  // H5.12：钉子不是卡片
  if (node.type === 'clusterPin') {
    drawClusterPin(ctx, node);
    return;
  }
  const meta = NODE_TYPE_META[node.type];
  const status = STATUS_META[node.status];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(node.x, node.y, node.w, node.h, 10);
  ctx.fillStyle = '#FBFAF7';
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 左侧类型色条
  ctx.beginPath();
  ctx.roundRect(node.x, node.y + 8, 4, node.h - 16, 2);
  ctx.fillStyle = meta.color;
  ctx.fill();
  // 类型圆点 + 图标
  ctx.beginPath();
  ctx.arc(node.x + 22, node.y + 22, 9, 0, Math.PI * 2);
  ctx.fillStyle = meta.color;
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = meta.color;
  ctx.font = font(10);
  ctx.textAlign = 'center';
  ctx.fillText(meta.icon, node.x + 22, node.y + 26);
  ctx.textAlign = 'left';
  // 标题
  const title = truncate(node.title, node.w > 180 ? 12 : 8);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 600);
  ctx.fillText(title, node.x + 38, node.y + 27);
  // 副标题
  const subtitle = node.aliases && node.aliases.length > 0 ? node.aliases[0] : meta.label;
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = font(11);
  ctx.fillText(truncate(subtitle, 16), node.x + 14, node.y + 52);
  // 状态点 + 状态文字
  ctx.beginPath();
  ctx.arc(node.x + 18, node.y + node.h - 16, 4, 0, Math.PI * 2);
  ctx.fillStyle = status.color;
  ctx.fill();
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = font(11);
  ctx.fillText(status.label, node.x + 28, node.y + node.h - 12);
  // 置信度
  ctx.textAlign = 'right';
  ctx.font = font(11, 400, MONO);
  ctx.fillText(String(node.confidence) + '%', node.x + node.w - 12, node.y + node.h - 12);
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, image: ImageNode, asset: Asset | undefined, source: CanvasImageSource | undefined): void {
  ctx.save();
  const cx = image.x + image.w / 2;
  const cy = image.y + image.h / 2;
  ctx.translate(cx, cy);
  if (image.rotation !== 0) ctx.rotate(((image.rotation % 360) * Math.PI) / 180);
  ctx.translate(-image.w / 2, -image.h / 2);
  if (source) {
    ctx.drawImage(source, 0, 0, image.w, image.h);
  } else {
    ctx.fillStyle = '#EDE9E2';
    ctx.fillRect(0, 0, image.w, image.h);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#C9C2B6';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, image.w, image.h);
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = font(12);
    ctx.textAlign = 'center';
    ctx.fillText(asset && asset.name ? truncate(asset.name, 14) : '图片原件不在本机', image.w / 2, image.h / 2);
    ctx.textAlign = 'left';
  }
  if (asset?.aiGenerated) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 112, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(11);
    ctx.fillText('AI 生成 · 模拟图', 14, 23);
  }
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, doc: CaseDoc, x: number, y: number): void {
  const styles: CaseEdge['style'][] = ['solid', 'dashed', 'dotted'];
  ctx.save();
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = font(12);
  ctx.fillText('线型即语义', x, y);
  styles.forEach((style, index) => {
    const meta = doc.settings.lineLegend[style] ?? LINE_STYLE_META[style];
    const lineY = y + 20 + index * 18;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.8;
    ctx.setLineDash(dashOf(style));
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + 40, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(12);
    ctx.fillText(meta.label, x + 50, lineY + 4);
  });
  ctx.restore();
}

/** 同步绘制整板到 canvas（图片要先由调用方预加载好）。 */
/** 集中钉子之间的红线（H5.12）：直线、全局线宽、画在卡片之上 */
function drawPinLinks(ctx: CanvasRenderingContext2D, doc: CaseDoc): void {
  const links = doc.pinLinks ?? [];
  if (links.length === 0) return;
  const width = Math.max(1, Math.min(12, Math.round(doc.settings.pinLinkWidth ?? 4)));
  const centerOf = (id: string): { x: number; y: number } | null => {
    const node = doc.nodes.find((item) => item.id === id && item.type === 'clusterPin');
    return node ? { x: node.x + node.w / 2, y: node.y + node.h / 2 } : null;
  };
  ctx.save();
  ctx.strokeStyle = '#C0392B';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (const link of links) {
    const from = centerOf(link.source);
    const to = centerOf(link.target);
    if (!from || !to) continue;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBoardToCanvas(doc: CaseDoc, options: BoardPngOptions = {}): BoardPngResult {
  const ratio = options.pixelRatio && options.pixelRatio > 0 ? options.pixelRatio : 2;
  // 排版与 SVG 共用 boardLayout（决策 D28）：同一份 doc 两种导出尺寸必须逐像素一致
  const layout = boardLayout(doc, options);
  const padding = layout.padding;
  const bounds = layout.bounds;
  const contentW = layout.width;
  const contentH = layout.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(contentW * ratio);
  canvas.height = Math.round(contentH * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境无法创建画布，PNG 导出失败');
  ctx.scale(ratio, ratio);

  const background = options.background ?? COLORS.bg;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, contentW, contentH);

  if (options.grid !== false) {
    ctx.fillStyle = '#DAD5CB';
    const step = 28;
    for (let y = step; y < contentH; y += step) {
      for (let x = step; x < contentW; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (options.titleBlock !== false) {
    ctx.fillStyle = COLORS.text;
    ctx.font = font(22, 700);
    ctx.fillText(doc.meta.title, padding, padding);
    const sub = [doc.meta.caseNo ? '案件编号 ' + doc.meta.caseNo : '', '导出 ' + doc.nodes.length + ' 个实体 / ' + doc.edges.length + ' 条关系'].filter(Boolean).join(' · ');
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = font(12);
    ctx.fillText(sub, padding, padding + 22);
  }

  ctx.save();
  ctx.translate(layout.translateX, layout.translateY);
  for (const group of doc.groups) drawGroup(ctx, group);
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  const imageMap = new Map(doc.imageNodes.map((image) => [image.id, image]));
  const assetMap = new Map(doc.assets.map((asset) => [asset.id, asset]));
  for (const edge of doc.edges) {
    const geometry = edgeGeometry(edge, nodeMap, imageMap);
    if (geometry) drawEdge(ctx, edge, geometry);
  }
  for (const image of doc.imageNodes) {
    drawImage(ctx, image, assetMap.get(image.assetId), options.images?.get(image.assetId));
  }
  for (const node of doc.nodes) drawNode(ctx, node);
  // H5.12：红线也要进导出，且压在最上面
  drawPinLinks(ctx, doc);
  ctx.restore();

  if (options.legend !== false) drawLegend(ctx, doc, layout.legendX, layout.legendY);
  if (options.footer) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = font(11);
    ctx.fillText(options.footer, padding, layout.footerY);
  }
  return { canvas, width: canvas.width, height: canvas.height, bounds };
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((item) => {
      if (item) resolve(item);
      else reject(new Error('PNG 编码失败'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** 预加载图片节点素材（asset 协议 / objectURL / data URL 均可）。 */
export async function loadBoardImages(doc: CaseDoc, urlOf: (asset: Asset) => string | undefined): Promise<Map<string, CanvasImageSource>> {
  const map = new Map<string, CanvasImageSource>();
  await Promise.all(
    doc.imageNodes.map(async (image) => {
      const asset = doc.assets.find((item) => item.id === image.assetId);
      if (!asset) return;
      const url = urlOf(asset);
      if (!url) return;
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        map.set(image.assetId, bitmap);
      } catch {
        // 单张图片读取失败不影响整板导出
      }
    }),
  );
  return map;
}

export async function boardToPngBytes(doc: CaseDoc, options: BoardPngOptions = {}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const result = drawBoardToCanvas(doc, options);
  return { bytes: await canvasToPngBytes(result.canvas), width: result.width, height: result.height };
}
