/**
 * AI 通道设置：只存本机 localStorage，不进案件文件（Gate 0-7 本地优先）。
 * 纯本地模式的判定同时用于：界面提示、远程调用前置检查、验收断言。
 */
import type { AiProviderId, AiSettings } from './types';

export const AI_SETTINGS_KEY = 'caseboard-ai-settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'builtin',
  model: 'qwen2.5:7b',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: '',
  allowRemote: false,
};

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  builtin: '内置规则（离线）',
  ollama: 'Ollama 本地模型',
  openai: 'OpenAI 兼容接口',
};

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
}

export function normalizeAiSettings(input: unknown): AiSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_AI_SETTINGS };
  const raw = input as Record<string, unknown>;
  const provider = raw.provider === 'ollama' || raw.provider === 'openai' ? raw.provider : 'builtin';
  return {
    provider,
    model: asString(raw.model, DEFAULT_AI_SETTINGS.model),
    baseUrl: asString(raw.baseUrl, DEFAULT_AI_SETTINGS.baseUrl).replace(/\/+$/, ''),
    apiKey: asString(raw.apiKey, ''),
    allowRemote: raw.allowRemote === true,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const text = localStorage.getItem(AI_SETTINGS_KEY);
    if (!text) return { ...DEFAULT_AI_SETTINGS };
    return normalizeAiSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): AiSettings {
  const next = normalizeAiSettings(settings);
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式 / 无 localStorage 时只在内存里生效，不阻断使用（D5）
  }
  return next;
}

function isLoopback(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url + '/');
}

/** Ollama 指向本机回环地址也算本地；openai 通道默认视为把数据发到本机之外。 */
export function isLocalProvider(settings: AiSettings): boolean {
  if (settings.provider === 'builtin') return true;
  if (settings.provider === 'ollama') return isLoopback(settings.baseUrl);
  return false;
}

/** 设置页/界面用的一句话说明：数据是否离开本机。 */
export function providerPrivacyText(settings: AiSettings): string {
  if (settings.provider === 'builtin') return '完全离线：抽取、审查与报告都在本机规则引擎内完成，不发任何网络请求。';
  if (settings.provider === 'ollama' && isLocalProvider(settings)) {
    return '本地模型：仅访问本机 ' + settings.baseUrl + '，案情文本不出本机。';
  }
  return '远程模型：案情文本会发送到 ' + settings.baseUrl + '，请确认已获授权。';
}

export function requireRemotePermission(settings: AiSettings): void {
  if (isLocalProvider(settings)) return;
  if (!settings.allowRemote) {
    throw new Error('当前是纯本地模式：请先在「设置」里勾选允许远程模型并二次确认，或改用内置规则/Ollama。');
  }
}
