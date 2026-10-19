import { newId } from '../lib/id';
import { descendantGroupIdsOf, findGroup } from '../lib/groups';
import { applyDockedMoves } from './nodeCommands';
import type { Command } from './types';

/** 组的默认底色不透明度与配色板（主色仍是中性深灰 + 证据红） */
export const GROUP_COLORS = ['#C0392B', '#7B5B3A', '#2E7D64', '#8C7A2E', '#2E6DA4', '#6E6862'];
export const DEFAULT_GROUP_OPACITY = 0.1;
export const MIN_GROUP_W = 120;
export const MIN_GROUP_H = 80;

export interface AddGroupInput {
  /** 允许外部预生成 id，便于创建后立刻选中 */
  id?: string;
  title?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  opacity?: number;
  parentId?: string;
  /** 建组时一并归入的节点（圈选成组用） */
  nodeIds?: string[];
}

export function addGroup(input: AddGroupInput): Command {
  const id = input.id ?? newId('g');
  const title = input.title?.trim() || '未命名分组';
  const w = Math.max(MIN_GROUP_W, Math.round(input.w ?? 360));
  const h = Math.max(MIN_GROUP_H, Math.round(input.h ?? 260));
  return {
    label: `新建分组：${title}`,
    apply(draft) {
      const opacity = input.opacity;
      const group: {
        id: string;
        title: string;
        bounds: { x: number; y: number; w: number; h: number };
        color: string;
        parentId?: string;
        collapsed: boolean;
        opacity?: number;
      } = {
        id,
        title,
        bounds: { x: Math.round(input.x), y: Math.round(input.y), w, h },
        color: input.color ?? '#C0392B',
        collapsed: false,
      };
      if (input.parentId) group.parentId = input.parentId;
      if (typeof opacity === 'number') group.opacity = opacity;
      draft.groups.push(group);
      for (const nodeId of input.nodeIds ?? []) {
        const node = draft.nodes.find((item) => item.id === nodeId);
        if (node) node.groupId = id;
      }
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export interface GroupPatch {
  title?: string;
  color?: string;
  opacity?: number;
  /** null 表示提升到顶层 */
  parentId?: string | null;
  collapsed?: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
}

export function updateGroup(id: string, patch: GroupPatch): Command {
  return {
    label: '修改分组属性',
    apply(draft) {
      const group = draft.groups.find((item) => item.id === id);
      if (!group) return;

      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (title.length > 0) group.title = title;
      }
      if (patch.color !== undefined) group.color = patch.color;
      if (patch.opacity !== undefined) {
        group.opacity = Math.min(0.6, Math.max(0.02, patch.opacity));
      }
      if (patch.collapsed !== undefined) group.collapsed = patch.collapsed;
      if (patch.bounds !== undefined) {
        group.bounds = {
          x: patch.bounds.x,
          y: patch.bounds.y,
          w: Math.max(MIN_GROUP_W, patch.bounds.w),
          h: Math.max(MIN_GROUP_H, patch.bounds.h),
        };
      }
      if (patch.parentId !== undefined) {
        if (patch.parentId === null) {
          delete group.parentId;
        } else if (patch.parentId !== id) {
          // 禁止把组挂到自己的子孙组下面，否则层级成环
          const forbidden = descendantGroupIdsOf(draft.groups, id);
          const parentExists = draft.groups.some((item) => item.id === patch.parentId);
          if (parentExists && !forbidden.includes(patch.parentId)) group.parentId = patch.parentId;
        }
      }
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function toggleGroupCollapsed(id: string): Command {
  return {
    label: '折叠 / 展开分组',
    apply(draft) {
      const group = draft.groups.find((item) => item.id === id);
      if (!group) return;
      group.collapsed = !group.collapsed;
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 删除组：成员节点与子组提升到被删组的上级，不连带删除任何节点 */
export function deleteGroup(id: string): Command {
  return {
    label: '删除分组',
    apply(draft) {
      const index = draft.groups.findIndex((item) => item.id === id);
      if (index < 0) return;
      const [removed] = draft.groups.splice(index, 1);
      const parentId = removed.parentId;
      for (const node of draft.nodes) {
        if (node.groupId !== id) continue;
        if (parentId) node.groupId = parentId;
        else delete node.groupId;
      }
      for (const group of draft.groups) {
        if (group.parentId !== id) continue;
        if (parentId) group.parentId = parentId;
        else delete group.parentId;
      }
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 移动组：组矩形 + 子孙组矩形 + 组内所有节点同一个位移，一条命令进撤销栈 */
export function moveGroup(id: string, dx: number, dy: number): Command {
  const stepX = Math.round(dx);
  const stepY = Math.round(dy);
  return {
    label: '移动分组',
    apply(draft) {
      if (stepX === 0 && stepY === 0) return;
      const group = draft.groups.find((item) => item.id === id);
      if (!group) return;
      const affectedGroups = new Set<string>([id, ...descendantGroupIdsOf(draft.groups, id)]);
      for (const item of draft.groups) {
        if (!affectedGroups.has(item.id)) continue;
        item.bounds.x += stepX;
        item.bounds.y += stepY;
      }
      for (const node of draft.nodes) {
        if (!node.groupId || !affectedGroups.has(node.groupId)) continue;
        node.x += stepX;
        node.y += stepY;
      }
      // 吸附随动（M10）：组里的卡片带着吸在它身上的图片一起走
      const deltas = new Map<string, { dx: number; dy: number }>();
      for (const node of draft.nodes) {
        if (!node.groupId || !affectedGroups.has(node.groupId)) continue;
        deltas.set(node.id, { dx: stepX, dy: stepY });
      }
      applyDockedMoves(draft, deltas);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function resizeGroup(id: string, bounds: { x: number; y: number; w: number; h: number }): Command {
  return {
    label: '调整分组大小',
    apply(draft) {
      const group = draft.groups.find((item) => item.id === id);
      if (!group) return;
      group.bounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        w: Math.max(MIN_GROUP_W, Math.round(bounds.w)),
        h: Math.max(MIN_GROUP_H, Math.round(bounds.h)),
      };
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 把节点归入某个组（groupId 传 null 即移出分组） */
export function assignNodesToGroup(nodeIds: string[], groupId: string | null): Command {
  const label = groupId ? '加入分组' : '移出分组';
  return {
    label,
    apply(draft) {
      const target = groupId ? draft.groups.find((item) => item.id === groupId) : null;
      if (groupId && !target) return;
      for (const nodeId of nodeIds) {
        const node = draft.nodes.find((item) => item.id === nodeId);
        if (!node) continue;
        if (groupId) node.groupId = groupId;
        else delete node.groupId;
      }
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 供 UI 判断某组能否作为另一组的上级（不能成环、不能是自己） */
export function canParentGroup(doc: Parameters<typeof findGroup>[0], groupId: string, candidateParentId: string | null): boolean {
  if (!candidateParentId) return true;
  if (candidateParentId === groupId) return false;
  if (!findGroup(doc, candidateParentId)) return false;
  return !descendantGroupIdsOf(doc.groups, groupId).includes(candidateParentId);
}
