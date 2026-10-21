/**
 * 全局搜索（M8 验收 6）：实体标题/别名/标签/字段/备注/附件名，关系标签/备注，分组名，素材编号/OCR 文本。
 * 纯函数、无 DOM：命令面板、自检与后续索引共用同一套命中规则（防两套真相）。
 */
import type { CaseDoc } from '../types';

export type SearchKind = 'node' | 'edge' | 'group' | 'asset';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** 命中的字段名（用于界面提示「命中：备注」） */
  field: string;
  snippet: string;
  score: number;
  /** 命中后该选中的画布实体：关系给源节点、素材给挂载它的图片节点 */
  focusId?: string;
}

export const KIND_LABEL: Record<SearchKind, string> = { node: '实体', edge: '关系', group: '分组', asset: '素材' };
const KIND_ORDER: Record<SearchKind, number> = { node: 0, edge: 1, asset: 2, group: 3 };
const SNIPPET_PAD = 16;

export function searchKindLabel(kind: SearchKind): string {
  return KIND_LABEL[kind];
}

interface Field {
  name: string;
  value: string;
}

interface Candidate {
  kind: SearchKind;
  id: string;
  title: string;
  focusId?: string;
  fields: Field[];
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function fieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => textOf(item)).join(' ');
  return textOf(value);
}

function collect(doc: CaseDoc): Candidate[] {
  const out: Candidate[] = [];
  const imageNodeOf = new Map<string, string>();
  for (const node of doc.imageNodes) imageNodeOf.set(node.assetId, node.id);
  for (const node of doc.nodes) {
    const fields: Field[] = [{ name: '标题', value: node.title }];
    const aliases = node.aliases ?? [];
    if (aliases.length > 0) fields.push({ name: '别名', value: aliases.join(' ') });
    if (node.tags.length > 0) fields.push({ name: '标签', value: node.tags.join(' ') });
    for (const [key, value] of Object.entries(node.fields)) {
      const text = fieldValue(value);
      if (text) fields.push({ name: '字段 ' + key, value: text });
    }
    if (node.notes) fields.push({ name: '备注', value: node.notes });
    if (node.attachments.length > 0) fields.push({ name: '附件', value: node.attachments.join(' ') });
    if (node.photo) fields.push({ name: '照片', value: node.photo });
    out.push({ kind: 'node', id: node.id, title: node.title, focusId: node.id, fields });
  }
  const titleOf = new Map<string, string>();
  for (const node of doc.nodes) titleOf.set(node.id, node.title);
  for (const edge of doc.edges) {
    const from = titleOf.get(edge.source) ?? edge.source;
    const to = titleOf.get(edge.target) ?? edge.target;
    const fields: Field[] = [
      { name: '关系', value: edge.relType + ' ' + (edge.label ?? '') },
      { name: '两端', value: from + ' ' + to },
    ];
    if (edge.notes) fields.push({ name: '备注', value: edge.notes });
    out.push({ kind: 'edge', id: edge.id, title: from + ' → ' + to, focusId: edge.source, fields });
  }
  for (const group of doc.groups) {
    out.push({ kind: 'group', id: group.id, title: group.title, fields: [{ name: '分组', value: group.title }] });
  }
  for (const asset of doc.assets) {
    const fields: Field[] = [
      { name: '名称', value: asset.name ?? asset.id },
      { name: '编号', value: asset.no ?? '' },
    ];
    if (asset.sourceLabel) fields.push({ name: '来源', value: asset.sourceLabel });
    if (asset.ocrText) fields.push({ name: 'OCR 文本', value: asset.ocrText });
    out.push({ kind: 'asset', id: asset.id, title: asset.name ?? asset.no ?? asset.id, focusId: imageNodeOf.get(asset.id), fields });
  }
  return out;
}

function snippetOf(value: string, token: string): string {
  const index = value.toLowerCase().indexOf(token);
  if (index < 0) return value.slice(0, SNIPPET_PAD * 2);
  const start = Math.max(0, index - SNIPPET_PAD);
  const end = Math.min(value.length, index + token.length + SNIPPET_PAD);
  return (start > 0 ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

/** 多关键词按 AND 命中；标题命中权重最高，其次别名/编号，其余字段最低。 */
export function searchDoc(doc: CaseDoc, query: string, limit = 30): SearchHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const candidate of collect(doc)) {
    const haystack = candidate.fields.map((field) => field.value.toLowerCase()).join(' ');
    if (!tokens.every((token) => haystack.includes(token))) continue;
    let score = 0;
    let matchedField = candidate.fields.find((field) => field.value.toLowerCase().includes(tokens[0])) ?? candidate.fields[0];
    for (const token of tokens) {
      const title = candidate.title.toLowerCase();
      if (title === token) score += 40;
      else if (title.startsWith(token)) score += 24;
      else if (title.includes(token)) score += 14;
      for (const field of candidate.fields) {
        if (!field.value.toLowerCase().includes(token)) continue;
        const weight = field.name === '标题' ? 12 : field.name === '别名' || field.name === '编号' ? 8 : 3;
        score += weight;
      }
    }
    hits.push({
      kind: candidate.kind,
      id: candidate.id,
      title: candidate.title,
      focusId: candidate.focusId,
      score,
      field: matchedField.name,
      snippet: snippetOf(matchedField.value, tokens[0]),
    });
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.title.localeCompare(b.title, 'zh-CN');
  });
  return hits.slice(0, Math.max(1, limit));
}
