/**
 * P5 矛盾检测 / 证据链审查 —— 确定性实现（零模型、可复现）。
 *
 * 只报「能指出具体实体与字段」的问题，不写泛泛而谈的建议；
 * 所有结论都是提示，不修改 Model（Gate 0-4）。
 */
import type { CaseDoc, CaseEdge, CaseNode } from '../types';
import type { AiConflict, ChainReviewItem, ConflictReport, ConflictSeverity } from '../services/ai/types';

export type ChainTemplateId = 'fraud' | 'theft' | 'general';

interface StageDef {
  stage: string;
  keywords: string[];
}

export const CHAIN_TEMPLATES: Record<ChainTemplateId, { label: string; stages: StageDef[] }> = {
  fraud: {
    label: '诈骗类',
    stages: [
      { stage: '接触 / 取得信任', keywords: ['认识', '联系', '接触', '自称', '介绍', '信任', 'KTV', '饭局'] },
      { stage: '虚构事实 / 诱骗', keywords: ['工程', '投资', '项目', '回报', '高息', '帮忙', '周转', '承诺'] },
      { stage: '资金转移', keywords: ['转账', '汇款', '现金', '银行卡', '账户', '支付', '取出'] },
      { stage: '占有 / 分赃', keywords: ['分赃', '挥霍', '取现', '提现', '消费', '赌博', '还款'] },
      { stage: '事后掩饰', keywords: ['删除', '销毁', '串供', '逃匿', '关机', '换号', '洗钱'] },
    ],
  },
  theft: {
    label: '盗窃类',
    stages: [
      { stage: '预谋', keywords: ['预谋', '踩点', '商量', '准备', '工具'] },
      { stage: '侵入 / 接近', keywords: ['进入', '撬', '翻墙', '入室', '潜入', '靠近'] },
      { stage: '取得财物', keywords: ['盗窃', '拿走', '盗走', '窃取', '财物', '现金'] },
      { stage: '处置 / 销赃', keywords: ['销赃', '变卖', '典当', '丢弃', '藏匿', '转移'] },
    ],
  },
  general: {
    label: '通用办案',
    stages: [
      { stage: '案发', keywords: ['案发', '发生', '报警', '报案', '发现'] },
      { stage: '行为', keywords: ['实施', '行为', '作案', '指使', '参与', '转账', '联系'] },
      { stage: '结果', keywords: ['损失', '后果', '死亡', '受伤', '交付', '收到', '到账'] },
      { stage: '证据', keywords: ['证据', '流水', '通话', '监控', '笔录', '鉴定'] },
    ],
  },
};

const SEVERITY_ORDER: Record<ConflictSeverity, number> = { high: 0, medium: 1, low: 2 };

function textOf(node: CaseNode): string {
  const fields = Object.values(node.fields).map((value) => String(value));
  return [node.title, ...(node.aliases ?? []), ...node.tags, ...fields, node.notes ?? ''].join(' ');
}

