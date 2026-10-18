import type { CaseDoc } from '../types';
import { DocMigrateError, normalizeDoc } from './migrate';

export function toJson(doc: CaseDoc): string {
  return JSON.stringify(doc, null, 2);
}

export class JsonImportError extends Error {}

/**
 * 导入做结构校验：宁可报错也不让残缺数据进 store（Gate 0-2）。
 * 校验通过后交给 normalizeDoc 兜底补字段（M2-1：老文件 / 手写文件也能打开）。
 */
export function fromJson(text: string): CaseDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JsonImportError('JSON 解析失败：文件不是合法的 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new JsonImportError('JSON 根节点必须是对象');
  }
  const doc = parsed as Partial<CaseDoc>;
  if (typeof doc.meta !== 'object' || doc.meta === null) {
    throw new JsonImportError('缺少 meta 字段');
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new JsonImportError('缺少 nodes / edges 数组');
  }
  if (typeof doc.meta.title !== 'string' || typeof doc.meta.id !== 'string') {
    throw new JsonImportError('meta.title 或 meta.id 缺失');
  }
  try {
    const normalized = normalizeDoc(doc);
    normalized.meta.updatedAt = new Date().toISOString();
    return normalized;
  } catch (error) {
    if (error instanceof DocMigrateError) throw new JsonImportError(error.message);
    throw error;
  }
}
