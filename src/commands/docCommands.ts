import type { CanvasSkin, CaseDoc, Settings } from '../types';
import {
  CANVAS_SKIN_META,
  clampCanvasOpacity,
  normalizeCanvasSkin,
  withCanvasImage,
  withCanvasSkin,
} from '../lib/canvasSkin';
import type { Command } from './types';

/** 导入 JSON 也是 Command：可撤销，且不会绕开单一数据源。 */
export function replaceDocument(next: CaseDoc): Command {
  return {
    label: '导入案件 JSON',
    apply(draft) {
      draft.meta = { ...next.meta, updatedAt: new Date().toISOString() };
      draft.nodes = next.nodes;
      draft.edges = next.edges;
      draft.groups = next.groups;
      draft.assets = next.assets;
      // M10：之前这里漏了图片节点 / 假设 / 文件夹 / 时间线，打开项目会悄悄丢图与去重轨
      draft.imageNodes = next.imageNodes;
      draft.hypotheses = next.hypotheses;
      draft.views = next.views;
      draft.settings = next.settings;
      if (next.assetFolders) draft.assetFolders = next.assetFolders;
      else delete draft.assetFolders;
      if (next.timeline) draft.timeline = next.timeline;
      else delete draft.timeline;
    },
  };
}

/** 修改文档级设置（地图底图等），所有写操作仍然只走 Command */
export function updateSettings(patch: Partial<Settings>): Command {
  return {
    label: '修改案件设置',
    apply(draft) {
      draft.settings = { ...draft.settings, ...patch };
    },
  };
}

/** 只改地图底图：单独一条命令，撤销文案更准确 */
export function setMapBackground(next: Settings['mapBackground'] | null): Command {
  return {
    label: next ? '设置地图底图' : '移除地图底图',
    apply(draft) {
      const settings = { ...draft.settings };
      if (next) settings.mapBackground = next;
      else delete settings.mapBackground;
      draft.settings = settings;
    },
  };
}

/** 只换画布底衬：单独一条命令，撤销文案更准确（M14） */
export function setCanvasSkin(skin: CanvasSkin): Command {
  return {
    label: `画布底衬改为${CANVAS_SKIN_META[normalizeCanvasSkin(skin)].label}`,
    apply(draft) {
      draft.settings = { ...draft.settings, canvas: withCanvasSkin(draft.settings.canvas, skin) };
    },
  };
}

/** 挂 / 摘画布背景图（M14）：assetId 为 null 时只摘图，保留底衬 */
export function setCanvasImage(assetId: string | null, opacity?: number): Command {
  return {
    label: assetId ? '设置画布背景图' : '移除画布背景图',
    apply(draft) {
      const current = draft.settings.canvas;
      const next = withCanvasImage(current, assetId);
      if (assetId && typeof opacity === 'number') next.opacity = clampCanvasOpacity(opacity);
      draft.settings = { ...draft.settings, canvas: next };
    },
  };
}
