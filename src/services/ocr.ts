import type { Asset } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';
import {
  builtinOcrStatus,
  disposeBuiltinOcr,
  recognizeWithBuiltin,
  warmupBuiltinOcr,
  type BuiltinOcrProgress,
} from './ocrBuiltin';

/**
 * OCR 入口（M7 起有，M10 增强）：两级引擎。
 * 1. 系统里装了 tesseract.exe → 调 Rust 侧车（启动快、无额外内存）；
 * 2. 没装 → 用**打包进应用**的 Tesseract WASM 内核与中文语言包（`public/ocr/`），
 *    装完即用，不再要求用户另外安装任何东西。
 */
export const OCR_ENGINE_HINT =
  '内置 OCR 引擎不可用。桌面版安装包已内置 Tesseract 内核与中英文语言包（public/ocr）；若此处仍报错，请确认安装完整，或改用「手工录入 + 解析字段」。';

export type OcrEngineKind = 'system' | 'bundled' | 'none';

export interface OcrEngineStatus {
  available: boolean;
  /** 真正会用到哪一级引擎 */
  engine: OcrEngineKind;
  version?: string;
  hint: string;
}

/** 查询可用引擎：系统 tesseract 优先，其次内置 WASM */
export async function ocrEngineStatus(): Promise<OcrEngineStatus> {
  if (!isTauri()) {
    return { available: false, engine: 'none', hint: '浏览器预览模式没有本机文件访问能力，OCR 只在桌面版可用。' };
  }
  try {
    const version = await invoke<string | null>('ocr_available');
    if (version) return { available: true, engine: 'system', version, hint: '' };
  } catch {
    // 侧车探测失败不代表没救：继续看内置引擎
  }
  const builtin = builtinOcrStatus();
  if (builtin.ready) {
    return { available: true, engine: 'bundled', version: '内置 Tesseract（WASM）', hint: '' };
  }
  return { available: false, engine: 'none', hint: OCR_ENGINE_HINT + (builtin.reason ? ' ' + builtin.reason : '') };
}

/** 识别过程中的阶段回调（导入后自动 OCR 时显示在素材库） */
export type OcrProgress = (value: BuiltinOcrProgress) => void;

/** 预热内置引擎：导入图片后立刻调用，用户点「识别文字」时内核已就绪 */
export async function warmOcrEngine(onProgress?: OcrProgress): Promise<void> {
  if (!isTauri()) return;
  try {
    const version = await invoke<string | null>('ocr_available');
    if (version) return; // 有系统引擎，不必载入 WASM
  } catch {
    // 忽略，继续预热内置引擎
  }
  await warmupBuiltinOcr(onProgress);
}

/** 释放内置引擎（关闭面板 / 切换案件时调用） */
export async function releaseOcrEngine(): Promise<void> {
  await disposeBuiltinOcr();
}

/**
 * 对素材原件做 OCR。先试系统 tesseract，失败或缺失时回落到内置 WASM 引擎；
 * 两级都不行才抛中文错误，界面据此回退到手工录入。
 */
export async function recognizeAssetText(
  asset: Pick<Asset, 'id' | 'name'> & { path?: string },
  onProgress?: OcrProgress,
): Promise<string> {
  if (!isTauri()) throw new Error('浏览器模式没有 OCR 引擎：请改用手工录入文字，或使用桌面版（安装包内置识别内核）。');
  if (!asset.path) throw new Error('素材原件不在本机，无法识别：请先重新导入原图。');

  let systemError: string | null = null;
  try {
    const text = await invoke<string>('ocr_image', { path: asset.path });
    if (text && text.trim()) return text;
    systemError = '系统 OCR 引擎返回空结果';
  } catch (error) {
    systemError = error instanceof Error ? error.message : String(error);
  }

  try {
    const text = await recognizeWithBuiltin(asset.path, onProgress);
    if (!text) throw new Error('识别结果为空：图片可能过于模糊，或不是文字截图。');
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('识别结果为空')) throw new Error(message);
    const reason = systemError ? '系统引擎：' + systemError + '；' : '';
    throw new Error('OCR 识别失败：' + reason + '内置引擎：' + message);
  }
}
