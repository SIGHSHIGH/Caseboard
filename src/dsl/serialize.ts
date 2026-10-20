import { NODE_TEMPLATES, NODE_TYPE_ORDER } from '../lib/nodeTemplates';
import type { CaseDoc, CaseEdge, CaseNode, Group, LineStyle, TimeRange, View } from '../types';

/**
 * M3-1 序列化器：Document Model → DSL 文本。
 *
 * 三条硬要求（docs/MILESTONES.md §3 M3 验收 1）：
 * 1. **幂等**：同一个 Model 连续序列化两次逐字节一致；与数组顺序无关（内部按类型 + id 排序）。
 * 2. **无副作用**：纯函数，不读 Date.now、不读随机数、不读全局状态。
 * 3. **只表达它该表达的**：DSL 覆盖实体 / 关系 / 组 / 视图（规格 §4 的语法面）；
 *    素材元数据、自由图片节点、评论、settings 不在文本视图里 —— 解析时按 id 增量合并，绝不整份覆盖（D20）。
 */

/** 可裸写的标量（时间、枚举）：不含空白、引号、斜杠、尖括号与线型符号。 */
const BARE_RE = /^[0-9A-Za-z:_][0-9A-Za-z:._+-]*$/;

export interface DslNameTable {
  /** 模型 id → 文本里的名字 */
  names: Map<string, string>;
  /** 文本里的名字 → 模型 id */
  reverse: Map<string, string>;
}

/**
 * 把 Model 的 id 映射成 DSL 标识符。
 * 只有「名字 != 原 id」时，块里才会补一行 `id: "原 id"`，保证往返不丢身份（M3-3 diff 靠它对齐）。
 */
export function createNameTable(ids: string[]): DslNameTable {
  const names = new Map<string, string>();
  const reverse = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    if (names.has(id)) continue;
    const base = sanitizeIdent(id);
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = base + '_' + n;
      n += 1;
    }
    names.set(id, candidate);
    reverse.set(candidate, id);
    used.add(candidate);
  }
  return { names, reverse };
}

/** 文本视图里需要具名的对象：实体与组（边的身份用块内 id 表达）。 */
export function dslNameTable(doc: CaseDoc): DslNameTable {
  return createNameTable([...doc.nodes.map((node) => node.id), ...doc.groups.map((group) => group.id)]);
}

/**
 * id → 标识符。允许中文（语法里 ident 也接受 CJK，与属性面板的中文字段名一致）；
 * 其它字符（-、空格、点等）替换成下划线，数字开头补 n_ 前缀。
 */
function sanitizeIdent(id: string): string {
  let out = id.replace(/[^A-Za-z0-9_\u4e00-\u9fa5]/g, '_');
  if (out.length === 0) out = 'n';
  if (!/^[A-Za-z_\u4e00-\u9fa5]/.test(out)) out = 'n_' + out;
  return out;
}

function num(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) return '0';
  return String(value);
}

/** 字符串一律走 JSON 规则（双引号 + 转义），中文原样保留；解析端只实现这一套转义。 */
function quoteString(value: string): string {
  return JSON.stringify(value);
}

function bareOrQuoted(value: string): string {
  return BARE_RE.test(value) ? value : quoteString(value);
}

function timeLiteral(time: TimeRange): string {
  const start = time.start.trim();
  const end = time.end?.trim();
  if (!end) return bareOrQuoted(start);
  const joined = start + '/' + end;
  // 区间用 / 连接；任一端本身带 / 时整体加引号，避免解析成三段
  if (BARE_RE.test(start) && BARE_RE.test(end)) return start + '/' + end;
  return quoteString(joined);
}

/** 字段名：中文、字母开头可裸写；含空格 / 冒号 / 引号才加引号。 */
function fieldKey(key: string): string {
  return /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*$/.test(key) ? key : quoteString(key);
}

function fieldLiteral(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return num(value);
  return quoteString(value);
}

function isEmptyFieldValue(value: string | number | boolean | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return typeof value === 'string' && value.trim().length === 0;
}

