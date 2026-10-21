import type { Draft } from 'immer';
import { optimizeDocEdges, type EdgeOptimizeResult } from '../lib/edgeOptimize';
import type { CaseDoc } from '../types';
import type { Command } from './types';

/**
 * 把一次「关系线梳理」的结果写回草稿：锚点 + 曲率。
 * 布局命令与「关系线单独自动调整」按钮共用这一份写回逻辑，避免两处各写一遍。
 */
export function writeEdgeGeometry(draft: Draft<CaseDoc>, onlyIds?: readonly string[]): EdgeOptimizeResult {
  const result = optimizeDocEdges(draft as CaseDoc, { onlyIds });
  const byId = new Map(draft.edges.map((edge) => [edge.id, edge]));
  for (const geometry of result.geometries) {
    const edge = byId.get(geometry.id);
    if (!edge) continue;
    edge.sourceHandle = geometry.anchors.source;
    edge.targetHandle = geometry.anchors.target;
    if (Math.abs(geometry.curvature) < 0.01) delete edge.curvature;
    else edge.curvature = geometry.curvature;
  }
  return result;
}

/**
 * M18：只梳理关系线，不动任何坐标。
 * 用户要求「在自动布局页面增加关系线单独自动调整功能按钮」——这条命令就是那个按钮。
 */
export function optimizeEdgeGeometry(onlyIds?: readonly string[]): Command {
  const single = onlyIds !== undefined && onlyIds.length === 1;
  return {
    label: single ? '梳理这条关系线' : '自动梳理关系线',
    apply(draft) {
      writeEdgeGeometry(draft, onlyIds);
    },
  };
}
