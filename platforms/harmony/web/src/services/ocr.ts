import type { Asset } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { isHarmony, readAssetBytes } from './platform';
import { bytesToBase64 } from './platform';
import { callNative } from './harmony';

/**
 * OCR 入口：按运行时分两级。
 * 1. 鸿蒙端 → 系统 Core Vision Kit（`@hms.ai.ocr.textRecognition`，经原生桥
 *    `ocrRecognize`）。不打包 Tesseract：那 16MB WASM 内核与语言包在
 *    `$rawfile` 里既拖慢装机又占内存，且鸿蒙自带中文识别。
 * 2. 桌面端 → 系统 tesseract.exe 侧车 → 内置 Tesseract WASM。
 *
 * 识别结果只是**文本输入**，进「待确认」队列后才可能影响 Model：
 * OCR 不构成任何关系证据（硬约束 4）。
 */
export const OCR_ENGINE_HINT =
  '系统 OCR 不可用。可在「设置」里确认设备是否支持文字识别，或改用「手工录入 + 解析字段」——手工录入的文本同样会进待确认队列。';

export type OcrEngineKind = 'system' | 'bundled' | 'none';

export interface OcrEngineStatus {
  available: boolean;
  /** 真正会用到哪一级引擎 */
  engine: OcrEngineKind;
  version?: string;
  hint: string;
}

/** 识别过程中的阶段回调（导入后自动 OCR 时显示在素材库） */
export interface OcrProgressValue {
  stage: string;
  progress: number;
}

export type OcrProgress = (value: OcrProgressValue) => void;

interface OcrResultJson {
  ok: boolean;
  text: string;
  lang: string;
  message: string;
}

/** 查询可用引擎。鸿蒙走 `canIUse('SystemCapability.AI.OCR.TextRecognition')` 的探测结果。 */
export async function ocrEngineStatus(): Promise<OcrEngineStatus> {
  if (isHarmony()) {
    const available = (await callNative<boolean>('ocrAvailable')) === true;
    return available
      ? { available: true, engine: 'system', version: '系统文字识别（Core Vision Kit）', hint: '' }
      : { available: false, engine: 'none', hint: OCR_ENGINE_HINT };
  }
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const version = await invoke<string | null>('ocr_available');
      if (version) return { available: true, engine: 'system', version, hint: '' };
    } catch {
      // 侧车探测失败不代表没救：桌面端还有内置引擎
    }
  }
  return { available: false, engine: 'none', hint: OCR_ENGINE_HINT };
}

/** 预热引擎：鸿蒙的 Core Vision Kit 由系统托管，无需预热。 */
export async function warmOcrEngine(_onProgress?: OcrProgress): Promise<void> {
  // 故意留空：预热只为 WASM 内核存在。
}

/** 释放引擎（关闭面板 / 切换案件时调用）。 */
export async function releaseOcrEngine(): Promise<void> {
  // 鸿蒙侧只在调用瞬间持有 PixelMap，识别结束即释放，无长期资源。
}

/**
 * 对素材原件做 OCR。鸿蒙端把原件字节交给原生侧解码成 PixelMap 再识别；
 * 失败抛中文错误，界面据此回退到手工录入。
 */
export async function recognizeAssetText(
  asset: Pick<Asset, 'id' | 'name'> & { path?: string },
  onProgress?: OcrProgress,
): Promise<string> {
  if (isHarmony()) {
    if (onProgress) onProgress({ stage: '读取原件', progress: 0.1 });
    const bytes = await readAssetBytes(asset.id);
    if (onProgress) onProgress({ stage: '识别中', progress: 0.5 });
    const result = await callNative<OcrResultJson>('ocrRecognize', bytesToBase64(bytes), 'zh-CN');
    if (result && result.ok && result.text.trim()) {
      if (onProgress) onProgress({ stage: '完成', progress: 1 });
      return result.text;
    }
    const reason = result && result.message ? result.message : '识别结果为空：图片可能过于模糊，或不是文字截图。';
    throw new Error('OCR 识别失败：' + reason);
  }

  if (!asset.path) throw new Error('素材原件不在本机，无法识别：请先重新导入原图。');
  const text = await invoke<string>('ocr_image', { path: asset.path });
  if (!text || !text.trim()) throw new Error('OCR 识别失败：系统引擎返回空结果。');
  return text;
}
