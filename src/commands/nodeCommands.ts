import type { CaseNode, NodeType, Status } from '../types';
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
      Object.assign(node, patch);
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
