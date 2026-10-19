import { DEFAULT_TIMELINE_PREFS } from '../serializers/migrate';
import type { Command } from './types';
import type { TimelineConfig, TimelinePrefs, TimelineTrack } from '../types';

/**
 * 时间线配置命令（M10）：轨道与比例都进 Document Model，
 * 这样撤销、持久化、代码视图与画布看到的是同一份数据（Gate 0-1 / 0-2）。
 */

function ensureTimeline(config: TimelineConfig | undefined): TimelineConfig {
  if (config) {
    config.prefs = { ...DEFAULT_TIMELINE_PREFS, ...config.prefs };
    if (!Array.isArray(config.tracks)) config.tracks = [];
    return config;
  }
  return { tracks: [], prefs: { ...DEFAULT_TIMELINE_PREFS } };
}

export function setTimelinePrefs(patch: Partial<TimelinePrefs>): Command {
  return {
    label: '调整时间线视图',
    apply(draft) {
      const config = ensureTimeline(draft.timeline);
      config.prefs = { ...config.prefs, ...patch };
      draft.timeline = config;
    },
  };
}

export function addTimelineTrack(track: TimelineTrack): Command {
  return {
    label: `新建时间线「${track.title}」`,
    apply(draft) {
      const config = ensureTimeline(draft.timeline);
      if (!config.tracks.some((item) => item.id === track.id)) {
        config.tracks.push({ ...track, order: config.tracks.length });
      }
      // 新建轨道后自动切到「多轨」模式，否则用户看不到刚建的轨
      config.prefs = { ...config.prefs, mode: 'tracks', trackIds: config.prefs.trackIds };
      draft.timeline = config;
    },
  };
}

export function updateTimelineTrack(id: string, patch: Partial<TimelineTrack>): Command {
  return {
    label: '修改时间线轨道',
    apply(draft) {
      const config = ensureTimeline(draft.timeline);
      const track = config.tracks.find((item) => item.id === id);
      if (!track) return;
      Object.assign(track, patch);
      draft.timeline = config;
    },
  };
}

export function removeTimelineTrack(id: string): Command {
  return {
    label: '删除时间线轨道',
    apply(draft) {
      const config = ensureTimeline(draft.timeline);
      config.tracks = config.tracks.filter((item) => item.id !== id);
      config.tracks.forEach((item, index) => {
        item.order = index;
      });
      config.prefs = {
        ...config.prefs,
        trackIds: config.prefs.trackIds.filter((item) => item !== id),
      };
      if (config.tracks.length === 0) config.prefs = { ...config.prefs, mode: 'type' };
      draft.timeline = config;
    },
  };
}