function presentFields(node: CaseNode): Array<[string, string | number | boolean]> {
  const template = NODE_TEMPLATES[node.type];
  const known = new Set(template.fields.map((field) => field.key));
  const out: Array<[string, string | number | boolean]> = [];
  for (const field of template.fields) {
    const value = node.fields[field.key];
    if (value === undefined || isEmptyFieldValue(value)) continue;
    out.push([field.key, value]);
  }
  // 模板外的自定义字段排在后面，按键码位排序（保证幂等）
  const extras = Object.keys(node.fields)
    .filter((key) => !known.has(key))
    .filter((key) => !isEmptyFieldValue(node.fields[key]))
    .sort();
  for (const key of extras) out.push([key, node.fields[key]]);
  return out;
}

function arrowFor(style: LineStyle, label?: string): string {
  const raw = (label ?? '').replace(/[\r\n]+/g, ' ').trim();
  const text = raw.length === 0 ? '' : /[-.>]/.test(raw) ? quoteString(raw) : raw;
  if (style === 'dashed') return '-.' + text + '.->';
  if (style === 'dotted') return '..' + text + '..>';
  return '--' + text + '-->';
}

function idLine(originalId: string, name: string): string[] {
  return name === originalId ? [] : ['    id: ' + quoteString(originalId)];
}

function nodeBlock(node: CaseNode, table: DslNameTable): string[] {
  const name = table.names.get(node.id) ?? sanitizeIdent(node.id);
  const lines: string[] = [];
  lines.push('  ' + node.type + ' ' + name + ' ' + quoteString(node.title) + ' {');
  lines.push('    at(' + num(node.x) + ', ' + num(node.y) + ')');
  lines.push('    size(' + num(node.w) + ', ' + num(node.h) + ')');
  lines.push('    status: ' + node.status);
  lines.push('    confidence: ' + num(node.confidence));
  lines.push(...idLine(node.id, name));
  if (node.tags.length > 0) lines.push('    tags: [' + node.tags.map((tag) => quoteString(tag)).join(', ') + ']');
  if (node.aliases && node.aliases.length > 0) {
    lines.push('    aliases: [' + node.aliases.map((alias) => quoteString(alias)).join(', ') + ']');
  }
  if (node.time) lines.push('    time: ' + timeLiteral(node.time));
  const fields = presentFields(node);
  if (fields.length > 0) {
    lines.push('    fields: { ' + fields.map(([key, value]) => fieldKey(key) + ': ' + fieldLiteral(value)).join(', ') + ' }');
  }
  if (node.photo) lines.push('    photo: ' + quoteString(node.photo));
  if (node.attachments.length > 0) {
    lines.push('    attachments: [' + node.attachments.map((id) => quoteString(id)).join(', ') + ']');
  }
  if (node.notes && node.notes.trim().length > 0) lines.push('    notes: ' + quoteString(node.notes));
  if (node.collapsed) lines.push('    collapsed: true');
  lines.push('  }');
  return lines;
}

function ref(id: string, table: DslNameTable): string {
  return table.names.get(id) ?? quoteString(id);
}

function edgeBlock(edge: CaseEdge, table: DslNameTable): string[] {
  const lines: string[] = [];
  const head = '  ' + ref(edge.source, table) + ' ' + arrowFor(edge.style, edge.label) + ' ' + ref(edge.target, table) + ' {';
  lines.push(head);
  lines.push('    id: ' + quoteString(edge.id));
  lines.push('    rel: ' + bareOrQuoted(edge.relType));
  lines.push('    style: ' + edge.style);
  if (!edge.directed) lines.push('    directed: false');
  if (edge.weight !== undefined) lines.push('    weight: ' + num(edge.weight));
  if (edge.thickness !== undefined) lines.push('    thickness: ' + num(edge.thickness));
  if (edge.time) lines.push('    time: ' + timeLiteral(edge.time));
  if (edge.evidenceIds.length > 0) {
    lines.push('    evidence: [' + edge.evidenceIds.map((id) => quoteString(id)).join(', ') + ']');
  }
  lines.push('    confidence: ' + num(edge.confidence));
  if (edge.color) lines.push('    color: ' + quoteString(edge.color));
  if (edge.path !== 'bezier') lines.push('    path: ' + edge.path);
  if (edge.notes && edge.notes.trim().length > 0) lines.push('    notes: ' + quoteString(edge.notes));
  if (edge.scenario && Object.keys(edge.scenario).length > 0) lines.push('    scenario: ' + stableJson(edge.scenario));
  lines.push('  }');
  return lines;
}

