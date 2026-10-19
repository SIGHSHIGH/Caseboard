import type { AiMeta, Asset, CaseDoc } from '../types';
import {
  AI_PRESETS,
  AI_WATERMARK_TEXT,
  buildAiMeta,
  buildAiPrompt,
  buildComfyWorkflow,
  defaultAiSeed,
  inspectAiPrompt,
  proceduralSketch,
  watermarkPlan,
  type AiImageSpec,
} from '../lib/aiImage';
import { nextAssetNo } from '../lib/assetMeta';
import { newId } from '../lib/id';
import { addImageNode } from '../commands/imageNodeCommands';
import { addAssets } from '../commands/assetCommands';
import { composeCommands } from '../commands/compose';
import type { Command } from '../commands/types';
import { imageStore } from './imageStore';
import { THUMB_LARGE, THUMB_SMALL, computeThumbSize } from '../lib/assetMeta';

/** AI 生图通道设置（M7-4）：不进 CaseDoc，只存本机 localStorage */
export type AiImageProvider = 'builtin' | 'comfyui' | 'openai';

export interface AiImageSettings {
  provider: AiImageProvider;
  baseUrl: string;
  model: string;
  checkpoint: string;
  apiKey: string;
  allowCloud: boolean;
}

export const AI_IMAGE_SETTINGS_KEY = 'caseboard-ai-image-settings';

export const AI_IMAGE_PROVIDER_LABEL: Record<AiImageProvider, string> = {
  builtin: '内置示意图（离线确定性）',
  comfyui: '本地 ComfyUI',
  openai: 'OpenAI 兼容生图（云端）',
};

export const AI_IMAGE_PRIVACY: Record<AiImageProvider, string> = {
  builtin: '完全离线：笔触由本地种子决定，不发送任何数据，产物一律带「AI 生成 · 模拟图」。',
  comfyui: '本机 ComfyUI（默认 127.0.0.1:8188）：提示词只在本机流转，不出局域网。',
  openai: '云端生图：提示词会发送到配置的服务地址，必须二次确认；建议只在非敏感描述上使用。',
};

export const DEFAULT_AI_IMAGE_SETTINGS: AiImageSettings = {
  provider: 'builtin',
  baseUrl: 'http://127.0.0.1:8188',
  model: 'gpt-image-1',
  checkpoint: 'sd_xl_base_1.0.safetensors',
  apiKey: '',
  allowCloud: false,
};

export function normalizeAiImageSettings(input: unknown): AiImageSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const provider = raw.provider === 'comfyui' || raw.provider === 'openai' ? raw.provider : 'builtin';
  const str = (value: unknown, fallback: string): string => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text === '' ? fallback : text;
  };
  return {
    provider,
    baseUrl: str(raw.baseUrl, DEFAULT_AI_IMAGE_SETTINGS.baseUrl),
    model: str(raw.model, DEFAULT_AI_IMAGE_SETTINGS.model),
    checkpoint: str(raw.checkpoint, DEFAULT_AI_IMAGE_SETTINGS.checkpoint),
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    allowCloud: raw.allowCloud === true,
  };
}

export function loadAiImageSettings(): AiImageSettings {
  try {
    const text = localStorage.getItem(AI_IMAGE_SETTINGS_KEY);
    if (!text) return { ...DEFAULT_AI_IMAGE_SETTINGS };
    return normalizeAiImageSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_AI_IMAGE_SETTINGS };
  }
}

export function saveAiImageSettings(settings: AiImageSettings): void {
  try {
    localStorage.setItem(AI_IMAGE_SETTINGS_KEY, JSON.stringify(normalizeAiImageSettings(settings)));
  } catch {
    /* 隐私模式下写入失败不影响当前会话 */
  }
}

export interface AiImageOutput {
  blob: Blob;
  width: number;
  height: number;
  meta: AiMeta;
  previewUrl: string;
}

