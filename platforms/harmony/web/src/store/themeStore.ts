import { create } from 'zustand';
import {
  THEME_STORAGE_KEY,
  nextThemeMode,
  normalizeThemeMode,
  type ThemeMode,
} from '../lib/themeMode';

function readStoredTheme(): ThemeMode {
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'board';
  }
}

/** 主题挂在 <html data-theme> 上，CSS 只重映射变量，组件不用知道当前主题 */
export function applyThemeMode(mode: ThemeMode): void {
  try {
    document.documentElement.setAttribute('data-theme', mode);
  } catch {
    /* 非浏览器环境忽略 */
  }
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'board',
  setMode: (mode) => {
    const next = normalizeThemeMode(mode);
    applyThemeMode(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 隐私模式下忽略 */
    }
    set({ mode: next });
  },
  cycle: () => get().setMode(nextThemeMode(get().mode)),
}));

/** 启动时先落 data-theme 再渲染，避免首屏闪一下浅色 */
export function bootTheme(): ThemeMode {
  const mode = readStoredTheme();
  applyThemeMode(mode);
  useThemeStore.setState({ mode });
  return mode;
}
