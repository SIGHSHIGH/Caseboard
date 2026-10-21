import { create } from 'zustand';

interface TimelineStore {
  /** 播放游标（UTC 毫秒）；null 表示跟随刻度起点 */
  cursor: number | null;
  playing: boolean;
  speed: number;
  setCursor: (cursor: number | null) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
}

/** 时间线播放状态（M5-5）：只影响视图，不改文档 */
export const useTimelineStore = create<TimelineStore>((set) => ({
  cursor: null,
  playing: false,
  speed: 1,
  setCursor: (cursor) => set({ cursor }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  setSpeed: (speed) => set({ speed }),
}));
