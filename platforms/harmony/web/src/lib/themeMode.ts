/** 界面主题（Gate 0-6：主色仍是中性深灰 + 证据红，只换明暗与对比度） */
export type ThemeMode = 'board' | 'dark' | 'contrast';

export const THEME_STORAGE_KEY = 'caseboard-theme';

export interface ThemeMeta {
  id: ThemeMode;
  label: string;
  hint: string;
}

export const THEME_ORDER: ThemeMode[] = ['board', 'dark', 'contrast'];

export const THEME_META: Record<ThemeMode, ThemeMeta> = {
  board: { id: 'board', label: '默认', hint: '暖白纸感：中性深灰 + 证据红（Gate 0-6 标准界面）' },
  dark: { id: 'dark', label: '深色', hint: '深色界面：夜间与暗光现场使用，主色不变' },
  contrast: { id: 'contrast', label: '高对比', hint: '纯白底 + 纯黑字 + 粗描边 + 关阴影，投影与低视力可用' },
};

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'dark' || value === 'contrast' ? value : 'board';
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const current = normalizeThemeMode(mode);
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

/** React Flow 的圆点/网格颜色是 SVG 属性，吃不到 CSS 变量，按主题取常量 */
export const BOARD_GRID: Record<ThemeMode, { dot: string; line: string; mask: string }> = {
  board: { dot: '#D9D4CA', line: '#E8E3DA', mask: 'rgba(245, 243, 239, 0.75)' },
  dark: { dot: '#3E3934', line: '#302C29', mask: 'rgba(21, 20, 18, 0.78)' },
  contrast: { dot: '#6B6B6B', line: '#B5B5B5', mask: 'rgba(255, 255, 255, 0.88)' },
};
