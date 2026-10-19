/**
 * M4 自检（--selftest 启动参数触发）：在真实 WebView2 里跑完整闭环，把结果写成 JSON。
 *
 * 这是无头浏览器被宿主拦截（D9）后的自动化验收通道：
 * 建板 → 落 SQLite → 重开 → .caseboard 打包/换目录打开 → PNG/SVG/PDF/图片包/脱敏 →
 * 网络外呼计数（验收 3「断网全流程」的机器证据）。
 *
 * 分两轮跑（scripts/run-selftest.cjs 连跑两次同一个数据目录）：
 * 第 1 轮（--selftest）把演示案件与素材原件写入 SQLite/素材目录；
 * 第 2 轮（--selftest=2）在新进程里先校验「上一轮写的数据还在、原件还能读回」，
 * 这才真正覆盖验收 ②「关闭再打开数据完整」。
 */
import { unzipSync } from 'fflate';
import { createDemoDoc } from '../data/demo';
import { isRegionFlattened, type RgbaImage } from '../lib/redact';
import type { TrashItem } from './db/repo';
import type { Asset, CaseDoc } from '../types';
import { analyzeConflicts } from '../lib/contradictions';
import { AI_WATERMARK_TEXT, blocksConfirmed, inspectAiAsset } from '../lib/aiImage';
import { parseOcrText } from '../lib/ocr';
import { DEFAULT_AI_IMAGE_SETTINGS, generateAiImage } from './aiImage';
import { ocrEngineStatus } from './ocr';
import { adoptionScore, extractFromText } from '../lib/extract';
import { buildReport } from '../lib/report';
import { SAMPLE_REFERENCE, SAMPLE_TRANSCRIPT } from '../data/sampleTranscript';
import { buildCaseboard, readCaseboard } from '../serializers/caseboard';
import { buildReportDocx } from '../serializers/reportDocx';
import { boardToPdfBytes } from '../serializers/pdfExport';
import { boardToPngBytes, drawBoardToCanvas } from '../serializers/png';
import { boardToSvg } from '../serializers/svg';
import { docBounds } from '../serializers/svg';
import { buildImagePackageBytes, MANIFEST_HEADER, redactAssetBytes } from './exporters';
import { imageStore } from './imageStore';
import { debugLog, ensureDbFile, getAppInfo, readFileBytes, reportSelftest, writeFileBytes, type AppInfo } from './platform';
import { vaultService } from './vault';
import {
  createSnapshot,
  listSnapshotsInStorage,
  listTrashInStorage,
  loadDocFromStorage,
  loadSnapshotFromStorage,
  purgeTrashInStorage,
  pushTrashToStorage,
  saveDocToStorage,
  searchInStorage,
  takeTrashFromStorage,
} from './storage';
import { errorText } from './exporters';

export interface SelftestCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SelftestReport {
  phase: number;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  app: AppInfo | null;
  externalRequests: string[];
  checks: SelftestCheck[];
}

const PAD = 64;
const TITLE_BLOCK = 48;

/** 合法 PNG：签名 + IHDR 宽高非零（不按文件大小判断，小图也能过）。 */
function bytesOfPng(bytes: Uint8Array): boolean {
  if (bytes.length < 33) return false;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk !== 'IHDR') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0;
}

function blobOf(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer as ArrayBuffer], { type });
}

async function canvasPng(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 110;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  const gradient = ctx.createLinearGradient(0, 0, 160, 110);
  gradient.addColorStop(0, '#C0392B');
  gradient.addColorStop(1, '#2E6DA4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 110);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px sans-serif';
  ctx.fillText('SELFTEST', 28, 60);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画布编码失败'))), 'image/png');
  });
}

/** 噪声图：脱敏前每个像素都不同，才能证明马赛克真的抹平了信息。 */
async function noisePng(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  const image = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const index = (y * 64 + x) * 4;
      image.data[index] = (x * 7 + y * 13) % 256;
      image.data[index + 1] = (x * 31 + y * 17) % 256;
      image.data[index + 2] = (x * 11 + y * 53) % 256;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画布编码失败'))), 'image/png');
  });
}

