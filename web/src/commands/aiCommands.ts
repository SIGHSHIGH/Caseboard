import type { CaseEdge, CaseNode } from '../types';
import type { AiEdgeDraft, AiNodeDraft } from '../services/ai/types';
import { newId } from '../lib/id';
import { NODE_TYPE_META } from '../lib/theme';
import type { Command } from './types';

const NODE_W = 208;
const NODE_H = 96;
const GAP_X = 48;
const GAP_Y = 32;

export interface AcceptAiDraftsInput {
  nodes: AiNodeDraft[];
  edges: AiEdgeDraft[];
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 采纳 AI 草稿（Gate 0-4 的唯一落地口）：
 * 1) 只有用户点了「采纳」才会走到这里，一次 dispatch 生成整批修改；
 * 2) 能按标题/别名对上既有实体的一律合并，不重复建点；
 * 3) 新建实体一律 status='todo'，AI 永不直接把结论写成「已证实」；
 * 4) 新点排在既有内容右侧空白区，不压在现有卡片上。
 */
export function acceptAiDrafts(input: AcceptAiDraftsInput): Command {
  return {
    label: '采纳 AI 草稿：' + input.nodes.length + ' 实体 / ' + input.edges.length + ' 关系',
    apply(draft) {
      const byTitle = new Map<string, string>();
      for (const node of draft.nodes) {
        byTitle.set(node.title, node.id);
        for (const alias of node.aliases ?? []) byTitle.set(alias, node.id);
      }

      let right = 0;
      let top = Number.POSITIVE_INFINITY;
      for (const node of draft.nodes) {
        right = Math.max(right, node.x + node.w);
        top = Math.min(top, node.y);
      }
      if (!Number.isFinite(top)) top = 80;
      const startX = right > 0 ? right + GAP_X : 120;
      const startY = top;
      let cursor = 0;

      for (const incoming of input.nodes) {
        const existingId = byTitle.get(incoming.title);
        const existing = existingId ? draft.nodes.find((node) => node.id === existingId) : undefined;
        if (existing) {
          // 合并：只补空字段，绝不覆盖用户已经写好的内容
          for (const [key, value] of Object.entries(incoming.fields)) {
            if (existing.fields[key] === undefined) existing.fields[key] = value;
          }
          const aliases = existing.aliases ?? [];
          for (const alias of incoming.aliases) {
            if (!aliases.includes(alias)) aliases.push(alias);
          }
          existing.aliases = aliases;
          if (incoming.time && !existing.time) existing.time = incoming.time;
          existing.confidence = Math.max(existing.confidence, clampConfidence(incoming.confidence));
          if (!existing.fields['AI 依据']) existing.fields['AI 依据'] = incoming.evidenceQuote;
          byTitle.set(existing.title, existing.id);
          for (const alias of aliases) byTitle.set(alias, existing.id);
          continue;
        }

        const id = newId(incoming.type);
        const node: CaseNode = {
          id,
          type: incoming.type,
          title: incoming.title,
          x: startX + (cursor % 3) * (NODE_W + GAP_X),
          y: startY + Math.floor(cursor / 3) * (NODE_H + GAP_Y),
          w: NODE_W,
          h: NODE_H,
          fields: { ...incoming.fields, 'AI 依据': incoming.evidenceQuote },
          aliases: [...incoming.aliases],
          tags: [],
          status: 'todo',
          confidence: clampConfidence(incoming.confidence),
          attachments: [],
        };
        if (incoming.time) node.time = incoming.time;
        // AI 草稿里的 type 必须落在 8 类之内（类型系统已保证，这里防御脏数据）
        if (!NODE_TYPE_META[node.type]) node.type = 'note';
        draft.nodes.push(node);
        cursor += 1;
        byTitle.set(node.title, node.id);
        for (const alias of node.aliases ?? []) byTitle.set(alias, node.id);
      }

      for (const incoming of input.edges) {
        const source = byTitle.get(incoming.sourceTitle);
        const target = byTitle.get(incoming.targetTitle);
        if (!source || !target || source === target) continue;
        const same = draft.edges.find(
          (edge) => edge.source === source && edge.target === target && edge.relType === incoming.relType,
        );
        if (same) {
          // 同一条关系重复抽取：书证（solid）优先，置信度取高，重量取大
          if (incoming.style === 'solid' && same.style !== 'solid') same.style = 'solid';
          same.confidence = Math.max(same.confidence, clampConfidence(incoming.confidence));
          if (incoming.weight !== undefined) same.weight = Math.max(same.weight ?? 0, incoming.weight);
          if (!same.label && incoming.label) same.label = incoming.label;
          continue;
        }
        const edge: CaseEdge = {
          id: newId('edge'),
          source,
          target,
          path: 'bezier',
          relType: incoming.relType,
          directed: incoming.directed,
          style: incoming.style,
          confidence: clampConfidence(incoming.confidence),
          evidenceIds: [],
        };
        if (incoming.label) edge.label = incoming.label;
        if (incoming.weight !== undefined) edge.weight = incoming.weight;
        if (incoming.time) edge.time = incoming.time;
        draft.edges.push(edge);
      }

      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
