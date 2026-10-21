import type { CaseNode, ImageNode, XY } from '../types';

/**
 * 集中钉子与「钉集」（H5.3）。
 *
 * 设计要点（来自需求原文）：
 *  - 集中钉子 = 一枚更大的图钉钉在一张规整的黄色便利贴上，便利贴可显隐，只有一条关系连接点；
 *  - 被它钉住的图片组成钉集：**只能由拖动集中钉子本身移动整集**，
 *    拖动集内任一图片等价于拖动钉子本身；
 *  - 集内图片相对钉子的位置/角度存成 clusterOffset，右栏可绕钉子旋转；
 *  - 钉集对外永远置顶，集内层级相对外界独立。
 *
 * 这里只放纯函数与常量，画布与命令层都复用，避免两处各算一套。
 */

/** 钉集成员的渲染层级基准：远高于普通卡片/图片（后者被夹在 1–199） */
export const CLUSTER_Z_BASE = 1000;
/** 集中钉子本身永远比它的成员再高一层 */
export const CLUSTER_PIN_Z = 1600;

/** 集中钉子的默认尺寸（钉在便利贴上的整体外框） */
export const CLUSTER_PIN_W = 168;
export const CLUSTER_PIN_H = 132;

/** 图片中心是否落在钉子的吸附范围里（钉子外框向外扩 tolerance） */
export function hitClusterPin(pin: CaseNode, center: XY, tolerance = 48): boolean {
  return (
    center.x >= pin.x - tolerance &&
    center.x <= pin.x + pin.w + tolerance &&
    center.y >= pin.y - tolerance &&
    center.y <= pin.y + pin.h + tolerance
  );
}

/** 从所有卡片里挑出离图片中心最近的集中钉子（没有则 null） */
export function findClusterTarget(nodes: readonly CaseNode[], center: XY, tolerance = 48): CaseNode | null {
  let best: CaseNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    if (node.type !== 'clusterPin') continue;
    if (!hitClusterPin(node, center, tolerance)) continue;
    const pinCenter = pinCenterOf(node);
    const distance = Math.hypot(pinCenter.x - center.x, pinCenter.y - center.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

export function pinCenterOf(pin: Pick<CaseNode, 'x' | 'y' | 'w' | 'h'>): XY {
  return { x: pin.x + pin.w / 2, y: pin.y + pin.h / 2 };
}

/** 入集时由图片中心与钉子中心算出的相对偏移 */
export function offsetForCluster(pin: Pick<CaseNode, 'x' | 'y' | 'w' | 'h'>, center: XY): XY {
  const pinCenter = pinCenterOf(pin);
  return { x: Math.round(center.x - pinCenter.x), y: Math.round(center.y - pinCenter.y) };
}

/** 成员图片的左上角坐标（由钉子位置 + 相对偏移 + 自身尺寸推导） */
export function memberPosition(
  pin: Pick<CaseNode, 'x' | 'y' | 'w' | 'h'>,
  offset: XY,
  size: { w: number; h: number },
): XY {
  const pinCenter = pinCenterOf(pin);
  return {
    x: Math.round(pinCenter.x + offset.x - size.w / 2),
    y: Math.round(pinCenter.y + offset.y - size.h / 2),
  };
}

/** 绕钉子中心旋转一个偏移（度，逆时针为正），用于右栏「绕钉子转」 */
export function rotateOffset(offset: XY, degrees: number): XY {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: Math.round(offset.x * cos - offset.y * sin),
    y: Math.round(offset.x * sin + offset.y * cos),
  };
}

/** 某个钉子的成员（按集内顺序，zIndex 越大越靠前） */
export function clusterMembers(imageNodes: readonly ImageNode[], pinId: string): ImageNode[] {
  return imageNodes
    .filter((item) => item.clusterId === pinId)
    .sort((a, b) => a.zIndex - b.zIndex);
}

/** 渲染层级：钉集成员在 CLUSTER_Z_BASE 之上按集内顺序递增，与外部层级完全隔离 */
export function clusterMemberZ(imageNodes: readonly ImageNode[], pinId: string, imageId: string): number {
  const members = clusterMembers(imageNodes, pinId);
  const index = members.findIndex((item) => item.id === imageId);
  return CLUSTER_Z_BASE + (index < 0 ? 0 : index);
}

/** 便利贴是否显示（fields 里存「显示 / 隐藏」，缺省显示） */
export function stickyVisible(node: Pick<CaseNode, 'fields'>): boolean {
  const value = node.fields['显示便利贴'];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== '隐藏';
  return true;
}

/** 便利贴上的字 */
export function stickyText(node: Pick<CaseNode, 'fields'>): string {
  const value = node.fields['便利贴文字'];
  return typeof value === 'string' ? value : '';
}
