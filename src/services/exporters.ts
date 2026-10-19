/**
 * 导出服务（M4）：把序列化器与文件对话框串起来，组件层只调用这里。
 *
 * 所有导出都是「模型驱动」：同一份 CaseDoc 渲染出 SVG / PNG / PDF，
 * 不存在 DOM 截屏的第二套排版（D9 无头浏览器被宿主拦截，DOM 截屏无法自动验收）。
 */
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { Annotation, Asset, CaseDoc } from '../types';
import { applyRedactions, isRegionFlattened, redactRegionsFromAnnotations, type RgbaImage } from '../lib/redact';
import { buildCaseboard, CASEBOARD_EXT, readCaseboard } from '../serializers/caseboard';
import { boardToPngBytes, canvasToPngBytes, drawBoardToCanvas, loadBoardImages } from '../serializers/png';
import { boardToPdfBytes } from '../serializers/pdfExport';
import { boardToSvg } from '../serializers/svg';
import { fileService } from './file';
import { imageStore, THUMB_LARGE, THUMB_SMALL } from './imageStore';
import { isTauri } from './platform';

export interface ExportResult {
  /** 落盘路径；网页模式下为 null（浏览器已下载） */
  path: string | null;
  /** 人类可读的说明，用于导出面板展示 */
  summary: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').slice(0, 60) || '案情板';
}

export function boardBaseName(doc: CaseDoc): string {
  const no = doc.meta.caseNo ? '-' + doc.meta.caseNo : '';
  return safeName(doc.meta.title) + no;
}

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
}

function footerOf(doc: CaseDoc): string {
  return '案情板 CaseBoard · ' + doc.meta.title + (doc.meta.caseNo ? ' · ' + doc.meta.caseNo : '') + ' · ' + new Date().toLocaleString('zh-CN');
}

/** 读图节点需要的素材像素：桌面端直接走 asset 协议，网页端用 objectURL。 */
async function boardImages(doc: CaseDoc): Promise<{ images: Map<string, CanvasImageSource>; revoke: () => void }> {
  const urls = new Map<string, string>();
  const created: string[] = [];
  for (const image of doc.imageNodes) {
    const blob = await imageStore.getOriginal(image.assetId);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    created.push(url);
    urls.set(image.assetId, url);
  }
  const images = await loadBoardImages(doc, (asset) => urls.get(asset.id));
  return {
    images,
    revoke: () => {
      for (const url of created) URL.revokeObjectURL(url);
      for (const source of images.values()) {
        const bitmap = source as ImageBitmap;
        if (typeof bitmap.close === 'function') bitmap.close();
      }
    },
  };
}

async function thumbFromBitmap(bitmap: ImageBitmap, maxEdge: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('缩略图编码失败'))), 'image/jpeg', 0.86);
  });
}

/** 打开别人机器上的 .caseboard 后缩略图还不存在，按原件重建两档缩略图（尽力而为）。 */
export async function rebuildThumbs(doc: CaseDoc): Promise<number> {
  let done = 0;
  for (const asset of doc.assets) {
    if (asset.kind !== 'image') continue;
    const existing = await imageStore.getThumb(asset.id, THUMB_SMALL);
    if (existing) continue;
    const blob = await imageStore.getOriginal(asset.id);
    if (!blob) continue;
    try {
      const bitmap = await createImageBitmap(blob);
      await imageStore.putThumb(asset.id, THUMB_SMALL, await thumbFromBitmap(bitmap, THUMB_SMALL));
      await imageStore.putThumb(asset.id, THUMB_LARGE, await thumbFromBitmap(bitmap, THUMB_LARGE));
      bitmap.close();
      done += 1;
    } catch (error) {
      console.warn('[caseboard] 缩略图重建失败', asset.id, error);
    }
  }
  return done;
}

export async function exportBoardSvg(doc: CaseDoc): Promise<ExportResult> {
  const { svg, width, height } = boardToSvg(doc);
  const path = await fileService.saveText(boardBaseName(doc) + '-' + today() + '.svg', svg, [{ name: 'SVG 矢量图', extensions: ['svg'] }]);
  return { path, summary: '整板 SVG（含贝塞尔线、组、图例） · ' + Math.round(width) + '×' + Math.round(height) };
}

