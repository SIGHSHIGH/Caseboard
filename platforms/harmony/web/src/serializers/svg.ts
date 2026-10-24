/**
 * 整板 SVG 导出：由 Document Model 直接生成矢量图，不截屏、不依赖浏览器布局。
 *
 * 为什么不用 DOM 截图（html-to-image）：本机无头浏览器被宿主拦截（D9），DOM 快照无法自动化验收；
 * 而模型驱动的 SVG 是纯函数，可在 smoke 里逐字节断言，也保证「导出图与画布所见一致」不依赖窗口尺寸。
 */
import type { Asset, CaseDoc, CaseEdge, CaseNode, Group, ImageNode } from '../types';
import { curveGeometry, curveOffsetOf, curvePath } from '../lib/edgeCurve';
import { COLORS, LINE_STYLE_META, NODE_TYPE_META, STATUS_META, relColor, relLabel } from '../lib/theme';

export interface BoardSvgOptions {
  /** 画布外边距，默认 64 */
  padding?: number;
  /** 输出缩放（只影响 width/height 与字号，不影响坐标系），默认 1 */
  scale?: number;
  /** 是否画网格点背景，默认 true */
  grid?: boolean;
  /** 是否画线型图例，默认 true */
  legend?: boolean;
  /** 是否画案件标题块，默认 true */
  titleBlock?: boolean;
  /** 底部说明文字（例如「脱敏版」），默认空 */
  footer?: string;
  /** 素材 id → 可直接嵌入的图片地址（data: 或 asset: 协议），缺省时画占位块 */
  imageUrl?: (asset: Asset) => string | undefined;
  /** 素材查找（imageNode → asset） */
  assets?: Asset[];
}

export interface BoardSvgResult {
  svg: string;
  width: number;
  height: number;
  /** 世界坐标包围盒（用于 PDF 分页与缩略图） */
  bounds: { x: number; y: number; w: number; h: number };
}

/** 标题块占用的高度（世界坐标内容从 padding + 这个值开始） */
export const BOARD_TITLE_BLOCK = 48;
/** 图例区高度 */
export const BOARD_LEGEND_HEIGHT = 78;
/** footer 行高 */
export const BOARD_FOOTER_HEIGHT = 26;

/** 整板排版结果：SVG / PNG / PDF 共用同一套尺寸与定位，避免两套导出错位。 */
export interface BoardLayout {
  padding: number;
  bounds: { x: number; y: number; w: number; h: number };
  /** 逻辑宽（未乘 scale） */
  width: number;
  /** 逻辑高（未乘 scale） */
  height: number;
  translateX: number;
  translateY: number;
  legendX: number;
  legendY: number;
  footerY: number;
}

/** 唯一的排版计算入口（决策 D28：只有一份排版真相）。 */
export function boardLayout(doc: CaseDoc, options: { padding?: number; legend?: boolean; footer?: string } = {}): BoardLayout {
  const padding = options.padding ?? 64;
  const bounds = docBounds(doc);
  const width = bounds.w + padding * 2;
  const height = bounds.h + padding * 2 + (options.legend === false ? 0 : BOARD_LEGEND_HEIGHT) + (options.footer ? BOARD_FOOTER_HEIGHT : 0);
  return {
    padding,
    bounds,
    width,
    height,
    translateX: padding - bounds.x,
    translateY: padding + BOARD_TITLE_BLOCK - bounds.y,
    legendX: padding,
    legendY: padding + BOARD_TITLE_BLOCK + bounds.h + 34,
    footerY: height - 18,
  };
}

const FONT = "'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif";
const MONO = "'Cascadia Mono',Consolas,'Courier New',monospace";

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 粗略估算文本宽度：中文按字号 1 倍、西文按 0.56 倍。 */
export function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    width += /[\u4e00-\u9fa5\u3000-\u303f]/.test(char) ? fontSize : fontSize * 0.56;
  }
  return width;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function normalizeDash(style: CaseEdge['style']): string | undefined {
  const dash = LINE_STYLE_META[style].dash;
  if (!dash) return undefined;
  return dash;
}