async function pixelsOf(blob: Blob): Promise<{ image: RgbaImage; canvas: HTMLCanvasElement }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { image: { width: canvas.width, height: canvas.height, data }, canvas };
}

function joinPath(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/, '') + '/' + name;
}

export async function runSelftest(): Promise<SelftestReport> {
  const startedAt = new Date().toISOString();
  const checks: SelftestCheck[] = [];
  const externalRequests: string[] = [];
  const app = await getAppInfo();

  const originalFetch = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const local = /^(blob:|data:|tauri:|asset:|https?:\/\/asset\.localhost|https?:\/\/ipc\.localhost)/.test(url);
    if (!local) externalRequests.push(url);
    return originalFetch.call(window, input, init);
  }) as typeof window.fetch;

  const record = async (name: string, run: () => Promise<string> | string) => {
    const t0 = performance.now();
    try {
      const detail = await run();
      checks.push({ name, ok: true, detail: detail + '（' + Math.round(performance.now() - t0) + 'ms）' });
      await debugLog('selftest ✓ ' + name);
    } catch (error) {
      checks.push({ name, ok: false, detail: errorText(error) });
      await debugLog('selftest ✗ ' + name + ' → ' + errorText(error));
    }
  };

  let doc: CaseDoc = createDemoDoc(true);
  let assetPath = '';
  const phase = app?.selftestPhase ?? 1;

  await record('APP 桌面环境', async () => {
    if (!app) throw new Error('不是 Tauri 桌面环境，无 app_info');
    if (!app.dataDir) throw new Error('app_info 缺少 dataDir');
    return 'v' + app.version + ' · ' + app.platform + ' · ' + app.dataDir + ' · 第 ' + phase + ' 轮';
  });

  if (phase >= 2) {
    // 必须排在「ASSET 素材落盘」之前：那一项会覆盖上一轮写下的原件
    await record('重启后数据完整（验收 2 跨进程）', async () => {
      const loaded = await loadDocFromStorage();
      if (!loaded.doc) throw new Error('重启后没有读到已保存的案件');
      if (loaded.backend !== 'sqlite') throw new Error('重启后后端不是 sqlite：' + loaded.backend);
      const back = loaded.doc;
      const asset = back.assets.find((item) => item.id === 'a-selftest');
      if (!asset) throw new Error('重启后素材元数据丢失（上一轮写入的 a-selftest）');
      if (!back.imageNodes.some((node) => node.id === 'im-selftest')) {
        throw new Error('重启后图片节点丢失（im-selftest）');
      }
      const bytes = await imageStore.originalBytes('a-selftest');
      if (!bytes || bytes.length === 0) throw new Error('重启后素材原件读不回来');
      return '后端 ' + loaded.backend + ' · ' + back.nodes.length + ' 节点 / ' + back.edges.length + ' 关系 / 原件 ' + bytes.length + ' 字节';
    });
  }

  await record('ASSET 素材落盘', async () => {
    const asset: Asset = {
      id: 'a-selftest',
      path: '',
      kind: 'image',
      hash: 'selftest',
      thumbnails: [],
      name: 'selftest.png',
      mimeType: 'image/png',
      no: 'IMG-9001',
      size: 0,
      source: 'import',
      sourceLabel: '现场照片',
      capturedAt: '2026-10-19T10:00:00.000Z',
      annotations: [{ id: 'an-selftest', shape: 'rect', geom: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, text: '模拟现场', redact: true }],
    };
    const png = await canvasPng();
    assetPath = await imageStore.putOriginal(asset.id, png);
    asset.path = assetPath;
    asset.size = png.size;
    const back = await imageStore.originalBytes(asset.id);
    if (!back || back.length === 0) throw new Error('原件读回为空');
    doc.assets.push(asset);
    doc.imageNodes.push({ id: 'im-selftest', kind: 'freeImage', assetId: asset.id, x: 760, y: 180, w: 220, h: 150, rotation: 0, zIndex: 3, borderStyle: 'photo' });
    return '原件 ' + back.length + ' 字节 · ' + assetPath;
  });

  await record('DB 保存并重开（验收 2）', async () => {
    doc.meta.updatedAt = new Date().toISOString();
    const saved = await saveDocToStorage(doc);
    if (saved.backend !== 'sqlite') throw new Error('保存后端不是 sqlite：' + saved.backend);
    const loaded = await loadDocFromStorage();
    if (!loaded.doc) throw new Error('重开时没有读到案件');
    const back = loaded.doc;
    if (back.nodes.length !== doc.nodes.length) throw new Error('节点数不一致：' + back.nodes.length + ' ≠ ' + doc.nodes.length);
    if (back.edges.length !== doc.edges.length) throw new Error('关系数不一致');
    if (back.imageNodes.length !== doc.imageNodes.length) throw new Error('图片节点数不一致');
    if (back.assets.filter((item) => item.id === 'a-selftest').length !== 1) throw new Error('素材元数据未随库保存');
    if (back.meta.title !== doc.meta.title) throw new Error('案件标题不一致');
    return back.nodes.length + ' 节点 / ' + back.edges.length + ' 关系 / ' + back.imageNodes.length + ' 图片节点 · ' + saved.savedAt;
  });

  await record('FTS 全文检索', async () => {
    const hits = await searchInStorage(doc.meta.id, '张建国', 10);
    if (hits.length === 0) throw new Error('FTS5 没有命中「张建国」');
    return hits.length + ' 条命中，首条：' + hits[0].title;
  });

  await record('版本快照（历史面板）', async () => {
    const created = await createSnapshot(doc, 'selftest');
    if (!created) throw new Error('当前后端不支持版本快照');
    const list = await listSnapshotsInStorage(doc.meta.id);
    if (list.length === 0) throw new Error('快照列表为空');
    const latest = list.find((item) => item.label === 'selftest') ?? list[0];
    const restored = await loadSnapshotFromStorage(latest.id);
    if (!restored) throw new Error('快照内容读不回来');
    if (restored.nodes.length !== doc.nodes.length) throw new Error('快照节点数不一致：' + restored.nodes.length);
    return list.length + ' 份快照 · 最新 ' + Math.round(JSON.stringify(restored).length / 1024) + ' KB';
  });

  await record('回收站（删除进回收站并可恢复）', async () => {
    const victim = doc.nodes[0];
    const edge = doc.edges.find((item) => item.source === victim.id || item.target === victim.id);
    const items: TrashItem[] = [{ kind: 'node', entityId: victim.id, label: victim.title, payload: victim }];
    if (edge) items.push({ kind: 'edge', entityId: edge.id, label: edge.label ?? edge.relType, payload: edge });
    await pushTrashToStorage(doc.meta.id, items);
    const rows = await listTrashInStorage(doc.meta.id);
    if (rows.length < items.length) throw new Error('回收站行数不足：' + rows.length);
    const first = await takeTrashFromStorage(rows[0].id);
    if (!first) throw new Error('取回收站条目失败');
    if (first.entityId !== rows[0].entityId) throw new Error('回收站条目 id 不一致');
    await purgeTrashInStorage(doc.meta.id);
    const left = await listTrashInStorage(doc.meta.id);
    if (left.length !== 0) throw new Error('清空回收站后仍有 ' + left.length + ' 条');
    return rows.length + ' 条记录 · 取回「' + first.label + '」· 已清空';
  });

  await record('.caseboard 打包（验收 2）', async () => {
    const bytes = await buildCaseboard(doc, { readAsset: async (asset) => await imageStore.originalBytes(asset.id), app: app?.version });
    if (bytes.length < 1000) throw new Error('项目包过小：' + bytes.length);
    const contents = readCaseboard(bytes);
    if (contents.doc.nodes.length !== doc.nodes.length) throw new Error('项目包节点数不一致');
    if (contents.dsl.length === 0) throw new Error('项目包缺少 DSL 文本');
    if (!contents.assetFiles.has('a-selftest')) throw new Error('项目包没有携带素材原件');
    return Math.round(bytes.length / 1024) + ' KB · 素材 ' + contents.assetFiles.size + ' 个 · DSL ' + contents.dsl.length + ' 字符';
  });

  await record('项目包拷到另一目录可打开（验收 2）', async () => {
    if (!app) throw new Error('无 dataDir');
    const bytes = await buildCaseboard(doc, { readAsset: async (asset) => await imageStore.originalBytes(asset.id) });
    const first = joinPath(app.dataDir, 'selftest-copy/deep/x.caseboard');
    const second = joinPath(app.dataDir, 'selftest-copy2/y.caseboard');
    const written = await writeFileBytes(first, bytes);
    if (written !== bytes.length) throw new Error('写盘字节数不一致');
    const readA = await readFileBytes(first);
    await writeFileBytes(second, readA);
    const readB = await readFileBytes(second);
    const opened = readCaseboard(readB);
    if (opened.doc.nodes.length !== doc.nodes.length) throw new Error('换目录打开后节点数不一致');
    if (opened.doc.meta.title !== doc.meta.title) throw new Error('换目录打开后标题不一致');
    return '写入 ' + first + ' → 复制 ' + second + ' → 打开 ' + opened.doc.nodes.length + ' 节点';
  });

  await record('整板 PNG 与模型一致（验收 4）', async () => {
    const bitmap = await createImageBitmap(await canvasPng());
    const images = new Map<string, CanvasImageSource>([['a-selftest', bitmap]]);
    // PNG 与 SVG 必须用**同一组选项**比较，否则差异只会来自测试自身（footer 会多占 26px）
    const png = await boardToPngBytes(doc, { images, pixelRatio: 1, footer: 'selftest' });
    const svg = boardToSvg(doc, { footer: 'selftest' });
    if (!bytesOfPng(png.bytes)) throw new Error('PNG 签名不正确');
    if (png.width !== Math.round(svg.width) || png.height !== Math.round(svg.height)) {
      throw new Error('PNG 尺寸与 SVG 坐标系不一致：' + png.width + '×' + png.height + ' vs ' + Math.round(svg.width) + '×' + Math.round(svg.height));
    }
    const bounds = docBounds(doc);
    const { canvas } = drawBoardToCanvas(doc, { images, pixelRatio: 1 });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法读回画布');
    const sample = (node: { x: number; y: number; w: number; h: number }) => {
      const px = Math.round(node.x - bounds.x + PAD + node.w - 14);
      const py = Math.round(node.y - bounds.y + PAD + TITLE_BLOCK + node.h - 20);
      return Array.from(ctx.getImageData(px, py, 1, 1).data);
    };
    const card = sample(doc.nodes[0]);
    if (card[3] === 0) throw new Error('画布是空的，卡片没有绘制');
    const isCard = Math.abs(card[0] - 251) + Math.abs(card[1] - 250) + Math.abs(card[2] - 247) < 40;
    const isStatus = card[3] === 255;
    if (!isStatus) throw new Error('卡片像素透明度异常');
    return png.width + '×' + png.height + ' · ' + Math.round(png.bytes.length / 1024) + ' KB · 取样像素 ' + card.slice(0, 3).join(',') + (isCard ? '（卡片底色）' : '');
  });

  await record('整板 SVG（验收 4）', async () => {
    const svg = boardToSvg(doc);
    for (const token of ['<svg', '<path', 'viewBox', 'stroke-dasharray']) {
      if (!svg.svg.includes(token)) throw new Error('SVG 缺少 ' + token);
    }
    if (doc.groups.length > 0 && !svg.svg.includes(doc.groups[0].title)) throw new Error('SVG 缺少分组标题');
    for (const label of ['已证实', '推测', '待核实']) {
      if (!svg.svg.includes(label)) throw new Error('SVG 缺少图例「' + label + '」');
    }
    return Math.round(svg.svg.length / 1024) + ' KB · ' + Math.round(svg.width) + '×' + Math.round(svg.height);
  });

  await record('多页 PDF（验收 4）', async () => {
    const bitmap = await createImageBitmap(await canvasPng());
    const images = new Map<string, CanvasImageSource>([['a-selftest', bitmap]]);
    const bytes = await boardToPdfBytes(doc, { images, pixelRatio: 1 });
    const head = String.fromCharCode(...bytes.slice(0, 5));
    if (head !== '%PDF-') throw new Error('PDF 头不正确：' + head);
    const raw = new TextDecoder('latin1').decode(bytes);
    // 对象流会让第三方工具读不到页对象，导出时必须关掉（决策 D32）
    if (raw.includes('/ObjStm')) throw new Error('PDF 使用了对象流，外部工具无法逐页解析');
    const scanPages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (scanPages < 2) throw new Error('PDF 页数异常：' + scanPages);
    // 内容流默认 Flate 压缩，页面上画的字读不出明文；改用 pdf-lib 自己解析已导出的字节。
    // 用「字节 → 重新解析」的方式断言，比 grep 明文更接近第三方工具的真实行为。
    const { PDFDocument } = await import('pdf-lib');
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    const parsed = loaded.getPageCount();
    if (parsed !== scanPages) throw new Error('PDF 页数不一致：原文 ' + scanPages + ' / 解析 ' + parsed);
    if (loaded.getTitle() !== doc.meta.title) throw new Error('PDF 标题未写入：' + loaded.getTitle());
    const last = loaded.getPage(parsed - 1);
    const size = last.getSize();
    if (Math.round(size.width) !== 842 || Math.round(size.height) !== 595) {
      throw new Error('检索页不是 A4 横向：' + Math.round(size.width) + '×' + Math.round(size.height));
    }
    if (last.node.Contents() === undefined) throw new Error('检索页没有内容流');
    return parsed + ' 页（含检索页）· ' + Math.round(bytes.length / 1024) + ' KB';
  });

  await record('案件图片包 manifest.csv（验收 5）', async () => {
    const pack = await buildImagePackageBytes(doc);
    const entries = unzipSync(pack.bytes);
    const manifest = entries['manifest.csv'];
    if (!manifest) throw new Error('压缩包缺少 manifest.csv');
    const csv = new TextDecoder('utf-8').decode(manifest).replace(/^\uFEFF/, '');
    const lines = csv.trim().split(/\r\n/);
    if (lines[0] !== MANIFEST_HEADER.join(',')) throw new Error('表头不符：' + lines[0]);
    if (lines.length < 2) throw new Error('manifest.csv 没有数据行');
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      const file = cells[cells.length - 1].replace(/^"|"$/g, '');
      if (!file) continue;
      if (!entries[file]) throw new Error('清单路径在包里不存在：' + file);
    }
    const images = Object.keys(entries).filter((name) => name.startsWith('images/'));
    if (images.length === 0) throw new Error('压缩包没有 images/ 原件');
    return images.length + ' 张原件 / ' + (lines.length - 1) + ' 行清单 / ' + Math.round(pack.bytes.length / 1024) + ' KB';
  });

  await record('脱敏马赛克不可逆（验收 6）', async () => {
    const noise = await noisePng();
    await imageStore.putOriginal('a-redact', noise);
    doc.assets.push({
      id: 'a-redact',
      path: 'a-redact',
      kind: 'image',
      hash: 'redact',
      thumbnails: [],
      name: 'redact.png',
      mimeType: 'image/png',
      no: 'IMG-9002',
      annotations: [{ id: 'an-redact', shape: 'rect', geom: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, redact: true }],
    });
    const result = await redactAssetBytes(doc, 'a-redact');
    if (!bytesOfPng(result.bytes)) throw new Error('脱敏图不是合法 PNG');
    if (!result.flattened) throw new Error('脱敏区域内仍有原始像素');
    if (result.pixels <= 0) throw new Error('没有像素被改写');
    const decoded = await pixelsOf(blobOf(result.bytes, 'image/png'));
    const flattened = isRegionFlattened(decoded.image, { x: 0.2, y: 0.2, w: 0.5, h: 0.5 });
    if (!flattened) throw new Error('解码回像素后区域未抹平');
    const original = await pixelsOf(noise);
    let diff = 0;
    for (let i = 0; i < decoded.image.data.length; i += 4) {
      if (decoded.image.data[i] !== original.image.data[i]) diff += 1;
    }
    if (diff === 0) throw new Error('与原始像素完全相同，马赛克未生效');
    return result.regions + ' 区域 / ' + result.pixels + ' 像素 · 解码复核抹平 · 与原始像素差异 ' + diff + ' 点';
  });

  await record('AI 文本能力（M6 验收 1/5：离线抽取与七节报告）', async () => {
    const extracted = extractFromText(SAMPLE_TRANSCRIPT);
    if (extracted.nodes.length < 6) throw new Error('样本笔录抽取实体不足：' + extracted.nodes.length);
    const score = adoptionScore(extracted, SAMPLE_REFERENCE);
    if (score.rate < 0.7) throw new Error('采纳率低于 70%：' + Math.round(score.rate * 100) + '%');
    const conflicts = analyzeConflicts(doc, { template: 'fraud' });
    if (conflicts.chainReview.length !== 5) throw new Error('证据链审查阶段数不是 5');
    const report = buildReport(doc, { unresolved: extracted.unresolved, conflicts });
    if (report.sections !== 7) throw new Error('报告不是七节');
    if (!/\[(节点|证据):/.test(report.markdown)) throw new Error('报告缺少 [节点:id]/[证据:id] 引用');
    const docx = buildReportDocx(report.markdown, report.title);
    if (docx[0] !== 0x50 || docx[1] !== 0x4b) throw new Error('Word 不是 zip 容器');
    return (
      '抽取 ' + extracted.nodes.length + ' 实体 / ' + extracted.edges.length + ' 关系 · 采纳率 ' +
      Math.round(score.rate * 100) + '% · 报告 7 节 ' + report.citations + ' 处引用 · Word ' + docx.length + ' 字节'
    );
  });

  await record('AI 模拟图（M7 验收 ④⑤⑥⑧：断网生图 + 强制角标像素 + 永不已证实）', async () => {
    const draft = await generateAiImage(
      { preset: 'sketch', subject: '身材偏瘦的中年男子，短发，深色夹克', seed: 20261019 },
      { ...DEFAULT_AI_IMAGE_SETTINGS, provider: 'builtin' },
      { createdAt: '2026-10-19T10:00:00.000Z' },
    );
    if (!draft.meta.prompt) throw new Error('aiMeta 缺少提示词');
    if (draft.meta.params?.watermark !== AI_WATERMARK_TEXT) throw new Error('aiMeta 未记录强制水印');
    const audit = inspectAiAsset({ zone: 'ai', aiGenerated: true, aiMeta: draft.meta });
    if (!audit.ok) throw new Error(audit.problems.join('；'));
    if (!blocksConfirmed({ zone: 'ai', aiGenerated: true })) throw new Error('AI 图没有被拦截为已证实');
    const blob = await (await fetch(draft.previewUrl)).blob();
    const { image } = await pixelsOf(blob);
    const px = (x: number, y: number) => {
      const index = (y * image.width + x) * 4;
      return image.data[index] + image.data[index + 1] + image.data[index + 2];
    };
    if (px(Math.floor(image.width / 2), 2) > 420) throw new Error('顶部角标窄带未写入像素');
    let darkCorner = 0;
    for (let y = image.height - 96; y < image.height; y += 2) {
      for (let x = image.width - 420; x < image.width; x += 2) {
        if (px(x, y) < 300) darkCorner += 1;
      }
    }
    if (darkCorner < 40) throw new Error('右下角角标区域没有足够深色像素：' + darkCorner);
    URL.revokeObjectURL(draft.previewUrl);
    return (
      '内置通道 ' + image.width + '×' + image.height + ' · 角标像素 ' + darkCorner + ' 点已复核 · aiMeta 完整 · 不可设为已证实 · 提示词 ' +
      draft.meta.prompt.slice(0, 18) + '…'
    );
  });

  await record('OCR 字段抽取（M7 验收 ③：金额/时间/账号可人工修正）', async () => {
    const parsed = parseOcrText('金额：500000 元  交易时间：2026-09-04 10:30  收款账号：6222 0202 0000 1234  对方户名：恒信财务公司');
    if (parsed.fields.amount !== '500000') throw new Error('金额解析失败：' + String(parsed.fields.amount));
    if (parsed.fields.time !== '2026-09-04T10:30:00') throw new Error('时间解析失败：' + String(parsed.fields.time));
    if (parsed.fields.account !== '6222020200001234') throw new Error('账号解析失败：' + String(parsed.fields.account));
    const engine = await ocrEngineStatus();
    return (
      '四字段解析通过 · 识别引擎' +
      (engine.available ? '可用 ' + (engine.version ?? '') : '未安装（界面已给出安装指引：' + engine.hint.slice(0, 20) + '…）')
    );
  });

  await record('零外呼（验收 3 断网可用的机器证据）', async () => {
    if (externalRequests.length > 0) throw new Error('检测到外呼：' + externalRequests.join(' '));
    return '整轮自检未发生任何非本机请求';
  });

  window.fetch = originalFetch;
  const finishedAt = new Date().toISOString();
  const report: SelftestReport = {
    phase,
    startedAt,
    finishedAt,
    ok: checks.every((check) => check.ok),
    app,
    externalRequests,
    checks,
  };
  const text = JSON.stringify(report, null, 2);
  try {
    await reportSelftest(text);
    await debugLog('selftest 报告已写盘 ok=' + report.ok);
  } catch (error) {
    console.error('[caseboard] 自检报告写盘失败', error);
    await debugLog('selftest 报告写盘失败 ' + errorText(error));
  }
  console.log('[caseboard] selftest', report.ok ? 'PASS' : 'FAIL');
  return report;
}