export async function exportBoardPng(doc: CaseDoc): Promise<ExportResult> {
  const { images, revoke } = await boardImages(doc);
  try {
    const { bytes, width, height } = await boardToPngBytes(doc, { images, footer: footerOf(doc), pixelRatio: 2 });
    const path = await fileService.saveBytes(boardBaseName(doc) + '-' + today() + '.png', bytes, [{ name: 'PNG 图片', extensions: ['png'] }]);
    return { path, summary: '整板 PNG（2 倍像素） · ' + width + '×' + height + ' · ' + Math.round(bytes.length / 1024) + ' KB' };
  } finally {
    revoke();
  }
}

export async function exportBoardPdf(doc: CaseDoc): Promise<ExportResult> {
  const { images, revoke } = await boardImages(doc);
  try {
    const bytes = await boardToPdfBytes(doc, { images, footer: footerOf(doc), pixelRatio: 2 });
    const path = await fileService.saveBytes(boardBaseName(doc) + '-' + today() + '.pdf', bytes, [{ name: 'PDF 文档', extensions: ['pdf'] }]);
    return { path, summary: '多页 PDF（A4 横向切片） · ' + Math.round(bytes.length / 1024) + ' KB' };
  } finally {
    revoke();
  }
}

export async function exportCaseboardFile(doc: CaseDoc): Promise<ExportResult> {
  const bytes = await buildCaseboard(doc, {
    readAsset: async (asset) => (asset.kind === 'image' ? await imageStore.originalBytes(asset.id) : null),
    thumbnail: await boardThumbnail(doc),
    app: '0.4.0',
  });
  const path = await fileService.saveBytes(boardBaseName(doc) + CASEBOARD_EXT, bytes, [{ name: '案情板项目', extensions: ['caseboard'] }]);
  return { path, summary: '单文件项目包（数据库 + 素材 + DSL + 缩略图） · ' + Math.round(bytes.length / 1024) + ' KB' };
}

async function boardThumbnail(doc: CaseDoc): Promise<Uint8Array | undefined> {
  try {
    const { images, revoke } = await boardImages(doc);
    try {
      const { canvas } = drawBoardToCanvas(doc, { images, pixelRatio: 0.35, grid: false, footer: undefined });
      return await canvasToPngBytes(canvas);
    } finally {
      revoke();
    }
  } catch {
    return undefined;
  }
}

export interface OpenedCaseboard {
  doc: CaseDoc;
  warnings: string[];
  /** 随包素材数量 */
  assets: number;
}

/** 打开 .caseboard：解包 → 素材落盘 → 重建缩略图 → 交给调用方 hydrate */
export async function openCaseboardFile(): Promise<OpenedCaseboard | null> {
  const picked = await fileService.openBytes([{ name: '案情板项目', extensions: ['caseboard'] }]);
  if (!picked) return null;
  return await openCaseboardBytes(picked.bytes);
}

export async function openCaseboardBytes(bytes: Uint8Array): Promise<OpenedCaseboard> {
  const contents = readCaseboard(bytes);
  for (const asset of contents.assets) {
    const fileBytes = contents.assetFiles.get(asset.id);
    if (!fileBytes) continue;
    const copy = new Uint8Array(fileBytes.byteLength);
    copy.set(fileBytes);
    await imageStore.putOriginal(asset.id, new Blob([copy.buffer as ArrayBuffer], { type: asset.mimeType ?? 'application/octet-stream' }));
  }
  await rebuildThumbs(contents.doc);
  return { doc: contents.doc, warnings: contents.warnings, assets: contents.assetFiles.size };
}

import { buildManifestCsv, MANIFEST_HEADER, relatedEntityTitles } from '../serializers/manifest';

export { buildManifestCsv, MANIFEST_HEADER, relatedEntityTitles };

export interface ImagePackage {
  bytes: Uint8Array;
  included: number;
  files: Map<string, string>;
}