function edgeGeometry(edge: CaseEdge, nodes: Map<string, CaseNode>, imageNodes: Map<string, ImageNode>): { sx: number; sy: number; tx: number; ty: number } | null {
  const centerOf = (id: string) => {
    const node = nodes.get(id);
    if (node) return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    const image = imageNodes.get(id);
    if (image) return { x: image.x + image.w / 2, y: image.y + image.h / 2 };
    return null;
  };
  const source = centerOf(edge.source);
  const target = centerOf(edge.target);
  if (!source || !target) return null;
  return { sx: source.x, sy: source.y, tx: target.x, ty: target.y };
}

function bezierPath(sx: number, sy: number, tx: number, ty: number, offset?: { x: number; y: number } | null): string {
  // 画布上手调过弧度的关系：导出必须用同一套控制点语义（M4 人工验收 A3）
  if (offset) return curvePath(curveGeometry({ x: sx, y: sy }, { x: tx, y: ty }, offset));
  const dx = tx - sx;
  const dy = ty - sy;
  const cx1 = sx + dx * 0.4;
  const cy1 = sy + dy * 0.05;
  const cx2 = sx + dx * 0.6;
  const cy2 = sy + dy * 0.95;
  return 'M ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' C ' + cx1.toFixed(1) + ' ' + cy1.toFixed(1) + ', ' + cx2.toFixed(1) + ' ' + cy2.toFixed(1) + ', ' + tx.toFixed(1) + ' ' + ty.toFixed(1);
}