function groupBlock(group: Group, doc: CaseDoc, table: DslNameTable): string[] {
  const name = table.names.get(group.id) ?? sanitizeIdent(group.id);
  const lines: string[] = [];
  lines.push('  group ' + name + ' ' + quoteString(group.title) + ' color=' + quoteString(group.color) + ' {');
  lines.push('    at(' + num(group.bounds.x) + ', ' + num(group.bounds.y) + ')');
  lines.push('    size(' + num(group.bounds.w) + ', ' + num(group.bounds.h) + ')');
  lines.push(...idLine(group.id, name));
  const members = doc.nodes.filter((node) => node.groupId === group.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (members.length > 0) lines.push('    nodes: [' + members.map((node) => ref(node.id, table)).join(', ') + ']');
  if (group.parentId) lines.push('    parent: ' + ref(group.parentId, table));
  if (group.collapsed) lines.push('    collapsed: true');
  if (group.opacity !== undefined) lines.push('    opacity: ' + num(group.opacity));
  lines.push('  }');
  return lines;
}

function viewBlock(view: View): string[] {
  const lines: string[] = [];
  lines.push('  view ' + view.kind + ' ' + quoteString(view.name) + ' {');
  lines.push('    id: ' + quoteString(view.id));
  if (view.camera) {
    lines.push('    camera: ' + num(view.camera.x) + ', ' + num(view.camera.y) + ', ' + num(view.camera.zoom));
  }
  if (Object.keys(view.filters).length > 0) lines.push('    filters: ' + stableJson(view.filters));
  if (view.steps && view.steps.length > 0) lines.push('    steps: ' + stableJson(view.steps));
  lines.push('  }');
  return lines;
}

/** 稳定 JSON：对象键排序、无多余空格；用于 filters / steps / scenario 这类自由结构。 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const prim = JSON.stringify(value);
    return prim === undefined ? 'null' : prim;
  }
  if (Array.isArray(value)) return '[' + value.map((item) => stableJson(item)).join(',') + ']';
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return '{' + keys.map((key) => quoteString(key) + ':' + stableJson(record[key])).join(',') + '}';
}

function typeOrderIndex(type: CaseNode['type']): number {
  const index = NODE_TYPE_ORDER.indexOf(type);
  return index < 0 ? NODE_TYPE_ORDER.length : index;
}

/** Model → DSL 文本。纯函数：同一份 Model 任意次数调用都输出逐字节一致的结果。 */
export function serializeDoc(doc: CaseDoc): string {
  const table = dslNameTable(doc);
  const nodes = [...doc.nodes].sort((a, b) => {
    const byType = typeOrderIndex(a.type) - typeOrderIndex(b.type);
    if (byType !== 0) return byType;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const edges = [...doc.edges].sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    if (a.target !== b.target) return a.target < b.target ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const groups = [...doc.groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const views = [...doc.views].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const lines: string[] = [];
  lines.push('// 案情板 CaseBoard · 文本视图');
  lines.push('// 线型即语义：--实线（已证实）-->  -.虚线（推测）.->  ..点线（待核实）..>');
  const header = 'case ' + quoteString(doc.meta.title) + (doc.meta.caseNo ? ' caseNo ' + quoteString(doc.meta.caseNo) : '') + ' {';
  lines.push(header);
  lines.push('');

  if (nodes.length > 0) {
    lines.push('  // ===== 实体 =====');
    for (const node of nodes) {
      lines.push(...nodeBlock(node, table));
      lines.push('');
    }
  }
  if (groups.length > 0) {
    lines.push('  // ===== 组 =====');
    for (const group of groups) {
      lines.push(...groupBlock(group, doc, table));
      lines.push('');
    }
  }
  if (edges.length > 0) {
    lines.push('  // ===== 关系 =====');
    for (const edge of edges) {
      lines.push(...edgeBlock(edge, table));
      lines.push('');
    }
  }
  if (views.length > 0) {
    lines.push('  // ===== 视图 =====');
    for (const view of views) {
      lines.push(...viewBlock(view));
      lines.push('');
    }
  }
  // 末尾去掉多余空行，保证固定结尾（幂等比较依赖它）
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  lines.push('}');
  return lines.join('\n') + '\n';
}
