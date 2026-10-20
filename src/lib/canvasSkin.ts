import type { CanvasConfig, CanvasSkin } from '../types';
import type { ThemeMode } from './themeMode';

/**
 * 画布底衬（M14）：纸张 / 软木板 / 黑板，另可叠一张导入的背景图。
 * 只影响画布底色与网格线，节点卡片仍是 --cb-surface，语义色（证据红等）不变。
 */
export const CANVAS_SKINS: CanvasSkin[] = ['paper', 'cork', 'chalk'];

export interface CanvasSkinMeta {
  id: CanvasSkin;
  label: string;
  hint: string;
}

export const CANVAS_SKIN_META: Record<CanvasSkin, CanvasSkinMeta> = {
  paper: { id: 'paper', label: '纸张', hint: '默认暖白纸感，跟随界面主题' },
  cork: { id: 'cork', label: '软木板', hint: '深棕软木纹，贴满照片与便签的观感' },
  chalk: { id: 'chalk', label: '黑板', hint: '深墨绿黑板，浅色字与粉笔线' },
};

export const DEFAULT_CANVAS: CanvasConfig = { skin: 'paper' };

export const CANVAS_OPACITY_MIN = 0.1;
export const CANVAS_OPACITY_MAX = 1;
export const CANVAS_OPACITY_DEFAULT = 0.35;

export function isCanvasSkin(value: unknown): value is CanvasSkin {
  return value === 'paper' || value === 'cork' || value === 'chalk';
}

export function normalizeCanvasSkin(value: unknown): CanvasSkin {
  return isCanvasSkin(value) ? value : 'paper';
}

export function nextCanvasSkin(skin: CanvasSkin): CanvasSkin {
  const index = CANVAS_SKINS.indexOf(normalizeCanvasSkin(skin));
  return CANVAS_SKINS[(index + 1) % CANVAS_SKINS.length];
}

export function clampCanvasOpacity(value: number): number {
  if (!Number.isFinite(value)) return CANVAS_OPACITY_DEFAULT;
  const clamped = Math.min(CANVAS_OPACITY_MAX, Math.max(CANVAS_OPACITY_MIN, value));
  return Math.round(clamped * 100) / 100;
}

/** 换皮肤时保留已经导入的背景图，只换底衬 */
export function withCanvasSkin(current: CanvasConfig | undefined, skin: CanvasSkin): CanvasConfig {
  const base = current ?? DEFAULT_CANVAS;
  const next: CanvasConfig = { skin: normalizeCanvasSkin(skin) };
  if (base.assetId) next.assetId = base.assetId;
  if (typeof base.opacity === 'number') next.opacity = clampCanvasOpacity(base.opacity);
  return next;
}

/** 挂 / 摘背景图；摘掉时回到纸张底衬（否则会留下一个空白的深色画布） */
export function withCanvasImage(current: CanvasConfig | undefined, assetId: string | null): CanvasConfig {
  const base = current ?? DEFAULT_CANVAS;
  if (!assetId) {
    return { skin: normalizeCanvasSkin(base.skin) };
  }
  return {
    skin: normalizeCanvasSkin(base.skin),
    assetId,
    opacity: clampCanvasOpacity(base.opacity ?? CANVAS_OPACITY_DEFAULT),
  };
}

/** 右上角「背景·XX」按钮的文案 */
export function canvasLabel(config: CanvasConfig | undefined): string {
  const base = config ?? DEFAULT_CANVAS;
  const label = CANVAS_SKIN_META[normalizeCanvasSkin(base.skin)].label;
  return base.assetId ? label + '+图' : label;
}

export interface SkinGrid {
  dot: string;
  line: string;
  mask: string;
}

/** React Flow 的圆点 / 网格是 SVG 属性，吃不到 CSS 变量，只能按皮肤取常量 */
export const SKIN_GRID: Record<CanvasSkin, SkinGrid> = {
  paper: { dot: '#D9D4CA', line: '#E8E3DA', mask: 'rgba(245, 243, 239, 0.75)' },
  cork: { dot: '#6B5138', line: '#5B432D', mask: 'rgba(66, 47, 31, 0.72)' },
  chalk: { dot: '#3F5A50', line: '#345046', mask: 'rgba(24, 38, 34, 0.78)' },
};

/** 纸张皮肤跟随界面主题（深色 / 高对比），软木板与黑板自带底色 */
export const THEME_GRID: Record<ThemeMode, SkinGrid> = {
  board: { dot: '#D9D4CA', line: '#E8E3DA', mask: 'rgba(245, 243, 239, 0.75)' },
  dark: { dot: '#3E3934', line: '#302C29', mask: 'rgba(21, 20, 18, 0.78)' },
  contrast: { dot: '#6B6B6B', line: '#B5B5B5', mask: 'rgba(255, 255, 255, 0.88)' },
};

export function canvasGrid(skin: CanvasSkin, theme: ThemeMode): SkinGrid {
  const normalized = normalizeCanvasSkin(skin);
  if (normalized === 'paper') return THEME_GRID[theme] ?? THEME_GRID.board;
  return SKIN_GRID[normalized];
}

/**
 * 是否要在画布上叠网格线（M15）。
 * 只有纸张底衬需要网格；软木板 / 黑板自带纹理，再叠一层线条就脏了，
 * 用户也明确要求去掉背景上的原点矩阵。
 */
export function showsCanvasGrid(skin: CanvasSkin): boolean {
  return normalizeCanvasSkin(skin) === 'paper';
}
