import { bestAnchors, rectOf } from '../lib/edgeCurve';
import type { LayoutResult } from '../lib/layout';
import type { Command } from './types';

/**
 * 把一次自动布局的结果写进文档（M5-4）。
 * 只生成一条命令：整板坐标一次改完，Ctrl+Z 一次整体回退，不会在撤销栈里留下几十条 MoveNode。
 *
 * M9 / S3：布局把实体彻底搬动之后，原来手调的 sourceHandle/targetHandle 往往对不上，
 * 会出现连线交叉、线从卡片背面穿过去。这里在写坐标的同一条命令里按新的相对位置重算锚点。
 */
export function applyLayout(result: LayoutResult): Command {
  const targets = new Map(
    result.placements.filter((placement) => !placement.locked).map((placement) => [placement.id, placement]),
  );
  return {
    label: `自动布局（${result.moved} 个实体）`,
    apply(draft) {
      for (const node of draft.nodes) {
        const target = targets.get(node.id);
        if (!target) continue;
        if (node.x === target.x && node.y === target.y) continue;
        node.x = target.x;
        node.y = target.y;
      }
      const byId = new Map(draft.nodes.map((node) => [node.id, node]));
      for (const edge of draft.edges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) continue;
        const anchors = bestAnchors(rectOf(source), rectOf(target));
        edge.sourceHandle = anchors.source;
        edge.targetHandle = anchors.target;
      }
    },
  };
}
