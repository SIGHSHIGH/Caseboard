/**
 * P7 情况分析报告（Markdown）—— 每条事实句都必须带引用。
 *
 * 引用格式（与规格一致）：
 * - 「[证据:<id>]」指向证据实体或素材
 * - 「[节点:<id>]」指向普通实体 / 关系两端
 * 没有来源的判断一律不写；推测关系标注「（待核实）」。
 */
import type { CaseDoc, CaseEdge, CaseNode, LineStyle } from '../types';
import { analyzeConflicts, type ChainTemplateId } from './contradictions';
import type { ConflictReport } from '../services/ai/types';
import { STATUS_META } from './theme';

const TYPE_LABEL: Record<CaseNode['type'], string> = {
  person: '人物',
  org: '机构',
  place: '地点',
  item: '物品',
  event: '事件',
  evidence: '证据',
  time: '时间',
  note: '便签',
  relation: '关系',
};

const STYLE_LABEL: Record<LineStyle, string> = {
  solid: '已证实',
  dashed: '推测',
  dotted: '待核实',
};

export interface ReportOptions {
  template?: ChainTemplateId;
  unresolved?: string[];
  /** 显式传入报告生成时间，便于测试确定性；缺省取 doc.meta.updatedAt */
  generatedAt?: string;
  conflicts?: ConflictReport;
}

export interface ReportResult {
  title: string;
  markdown: string;
  /** 引用数（[证据:]/[节点:] 出现次数），供验收断言 */
  citations: number;
  sections: number;
}

function nodeRef(node: CaseNode): string {
  return node.type === 'evidence' ? '[证据:' + node.id + ']' : '[节点:' + node.id + ']';
}

function edgeRef(doc: CaseDoc, edge: CaseEdge): string {
  const source = doc.nodes.find((node) => node.id === edge.source);
  const target = doc.nodes.find((node) => node.id === edge.target);
  return (source ? nodeRef(source) : '[节点:' + edge.source + ']') + (target ? nodeRef(target) : '[节点:' + edge.target + ']');
}

function styleNote(style: LineStyle): string {
  return style === 'solid' ? '' : '（' + STYLE_LABEL[style] + '）';
}

function statusText(node: CaseNode): string {
  return STATUS_META[node.status]?.label ?? node.status;
}

