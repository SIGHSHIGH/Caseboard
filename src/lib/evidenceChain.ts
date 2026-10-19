/**
 * 证据链六阶段（M7-2，纯函数）：动机 → 预谋 → 准备 → 实施 → 逃离 → 销赃。
 * 与 M6 的 fraud/theft/general 审查模板不同：这里按固定六阶段纵向排列，
 * 并标出缺材料的断点（验收要求「自动标断点」）。
 */

import type { CaseDoc, CaseNode, ChainStageId } from '../types';

/** 阶段 id 定义在 types（M12 / K14c）：自定义链要跟着持久化，纯库只是复用 */
export type { ChainStageId } from '../types';

export interface ChainStageDef {
  id: ChainStageId;
  label: string;
  hint: string;
  keywords: string[];
}

export const CHAIN6_STAGES: ChainStageDef[] = [
  { id: 'motive', label: '动机', hint: '图财、报复、纠纷等动因', keywords: ['动机', '图财', '谋财', '欠债', '债务', '报复', '纠纷', '感情', '怀恨', '急需'] },
  { id: 'plan', label: '预谋', hint: '商量、踩点、计划', keywords: ['预谋', '密谋', '商量', '合谋', '计划', '踩点', '策划', '约定'] },
  { id: 'prepare', label: '准备', hint: '工具、账户、车辆、假身份', keywords: ['准备', '购买', '购置', '租车', '开户', '办卡', '银行卡', '工具', '假身份', '伪造', '事先'] },
  { id: 'act', label: '实施', hint: '接触、威胁、转账、取得财物', keywords: ['实施', '威胁', '殴打', '持刀', '强迫', '骗取', '转账', '汇款', '取现', '取得', '作案', '侵入'] },
  { id: 'escape', label: '逃离', hint: '离开现场、潜逃、躲避', keywords: ['逃离', '逃跑', '潜逃', '逃逸', '离开', '躲避', '藏匿', '出境'] },
  { id: 'launder', label: '销赃', hint: '变现、洗钱、分赃、挥霍', keywords: ['销赃', '变现', '洗钱', '分赃', '挥霍', '转移资金', '套现', '转卖'] },
];

export interface ChainItem {
  nodeId: string;
  title: string;
  type: CaseNode['type'];
  evidenceIds: string[];
  /** 无任何证据支撑的阶段条目（虚线标注） */
  weak: boolean;
}

export interface ChainStage {
  id: ChainStageId;
  label: string;
  hint: string;
  items: ChainItem[];
  /** 该阶段没有任何材料 → 断点 */
  missing: boolean;
}

export interface EvidenceChain {
  stages: ChainStage[];
  gaps: ChainStageId[];
  covered: number;
  total: number;
  coverage: number;
}

function haystack(node: CaseNode): string {
  const fields = node.fields
    ? Object.keys(node.fields)
        .map((key) => key + ' ' + String(node.fields[key]))
        .join(' ')
    : '';
  return [node.title, fields, (node.tags ?? []).join(' '), node.notes ?? '', (node.aliases ?? []).join(' ')].join(' ').toLowerCase();
}

/** M11（J11）：人工把实体归入某个阶段时写在节点字段里的键 */
export const CHAIN_STAGE_FIELD = '链条阶段';

/** 节点被人工归入的阶段（没有则 null） */
export function manualStage(node: CaseNode): ChainStageId | null {
  const raw = node.fields?.[CHAIN_STAGE_FIELD];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const found = CHAIN6_STAGES.find((def) => def.label === raw || def.id === raw);
  return found ? found.id : null;
}

/** 把实体归入某个阶段（写字段）后的新 fields；stageId 为 null 表示移出 */
export function stageFields(fields: Record<string, string | number | boolean>, stageId: ChainStageId | null): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = { ...fields };
  if (stageId === null) {
    delete next[CHAIN_STAGE_FIELD];
    return next;
  }
  const def = CHAIN6_STAGES.find((item) => item.id === stageId);
  next[CHAIN_STAGE_FIELD] = def ? def.label : stageId;
  return next;
}

function evidenceIdsOf(doc: CaseDoc, nodeId: string): string[] {
  const ids = new Set<string>();
  for (const edge of doc.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    for (const id of edge.evidenceIds ?? []) ids.add(id);
  }
  const node = doc.nodes.find((item) => item.id === nodeId);
  for (const attachment of node?.attachments ?? []) {
    if (attachment) ids.add(attachment);
  }
  return [...ids].sort();
}

function matches(node: CaseNode, def: ChainStageDef): boolean {
  // M11（J11）：人工归入的阶段优先，关键词只当自动建议
  const manual = manualStage(node);
  if (manual) return manual === def.id;
  const text = haystack(node);
  return def.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function buildEvidenceChain(doc: CaseDoc): EvidenceChain {
  const stages: ChainStage[] = CHAIN6_STAGES.map((def) => {
    const items = doc.nodes
      .filter((node) => node.type !== 'evidence' && matches(node, def))
      .map((node) => {
        const evidenceIds = evidenceIdsOf(doc, node.id);
        return { nodeId: node.id, title: node.title, type: node.type, evidenceIds, weak: evidenceIds.length === 0 };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    return { id: def.id, label: def.label, hint: def.hint, items, missing: items.length === 0 };
  });
  const gaps = stages.filter((stage) => stage.missing).map((stage) => stage.id);
  const covered = stages.length - gaps.length;
  const total = stages.length;
  return { stages, gaps, covered, total, coverage: Math.round((covered / total) * 100) };
}

/** 素材/证据节点只作为链条的支撑物，不参与阶段归类；面板用它显示「可用证据数」 */
export function evidencePool(doc: CaseDoc): string[] {
  return doc.nodes.filter((node) => node.type === 'evidence').map((node) => node.id).sort();
}
