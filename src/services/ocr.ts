import type { Asset } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';

export const OCR_ENGINE_HINT = '未找到本地 OCR 引擎（Tesseract）。安装 tesseract 并勾选中文语言包（chi_sim）后重启应用；也可以把截图上的文字手工录入，再用「解析字段」抽成结构化字段。';

export interface OcrEngineStatus {
  available: boolean;
  version?: string;
  hint: string;
}

/** 查询本机 OCR 引擎是否可用：桌面端调用 Rust 侧车探测，浏览器端一律不可用 */
export async function ocrEngineStatus(): Promise<OcrEngineStatus> {
  if (!isTauri()) return { available: false, hint: OCR_ENGINE_HINT };
  try {
    const version = await invoke<string | null>('ocr_available');
    if (version) return { available: true, version, hint: '' };
    return { available: false, hint: OCR_ENGINE_HINT };
  } catch {
    return { available: false, hint: OCR_ENGINE_HINT };
  }
}

/**
 * 对素材原件做 OCR（M7-3）。图片必须是本机存在的绝对路径；
 * 识别引擎不可用时抛中文错误，界面据此回退到手工录入。
 */
export async function recognizeAssetText(asset: Pick<Asset, 'id' | 'name'> & { path?: string }): Promise<string> {
  if (!isTauri()) throw new Error('浏览器模式没有本地 OCR 引擎：请改用手工录入文字，或使用桌面版配合 Tesseract。');
  if (!asset.path) throw new Error('素材原件不在本机，无法识别：请先重新导入原图。');
  try {
    const text = await invoke<string>('ocr_image', { path: asset.path });
    if (!text || !text.trim()) throw new Error('识别结果为空：图片可能过于模糊，或不是文字截图。');
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('未找到')) throw new Error(OCR_ENGINE_HINT);
    throw new Error('OCR 识别失败：' + message);
  }
}