function short(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function descriptionOf(node: CaseNode): string {
  const fieldText = Object.entries(node.fields)
    .filter(([key]) => key !== 'AI 依据')
    .slice(0, 3)
    .map(([key, value]) => key + '：' + String(value))
    .join('；');
  const notes = node.notes ? short(node.notes, 80) : '';
  return [fieldText, notes].filter(Boolean).join('；');
}

function timelineRows(doc: CaseDoc): Array<{ at: string; text: string }> {
  const rows: Array<{ at: string; text: string }> = [];
  for (const node of doc.nodes) {
    if (!node.time?.start) continue;
    rows.push({
      at: node.time.start,
      text: node.title + '（' + TYPE_LABEL[node.type] + '，' + statusText(node) + '）' + nodeRef(node),
    });
  }
  for (const edge of doc.edges) {
    if (!edge.time?.start) continue;
    const source = doc.nodes.find((node) => node.id === edge.source)?.title ?? edge.source;
    const target = doc.nodes.find((node) => node.id === edge.target)?.title ?? edge.target;
    rows.push({
      at: edge.time.start,
      text: source + ' —' + (edge.label ?? edge.relType) + '→ ' + target + '（关系）' + styleNote(edge.style) + edgeRef(doc, edge),
    });
  }
  return rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function evidenceRows(doc: CaseDoc): string[] {
  const rows: string[] = [];
  for (const node of doc.nodes) {
    if (node.type !== 'evidence') continue;
    rows.push('- 证据实体：' + node.title + '（' + statusText(node) + '）' + nodeRef(node));
  }
  for (const asset of doc.assets) {
    const label = asset.name ?? asset.no ?? asset.id;
    rows.push(
      '- 素材：' + label + '（' + (asset.kind === 'image' ? '图片' : asset.kind) + (asset.no ? '，编号 ' + asset.no : '') +
        (asset.hash ? '，SHA-256 ' + asset.hash.slice(0, 12) + '…' : '') + '）[证据:' + asset.id + ']',
    );
  }
  return rows;
}

export function buildReport(doc: CaseDoc, options: ReportOptions = {}): ReportResult {
  const conflicts = options.conflicts ?? analyzeConflicts(doc, { template: options.template });
  const generatedAt = options.generatedAt ?? doc.meta.updatedAt;
  const title = doc.meta.title + ' · 情况分析报告';
  const lines: string[] = [];

  lines.push('# ' + title, '');
  lines.push(
    '> 案件编号：' + (doc.meta.caseNo || '未编号') + ' ｜ 报告时间：' + generatedAt +
      ' ｜ 引用格式：[节点:id] 实体 / [证据:id] 证据',
    '',
  );

  lines.push('## 一、案件概况', '');
  const confirmed = doc.nodes.filter((node) => node.status === 'confirmed').length;
  const checking = doc.nodes.filter((node) => node.status === 'checking').length;
  const todo = doc.nodes.filter((node) => node.status === 'todo').length;
  lines.push('- 统计：实体 ' + doc.nodes.length + ' 个 · 关系 ' + doc.edges.length + ' 条 · 分组 ' + doc.groups.length + ' 个 · 素材 ' + doc.assets.length + ' 份');
  lines.push('- 状态分布：已证实 ' + confirmed + ' · 核查中 ' + checking + ' · 待核实 ' + todo);
  const timed = doc.nodes.filter((node) => node.time?.start).sort((a, b) => (a.time!.start < b.time!.start ? -1 : 1));
  if (timed.length > 0) {
    lines.push('- 时间跨度：' + timed[0].time!.start + ' 起，最晚 ' + timed[timed.length - 1].time!.start + '，共 ' + timed.length + ' 个带时间实体');
  }
  lines.push('');

  lines.push('## 二、人员与组织', '');
  const people = doc.nodes.filter((node) => node.type === 'person' || node.type === 'org');
  if (people.length === 0) {
    lines.push('- 暂未登记人员或组织。', '');
  } else {
    for (const node of people) {
      const detail = descriptionOf(node);
      lines.push(
        '- ' + node.title + '（' + TYPE_LABEL[node.type] + '，' + statusText(node) + '，置信度 ' + node.confidence + '%）' +
          (detail ? '：' + detail : '') + nodeRef(node),
      );
    }
    lines.push('');
  }

  lines.push('## 三、关系网络', '');
  if (doc.edges.length === 0) {
    lines.push('- 暂未登记关系。', '');
  } else {
    for (const edge of doc.edges) {
      const source = doc.nodes.find((node) => node.id === edge.source)?.title ?? edge.source;
      const target = doc.nodes.find((node) => node.id === edge.target)?.title ?? edge.target;
      const weight = edge.weight !== undefined ? '，权重 ' + edge.weight : '';
      lines.push(
        '- ' + source + ' —' + (edge.label ?? edge.relType) + (edge.directed ? '→ ' : '— ') + target +
          '（' + STYLE_LABEL[edge.style] + '，置信度 ' + edge.confidence + '%' + weight + '）' + edgeRef(doc, edge),
      );
    }
    lines.push('');
  }

  lines.push('## 四、时间线', '');
  const rows = timelineRows(doc);
  if (rows.length === 0) {
    lines.push('- 暂无可排序的时间信息。', '');
  } else {
    for (const row of rows) lines.push('- ' + row.at + '：' + row.text);
    lines.push('');
  }

  lines.push('## 五、证据清单', '');
  const evidence = evidenceRows(doc);
  if (evidence.length === 0) {
    lines.push('- 暂未登记证据。', '');
  } else {
    lines.push(...evidence, '');
  }

  lines.push('## 六、待核实事项', '');
  let pending = 0;
  for (const node of doc.nodes) {
    if (node.status === 'todo' || node.status === 'checking') {
      lines.push('- 「' + node.title + '」当前' + statusText(node) + '，需补充核查' + nodeRef(node));
      pending += 1;
    }
  }
  for (const edge of doc.edges) {
    if (edge.style !== 'solid') {
      lines.push('- 关系「' + (edge.label ?? edge.relType) + '」为' + STYLE_LABEL[edge.style] + '，尚无书面证据' + edgeRef(doc, edge));
      pending += 1;
    }
  }
  for (const item of options.unresolved ?? []) {
    lines.push('- ' + item);
    pending += 1;
  }
  if (pending === 0) lines.push('- 当前没有标记为待核实的事项。');
  lines.push('');

  lines.push('## 七、下一步建议', '');
  for (const item of conflicts.nextSteps) lines.push('- ' + item);
  lines.push('');

  const markdown = lines.join('\n');
  const citations = (markdown.match(/\[(证据|节点):/g) ?? []).length;
  return { title, markdown, citations, sections: 7 };
}

/** 供导出 Word/PDF 用的纯文本（去掉 Markdown 标记，保留引用）。 */
export function reportPlainLines(markdown: string): Array<{ kind: 'title' | 'heading' | 'bullet' | 'text'; text: string }> {
  const rows: Array<{ kind: 'title' | 'heading' | 'bullet' | 'text'; text: string }> = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) rows.push({ kind: 'title', text: line.slice(2) });
    else if (line.startsWith('## ')) rows.push({ kind: 'heading', text: line.slice(3) });
    else if (line.startsWith('- ')) rows.push({ kind: 'bullet', text: line.slice(2) });
    else if (line.startsWith('> ')) rows.push({ kind: 'text', text: line.replace(/^>\s*/, '') });
    else rows.push({ kind: 'text', text: line.replace(/^[#>*\s]+/, '') });
  }
  return rows;
}
