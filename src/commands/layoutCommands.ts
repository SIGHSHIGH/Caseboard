import { bestAnchors, pickAnchorPair, rectOf, type RectLike } from '../lib/edgeCurve';
import type { LayoutResult } from '../lib/layout';
import { applyDockedMoves } from './nodeCommands';
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
      const byId = new Map(draft.nodes.map((node) => [node.id, node]));
      const rects = new Map<string, RectLike>();
      for (const node of draft.nodes) rects.set(node.id, rectOf(node));
      for (const edge of draft.edges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) continue;
        // M17：布局后可能还是会「线穿卡片」，所以挑锚点时把其他卡片当障碍一起评分；
        // 而且无条件覆盖旧 handle —— 用户明确要求「自动布局自动更改使用哪个节点」。
        const sourceRect = rects.get(source.id);
        const targetRect = rects.get(target.id);
        if (!sourceRect || !targetRect) continue;
        const obstacles: RectLike[] = [];
        for (const [id, rect] of rects) {
          if (id === source.id || id === target.id) continue;
          obstacles.push(rect);
        }
        const anchors = obstacles.length > 0
          ? pickAnchorPair(sourceRect, targetRect, obstacles)
          : bestAnchors(sourceRect, targetRect);
        edge.sourceHandle = anchors.source;
        edge.targetHandle = anchors.target;
      }
    },
  };
}
