import type { CaseDoc, CaseNode, NodeComment, NodeType, Status } from '../types';
import { blocksConfirmed } from '../lib/aiImage';
import { newId } from '../lib/id';
import { NODE_TYPE_META } from '../lib/theme';
import type { Command } from './types';

/**
 * 吸附随动（M10）：卡片位移后，挂在它身上的图片同步平移。
 * 放在命令层而不是画布层，是为了让拖动、方向键、布局、组移动、撤销全都一致——
 * 否则「吸附后图片不跟卡片走」会在某个入口漏掉（M10 反馈原话就是漏在拖动上）。
 */
export function applyDockedMoves(
  draft: Pick<CaseDoc, 'imageNodes'>,
  deltas: ReadonlyMap<string, { dx: number; dy: number }>,
): number {
  if (deltas.size === 0) return 0;
  // 兼容只有 nodes 的手写 draft（测试与脚本里常见）：没有图片节点就当作没有随动
  const images = draft.imageNodes ?? [];
  let moved = 0;
  for (const image of images) {
    const host = image.linkedNodeId;
    if (!host) continue;
    const delta = deltas.get(host);
    if (!delta || (delta.dx === 0 && delta.dy === 0)) continue;
    image.x = Math.round(image.x + delta.dx);
    image.y = Math.round(image.y + delta.dy);
    moved += 1;
  }
  return moved;
}

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
  /** M17：关系气泡这类小尺寸节点需要自定义宽高 */
  w?: number;
  h?: number;
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
        w: input.w ?? DEFAULT_W,
        h: input.h ?? 96,
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
      const dx = x - node.x;
      const dy = y - node.y;
      node.x = x;
      node.y = y;
      // 吸附随动（M10）：吸在这张卡片上的图片跟着走，仍是一条命令一次撤销
      applyDockedMoves(draft, new Map([[id, { dx, dy }]]));
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
      const deltas = new Map<string, { dx: number; dy: number }>();
      for (const item of positions) {
        const node = draft.nodes.find((n) => n.id === item.id);
        if (!node) continue;
        const dx = item.x - node.x;
        const dy = item.y - node.y;
        if (dx === 0 && dy === 0) continue;
        node.x = item.x;
        node.y = item.y;
        deltas.set(item.id, { dx, dy });
        changed = true;
      }
      // 吸附随动（M10）：只对真的位移过的卡片生效
      applyDockedMoves(draft, deltas);
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
