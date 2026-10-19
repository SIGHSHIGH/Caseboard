/**
 * 整板 PDF 导出：把 PNG 渲染结果按 A4 横向切片分页嵌入。
 *
 * 为什么切片而不是矢量 PDF：边/卡片已经是 canvas 绘制（与 PNG 同一套代码），
 * 矢量重建会产生两套排版；切片能保证「PDF 与画布所见一致」只有一份真相。
 */
import type { CaseDoc } from '../types';
import { drawBoardToCanvas, canvasToPngBytes, type BoardPngOptions } from './png';

export interface BoardPdfOptions extends BoardPngOptions {
  /** 每页页脚（追加页码） */
  pageFooter?: string;
}

const A4_LANDSCAPE = { w: 842, h: 595 };
const MARGIN = 24;

export async function boardToPdfBytes(doc: CaseDoc, options: BoardPdfOptions = {}): Promise<Uint8Array> {
  // pdf-lib 约 1.6MB 源，只有导出 PDF 时才需要：动态 import 让主包保持轻薄
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const result = drawBoardToCanvas(doc, { ...options, pixelRatio: options.pixelRatio ?? 2 });
  const source = result.canvas;
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.meta.title);
  pdf.setSubject(doc.meta.caseNo ? '案件编号 ' + doc.meta.caseNo : '案情板导出');
  pdf.setCreator('案情板 CaseBoard');
  pdf.setProducer('案情板 CaseBoard');
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const contentW = A4_LANDSCAPE.w - MARGIN * 2;
  const contentH = A4_LANDSCAPE.h - MARGIN * 2;
  const pageAspect = contentW / contentH;
  // 每页覆盖的源图像高度（按横向 A4 的比例切片，避免细长条）
  let sliceHeight = Math.max(1, Math.floor(source.width / pageAspect));
  const pageCount = Math.max(1, Math.ceil(source.height / sliceHeight));
  const pageSizes: number[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const top = pageIndex * sliceHeight;
    const height = Math.min(sliceHeight, source.height - top);
    pageSizes.push(height);
  }

  // 页眉/页脚在原图像素坐标里画，再整体缩到 A4：
  // 这样中文标题、案件编号、页码与关系数都用画布字体（pdf-lib 内置 Helvetica 不含中文）。
  const headerH = Math.max(48, Math.round(source.width * 0.05));
  const footerH = Math.max(36, Math.round(source.width * 0.034));
  const pad = Math.round(source.width * 0.02);
  const fontPx = Math.max(16, Math.round(source.width * 0.0135));
  const smallPx = Math.max(13, Math.round(source.width * 0.0105));
  const generatedText = new Date().toLocaleString('zh-CN');
  const brandFont = '600 ' + fontPx + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
  const smallFont = smallPx + 'px "Microsoft YaHei", "PingFang SC", sans-serif';

  const drawSlice = (top: number, height: number): HTMLCanvasElement => {
    const slice = document.createElement('canvas');
    slice.width = source.width;
    slice.height = height;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('当前环境无法创建画布，PDF 导出失败');
    ctx.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height);
    return slice;
  };

  /** 把切片套进「页眉 + 内容 + 页脚」的整页图：A4 打印直接用，不需要再拼。 */
  const composePage = (slice: HTMLCanvasElement, index: number, total: number): HTMLCanvasElement => {
    const page = document.createElement('canvas');
    page.width = slice.width;
    page.height = slice.height + headerH + footerH;
    const ctx = page.getContext('2d');
    if (!ctx) throw new Error('当前环境无法创建画布，PDF 导出失败');
    ctx.fillStyle = '#F5F3EF';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2B2B2B';
    ctx.font = brandFont;
    ctx.fillText(doc.meta.title, pad, headerH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6E6862';
    ctx.font = smallFont;
    ctx.fillText(doc.meta.caseNo ? '案件编号 ' + doc.meta.caseNo : '案情板导出', page.width - pad, headerH / 2);
    ctx.strokeStyle = '#E2DED5';
    ctx.lineWidth = Math.max(1, Math.round(source.width * 0.0008));
    ctx.beginPath();
    ctx.moveTo(pad, headerH - 1);
    ctx.lineTo(page.width - pad, headerH - 1);
    ctx.stroke();
    ctx.drawImage(slice, 0, headerH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6E6862';
    ctx.font = smallFont;
    ctx.fillText('案情板 CaseBoard · ' + generatedText + ' · ' + doc.nodes.length + ' 实体 / ' + doc.edges.length + ' 关系', pad, page.height - footerH / 2);
    ctx.textAlign = 'right';
    ctx.fillText('第 ' + (index + 1) + ' / ' + total + ' 页', page.width - pad, page.height - footerH / 2);
    return page;
  };

  let pageIndex = 0;
  for (const height of pageSizes) {
    const slice = drawSlice(pageIndex * sliceHeight, height);
    const composed = composePage(slice, pageIndex, pageSizes.length);
    const png = await pdf.embedPng(await canvasToPngBytes(composed));
    const scale = Math.min(contentW / png.width, contentH / png.height);
    const drawW = png.width * scale;
    const drawH = png.height * scale;
    const page = pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
    page.drawRectangle({ x: 0, y: 0, width: A4_LANDSCAPE.w, height: A4_LANDSCAPE.h, color: rgb(0.961, 0.953, 0.937) });
    page.drawImage(png, {
      x: (A4_LANDSCAPE.w - drawW) / 2,
      y: (A4_LANDSCAPE.h - drawH) / 2,
      width: drawW,
      height: drawH,
    });
    pageIndex += 1;
  }

  // 末尾附一页检索信息（拉丁可读版本），便于外部工具识别案件与页数
  const metaPage = pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
  metaPage.drawText('CaseBoard export', { x: MARGIN, y: A4_LANDSCAPE.h - 60, size: 16, font, color: rgb(0.17, 0.17, 0.17) });
  metaPage.drawText('case: ' + (doc.meta.caseNo ?? doc.meta.id), { x: MARGIN, y: A4_LANDSCAPE.h - 90, size: 11, font });
  metaPage.drawText('entities: ' + doc.nodes.length + '   relations: ' + doc.edges.length, { x: MARGIN, y: A4_LANDSCAPE.h - 110, size: 11, font });
  metaPage.drawText('pages: ' + pageSizes.length, { x: MARGIN, y: A4_LANDSCAPE.h - 130, size: 11, font });
  // useObjectStreams: false —— 默认会把对象压进对象流，外部工具（与验收脚本）就读不到
  // 可读的 /Type /Page；证据类 PDF 要能被第三方工具解析，宁可大一点（决策 D32）
  return pdf.save({ useObjectStreams: false });
}

/** 单页 PDF（导出带标注的素材图时用）。 */
export async function imagePdfBytes(pngBytes: Uint8Array, title: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const png = await pdf.embedPng(pngBytes);
  const scale = Math.min((A4_LANDSCAPE.w - MARGIN * 2) / png.width, (A4_LANDSCAPE.h - MARGIN * 2) / png.height);
  const page = pdf.addPage([png.width * scale + MARGIN * 2, png.height * scale + MARGIN * 2]);
  page.drawImage(png, { x: MARGIN, y: MARGIN, width: png.width * scale, height: png.height * scale });
  return pdf.save();
}
