import type { DockCorner, ImageNode } from '../types';
import {
  fitImageSize,
  nextZIndex,
  normAngle,
  reorderLayers,
  type LayerAction,
} from '../lib/imageNode';
import { newId } from '../lib/id';
import type { Command } from './types';

/**
 * 自由图片节点的写入口（M2-4，Gate 0-2）。
 * 画布交互、右栏表单、素材库拖入都只调这里的命令，保证每次改动都可撤销。
 */

export interface AddImageNodeInput {
  id?: string;
  assetId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  borderStyle?: ImageNode['borderStyle'];
  linkedNodeId?: string;
  /** 已知全部图片节点：用来算下一个层级 */
  siblings?: readonly ImageNode[];
  assetWidth?: number;
  assetHeight?: number;
}

export function addImageNode(input: AddImageNodeInput): Command {
  const size =
    input.w && input.h
      ? { w: input.w, h: input.h }
      : fitImageSize(input.assetWidth, input.assetHeight);
  const node: ImageNode = {
    id: input.id ?? newId('img'),
    kind: 'freeImage',
    assetId: input.assetId,
    x: Math.round(input.x),
    y: Math.round(input.y),
    w: size.w,
    h: size.h,
    rotation: normAngle(input.rotation ?? 0),
    zIndex: nextZIndex(input.siblings ?? []),
  };
  if (input.borderStyle) node.borderStyle = input.borderStyle;
  if (input.linkedNodeId) node.linkedNodeId = input.linkedNodeId;
  return {
    label: '拖入图片',
    apply(draft) {
      if (draft.imageNodes.some((item) => item.id === node.id)) return;
      draft.imageNodes.push(node);
    },
  };
}

export interface ImageNodePatch {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  borderStyle?: ImageNode['borderStyle'] | null;
  linkedNodeId?: string | null;
  /** 吸附角（M10）：null = 清掉角标记，退回普通关联 */
  dockCorner?: DockCorner | null;
  dockOffset?: { x: number; y: number } | null;
  pinned?: boolean;
  /** M11（I6）：true = 压缩成小圆点；false/null = 展开成正常图片 */
  dotMode?: boolean;
}

export function updateImageNode(id: string, patch: ImageNodePatch): Command {
  return {
    label: '调整图片',
    apply(draft) {
      const node = draft.imageNodes.find((item) => item.id === id);
      if (!node) return;
      if (patch.x !== undefined) node.x = Math.round(patch.x);
      if (patch.y !== undefined) node.y = Math.round(patch.y);
      if (patch.w !== undefined) node.w = Math.max(1, Math.round(patch.w));
      if (patch.h !== undefined) node.h = Math.max(1, Math.round(patch.h));
      if (patch.rotation !== undefined) node.rotation = normAngle(patch.rotation);
      if (patch.borderStyle !== undefined) {
        if (patch.borderStyle === null) delete node.borderStyle;
        else node.borderStyle = patch.borderStyle;
      }
      if (patch.linkedNodeId !== undefined) {
        if (patch.linkedNodeId === null) {
          delete node.linkedNodeId;
          // 取消吸附时角标记一起清掉，否则下次移动会跟着旧卡片走
          delete node.dockCorner;
          delete node.dockOffset;
        } else {
          node.linkedNodeId = patch.linkedNodeId;
        }
      }
      if (patch.dockCorner !== undefined) {
        if (patch.dockCorner === null) delete node.dockCorner;
        else node.dockCorner = patch.dockCorner;
      }
      if (patch.dockOffset !== undefined) {
        if (patch.dockOffset === null) delete node.dockOffset;
        else node.dockOffset = { x: Math.round(patch.dockOffset.x), y: Math.round(patch.dockOffset.y) };
      }
      if (patch.pinned !== undefined) node.pinned = patch.pinned ? true : undefined;
      if (patch.dotMode !== undefined) node.dotMode = patch.dotMode ? true : undefined;
    },
  };
}