export interface AiImageDraft extends AiImageOutput {
  assetId: string;
  /** 生图通道，写进 aiMeta.params.provider */
  provider: AiImageProvider;
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('本机 WebView 不支持 canvas，无法生成示意图。');
  return { canvas, ctx };
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败：画布为空。'));
      },
      type,
      quality,
    );
  });
}

/** 把「AI 生成 · 模拟图」写进像素（Gate 0-5：界面没有关闭开关） */
export function stampWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const plan = watermarkPlan(width, height);
  ctx.save();
  ctx.font = '600 ' + plan.fontSize + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
  const metrics = ctx.measureText(plan.text);
  const boxW = metrics.width + plan.padding * 2;
  const boxH = plan.fontSize + plan.padding * 2;
  const boxX = width - boxW - plan.padding;
  const boxY = height - boxH - plan.padding;
  ctx.fillStyle = plan.background;
  ctx.beginPath();
  const radius = Math.min(8, boxH / 3);
  ctx.moveTo(boxX + radius, boxY);
  ctx.lineTo(boxX + boxW - radius, boxY);
  ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
  ctx.lineTo(boxX + boxW, boxY + boxH - radius);
  ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
  ctx.lineTo(boxX + radius, boxY + boxH);
  ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
  ctx.lineTo(boxX, boxY + radius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = plan.color;
  ctx.textBaseline = 'middle';
  ctx.fillText(plan.text, boxX + plan.padding, boxY + boxH / 2);
  // 顶部再加一条窄带，裁切下半部分也仍能看出是模拟图
  ctx.fillStyle = 'rgba(32, 32, 32, 0.55)';
  ctx.fillRect(0, 0, width, Math.max(18, Math.round(height * 0.035)));
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 ' + Math.max(11, Math.round(height * 0.022)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(AI_WATERMARK_TEXT + ' · 非真实照片', 10, Math.max(18, Math.round(height * 0.035)) / 2);
  ctx.restore();
}

function drawProcedural(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, spec: AiImageSpec, seed: number): void {
  const preset = spec.preset;
  ctx.fillStyle = preset === 'scene' ? '#F3F1EC' : '#F7F5F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#3A3A3A';
  ctx.lineCap = 'round';
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 480;
  const ops = proceduralSketch(preset, seed, 640, 480);
  for (const op of ops) {
    ctx.globalAlpha = op.opacity;
    ctx.lineWidth = Math.max(1, op.width * Math.min(scaleX, scaleY));
    if (op.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(op.x * scaleX, op.y * scaleY, (op.rx ?? 10) * scaleX, (op.ry ?? 10) * scaleY, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (op.kind === 'rect') {
      ctx.save();
      ctx.translate(op.x * scaleX, op.y * scaleY);
      ctx.rotate(op.rotation ?? 0);
      const w = (op.rx ?? 10) * 2 * scaleX;
      const h = (op.ry ?? 10) * 2 * scaleY;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.moveTo(op.x * scaleX, op.y * scaleY);
      ctx.lineTo((op.x2 ?? op.x) * scaleX, (op.y2 ?? op.y) * scaleY);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(43, 43, 43, 0.5)';
  ctx.font = '13px "Microsoft YaHei", sans-serif';
  ctx.fillText('示意笔触 · 种子 ' + seed, 14, canvas.height - 14);
}

async function renderBuiltin(spec: AiImageSpec, seed: number): Promise<{ blob: Blob; width: number; height: number }> {
  const preset = AI_PRESETS[spec.preset];
  const width = Math.max(320, Math.round(spec.width ?? preset.width));
  const height = Math.max(240, Math.round(spec.height ?? preset.height));
  const { canvas, ctx } = canvasOf(width, height);
  drawProcedural(canvas, ctx, spec, seed);
  stampWatermark(ctx, width, height);
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width, height };
}

/** 远程/本地模型出的图也要重新盖水印：任何通道都不放过角标 */
async function stampRemote(blob: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { canvas, ctx } = canvasOf(width, height);
  ctx.fillStyle = '#1F1F1F';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  ctx.drawImage(bitmap, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  stampWatermark(ctx, width, height);
  bitmap.close?.();
  return canvasToBlob(canvas, 'image/png');
}

async function generateComfyUi(spec: AiImageSpec, settings: AiImageSettings, seed: number): Promise<{ blob: Blob; width: number; height: number }> {
  const preset = AI_PRESETS[spec.preset];
  const width = Math.round(spec.width ?? preset.width);
  const height = Math.round(spec.height ?? preset.height);
  const base = settings.baseUrl.replace(/\/+$/, '');
  const pack = buildAiPrompt(spec);
  const workflow = buildComfyWorkflow(pack, { checkpoint: settings.checkpoint, width, height, seed });
  const submit = await fetch(base + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'caseboard-' + Date.now() }),
  });
  if (!submit.ok) throw new Error('ComfyUI 提交失败（HTTP ' + submit.status + '）：请确认本地服务已启动。');
  const queued = (await submit.json()) as { prompt_id?: string };
  if (!queued.prompt_id) throw new Error('ComfyUI 没有返回任务号：请检查工作流与模型是否匹配。');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const history = await fetch(base + '/history/' + queued.prompt_id);
    if (!history.ok) continue;
    const data = (await history.json()) as Record<string, { outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }> }>;
    const entry = data[queued.prompt_id];
    const outputs = entry?.outputs ?? {};
    const first = Object.values(outputs).flatMap((item) => item.images ?? [])[0];
    if (!first) continue;
    const query = new URLSearchParams({ filename: first.filename, type: first.type ?? 'output' });
    if (first.subfolder) query.set('subfolder', first.subfolder);
    const file = await fetch(base + '/view?' + query.toString());
    if (!file.ok) throw new Error('ComfyUI 出图下载失败（HTTP ' + file.status + '）。');
    const raw = await file.blob();
    const stamped = await stampRemote(raw, width, height);
    return { blob: stamped, width, height };
  }
  throw new Error('ComfyUI 生成超时（120 秒）：请查看 ComfyUI 控制台是否报显存不足。');
}

