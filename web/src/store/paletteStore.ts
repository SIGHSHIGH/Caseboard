import { create } from 'zustand';

/** 命令面板开关（M8 验收 6）：App 监听 Ctrl+K，TopBar 的「搜索」按钮也走这里。 */
interface PaletteStore {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

export const usePaletteStore = create<PaletteStore>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
}));
