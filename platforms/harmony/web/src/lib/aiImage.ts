import type { AiMeta, Asset } from '../types';

/** AI 生图四预设（M7-4）：与规格 P7/图像预设一致 */
export type AiImagePreset = AiMeta['preset'];

export const AI_WATERMARK_TEXT = 'AI 生成 · 模拟图';
export const AI_ZONE = 'ai' as const;

export interface AiPresetMeta {
  label: string;
  description: string;
  /** 拼进正向提示词的风格说明 */
  style: string;
  negative: string;
  width: number;
  height: number;
}

export const AI_PRESETS: Record<AiImagePreset, AiPresetMeta> = {
  sketch: {
    label: '模拟画像',
    description: '按文字描述拼出嫌疑人/证人的示意性画像，用于排查思路，不作为辨认依据。',
    style: '黑白素描风格的示意画像，正面半身，结构简化，非真实照片',
    negative: '真实照片，换脸，具体真实姓名，身份证号，精确五官复刻',
    width: 768,
    height: 960,
  },
  scene: {
    label: '现场示意',
    description: '把现场空间关系画成平面示意图，帮助说明位置与动线。',
    style: '刑侦白板风格的现场平面示意图，俯视，标注方位与动线，非照片',
    negative: '真实照片，监控截图，血腥暴力细节，真实门牌号',
    width: 1024,
    height: 640,
  },
  item: {
    label: '物品示意',
    description: '示意证物外观（包、卡、工具等），用于认出同款而非认定同一物。',
    style: '白底物品示意图，等距视角，线条清晰，标注尺寸比例，非照片',
    negative: '真实照片，品牌商标特写，序列号可读',
    width: 768,
    height: 768,
  },
  enhance: {
    label: '图像增强',
    description: '把模糊草图/截图的线条关系画清楚；产物仍是模拟图，不能当原件使用。',
    style: '根据文字描述重绘的清晰示意图，保留原有空间关系，灰阶，非照片修复',
    negative: '真实照片修复，人脸超分，无中生有的细节，真实车牌',
    width: 1024,
    height: 768,
  },
};

const FACE_SWAP_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /换脸|换头|人脸替换|face\s*swap|faceswap/i, reason: '涉及换脸/换头' },
  { pattern: /把.{0,10}的(?:脸|头像|照片).{0,10}(?:换|贴|合成|移)/, reason: '把特定真人的脸合成到别人身上' },
  { pattern: /用.{0,12}(?:照片|头像|证件照|生活照).{0,10}(?:合成|生成|做)/, reason: '用真实照片合成' },
  { pattern: /真实(?:人脸|照片|身份证|证件照)/, reason: '要求真实人脸或证件照' },
  { pattern: /(?:生成|合成|伪造).{0,12}(?:真人|某人|某某|嫌疑人).{0,8}(?:照片|肖像|正面照)/, reason: '生成特定真人的照片' },
  { pattern: /(?:生成|合成|画出|绘制).{0,6}的?(?:肖像|正面照)/, reason: '生成真人的肖像/照片' },
  { pattern: /身份证号|银行卡号密码|开房记录|行踪定位/, reason: '涉及敏感个人信息' },
];

export interface PromptGuardResult {
  ok: boolean;
  reasons: string[];
  message: string;
}

/** 生图红线检查：只检查用户输入，模板自带的 negative 不参与（否则自我否决） */
export function inspectAiPrompt(input: string): PromptGuardResult {
  const text = (input ?? '').trim();
  const reasons: string[] = [];
  if (!text) reasons.push('描述为空');
  for (const rule of FACE_SWAP_RULES) {
    if (rule.pattern.test(text)) reasons.push(rule.reason);
  }
  if (text.length > 600) reasons.push('描述超过 600 字');
  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    message: ok
      ? ''
      : '拒绝生成：' + reasons.join('；') + '。案情板的生图只做示意性模拟图，禁止真实人脸换脸、冒充特定真人与伪造证件。',
  };
}

export interface AiImageSpec {
  preset: AiImagePreset;
  subject: string;
  /** 额外风格/构图要求，可为空 */
  extra?: string;
  seed?: number;
  width?: number;
  height?: number;
}

export interface AiPromptPack {
  prompt: string;
  negativePrompt: string;
}