async function generateOpenAi(spec: AiImageSpec, settings: AiImageSettings, confirmCloud: boolean): Promise<{ blob: Blob; width: number; height: number }> {
  if (!settings.allowCloud || !confirmCloud) {
    throw new Error('云端生图未授权：请在设置里勾选「允许云端生图」，并在生成前二次确认。');
  }
  const preset = AI_PRESETS[spec.preset];
  const width = Math.round(spec.width ?? preset.width);
  const height = Math.round(spec.height ?? preset.height);
  const pack = buildAiPrompt(spec);
  const base = settings.baseUrl.replace(/\/+$/, '');
  const response = await fetch(base + '/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: 'Bearer ' + settings.apiKey } : {}),
    },
    body: JSON.stringify({ model: settings.model, prompt: pack.prompt, n: 1, size: width + 'x' + height, response_format: 'b64_json' }),
  });
  if (!response.ok) throw new Error('云端生图失败（HTTP ' + response.status + '）：' + (await response.text()).slice(0, 220));
  const data = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  let raw: Blob;
  if (item?.b64_json) {
    const binary = atob(item.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    raw = new Blob([bytes], { type: 'image/png' });
  } else if (item?.url) {
    const fetched = await fetch(item.url);
    raw = await fetched.blob();
  } else {
    throw new Error('云端生图没有返回图片数据。');
  }
  const stamped = await stampRemote(raw, width, height);
  return { blob: stamped, width, height };
}

/**
 * 统一生图入口：先过提示词红线，再按通道出图，最后统一盖水印。
 * seed 固定后内置通道完全可复现（验收 ⑧ 断网可用）。
 */