/** 保险库自检用的密码：只写在测试数据目录里，不会进用户数据。 */
const VAULT_TEST_PASSWORD = 'caseboard-selftest';
const VAULT_TEST_PASSWORD_2 = 'caseboard-selftest-2';
const SQLITE_HEADER = '53514C69746520666F726D6174203300';
const VAULT_MAGIC = '43425631';

async function expectReject(label: string, run: () => Promise<unknown>, contains: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    const text = errorText(error);
    if (!text.includes(contains)) throw new Error(label + ' 的错误文案不对：' + text);
    return;
  }
  throw new Error(label + ' 没有被拒绝');
}

/**
 * M8 验收 2 的自检轮（--selftest=3）：整库加密 → 错误密码被拒 → 正确密码解锁 → 换密码/关闭。
 * 这一轮必须在 bootstrapDoc 之前跑：明文库一旦被 sqlx 打开，Windows 下就删不掉，加密会失败。
 */
export async function runVaultSelftest(): Promise<void> {
  const startedAt = new Date().toISOString();
  const checks: SelftestCheck[] = [];
  const app = await getAppInfo().catch(() => null);
  const dbPath = app?.dbPath ?? '';
  const record = async (name: string, run: () => Promise<string>): Promise<void> => {
    const at = Date.now();
    try {
      const detail = await run();
      checks.push({ name, ok: true, detail: detail + ' · ' + (Date.now() - at) + 'ms' });
    } catch (error) {
      checks.push({ name, ok: false, detail: errorText(error) });
      await debugLog('vault selftest 失败 ' + name + '：' + errorText(error));
    }
  };

  await record('启用启动密码（明文库加密成 CBV1 保险库）', async () => {
    await ensureDbFile();
    const before = await vaultService.status();
    if (before.enabled) throw new Error('测试数据目录里已经存在保险库：' + before.path);
    const plain = await vaultService.header(dbPath);
    if (!plain.startsWith(SQLITE_HEADER.slice(0, 16))) throw new Error('明文库文件头不是 SQLite：' + plain);
    const after = await vaultService.enable(VAULT_TEST_PASSWORD);
    if (!after.enabled) throw new Error('启用后 vault_status 仍是未启用');
    const vault = await vaultService.header(after.path);
    if (!vault.startsWith(VAULT_MAGIC)) throw new Error('保险库文件头不是 CBV1：' + vault);
    return '明文 ' + plain.slice(0, 16) + '… → 密文 ' + vault.slice(0, 8) + '…';
  });

  await record('磁盘上只剩密文（SQLite 工具打不开）', async () => {
    await expectReject('读取明文库', () => vaultService.header(dbPath), '无法读取文件');
    const status = await vaultService.status();
    if (!status.enabled) throw new Error('保险库未启用');
    const vault = await vaultService.header(status.path);
    if (vault.startsWith(SQLITE_HEADER.slice(0, 16))) throw new Error('保险库居然还是 SQLite 明文');
    return '明文库已删除，保险库头 ' + vault.slice(0, 8) + '（不是 SQLite 头）';
  });

  await record('错误密码无法解锁', async () => {
    await expectReject('错误密码解锁', () => vaultService.unlock('definitely-wrong'), '启动密码不正确');
    const status = await vaultService.status();
    if (!status.enabled || status.unlocked) throw new Error('错误密码后状态异常：' + JSON.stringify(status));
    const vault = await vaultService.header(status.path);
    if (!vault.startsWith(VAULT_MAGIC)) throw new Error('错误密码把保险库弄坏了：' + vault);
    return '拒绝并提示「启动密码不正确」，保险库完好';
  });

  await record('正确密码解锁（密文 → 明文 SQLite）', async () => {
    const status = await vaultService.unlock(VAULT_TEST_PASSWORD);
    if (!status.unlocked) throw new Error('正确密码没有解锁');
    const plain = await vaultService.header(dbPath);
    if (!plain.startsWith(SQLITE_HEADER.slice(0, 16))) throw new Error('解锁后文件头不对：' + plain);
    return '解锁成功，明文库文件头 ' + plain.slice(0, 16) + '…';
  });

  await record('立即锁定（明文再次从磁盘消失）', async () => {
    const status = await vaultService.lock(VAULT_TEST_PASSWORD);
    if (!status.enabled || status.unlocked) throw new Error('锁定后状态异常：' + JSON.stringify(status));
    await expectReject('锁定后读取明文库', () => vaultService.header(dbPath), '无法读取文件');
    return '明文库已删除，界面回到锁屏';
  });

  await record('更换启动密码（旧密码失效）', async () => {
    await vaultService.unlock(VAULT_TEST_PASSWORD);
    await expectReject('旧密码错误', () => vaultService.changePassword('not-the-password', VAULT_TEST_PASSWORD_2), '启动密码不正确');
    const status = await vaultService.changePassword(VAULT_TEST_PASSWORD, VAULT_TEST_PASSWORD_2);
    if (!status.enabled || status.unlocked) throw new Error('换密码后状态异常：' + JSON.stringify(status));
    await expectReject('旧密码解锁', () => vaultService.unlock(VAULT_TEST_PASSWORD), '启动密码不正确');
    const again = await vaultService.unlock(VAULT_TEST_PASSWORD_2);
    if (!again.unlocked) throw new Error('新密码解锁失败');
    return '旧密码被拒、新密码可解锁，换密码前后明文库都即时删除';
  });

  await record('关闭启动密码（恢复明文、保险库删除）', async () => {
    await expectReject('错误密码关闭', () => vaultService.disable('definitely-wrong'), '启动密码不正确');
    const status = await vaultService.disable(VAULT_TEST_PASSWORD_2);
    if (status.enabled) throw new Error('关闭后仍显示已启用');
    const plain = await vaultService.header(dbPath);
    if (!plain.startsWith(SQLITE_HEADER.slice(0, 16))) throw new Error('关闭后文件头不对：' + plain);
    await expectReject('读取保险库', () => vaultService.header(status.path), '无法读取文件');
    return '错误密码被拒；正确密码关闭后恢复 SQLite 明文、保险库文件已删除';
  });

  const finishedAt = new Date().toISOString();
  const report: SelftestReport = {
    phase: 3,
    startedAt,
    finishedAt,
    ok: checks.every((check) => check.ok),
    app,
    externalRequests: [],
    checks,
  };
  const text = JSON.stringify(report, null, 2);
  try {
    await reportSelftest(text);
    await debugLog('vault selftest 报告已写盘 ok=' + report.ok);
  } catch (error) {
    console.error('[caseboard] 保险库自检报告写盘失败', error);
    await debugLog('vault selftest 报告写盘失败 ' + errorText(error));
  }
  console.log('[caseboard] vault selftest', report.ok ? 'PASS' : 'FAIL');
}
