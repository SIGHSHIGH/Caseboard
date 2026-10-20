import type { LayoutResult } from '../lib/layout';
import { applyDockedMoves } from './nodeCommands';
import { writeEdgeGeometry } from './edgeGeometryCommands';
import type { Command } from './types';

/**
 * 把一次自动布局的结果写进文档（M5-4）。
 * 只生成一条命令：整板坐标一次改完，Ctrl+Z 一次整体回退，不会在撤销栈里留下几十条 MoveNode。
 *
 * M9 / S3：布局把实体彻底搬动之后，原来手调的 sourceHandle/targetHandle 往往对不上，
 * 会出现连线交叉、线从卡片背面穿过去。这里在写坐标的同一条命令里按新的相对位置重算锚点。
 *
 * M16：自动布局同样要让吸附的图片跟随卡片——布局改坐标历来只动 draft.nodes，
 * 于是「吸附的图片在自动布局后不跟随」成为反复出现的反馈；这里复用命令层的 applyDockedMoves，
 * 与拖动、方向键走同一条随动逻辑。
 *
 * M18：手机反馈「自动布局之后线还是交叉、还是压在卡片上」，于是把「挑锚点」升级成
 * writeEdgeGeometry（锚点 + 贝塞尔曲率一起挑），与「关系线单独自动调整」按钮共用同一份实现。
 * 只梳理 autoAnchor !== false 的边；被用户钉住的边保持原样。
 */
export function applyLayout(result: LayoutResult): Command {
  const targets = new Map(
    result.placements.filter((placement) => !placement.locked).map((placement) => [placement.id, placement]),
  );
  return {
    label: `自动布局（${result.moved} 个实体）`,
    apply(draft) {
      const deltas = new Map<string, { dx: number; dy: number }>();
      for (const node of draft.nodes) {
        const target = targets.get(node.id);
        if (!target) continue;
        const dx = target.x - node.x;
        const dy = target.y - node.y;
        if (dx === 0 && dy === 0) continue;
        deltas.set(node.id, { dx, dy });
        node.x = target.x;
        node.y = target.y;
      }
      // 吸附随动（M16）：被布局搬走的卡片，把吸在它身上的图片一起挪过去
      applyDockedMoves(draft, deltas);
      // 关系线几何（M18）：坐标定下来之后再挑锚点与曲率，避免「先挑后挪」
      writeEdgeGeometry(draft);
    },
  };
}