export async function generateAiImage(
  spec: AiImageSpec,
  settings: AiImageSettings,
  options: { confirmCloud?: boolean; createdAt?: string } = {},
): Promise<AiImageDraft> {
  const guard = inspectAiPrompt(spec.subject + ' ' + (spec.extra ?? ''));
  if (!guard.ok) throw new Error(guard.message);
  const seed = spec.seed ?? defaultAiSeed(spec.subject);
  const filled: AiImageSpec = { ...spec, seed };
  const provider = settings.provider;
  let output: { blob: Blob; width: number; height: number };
  if (provider === 'comfyui') output = await generateComfyUi(filled, settings, seed);
  else if (provider === 'openai') output = await generateOpenAi(filled, settings, options.confirmCloud === true);
  else output = await renderBuiltin(filled, seed);
  const meta = buildAiMeta({
    spec: filled,
    provider,
    model: provider === 'builtin' ? 'builtin-procedural' : provider === 'comfyui' ? settings.checkpoint : settings.model,
    seed,
    createdAt: options.createdAt,
  });
  return {
    ...output,
    meta,
    previewUrl: URL.createObjectURL(output.blob),
    assetId: newId('a'),
    provider,
  };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 2166136261;
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 1) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return 'fnv1a' + hash.toString(16).padStart(8, '0');
  }
}

async function thumbBlob(blob: Blob, maxEdge: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = computeThumbSize(bitmap.width, bitmap.height, maxEdge);
  const { canvas, ctx } = canvasOf(size.w, size.h);
  ctx.drawImage(bitmap, 0, 0, size.w, size.h);
  bitmap.close?.();
  return { blob: await canvasToBlob(canvas, 'image/jpeg', 0.9), width: size.w, height: size.h };
}

/** 画布落点：所有卡片与图片节点最右侧再往右一屏，纵坐标对齐最上方 */
export function nextAiImageSpot(doc: Pick<CaseDoc, 'nodes' | 'imageNodes'>): { x: number; y: number } {
  let right = 0;
  let top = Number.POSITIVE_INFINITY;
  for (const node of doc.nodes) {
    right = Math.max(right, node.x + node.w);
    top = Math.min(top, node.y);
  }
  for (const image of doc.imageNodes) {
    right = Math.max(right, image.x + image.w);
    top = Math.min(top, image.y);
  }
  if (!Number.isFinite(top)) top = 120;
  return { x: Math.round(right + 96), y: Math.round(top) };
}

export interface CommitAiImageResult {
  asset: Asset;
  command: Command;
}

/**
 * 把预览结果落盘并生成一条可撤销命令：
 * 素材 + 图片节点同批写入，撤销一次全部退回（Gate 0-2）。
 */
export async function commitAiImage(doc: CaseDoc, draft: AiImageDraft): Promise<CommitAiImageResult> {
  const bytes = await draft.blob.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const path = await imageStore.putOriginal(draft.assetId, draft.blob);
  const small = await thumbBlob(draft.blob, THUMB_SMALL);
  const large = await thumbBlob(draft.blob, THUMB_LARGE);
  await imageStore.putThumb(draft.assetId, THUMB_SMALL, small.blob);
  await imageStore.putThumb(draft.assetId, THUMB_LARGE, large.blob);
  const asset: Asset = {
    id: draft.assetId,
    path,
    kind: 'image',
    hash,
    thumbnails: [draft.assetId + ':' + THUMB_SMALL, draft.assetId + ':' + THUMB_LARGE],
    source: 'ai',
    sourceLabel: 'AI 模拟图（' + AI_WATERMARK_TEXT + '）',
    zone: 'ai',
    width: draft.width,
    height: draft.height,
    name: 'AI-' + draft.meta.preset + '-' + draft.assetId.slice(-4) + '.png',
    size: draft.blob.size,
    mimeType: 'image/png',
    no: nextAssetNo(doc.assets),
    addedAt: new Date().toISOString(),
    annotations: [],
    aiGenerated: true,
    aiMeta: draft.meta,
  };
  const spot = nextAiImageSpot(doc);
  const command = composeCommands('插入 AI 模拟图', [
    addAssets([asset]),
    addImageNode({
      assetId: asset.id,
      x: spot.x,
      y: spot.y,
      w: Math.min(420, draft.width),
      h: Math.round((Math.min(420, draft.width) / draft.width) * draft.height),
      siblings: doc.imageNodes,
      assetWidth: draft.width,
      assetHeight: draft.height,
    }),
  ]);
  return { asset, command };
}
