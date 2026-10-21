/**
 * 视口分档（H1 平板适配）：只做纯计算，组件负责量宽度并渲染。
 *
 * 桌面窗口最窄也在 1000px 以上，所以这里的三档主要服务平板与窄窗：
 *   wide    ≥ 1180px  左右栏并排（桌面默认形态）
 *   medium  ≥ 900px   右栏改抽屉（它宽 312px，占 1440 的 22%，挤画布）
 *   compact < 900px   左右栏都改抽屉
 *
 * 平板实测：MatePad Pro 13 在 ArkWeb 里是 1440×893 CSS px、dpr=2，
 * 所以 1440 落在 wide 档——并排没问题，但顶栏已经开始往「⋯」里收。
 */

export type ViewportTier = 'wide' | 'medium' | 'compact';

/** 右栏开始改抽屉的宽度下限（含） */
export const WIDE_MIN_WIDTH = 1180;
/** 左栏也开始改抽屉的宽度下限（含） */
export const MEDIUM_MIN_WIDTH = 900;

/** 无法测量时按宽屏处理：宁可并排（桌面原状），也不要平白把面板收起来 */
export function classifyViewport(width: number): ViewportTier {
  if (!Number.isFinite(width) || width <= 0) return 'wide';
  if (width >= WIDE_MIN_WIDTH) return 'wide';
  if (width >= MEDIUM_MIN_WIDTH) return 'medium';
  return 'compact';
}

export interface PanelState {
  left: boolean;
  right: boolean;
}

/** 进入某一档时面板应有的初始开合状态 */
export function defaultPanelState(tier: ViewportTier): PanelState {
  if (tier === 'wide') return { left: true, right: true };
  if (tier === 'medium') return { left: true, right: false };
  return { left: false, right: false };
}

/** 该档下面板是否是浮层抽屉（而不是并排占位） */
export function panelIsDrawer(tier: ViewportTier, side: 'left' | 'right'): boolean {
  if (side === 'right') return tier !== 'wide';
  return tier === 'compact';
}

/**
 * 档位变化时是否需要重置面板开合：只在「变窄」时收，变宽时不自动弹开，
 * 免得用户刚收起右栏、窗口一动又自己冒出来。
 */
export function shouldResetPanels(prev: ViewportTier, next: ViewportTier): boolean {
  const order: Record<ViewportTier, number> = { wide: 2, medium: 1, compact: 0 };
  return order[next] < order[prev];
}

/**
 * H1 决策：**不支持竖屏**。案情板是横向铺开的信息密度工具——画布要宽、时间线要长、
 * 左右栏各占一列，竖屏下再怎么折叠也只剩一条窄缝。
 *
 * 所以平台侧强制横屏（`module.json5` 的 `orientation: "landscape"`），前端再兜一层：
 * 一旦拿到竖屏比例（高 > 宽）或宽度不足 `USABLE_MIN_WIDTH`（2in1 拖成小窗、分屏、
 * 折叠屏半折），直接盖一张提示层，而不是把半残的界面摆给用户看。
 */
export const USABLE_MIN_WIDTH = 900;

/** 当前视口是否应当被提示层接管 */
export function shouldGateLayout(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  if (height > width) return true;
  return width < USABLE_MIN_WIDTH;
}
