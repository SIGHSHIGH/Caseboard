/**
 * 报告导出 PDF —— 把 Markdown 逐行排版到 canvas，再按 A4 纵向分页嵌入 pdf-lib。
 *
 * 与整板 PDF 同一套思路（D28）：排版只有一份真相，不做 HTML/打印通道。
 * 中文由系统字体渲染（Windows 有微软雅黑，桌面端可用）。
 */
import { reportPlainLines } from '../lib/report';

const PAGE_W = 1240;
const PAGE_H = 1754;
const PADDING = 90;
const A4_PORTRAIT = { w: 595, h: 842 };

interface Line {
  text: string;
  size: number;
  bold: boolean;
  indent: number;
  spaceBefore: number;
}

function layoutLines(markdown: string): Line[] {
  const lines: Line[] = [];
  for (const row of reportPlainLines(markdown)) {
    if (row.kind === 'title') lines.push({ text: row.text, size: 30, bold: true, indent: 0, spaceBefore: 8 });
    else if (row.kind === 'heading') lines.push({ text: row.text, size: 23, bold: true, indent: 0, spaceBefore: 22 });
    else if (row.kind === 'bullet') lines.push({ text: '• ' + row.text, size: 17, bold: false, indent: 18, spaceBefore: 4 });
    else lines.push({ text: row.text, size: 17, bold: false, indent: 0, spaceBefore: 6 });
  }
  return lines;
}

function wrapLine(ctx: CanvasRenderingContext2D, line: Line): string[] {
  ctx.font = (line.bold ? 'bold ' : '') + line.size + 'px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const maxWidth = PAGE_W - PADDING * 2 - line.indent;
  if (ctx.measureText(line.text).width <= maxWidth) return [line.text];
  const chars = Array.from(line.text);
  const rows: string[] = [];
  let current = '';
  for (const char of chars) {
    const next = current + char;
    if (current && ctx.measureText(next).width > maxWidth) {
      rows.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
  return rows;
}

export async function reportToPdfBytes(markdown: string, title: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const lines = layoutLines(markdown);
  const canvases: HTMLCanvasElement[] = [];
  let canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境无法创建画布，报告 PDF 导出失败');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = '#2B2B2B';
  ctx.textBaseline = 'top';
  let y = PADDING;

  const newPage = (): void => {
    canvases.push(canvas);
    canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const next = canvas.getContext('2d');
    if (!next) throw new Error('当前环境无法创建画布，报告 PDF 导出失败');
    ctx = next;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#2B2B2B';
    ctx.textBaseline = 'top';
    y = PADDING;
  };

  for (const line of lines) {
    const rows = wrapLine(ctx, line);
    ctx.font = (line.bold ? 'bold ' : '') + line.size + 'px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    for (const row of rows) {
      const lineHeight = Math.round(line.size * 1.6);
      if (y + lineHeight > PAGE_H - PADDING) newPage();
      ctx.font = (line.bold ? 'bold ' : '') + line.size + 'px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
      ctx.fillText(row, PADDING + line.indent, y);
      y += lineHeight;
    }
    y += line.spaceBefore;
  }
  canvases.push(canvas);

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('案情板 CaseBoard');
  pdf.setProducer('案情板 CaseBoard');
  for (const pageCanvas of canvases) {
    const blob: Blob = await new Promise((resolve, reject) => {
      pageCanvas.toBlob((value) => (value ? resolve(value) : reject(new Error('报告页面转图失败'))), 'image/png');
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = await pdf.embedPng(bytes);
    const page = pdf.addPage([A4_PORTRAIT.w, A4_PORTRAIT.h]);
    page.drawImage(image, { x: 0, y: 0, width: A4_PORTRAIT.w, height: A4_PORTRAIT.h });
  }
  return pdf.save();
}