/** 把预设 + 用户描述拼成提示词；生成器与审计记录都用这一份 */
export function buildAiPrompt(spec: AiImageSpec): AiPromptPack {
  const meta = AI_PRESETS[spec.preset];
  const subject = spec.subject.trim();
  const extra = (spec.extra ?? '').trim();
  const prompt = [
    '生成一张刑侦案情推演用的' + meta.label + '（' + meta.style + '）。',
    '画面主体：' + subject + '。',
    extra ? '补充要求：' + extra + '。' : '',
    '画面右下角必须带文字「' + AI_WATERMARK_TEXT + '」，不得被裁切或遮挡。',
    '这是模拟图，不是真实照片，不得声称是真实拍摄或真实人物。',
  ]
    .filter(Boolean)
    .join('\n');
  return { prompt, negativePrompt: meta.negative + '，真实照片，水印遮挡' };
}

export interface AiMetaInput {
  spec: AiImageSpec;
  provider: string;
  model: string;
  seed: number;
  createdAt?: string;
}

/** 完整 aiMeta（Gate 0-5）：预设、正负提示词、模型、种子、参数、水印与分区都写进去 */
export function buildAiMeta(input: AiMetaInput): AiMeta {
  const pack = buildAiPrompt(input.spec);
  return {
    preset: input.spec.preset,
    prompt: pack.prompt,
    negativePrompt: pack.negativePrompt,
    model: input.model,
    seed: input.seed,
    createdAt: input.createdAt ?? new Date().toISOString(),
    params: {
      provider: input.provider,
      width: input.spec.width ?? AI_PRESETS[input.spec.preset].width,
      height: input.spec.height ?? AI_PRESETS[input.spec.preset].height,
      watermark: AI_WATERMARK_TEXT,
      simulated: true,
      subject: input.spec.subject,
    },
  };
}

const SEED_MOD = 2147483647;

/** 确定性伪随机：同一 seed 必得同一组笔触，验收才可复现 */
export function seededRandom(seed: number): () => number {
  let state = Math.abs(Math.floor(seed)) % SEED_MOD;
  if (state === 0) state = 20261019;
  return () => {
    state = (state * 48271) % SEED_MOD;
    return state / SEED_MOD;
  };
}

export interface SketchOp {
  kind: 'line' | 'ellipse' | 'rect';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  rx?: number;
  ry?: number;
  rotation?: number;
  opacity: number;
  width: number;
}