/** 计算整板包围盒（节点 + 组 + 自由图片）。 */
export function docBounds(doc: CaseDoc): { x: number; y: number; w: number; h: number } {
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const node of doc.nodes) boxes.push({ x: node.x, y: node.y, w: node.w, h: node.h });
  for (const group of doc.groups) boxes.push(group.bounds);
  for (const image of doc.imageNodes) boxes.push({ x: image.x, y: image.y, w: image.w, h: image.h });
  if (boxes.length === 0) return { x: 0, y: 0, w: 960, h: 600 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function renderGroup(group: Group): string {
  const { x, y, w, h } = group.bounds;
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-group" data-group-id="' + esc(group.id) + '">');
  parts.push(
    '    <rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="18" fill="' + group.color + '" fill-opacity="0.08" stroke="' + group.color + '" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="7 5" />',
  );
  parts.push(
    '    <text x="' + (x + 14) + '" y="' + (y + 24) + '" font-family="' + FONT + '" font-size="14" font-weight="600" fill="' + group.color + '">' + esc(group.title) + '</text>',
  );
  parts.push('  </g>');
  return parts.join('\n');
}

/** 集中钉子（H5.12）：30px 圆点 + 可选黄色便签，导出与画布一致 */
function renderClusterPin(node: CaseNode): string {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  // 老文档里的钉子可能是 168×132，半径夹在 9–15
  const r = Math.max(9, Math.min(15, Math.min(node.w, node.h) / 2));
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-pin" data-node-id="' + esc(node.id) + '" data-node-type="clusterPin">');
  const paper = String(node.fields['显示便利贴'] ?? '隐藏') === '显示';
  const text = String(node.fields['便利贴文字'] ?? '').trim();
  if (paper) {
    const pw = 200;
    const ph = 84;
    const px = cx - pw / 2;
    const py = node.y + node.h + 10;
    parts.push('    <rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="4" fill="#FFE9A8" stroke="#E4CE86" stroke-width="1" />');
    if (text) {
      const lines: string[] = [];
      for (let i = 0; i < text.length && lines.length < 4; i += 13) lines.push(text.slice(i, i + 13));
      lines.forEach((line, index) => {
        parts.push('    <text x="' + (px + 10) + '" y="' + (py + 20 + index * 17) + '" font-family="' + FONT + '" font-size="12" fill="#4A3B12">' + esc(line) + '</text>');
      });
    }
  }
  parts.push('    <circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#C0392B" stroke="#FFFFFF" stroke-width="2" />');
  parts.push('  </g>');
  return parts.join(String.fromCharCode(10));
}

function renderNode(node: CaseNode): string {
  // H5.12：钉子不是卡片
  if (node.type === 'clusterPin') return renderClusterPin(node);
  const meta = NODE_TYPE_META[node.type];
  const status = STATUS_META[node.status];
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-node" data-node-id="' + esc(node.id) + '" data-node-type="' + node.type + '">');
  parts.push(
    '    <rect x="' + node.x + '" y="' + node.y + '" width="' + node.w + '" height="' + node.h + '" rx="10" fill="#FBFAF7" stroke="' + COLORS.panelBorder + '" stroke-width="1.5" />',
  );
  parts.push(
    '    <rect x="' + node.x + '" y="' + (node.y + 8) + '" width="4" height="' + (node.h - 16) + '" rx="2" fill="' + meta.color + '" />',
  );
  parts.push(
    '    <circle cx="' + (node.x + 22) + '" cy="' + (node.y + 22) + '" r="9" fill="' + meta.color + '" fill-opacity="0.16" stroke="' + meta.color + '" stroke-width="1.2" />',
  );
  parts.push(
    '    <text x="' + (node.x + 22) + '" y="' + (node.y + 26) + '" font-family="' + FONT + '" font-size="10" fill="' + meta.color + '" text-anchor="middle">' + esc(meta.icon) + '</text>',
  );
  const title = truncate(node.title, node.w > 180 ? 12 : 8);
  parts.push(
    '    <text x="' + (node.x + 38) + '" y="' + (node.y + 27) + '" font-family="' + FONT + '" font-size="14" font-weight="600" fill="' + COLORS.text + '">' + esc(title) + '</text>',
  );
  const subtitle = node.aliases && node.aliases.length > 0 ? node.aliases[0] : meta.label;
  parts.push(
    '    <text x="' + (node.x + 14) + '" y="' + (node.y + 52) + '" font-family="' + FONT + '" font-size="11" fill="' + COLORS.textMuted + '">' + esc(truncate(subtitle, 16)) + '</text>',
  );
  parts.push(
    '    <circle cx="' + (node.x + 18) + '" cy="' + (node.y + node.h - 16) + '" r="4" fill="' + status.color + '" />',
  );
  parts.push(
    '    <text x="' + (node.x + 28) + '" y="' + (node.y + node.h - 12) + '" font-family="' + FONT + '" font-size="11" fill="' + COLORS.textMuted + '">' + esc(status.label) + '</text>',
  );
  parts.push(
    '    <text x="' + (node.x + node.w - 12) + '" y="' + (node.y + node.h - 12) + '" font-family="' + MONO + '" font-size="11" fill="' + COLORS.textMuted + '" text-anchor="end">' + node.confidence + '%</text>',
  );
  parts.push('  </g>');
  return parts.join('\n');
}

function renderImage(image: ImageNode, asset: Asset | undefined, href: string | undefined): string {
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-image" data-image-id="' + esc(image.id) + '">');
  const transform =
    image.rotation === 0
      ? 'translate(' + image.x + ',' + image.y + ')'
      : 'rotate(' + image.rotation + ',' + (image.x + image.w / 2) + ',' + (image.y + image.h / 2) + ')';
  parts.push('    <g transform="' + transform + '">');
  if (href) {
    parts.push(
      '      <image x="0" y="0" width="' + image.w + '" height="' + image.h + '" href="' + esc(href) + '" preserveAspectRatio="xMidYMid slice" />',
    );
  } else {
    parts.push(
      '      <rect x="0" y="0" width="' + image.w + '" height="' + image.h + '" fill="#EDE9E2" stroke="#C9C2B6" stroke-width="2" stroke-dasharray="6 4" />',
    );
    parts.push(
      '      <text x="' + image.w / 2 + '" y="' + image.h / 2 + '" font-family="' + FONT + '" font-size="12" fill="' + COLORS.textMuted + '" text-anchor="middle">' + esc(asset && asset.name ? truncate(asset.name, 14) : '图片原件不在本机') + '</text>',
    );
  }
  if (asset?.aiGenerated) {
    parts.push(
      '      <rect x="8" y="8" width="112" height="22" rx="4" fill="#000000" fill-opacity="0.62" />',
    );
    parts.push(
      '      <text x="14" y="23" font-family="' + FONT + '" font-size="11" fill="#FFFFFF">AI 生成 · 模拟图</text>',
    );
  }
  parts.push('    </g>');
  parts.push('  </g>');
  return parts.join('\n');
}

function renderEdge(edge: CaseEdge, geometry: { sx: number; sy: number; tx: number; ty: number }): string {
  const color = edge.color ?? relColor(edge.relType);
  const dash = normalizeDash(edge.style);
  const width = edge.weight && edge.weight > 0 ? Math.min(4.5, Math.max(1.4, 1.4 + Math.log10(edge.weight) * 0.45)) : 1.6;
  const markerId = 'arrow-' + edge.relType.replace(/[^a-z0-9]/gi, '');
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-edge" data-edge-id="' + esc(edge.id) + '" data-edge-style="' + edge.style + '">');
  parts.push(
    '    <path d="' + bezierPath(geometry.sx, geometry.sy, geometry.tx, geometry.ty, curveOffsetOf(edge)) + '" fill="none" stroke="' + color + '" stroke-width="' + width.toFixed(2) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') +
      (edge.directed ? ' marker-end="url(#' + markerId + ')"' : '') +
      ' />',
  );
  const label = edge.label && edge.label.trim().length > 0 ? edge.label : relLabel(edge.relType);
  if (label) {
    const lx = (geometry.sx + geometry.tx) / 2;
    const ly = (geometry.sy + geometry.ty) / 2;
    const fontSize = 11;
    const textW = textWidth(label, fontSize) + 12;
    parts.push(
      '    <rect x="' + (lx - textW / 2).toFixed(1) + '" y="' + (ly - 9).toFixed(1) + '" width="' + textW.toFixed(1) + '" height="18" rx="5" fill="#FBFAF7" fill-opacity="0.92" stroke="' + color + '" stroke-opacity="0.35" stroke-width="0.8" />',
    );
    parts.push(
      '    <text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" font-family="' + FONT + '" font-size="' + fontSize + '" fill="' + color + '" text-anchor="middle">' + esc(label) + '</text>',
    );
  }
  parts.push('  </g>');
  return parts.join('\n');
}

function renderLegend(layout: BoardLayout, doc: CaseDoc): string {
  const styles: CaseEdge['style'][] = ['solid', 'dashed', 'dotted'];
  const y0 = layout.legendY;
  const x0 = layout.legendX;
  const parts: string[] = [];
  parts.push('  <g class="cb-svg-legend">');
  parts.push(
    '    <text x="' + x0 + '" y="' + y0 + '" font-family="' + FONT + '" font-size="12" fill="' + COLORS.textMuted + '">线型即语义</text>',
  );
  styles.forEach((style, index) => {
    const meta = doc.settings.lineLegend[style] ?? LINE_STYLE_META[style];
    const y = y0 + 20 + index * 18;
    const dash = LINE_STYLE_META[style].dash;
    parts.push(
      '    <line x1="' + x0 + '" y1="' + y + '" x2="' + (x0 + 40) + '" y2="' + y + '" stroke="' + COLORS.text + '" stroke-width="1.8"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />',
    );
    parts.push(
      '    <text x="' + (x0 + 50) + '" y="' + (y + 4) + '" font-family="' + FONT + '" font-size="12" fill="' + COLORS.text + '">' + esc(meta.label) + '</text>',
    );
  });
  parts.push('  </g>');
  return parts.join('\n');
}

/** 整板导出 SVG。纯函数：相同 doc 生成逐字节相同的字符串。 */
/** 集中钉子之间的红线（H5.12）：直线、全局线宽、压在所有卡片之上 */
function renderPinLinks(doc: CaseDoc): string {
  const links = doc.pinLinks ?? [];
  if (links.length === 0) return '';
  const width = Math.max(1, Math.min(12, Math.round(doc.settings.pinLinkWidth ?? 4)));
  const centerOf = (id: string): { x: number; y: number } | null => {
    const node = doc.nodes.find((item) => item.id === id && item.type === 'clusterPin');
    return node ? { x: node.x + node.w / 2, y: node.y + node.h / 2 } : null;
  };
  const parts: string[] = ['  <g class="cb-svg-pinlinks">'];
  for (const link of links) {
    const from = centerOf(link.source);
    const to = centerOf(link.target);
    if (!from || !to) continue;
    parts.push(
      '    <line class="cb-pinlink" data-pinlink-id="' + esc(link.id) + '" x1="' + from.x + '" y1="' + from.y +
        '" x2="' + to.x + '" y2="' + to.y + '" stroke="#C0392B" stroke-width="' + width +
        '" stroke-linecap="round" />',
    );
  }
  parts.push('  </g>');
  return parts.join(String.fromCharCode(10));
}

export function boardToSvg(doc: CaseDoc, options: BoardSvgOptions = {}): BoardSvgResult {
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const layout = boardLayout(doc, options);
  const padding = layout.padding;
  const bounds = layout.bounds;
  const contentW = layout.width;
  const contentH = layout.height;
  const width = Math.round(contentW * scale);
  const height = Math.round(contentH * scale);
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  const imageMap = new Map(doc.imageNodes.map((image) => [image.id, image]));
  const assetMap = new Map((options.assets ?? doc.assets).map((asset) => [asset.id, asset]));
  const textX = bounds.x + padding - bounds.x;
  const textY = padding;

  const markerColors = new Map<string, string>();
  for (const edge of doc.edges) {
    const color = edge.color ?? relColor(edge.relType);
    markerColors.set(edge.relType, color);
  }

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + contentW + ' ' + contentH + '" font-family="' + FONT + '">',
  );
  parts.push('  <title>' + esc(doc.meta.title) + '</title>');
  parts.push('  <defs>');
  for (const [relType, color] of markerColors) {
    const markerId = 'arrow-' + relType.replace(/[^a-z0-9]/gi, '');
    parts.push(
      '    <marker id="' + markerId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + color + '" /></marker>',
    );
  }
  parts.push('  </defs>');
  if (options.grid !== false) {
    parts.push('  <rect x="0" y="0" width="' + contentW + '" height="' + contentH + '" fill="' + COLORS.bg + '" />');
    const dots: string[] = [];
    const step = 28;
    for (let y = step; y < contentH; y += step) {
      for (let x = step; x < contentW; x += step) {
        dots.push('    <circle cx="' + x + '" cy="' + y + '" r="1" fill="#DAD5CB" />');
      }
    }
    parts.push('  <g class="cb-svg-grid">');
    parts.push(dots.join('\n'));
    parts.push('  </g>');
  }
  if (options.titleBlock !== false) {
    parts.push('  <g class="cb-svg-title">');
    parts.push(
      '    <text x="' + textX + '" y="' + textY + '" font-family="' + FONT + '" font-size="22" font-weight="700" fill="' + COLORS.text + '">' + esc(doc.meta.title) + '</text>',
    );
    const sub = [doc.meta.caseNo ? '案件编号 ' + doc.meta.caseNo : '', '导出 ' + doc.nodes.length + ' 个实体 / ' + doc.edges.length + ' 条关系'].filter(Boolean).join(' · ');
    parts.push(
      '    <text x="' + textX + '" y="' + (textY + 22) + '" font-family="' + FONT + '" font-size="12" fill="' + COLORS.textMuted + '">' + esc(sub) + '</text>',
    );
    parts.push('  </g>');
  }
  // 平移：世界坐标 → SVG 坐标（内容原点在 padding 处）
  parts.push('  <g transform="translate(' + layout.translateX + ',' + layout.translateY + ')">');
  for (const group of doc.groups) parts.push(renderGroup(group));
  for (const edge of doc.edges) {
    const geometry = edgeGeometry(edge, nodeMap, imageMap);
    if (geometry) parts.push(renderEdge(edge, geometry));
  }
  for (const image of doc.imageNodes) {
    const asset = assetMap.get(image.assetId);
    const href = asset && options.imageUrl ? options.imageUrl(asset) : undefined;
    parts.push(renderImage(image, asset, href));
  }
  for (const node of doc.nodes) parts.push(renderNode(node));
  // H5.12：红线要进导出，并在卡片之上
  const pinLinkSvg = renderPinLinks(doc);
  if (pinLinkSvg) parts.push(pinLinkSvg);
  parts.push('  </g>');
  if (options.legend !== false) parts.push(renderLegend(layout, doc));
  if (options.footer) {
    parts.push(
      '  <text x="' + padding + '" y="' + layout.footerY + '" font-family="' + FONT + '" font-size="11" fill="' + COLORS.textMuted + '">' + esc(options.footer) + '</text>',
    );
  }
  parts.push('</svg>');
  parts.push('');
  return { svg: parts.join('\n'), width, height, bounds };
}