export function moveImageNode(id: string, x: number, y: number): Command {
  return updateImageNode(id, { x, y });
}

/** 多选整体拖动：一条命令，撤销一次整组回原位 */
export function moveImageNodes(moves: ReadonlyArray<{ id: string; x: number; y: number }>): Command {
  return {
    label: moves.length > 1 ? `移动 ${moves.length} 张图片` : '移动图片',
    apply(draft) {
      for (const move of moves) {
        const node = draft.imageNodes.find((item) => item.id === move.id);
        if (!node) continue;
        node.x = Math.round(move.x);
        node.y = Math.round(move.y);
      }
    },
  };
}

export function resizeImageNode(id: string, rect: { x: number; y: number; w: number; h: number }): Command {
  return updateImageNode(id, rect);
}

export function rotateImageNode(id: string, rotation: number): Command {
  return updateImageNode(id, { rotation });
}

export function setImageLayer(id: string, action: LayerAction): Command {
  return {
    label: action === 'front' ? '图片置顶' : action === 'back' ? '图片置底' : action === 'up' ? '图片上移一层' : '图片下移一层',
    apply(draft) {
      const next = reorderLayers(draft.imageNodes, id, action);
      for (const [nodeId, zIndex] of Object.entries(next)) {
        const node = draft.imageNodes.find((item) => item.id === nodeId);
        if (node) node.zIndex = zIndex;
      }
    },
  };
}

export function deleteImageNode(id: string): Command {
  return {
    label: '删除图片',
    apply(draft) {
      draft.imageNodes = draft.imageNodes.filter((item) => item.id !== id);
    },
  };
}

export function deleteImageNodes(ids: readonly string[]): Command {
  const set = new Set(ids);
  return {
    label: ids.length > 1 ? `删除 ${ids.length} 张图片` : '删除图片',
    apply(draft) {
      draft.imageNodes = draft.imageNodes.filter((item) => !set.has(item.id));
    },
  };
}

/**
 * 吸附为头像 / 证据附件。
 * 人物节点写 photo（头像），其余节点把素材 id 并入 attachments——
 * 与 M2-3 导入向导「关联实体」同一条规则，右栏能看到同一份关联。
 */
export function attachImageNode(
  imageId: string,
  targetNodeId: string | null,
  dock?: { corner: DockCorner; offsetX: number; offsetY: number } | null,
): Command {
  return {
    label: targetNodeId ? (dock ? '吸附图片到卡片角' : '吸附图片到卡片') : '取消图片吸附',
    apply(draft) {
      const image = draft.imageNodes.find((item) => item.id === imageId);
      if (!image) return;
      if (!targetNodeId) {
        delete image.linkedNodeId;
        delete image.dockCorner;
        delete image.dockOffset;
        return;
      }
      const target = draft.nodes.find((item) => item.id === targetNodeId);
      if (!target) return;
      image.linkedNodeId = target.id;
      if (dock) {
        image.dockCorner = dock.corner;
        image.dockOffset = { x: Math.round(dock.offsetX), y: Math.round(dock.offsetY) };
      } else {
        delete image.dockCorner;
        delete image.dockOffset;
      }
      if (target.type === 'person') {
        target.photo = image.assetId;
      } else if (!target.attachments.includes(image.assetId)) {
        target.attachments = [...target.attachments, image.assetId];
      }
    },
  };
}

/** 多选对齐 / 等距分布：一张命令改完所有图片 */
export function applyImageLayout(
  moves: ReadonlyArray<{ id: string; x: number; y: number }>,
  label: string,
): Command {
  return {
    label,
    apply(draft) {
      for (const move of moves) {
        const node = draft.imageNodes.find((item) => item.id === move.id);
        if (!node) continue;
        node.x = Math.round(move.x);
        node.y = Math.round(move.y);
      }
    },
  };
}