function lerp(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

/** 内置生成器的笔触规划（纯函数）：canvas 渲染与 smoke 断言共用同一份几何 */
export function proceduralSketch(preset: AiImagePreset, seed: number, width = 640, height = 480): SketchOp[] {
  const rand = seededRandom(seed);
  const ops: SketchOp[] = [];
  const cx = width / 2;
  const cy = height / 2;
  if (preset === 'sketch') {
    ops.push({ kind: 'ellipse', x: cx, y: cy - height * 0.12, rx: width * 0.14, ry: height * 0.19, opacity: 0.85, width: 2.2 });
    ops.push({ kind: 'line', x: cx - width * 0.2, y: cy + height * 0.3, x2: cx + width * 0.2, y2: cy + height * 0.3, opacity: 0.8, width: 2.4 });
    ops.push({ kind: 'line', x: cx - width * 0.1, y: cy - height * 0.02, x2: cx + width * 0.1, y2: cy - height * 0.02, opacity: 0.6, width: 1.4 });
    for (let i = 0; i < 18; i += 1) {
      const angle = lerp(rand, -Math.PI * 0.9, Math.PI * 0.1);
      const radius = lerp(rand, width * 0.1, width * 0.16);
      ops.push({
        kind: 'line',
        x: cx + Math.cos(angle) * radius,
        y: cy - height * 0.12 + Math.sin(angle) * radius * 0.9,
        x2: cx + Math.cos(angle) * radius * 1.18,
        y2: cy - height * 0.12 + Math.sin(angle) * radius * 1.08,
        opacity: 0.5,
        width: 1.2,
      });
    }
  } else if (preset === 'scene') {
    for (let i = 0; i < 6; i += 1) {
      const x = lerp(rand, width * 0.08, width * 0.9);
      const y = lerp(rand, height * 0.1, height * 0.85);
      ops.push({ kind: 'rect', x, y, rx: lerp(rand, 40, 110), ry: lerp(rand, 26, 70), opacity: 0.55, width: 1.6 });
    }
    ops.push({ kind: 'line', x: width * 0.1, y: height * 0.5, x2: width * 0.9, y2: height * 0.5, opacity: 0.35, width: 1 });
    ops.push({ kind: 'line', x: width * 0.5, y: height * 0.08, x2: width * 0.5, y2: height * 0.92, opacity: 0.35, width: 1 });
  } else if (preset === 'item') {
    ops.push({ kind: 'rect', x: cx, y: cy, rx: width * 0.26, ry: height * 0.2, opacity: 0.85, width: 2.4, rotation: -0.08 });
    ops.push({ kind: 'line', x: cx - width * 0.18, y: cy - 6, x2: cx + width * 0.18, y2: cy - 6, opacity: 0.6, width: 1.4 });
    for (let i = 0; i < 10; i += 1) {
      const x = cx + lerp(rand, -width * 0.22, width * 0.22);
      ops.push({ kind: 'line', x, y: cy + height * 0.1, x2: x + lerp(rand, -8, 8), y2: cy + height * 0.16, opacity: 0.4, width: 1 });
    }
  } else {
    for (let i = 0; i < 24; i += 1) {
      const x = lerp(rand, width * 0.1, width * 0.9);
      const y = lerp(rand, height * 0.1, height * 0.9);
      ops.push({
        kind: 'line',
        x,
        y,
        x2: x + lerp(rand, -60, 60),
        y2: y + lerp(rand, -40, 40),
        opacity: lerp(rand, 0.15, 0.5),
        width: lerp(rand, 0.8, 2.4),
      });
    }
  }
  return ops;
}

export interface WatermarkPlan {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  padding: number;
  background: string;
  color: string;
}

/** 角标写入像素时的几何：右下角内缩，字号随图宽缩放，最小 12px */
export function watermarkPlan(width: number, height: number): WatermarkPlan {
  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 22));
  const padding = Math.max(8, Math.round(fontSize * 0.5));
  return {
    text: AI_WATERMARK_TEXT,
    x: width - padding,
    y: height - padding,
    fontSize,
    padding,
    background: 'rgba(32, 32, 32, 0.82)',
    color: '#ffffff',
  };
}

/** AI 素材的硬校验：任何一条不满足都不允许进入「证据已证实」通道 */
export function inspectAiAsset(asset: AiAssetMeta): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (asset.zone !== 'ai') problems.push('素材不在 AI 分区');
  if (asset.aiGenerated !== true) problems.push('缺少 aiGenerated 标记');
  if (!asset.aiMeta) problems.push('缺少完整 aiMeta');
  else {
    if (!asset.aiMeta.prompt) problems.push('aiMeta 缺提示词');
    if (asset.aiMeta.params?.watermark !== AI_WATERMARK_TEXT) problems.push('aiMeta 缺水印记录');
  }
  return { ok: problems.length === 0, problems };
}

export interface AiAssetMeta {
  zone?: Asset['zone'];
  aiGenerated?: boolean;
  aiMeta?: AiMeta;
}

/** AI 图永远不允许被标成「已证实」 */
export function blocksConfirmed(asset: Pick<Asset, 'zone' | 'aiGenerated'> | undefined): boolean {
  return Boolean(asset && (asset.zone === 'ai' || asset.aiGenerated === true));
}

export function aiPresetLabel(preset: AiImagePreset): string {
  return AI_PRESETS[preset].label;
}

/**
 * ComfyUI 的 API 工作流（文生图最小图）：本地 ComfyUI 走 /prompt 提交这份 JSON。
 * 只用标准节点，避免绑定某个自定义节点包。
 */
export function buildComfyWorkflow(
  pack: AiPromptPack,
  options: { checkpoint: string; width: number; height: number; seed: number; steps?: number; cfg?: number },
): Record<string, unknown> {
  const seed = Math.abs(Math.floor(options.seed)) % 2147483647;
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: options.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: pack.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: pack.negativePrompt, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: options.width, height: options.height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: options.steps ?? 24,
        cfg: options.cfg ?? 6.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'caseboard-ai' } },
  };
}

/** 同一主体 + 同一日期得到同一默认种子：审计时能复现，且不同描述不会撞图 */
export function defaultAiSeed(subject: string, day = '2026-10-19'): number {
  let hash = 2166136261;
  const text = subject + '|' + day;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 2000000000) + 1;
}
