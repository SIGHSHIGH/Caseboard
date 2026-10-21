import { create } from 'zustand';

export type ViewMode = 'board' | 'timeline' | 'present' | 'map';

interface ViewModeStore {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
}

/** 顶层视图切换：画布 / 时间线 / 演示（M5-5）。不属于文档，不进撤销栈 */
export const useViewModeStore = create<ViewModeStore>((set) => ({
  mode: 'board',
  setMode: (mode) => set({ mode }),
}));
