import type { CaseDoc } from '../types';

export function toJson(doc: CaseDoc): string {
  return JSON.stringify(doc, null, 2);
}

export class JsonImportError extends Error {}

/** 导入做结构校验：宁可报错也不让残缺数据进 store（Gate 0-2）。 */
export function fromJson(text: string): CaseDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JsonImportError('JSON 解析失败：文件不是合法的 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
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
  const now = new Date().toISOString();
  return {
    meta: {
      id: doc.meta.id,
      title: doc.meta.title,
      caseNo: doc.meta.caseNo,
      createdAt: doc.meta.createdAt ?? now,
      updatedAt: now,
    },
    nodes: doc.nodes,
    edges: doc.edges,
    groups: Array.isArray(doc.groups) ? doc.groups : [],
    assets: Array.isArray(doc.assets) ? doc.assets : [],
    views: Array.isArray(doc.views) ? doc.views : [],
    settings: doc.settings ?? {
      theme: 'whiteboard',
      lineLegend: {
        solid: { label: '已证实', style: 'solid', color: '#6E6862' },
        dashed: { label: '推测', style: 'dashed', color: '#6E6862' },
        dotted: { label: '待核实', style: 'dotted', color: '#6E6862' },
      },
    },
  };
}
