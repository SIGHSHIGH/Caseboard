import { memo } from 'react';
import { ViewportPortal } from '@xyflow/react';
import type { CaseNode, PinLink } from '../../types';

/**
 * 集中钉子之间的红线（H5.6.3）
 *
 * 用户要求：只是画布上的一条**红色直线**——不是贝塞尔曲线、不是关系线。
 * 所以它不进 `doc.edges`，而是单独存在 `doc.pinLinks` 里：
 * 不计入关系数、不进时间线 / 地图 / 导出 / 代码视图，也不能当关系来编辑。
 *
 * 渲染放在 React Flow 的 `ViewportPortal` 里：直接用世界坐标画，
 * 平移缩放由 viewport 变换负责，pointer-events 关掉不挡卡片点击。
 */
function PinLinkLayerInner({ links, nodes }: { links: PinLink[]; nodes: CaseNode[] }) {
  if (links.length === 0) return null;
  const centerOf = (id: string): { x: number; y: number } | null => {
    const node = nodes.find((item) => item.id === id && item.type === 'clusterPin');
    if (!node) return null;
    return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
  };
  return (
    <ViewportPortal>
      <svg className="cb-pinlinks" aria-hidden="true">
        {links.map((link) => {
          const from = centerOf(link.source);
          const to = centerOf(link.target);
          if (!from || !to) return null;
          return (
            <line
              key={link.id}
              className="cb-pinlink"
              data-pinlink-id={link.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

export const PinLinkLayer = memo(PinLinkLayerInner);
