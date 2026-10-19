/**
 * 多假设命令（M7-1，Gate 0-2 唯一写入口）。
 * 文档里只有一份节点/关系；假设只改自己的立场表，支持度由纯函数现算。
 */
import type { Draft } from 'immer';
import type { CaseDoc, EvidenceStance, Hypothesis, HypothesisStance } from '../types';
import { newId } from '../lib/id';
import type { Command } from './types';

export interface AddHypothesisInput {
  /** 指定 id（自动构建假设时由调用方生成，便于同一批里引用） */
  id?: string;
  title: string;
  summary?: string;
  createdAt?: string;
  /** 一次带上的初始证据（M12 / K14b：自动构建的实体直接作为「支持」） */
  stances?: Array<{
    targetId: string;
    targetKind: HypothesisStance['targetKind'];
    stance: EvidenceStance;
    note?: string;
  }>;
}

export interface HypothesisPatch {
  title?: string;
  summary?: string | null;
  status?: Hypothesis['status'];
}

export function addHypothesis(input: AddHypothesisInput): Command {
  return {
    label: '新增假设',
    apply(draft) {
      const title = input.title.trim();
      if (!title) return;
      const hypothesis: Hypothesis = {
        id: input.id?.trim() || newId('hyp'),
        title,
        stances: [],
        status: 'active',
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      if (input.summary) hypothesis.summary = input.summary.trim();
      if (draft.hypotheses.some((item) => item.id === hypothesis.id)) return;
      for (const raw of input.stances ?? []) {
        if (!targetExists(draft, raw.targetId, raw.targetKind)) continue;
        const stance: HypothesisStance = {
          targetId: raw.targetId,
          targetKind: raw.targetKind,
          stance: raw.stance,
        };
        const note = (raw.note ?? '').trim();
        if (note) stance.note = note;
        hypothesis.stances.push(stance);
      }
      draft.hypotheses.push(hypothesis);
    },
  };
}

export function updateHypothesis(id: string, patch: HypothesisPatch): Command {
  return {
    label: '修改假设',
    apply(draft) {
      const hypothesis = draft.hypotheses.find((item) => item.id === id);
      if (!hypothesis) return;
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (title) hypothesis.title = title;
      }
      if (patch.summary !== undefined) {
        const summary = (patch.summary ?? '').trim();
        if (summary) hypothesis.summary = summary;
        else delete hypothesis.summary;
      }
      if (patch.status !== undefined) hypothesis.status = patch.status;
    },
  };
}

export function deleteHypothesis(id: string): Command {
  return {
    label: '删除假设',
    apply(draft) {
      const index = draft.hypotheses.findIndex((item) => item.id === id);
      if (index >= 0) draft.hypotheses.splice(index, 1);
    },
  };
}

export interface SetStanceInput {
  hypothesisId: string;
  targetId: string;
  targetKind: HypothesisStance['targetKind'];
  stance: EvidenceStance;
  note?: string;
}

function targetExists(draft: Draft<CaseDoc>, targetId: string, kind: HypothesisStance['targetKind']): boolean {
  if (kind === 'node') return draft.nodes.some((node) => node.id === targetId);
  if (kind === 'edge') return draft.edges.some((edge) => edge.id === targetId);
  return draft.assets.some((asset) => asset.id === targetId);
}

/** stance=null 表示撤销该证据在这个假设里的立场 */
export function setStance(input: SetStanceInput | null): Command {
  return {
    label: input && input.stance === 'refute' ? '标记反驳' : '标记支持',
    apply(draft) {
      if (!input) return;
      const hypothesis = draft.hypotheses.find((item) => item.id === input.hypothesisId);
      if (!hypothesis) return;
      if (!targetExists(draft, input.targetId, input.targetKind)) return;
      const existing = hypothesis.stances.find(
        (item) => item.targetId === input.targetId && item.targetKind === input.targetKind,
      );
      if (existing) {
        existing.stance = input.stance;
        if (input.note) existing.note = input.note.trim();
        else delete existing.note;
        return;
      }
      const stance: HypothesisStance = { targetId: input.targetId, targetKind: input.targetKind, stance: input.stance };
      if (input.note) stance.note = input.note.trim();
      hypothesis.stances.push(stance);
    },
  };
}

export function clearStance(hypothesisId: string, targetId: string, targetKind: HypothesisStance['targetKind']): Command {
  return {
    label: '清除证据立场',
    apply(draft) {
      const hypothesis = draft.hypotheses.find((item) => item.id === hypothesisId);
      if (!hypothesis) return;
      hypothesis.stances = hypothesis.stances.filter(
        (item) => !(item.targetId === targetId && item.targetKind === targetKind),
      );
    },
  };
}
