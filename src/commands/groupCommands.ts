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

/**
 * 把已经在画布上的卡片收进一个**已有**组框（H5-6）。
 *
 * 与 `assignNodesToGroup` 的区别：那个只写 `node.groupId`，卡片还留在原地，
 * 于是「加入分组」后卡片可能飘在组框外面，看起来完全没进组。
 * 这里把卡片按列摆进组框内容区（顶部留标题栏、四周留内边距），并且**只放大不缩小**组框，
 * 覆盖住新成员——拖一张卡片进组框的用户预期就是「它在框里了」。
 */
export function addNodesToGroup(nodeIds: string[], groupId: string): Command {
  const ids = nodeIds.filter((id, index) => nodeIds.indexOf(id) === index);
  return {
    label: `加入分组：${ids.length} 个卡片`,
    apply(draft) {
      const group = draft.groups.find((item) => item.id === groupId);
      if (!group || ids.length === 0) return;
      const moving = ids
        .map((id) => draft.nodes.find((item) => item.id === id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      if (moving.length === 0) return;

      const b = { ...group.bounds };
      // 组框内边距与标题栏高度（与画布上组框的视觉留白保持一致）
      const pad = 24;
      const header = 40;
      const gap = 16;
      // 卡片高度是自适应的（BaseNode 由内容撑开），doc 里的 h 只是估计值，
      // 太小时两张卡会视觉上叠在一起，所以给一个下限。
      const heightOf = (node: (typeof moving)[number]) => Math.max(96, Math.round(node.h));
      // 只放大组框，绝不把卡片收窄去迁就组框：卡片被压窄比框不够大更难看
      const widest = Math.max(...moving.map((node) => node.w));

      // 已有成员的最低点之下开始摆，避免压住框里原来的卡片
      const stay = draft.nodes.filter((item) => item.groupId === groupId && !ids.includes(item.id));
      let cursorY = b.y + header;
      if (stay.length > 0) {
        cursorY = Math.max(...stay.map((item) => item.y + Math.max(96, item.h))) + gap;
      }

      let right = Math.max(b.x + pad + widest, b.x + b.w - pad);
      for (const node of moving) {
        node.groupId = groupId;
        node.x = Math.round(b.x + pad);
        node.y = Math.round(cursorY);
        cursorY += heightOf(node) + gap;
        right = Math.max(right, node.x + node.w);
      }

      group.bounds = {
        x: b.x,
        y: b.y,
        w: Math.max(b.w, Math.round(right + pad - b.x), MIN_GROUP_W),
        h: Math.max(b.h, Math.round(cursorY - gap + pad - b.y), MIN_GROUP_H),
      };
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
