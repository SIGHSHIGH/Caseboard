/**
 * 远程模型通道：Ollama（/api/chat）与 OpenAI 兼容（/chat/completions）。
 * 远程调用前置：D 设置里 allowRemote 为 true；内置规则通道不经过此文件（零网络，验收 5）。
 */
import { requireRemotePermission } from './settings';
import { SYSTEM_PROMPTS } from './prompts';
import type { AiSettings, AiTask } from './types';

export interface AiReply {
  text: string;
  model: string;
  local: boolean;
}

export const AI_TIMEOUT_MS = 90_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function contentOf(data: unknown, provider: 'ollama' | 'openai'): string {
  if (!data || typeof data !== 'object') throw new Error('模型返回的不是 JSON 对象');
  const record = data as Record<string, unknown>;
  if (provider === 'ollama') {
    const message = record.message;
    if (message && typeof message === 'object') {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string') return content;
    }
    throw new Error('Ollama 返回缺少 message.content');
  }
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string') return content;
      }
    }
  }
  throw new Error('OpenAI 兼容接口返回缺少 choices[0].message.content');
}

export async function requestRemote(settings: AiSettings, task: AiTask, user: string): Promise<AiReply> {
  requireRemotePermission(settings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const url = settings.provider === 'ollama' ? settings.baseUrl + '/api/chat' : settings.baseUrl + '/chat/completions';
  const body = settings.provider === 'ollama'
    ? {
        model: settings.model,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[task] },
          { role: 'user', content: user },
        ],
      }
    : {
        model: settings.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[task] },
          { role: 'user', content: user },
        ],
      };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.provider === 'openai' && settings.apiKey.trim().length > 0) {
    headers.Authorization = 'Bearer ' + settings.apiKey.trim();
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error('模型请求失败（HTTP ' + response.status + '）：' + raw.slice(0, 200));
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('模型返回的不是 JSON：' + raw.slice(0, 120));
    }
    return {
      text: contentOf(data, settings.provider === 'ollama' ? 'ollama' : 'openai'),
      model: settings.model,
      local: settings.provider === 'ollama',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('模型请求超时（' + Math.round(AI_TIMEOUT_MS / 1000) + ' 秒），请检查本地模型是否在运行。');
    }
    throw new Error('模型请求失败：' + errorText(error));
  } finally {
    clearTimeout(timer);
  }
}
