/**
 * 多假设（M7-1，纯函数，无 DOM）。
 *
 * 设计（D45）：文档只有一份——节点、关系、素材都共享；每个假设只记录
 * 「对某个证据/实体/关系的立场（支持或反驳）」。这样既满足「平行假设」，
 * 又不会把同一案件复制成多份互不同步的数据（Gate 0-1 单一数据源）。
 */

import type { Asset, CaseDoc, CaseEdge, CaseNode, EvidenceStance, Hypothesis } from '../types';
import { NODE_TYPE_META } from './theme';

export const STANCE_META: Record<EvidenceStance, { label: string; color: string; sign: number }> = {
  support: { label: '支持', color: '#2E7D64', sign: 1 },
  refute: { label: '反驳', color: '#C0392B', sign: -1 },
};

/** 反驳权重：同样置信度下，反驳比支持更能推翻一个假设 */
export const REFUTE_WEIGHT = 0.6;
export const STANCE_KINDS = ['node', 'edge', 'asset'] as const;
export type StanceTargetKind = (typeof STANCE_KINDS)[number];

export interface HypothesisScore {
  /** 支持证据的置信度之和 */
  support: number;
  /** 反驳证据的置信度之和 */
  refute: number;
  supportCount: number;
  refuteCount: number;
  /** 归一化支持度：-100（全被推翻）… +100（全支持），保留 1 位小数 */
  score: number;
}

export interface CompareCell {
  hypothesisId: string;
  stance: EvidenceStance | null;
  note?: string;
}

export interface CompareRow {
  targetId: string;
  targetKind: StanceTargetKind;
  label: string;
  cells: CompareCell[];
  /** 各假设立场不一致（有支持也有反驳） */
  divergent: boolean;
}

export interface HypothesisComparison {
  hypotheses: Hypothesis[];
  rows: CompareRow[];
  divergent: CompareRow[];
  ranking: Array<{ hypothesis: Hypothesis; score: HypothesisScore }>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function findTarget(doc: CaseDoc, targetId: string, kind: StanceTargetKind): CaseNode | CaseEdge | Asset | undefined {
  if (kind === 'node') return doc.nodes.find((node) => node.id === targetId);
  if (kind === 'edge') return doc.edges.find((edge) => edge.id === targetId);
  return doc.assets.find((asset) => asset.id === targetId);
}

/** 立场的证据权重：节点/关系用置信度，素材无置信度时按 60 计 */
export function targetWeight(doc: CaseDoc, targetId: string, kind: StanceTargetKind): number {
  const target = findTarget(doc, targetId, kind);
  if (!target) return 0;
  if (kind === 'asset') return 60;
  const confidence = (target as CaseNode | CaseEdge).confidence;
  return typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 50;
}

export function targetLabel(doc: CaseDoc, targetId: string, kind: StanceTargetKind): string {
  const target = findTarget(doc, targetId, kind);
  if (!target) return targetId;
  if (kind === 'node') {
    const node = target as CaseNode;
    const typeLabel = NODE_TYPE_META[node.type] ? NODE_TYPE_META[node.type].label : node.type;
    return typeLabel + ' · ' + node.title;
  }
  if (kind === 'edge') {
    const edge = target as CaseEdge;
    const source = doc.nodes.find((node) => node.id === edge.source);
    const targetNode = doc.nodes.find((node) => node.id === edge.target);
    const arrow = edge.directed ? '→' : '—';
    return (source ? source.title : edge.source) + ' ' + arrow + ' ' + (targetNode ? targetNode.title : edge.target) + '（' + (edge.label || edge.relType) + '）';
  }
  const asset = target as Asset;
  return '素材 · ' + (asset.name ? asset.name : asset.no ? asset.no : asset.id);
}

export function stanceOf(hypothesis: Hypothesis, targetId: string, kind: StanceTargetKind): EvidenceStance | null {
  const found = hypothesis.stances.find((stance) => stance.targetId === targetId && stance.targetKind === kind);
  return found ? found.stance : null;
}

/** 支持度计分：同一份文档 + 同一假设永远得到同一个分数（验收 1 的可复现口径） */
export function hypothesisScore(doc: CaseDoc, hypothesis: Hypothesis): HypothesisScore {
  let support = 0;
  let refute = 0;
  let supportCount = 0;
  let refuteCount = 0;
  for (const stance of hypothesis.stances) {
    const weight = targetWeight(doc, stance.targetId, stance.targetKind);
    if (weight <= 0) continue;
    if (stance.stance === 'refute') {
      refute += weight;
      refuteCount += 1;
    } else {
      support += weight;
      supportCount += 1;
    }
  }
  const total = support + refute * REFUTE_WEIGHT;
  const raw = total <= 0 ? 0 : ((support - refute * REFUTE_WEIGHT) / total) * 100;
  const score = round1(Math.max(-100, Math.min(100, raw)));
  return { support: round1(support), refute: round1(refute), supportCount, refuteCount, score };
}

export function rankHypotheses(doc: CaseDoc): Array<{ hypothesis: Hypothesis; score: HypothesisScore }> {
  return doc.hypotheses
    .filter((hypothesis) => hypothesis.status === 'active')
    .map((hypothesis) => ({ hypothesis, score: hypothesisScore(doc, hypothesis) }))
    .sort((a, b) => b.score.score - a.score.score || a.hypothesis.title.localeCompare(b.hypothesis.title, 'zh'));
}

/** 并排对比：同一证据在各假设里的立场（验收 1 的「差异」列） */
export function compareHypotheses(doc: CaseDoc): HypothesisComparison {
  const hypotheses = doc.hypotheses.filter((hypothesis) => hypothesis.status === 'active');
  const keys: Array<{ targetId: string; targetKind: StanceTargetKind }> = [];
  const seen = new Set<string>();
  for (const hypothesis of hypotheses) {
    for (const stance of hypothesis.stances) {
      const key = stance.targetKind + ':' + stance.targetId;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push({ targetId: stance.targetId, targetKind: stance.targetKind });
    }
  }
  const rows: CompareRow[] = keys.map(({ targetId, targetKind }) => {
    const cells: CompareCell[] = hypotheses.map((hypothesis) => {
      const found = hypothesis.stances.find((stance) => stance.targetId === targetId && stance.targetKind === targetKind);
      const cell: CompareCell = { hypothesisId: hypothesis.id, stance: found ? found.stance : null };
      if (found && found.note) cell.note = found.note;
      return cell;
    });
    const marked = cells.filter((cell) => cell.stance !== null);
    const divergent =
      marked.some((cell) => cell.stance === 'support') && marked.some((cell) => cell.stance === 'refute');
    return { targetId, targetKind, label: targetLabel(doc, targetId, targetKind), cells, divergent };
  });
  return {
    hypotheses,
    rows,
    divergent: rows.filter((row) => row.divergent),
    ranking: rankHypotheses(doc),
  };
}
