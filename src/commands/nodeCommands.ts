import type { CaseNode, NodeComment, NodeType, Status } from '../types';
import { blocksConfirmed } from '../lib/aiImage';
import { newId } from '../lib/id';
import { NODE_TYPE_META } from '../lib/theme';
import type { Command } from './types';

export interface AddNodeInput {
  type: NodeType;
  title?: string;
  x: number;
  y: number;
  status?: Status;
  confidence?: number;
  tags?: string[];
  notes?: string;
  fields?: Record<string, string | number | boolean>;
  time?: { start: string; end?: string };
  id?: string;
}

const DEFAULT_W = 208;

export function addNode(input: AddNodeInput): Command {
  const type = input.type;
  const meta = NODE_TYPE_META[type];
  return {
    label: `新增节点：${input.title ?? meta.label}`,
    apply(draft) {
      const node: CaseNode = {
        id: input.id ?? newId(type),
        type,
        title: input.title ?? `新${meta.label}`,
        x: input.x,
        y: input.y,
        w: DEFAULT_W,
        h: 96,
        fields: input.fields ?? {},
        tags: input.tags ?? [],
        status: input.status ?? 'todo',
        confidence: input.confidence ?? 50,
        attachments: [],
      };
      if (input.notes !== undefined) node.notes = input.notes;
      if (input.time !== undefined) node.time = input.time;
      draft.nodes.push(node);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function updateNode(id: string, patch: Partial<Omit<CaseNode, 'id'>>): Command {
  return {
    label: '修改节点属性',
    apply(draft) {
      const node = draft.nodes.find((n) => n.id === id);
      if (!node) return;
      const next: Partial<Omit<CaseNode, 'id'>> = { ...patch };
      // Gate 0-5：挂了 AI 模拟图的实体永远不能标「已证实」，命令层兜底（界面也会禁用）
      if (next.status === 'confirmed') {
        const linked = [node.photo, ...node.attachments].filter((item): item is string => Boolean(item));
        const hasAi = linked.some((assetId) => blocksConfirmed(draft.assets.find((asset) => asset.id === assetId)));
        if (hasAi) delete next.status;
      }
      Object.assign(node, next);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function moveNode(id: string, x: number, y: number): Command {
  return {
    label: '移动节点',
    apply(draft) {
      const node = draft.nodes.find((n) => n.id === id);
      if (!node) return;
      node.x = x;
      node.y = y;
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 批量移动实体：多选后整体拖动只压一条历史（M4 人工验收 A4 修复）。 */
export function moveNodes(positions: Array<{ id: string; x: number; y: number }>): Command {
  return {
    label: positions.length > 1 ? '移动 ' + positions.length + ' 个实体' : '移动节点',
    apply(draft) {
      let changed = false;
      for (const item of positions) {
        const node = draft.nodes.find((n) => n.id === item.id);
        if (!node) continue;
        if (node.x === item.x && node.y === item.y) continue;
        node.x = item.x;
        node.y = item.y;
        changed = true;
      }
      if (changed) draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 追加一条评论（M2-1）。评论只存文本，不影响状态与置信度。 */
export function addComment(nodeId: string, text: string, author?: string): Command {
  const trimmed = text.trim();
  return {
    label: '添加评论',
    apply(draft) {
      if (trimmed.length === 0) return;
      const node = draft.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const comment: NodeComment = {
        id: newId('c'),
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      if (author !== undefined && author.trim().length > 0) comment.author = author.trim();
      node.comments = [...(node.comments ?? []), comment];
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function deleteComment(nodeId: string, commentId: string): Command {
  return {
    label: '删除评论',
    apply(draft) {
      const node = draft.nodes.find((n) => n.id === nodeId);
      if (!node || !node.comments) return;
      node.comments = node.comments.filter((comment) => comment.id !== commentId);
      if (node.comments.length === 0) delete node.comments;
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/**
 * 从回收站恢复节点：按**原 id** 放回，否则引用它的边、附件与标注锚点全部断裂。
 * 已存在同 id 节点时不做任何改动（重复恢复安全）。
 */
export function restoreNode(node: CaseNode): Command {
  const copy = JSON.parse(JSON.stringify(node)) as CaseNode;
  return {
    label: `恢复节点：${copy.title}`,
    apply(draft) {
      if (draft.nodes.some((n) => n.id === copy.id)) return;
      draft.nodes.push(copy);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 删除节点，同时清理挂在它身上的边与组成员引用。 */
export function deleteNode(id: string): Command {
  return {
    label: '删除节点',
    apply(draft) {
      const index = draft.nodes.findIndex((n) => n.id === id);
      if (index < 0) return;
      draft.nodes.splice(index, 1);
      draft.edges = draft.edges.filter((e) => e.source !== id && e.target !== id);
      for (const group of draft.groups) {
        void group;
      }
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