/** 打包案件图片包（zip：images/ 原件 + manifest.csv），不落盘，便于自动化验收。 */
export async function buildImagePackageBytes(doc: CaseDoc): Promise<ImagePackage> {
  const entries: Record<string, Uint8Array> = {};
  const files = new Map<string, string>();
  let included = 0;
  for (const asset of doc.assets) {
    const bytes = asset.kind === 'image' ? await imageStore.originalBytes(asset.id) : null;
    if (!bytes || bytes.length === 0) continue;
    const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(asset.name ?? '')?.[1] ?? 'png').toLowerCase();
    const name = (asset.no ?? asset.id).replace(/[^A-Za-z0-9_-]/g, '_') + '.' + ext;
    entries['images/' + name] = bytes;
    files.set(asset.id, 'images/' + name);
    included += 1;
  }
  entries['manifest.csv'] = strToU8(buildManifestCsv(doc, files));
  return { bytes: zipSync(entries, { level: 6 }), included, files };
}

export async function exportImagePackage(doc: CaseDoc): Promise<ExportResult> {
  const pack = await buildImagePackageBytes(doc);
  const path = await fileService.saveBytes(boardBaseName(doc) + '-图片包-' + today() + '.zip', pack.bytes, [{ name: 'ZIP 压缩包', extensions: ['zip'] }]);
  return { path, summary: '案件图片包 · ' + pack.included + ' 张原件 + manifest.csv（' + MANIFEST_HEADER.length + ' 个字段）' };
}

export interface RedactResult extends ExportResult {
  regions: number;
  pixels: number;
}

/**
 * 脱敏导出：把标注里勾选了「打码」的区域做马赛克，再编码成新 PNG。
 * 原图不被修改；导出的像素里不存在原始信息（验收 6 用 isRegionFlattened 复核）。
 */
export interface RedactPixels {
  bytes: Uint8Array;
  regions: number;
  pixels: number;
  flattened: boolean;
}

/** 生成脱敏像素（不落盘）：标注里勾选打码的区域做马赛克，再编码成 PNG。 */
export async function redactAssetBytes(doc: CaseDoc, assetId: string): Promise<RedactPixels> {
  const asset = doc.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error('找不到该素材');
  const regions = redactRegionsFromAnnotations(asset.annotations);
  if (regions.length === 0) throw new Error('该素材还没有标记为脱敏的标注区域');
  const blob = await imageStore.getOriginal(assetId);
  if (!blob) throw new Error('原件不在本机，无法脱敏导出');
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgba: RgbaImage = { width: canvas.width, height: canvas.height, data: imageData.data };
  const applied = applyRedactions(rgba, regions);
  ctx.putImageData(imageData, 0, 0);
  const bytes = await canvasToPngBytes(canvas);
  const flattened = regions.every((region) => isRegionFlattened(rgba, region));
  return { bytes, regions: applied.regions, pixels: applied.pixels, flattened };
}

export async function exportRedactedAsset(doc: CaseDoc, assetId: string): Promise<RedactResult> {
  const asset = doc.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error('找不到该素材');
  const result = await redactAssetBytes(doc, assetId);
  if (!result.flattened) throw new Error('脱敏校验失败：区域内仍有原始像素，已中止导出');
  const path = await fileService.saveBytes('脱敏-' + (asset.no ?? asset.id) + '.png', result.bytes, [{ name: 'PNG 图片', extensions: ['png'] }]);
  return { path, summary: '脱敏导出 · ' + result.regions + ' 个区域 / ' + result.pixels + ' 像素 · 不可逆校验通过', regions: result.regions, pixels: result.pixels };
}

/** 带标注的整图导出（复用标注合成，供右栏与导出面板共用）。 */
export async function exportAnnotatedAsset(doc: CaseDoc, assetId: string, render: (source: Blob, annotations: Annotation[]) => Promise<Blob>): Promise<ExportResult> {
  const asset = doc.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error('找不到该素材');
  const blob = await imageStore.getOriginal(assetId);
  if (!blob) throw new Error('原件不在本机，无法导出');
  const output = await render(blob, asset.annotations);
  const bytes = new Uint8Array(await output.arrayBuffer());
  const path = await fileService.saveBytes('标注-' + (asset.no ?? asset.id) + '.png', bytes, [{ name: 'PNG 图片', extensions: ['png'] }]);
  return { path, summary: '标注图 · ' + asset.annotations.length + ' 处标注' };
}

/** 供脱敏面板列出「有可脱敏素材」的资产 */
export function redactableAssets(doc: CaseDoc): Asset[] {
  return doc.assets.filter((asset) => redactRegionsFromAnnotations(asset.annotations).length > 0);
}

export { errorText, isTauri, unzipSync };
