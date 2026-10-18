import type { LayoutResult } from '../lib/layout';
import type { Command } from './types';

/**
 * 把一次自动布局的结果写进文档（M5-4）。
 * 只生成一条命令：整板坐标一次改完，Ctrl+Z 一次整体回退，不会在撤销栈里留下几十条 MoveNode。
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
    },
  };
}