function connectedEdges(doc: CaseDoc, nodeId: string): CaseEdge[] {
  return doc.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

function hasEvidence(doc: CaseDoc, node: CaseNode): boolean {
  if ((node.attachments ?? []).length > 0) return true;
  const linked = connectedEdges(doc, node.id);
  if (linked.some((edge) => edge.style === 'solid' && (edge.evidenceIds ?? []).length > 0)) return true;
  // 直接连到证据实体也算有证据
  return linked.some((edge) => {
    const other = doc.nodes.find((item) => item.id === (edge.source === node.id ? edge.target : edge.source));
    return other?.type === 'evidence';
  });
}

function pushConflict(list: AiConflict[], conflict: AiConflict): void {
  const key = conflict.type + '|' + conflict.involvedIds.slice().sort().join(',') + '|' + conflict.title;
  if (list.some((item) => item.type + '|' + item.involvedIds.slice().sort().join(',') + '|' + item.title === key)) return;
  list.push(conflict);
}

function compareTime(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return left - right;
}

function checkTimeConflicts(doc: CaseDoc, out: AiConflict[]): void {
  for (const node of doc.nodes) {
    if (!node.time?.end) continue;
    if (compareTime(node.time.start, node.time.end) > 0) {
      pushConflict(out, {
        type: 'time_conflict',
        severity: 'high',
        title: '时间区间倒置：' + node.title,
        description: '开始时间 ' + node.time.start + ' 晚于结束时间 ' + node.time.end + '，同一条记录不可能同时成立。',
        involvedIds: [node.id],
        suggestion: '请核对「' + node.title + '」的起止时间，确认后修改其中一端。',
      });
    }
  }
  for (const edge of doc.edges) {
    if (!edge.time?.end) continue;
    if (compareTime(edge.time.start, edge.time.end) > 0) {
      pushConflict(out, {
        type: 'time_conflict',
        severity: 'medium',
        title: '关系时间区间倒置',
        description: '关系「' + (edge.label ?? edge.relType) + '」的起止时间顺序颠倒。',
        involvedIds: [edge.source, edge.target],
        suggestion: '请核对这条关系的起止时间。',
      });
    }
  }
}

function checkDuplicateIdentity(doc: CaseDoc, out: AiConflict[]): void {
  for (let i = 0; i < doc.nodes.length; i += 1) {
    for (let j = i + 1; j < doc.nodes.length; j += 1) {
      const a = doc.nodes[i];
      const b = doc.nodes[j];
      if (a.type !== b.type) continue;
      const aliasesA = a.aliases ?? [];
      const aliasesB = b.aliases ?? [];
      let reason = '';
      if (a.title === b.title) reason = '标题完全相同';
      else if (aliasesA.includes(b.title) || aliasesB.includes(a.title)) reason = '一个标题是另一个的别名';
      else if (aliasesA.some((alias) => aliasesB.includes(alias))) reason = '共享同一个别名';
      if (!reason) continue;
      pushConflict(out, {
        type: 'duplicate_identity',
        severity: 'medium',
        title: '可能是同一实体：' + a.title + ' / ' + b.title,
        description: '两张' + (a.type === 'person' ? '人物' : '同类') + '卡片' + reason + '，可能重复建档。',
        involvedIds: [a.id, b.id],
        suggestion: '请确认是否为同一人/同一对象；如果是，合并卡片并保留别名。',
      });
    }
  }
}

function checkUnsupportedClaims(doc: CaseDoc, out: AiConflict[]): void {
  for (const node of doc.nodes) {
    if (node.status !== 'confirmed') continue;
    if (hasEvidence(doc, node)) continue;
    pushConflict(out, {
      type: 'unsupported_claim',
      severity: 'high',
      title: '无证据的已证实断言：' + node.title,
      description: '「' + node.title + '」状态为已证实，但没有关联证据实体、附件或带证据编号的实线关系。',
      involvedIds: [node.id],
      suggestion: '请补充证据，或把「' + node.title + '」改回核查中/待核实。',
    });
  }
}

function checkContradictions(doc: CaseDoc, out: AiConflict[]): void {
  const byPair = new Map<string, CaseEdge[]>();
  for (const edge of doc.edges) {
    if (edge.source === edge.target) continue;
    const key = [edge.source, edge.target].sort().join('|');
    const list = byPair.get(key) ?? [];
    list.push(edge);
    byPair.set(key, list);
  }
  for (const [key, edges] of byPair) {
    const solid = edges.filter((edge) => edge.style === 'solid');
    const weak = edges.filter((edge) => edge.style !== 'solid');
    if (solid.length === 0 || weak.length === 0) continue;
    const [a, b] = key.split('|');
    const titleA = doc.nodes.find((node) => node.id === a)?.title ?? a;
    const titleB = doc.nodes.find((node) => node.id === b)?.title ?? b;
    pushConflict(out, {
      type: 'contradiction',
      severity: 'high',
      title: '同一对实体既有实线又有推测线：' + titleA + ' / ' + titleB,
      description:
        '实线关系「' + solid.map((edge) => edge.label ?? edge.relType).join('、') +
        '」与推测关系「' + weak.map((edge) => edge.label ?? edge.relType).join('、') +
        '」同时存在，需要确认是同一件事还是两件事。',
      involvedIds: [a, b],
      suggestion: '请确认这组关系的证据状态：有证据的留实线，推测的改回虚线并降低置信度。',
    });
  }
}

function reviewChain(doc: CaseDoc, template: ChainTemplateId): ChainReviewItem[] {
  const stages = CHAIN_TEMPLATES[template].stages;
  const result: ChainReviewItem[] = [];
  for (const stage of stages) {
    const matched = doc.nodes.filter((node) => stage.keywords.some((keyword) => textOf(node).includes(keyword)));
    const evidenceIds = matched.filter((node) => node.type === 'evidence').map((node) => node.id);
    let status: ChainReviewItem['status'] = 'missing';
    let note = '缺少与该阶段对应的实体、关系或证据。';
    if (matched.length > 0) {
      const backed = matched.some((node) => node.type === 'evidence' || hasEvidence(doc, node));
      status = backed ? 'covered' : 'weak';
      note = backed
        ? '已找到 ' + matched.length + ' 个相关实体/证据：' + matched.slice(0, 3).map((node) => node.title).join('、')
        : '仅有口头/推测材料（' + matched.slice(0, 3).map((node) => node.title).join('、') + '），缺少书证。';
    }
    result.push({ stage: stage.stage, status, evidenceIds, note });
  }
  return result;
}

/** 主入口：确定性输出（同样输入必得同样报告）。 */
export function analyzeConflicts(doc: CaseDoc, options?: { template?: ChainTemplateId }): ConflictReport {
  const template = options?.template ?? 'general';
  const conflicts: AiConflict[] = [];
  checkTimeConflicts(doc, conflicts);
  checkDuplicateIdentity(doc, conflicts);
  checkUnsupportedClaims(doc, conflicts);
  checkContradictions(doc, conflicts);

  const chainReview = reviewChain(doc, template);
  conflicts.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  const nextSteps: string[] = [];
  for (const conflict of conflicts) {
    if (nextSteps.length >= 5) break;
    if (!nextSteps.includes(conflict.suggestion)) nextSteps.push(conflict.suggestion);
  }
  for (const item of chainReview) {
    if (nextSteps.length >= 5) break;
    if (item.status !== 'missing') continue;
    const question = '「' + item.stage + '」阶段缺少材料，能否补充对应的证据或陈述？';
    if (!nextSteps.includes(question)) nextSteps.push(question);
  }
  if (nextSteps.length === 0) nextSteps.push('当前没有发现明显矛盾，建议继续补充证据并核对未决线索。');

  return { conflicts, chainReview, nextSteps };
}
