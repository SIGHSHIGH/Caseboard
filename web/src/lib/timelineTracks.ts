import { NODE_TYPE_META } from './theme';
import type { TimelineItem } from './timeline';
import type { CaseNode, NodeType, TimelineConfig, TimelineTrack, TimelineTrackKind } from '../types';

/**
 * 时间线泳道（M10）：从「固定按节点类型分道」升级成「可配置多轨」。
 *
 * 需求里要的是「多条人物时间线并行」：把某个实体单独拉成一条轨，
 * 就能一眼看出它在一段时间里做了什么，而不只是「人物类型的节点都挤在一道」。
 */

export interface TrackLane {
  id: string;
  title: string;
  kind: TimelineTrackKind;
  ref: string;
  color: string;
  items: TimelineItem[];
}

/** 新建轨道的默认配色（按顺序取，避免每条都一个颜色） */
export const TRACK_COLORS = [
  '#C0392B',
  '#2F6F8F',
  '#4B7D4B',
  '#A8781F',
  '#6B5B95',
  '#3F7F7A',
  '#7A5C3E',
  '#8A8A8A',
];

export function defaultTrackColor(seq: number): string {
  return TRACK_COLORS[Math.abs(seq) % TRACK_COLORS.length];
}

/** 新建轨道 id：调用方负责保证唯一（传当前已有 id 列表） */
export function nextTrackId(existing: readonly TimelineTrack[]): string {
  const used = new Set(existing.map((track) => track.id));
  for (let seq = 1; seq <= existing.length + 1; seq += 1) {
    const id = `tr-${seq}`;
    if (!used.has(id)) return id;
  }
  return `tr-${Date.now().toString(36)}`;
}

export function entityTrackTitle(node: CaseNode): string {
  return `${NODE_TYPE_META[node.type].label} · ${node.title}`;
}

/** 把一个实体做成一条轨道（「新建时间线」的主要用途） */
export function entityTrack(node: CaseNode, seq: number): TimelineTrack {
  return {
    id: `tr-entity-${node.id}`,
    title: entityTrackTitle(node),
    kind: 'entity',
    ref: node.id,
    color: NODE_TYPE_META[node.type].color ?? defaultTrackColor(seq),
    order: seq,
  };
}

/** 按类型建一条轨道（老行为，但变成显式轨道） */
export function typeTrack(type: NodeType, seq: number): TimelineTrack {
  return {
    id: `tr-type-${type}`,
    title: NODE_TYPE_META[type].label,
    kind: 'type',
    ref: type,
    color: NODE_TYPE_META[type].color ?? defaultTrackColor(seq),
    order: seq,
  };
}

/** 默认轨道集合：老行为（按类型分道），让升级后的文档看起来没变 */
export function defaultTracks(items: readonly TimelineItem[]): TimelineTrack[] {
  const seen = new Set<NodeType>();
  const tracks: TimelineTrack[] = [];
  for (const item of items) {
    if (seen.has(item.type)) continue;
    seen.add(item.type);
    tracks.push(typeTrack(item.type, tracks.length));
  }
  return tracks;
}

function laneOf(track: TimelineTrack, items: readonly TimelineItem[]): TimelineItem[] {
  // M11（I9）：手工挑过条目就以手工清单为准，允许一条轨道混放不同实体的事件
  if (track.nodeIds && track.nodeIds.length > 0) {
    const picked = new Set(track.nodeIds);
    return items.filter((item) => picked.has(item.id));
  }
  if (track.kind === 'entity') return items.filter((item) => item.id === track.ref);
  return items.filter((item) => item.type === track.ref);
}

/**
 * 生成实际渲染的泳道列表。
 * - `prefs.mode === 'tracks'`：按配置的轨道顺序输出（空轨也保留，用户能看到自己新建的轨）
 * - 否则：按节点类型分道（M9 及更早的行为）
 */
export function buildTrackLanes(
  nodes: readonly CaseNode[],
  items: readonly TimelineItem[],
  config?: TimelineConfig,
): TrackLane[] {
  const mode = config?.prefs.mode ?? 'type';
  const configured = config?.tracks ?? [];
  const candidate = mode === 'tracks' && configured.length > 0 ? configured : defaultTracks(items);
  const nodeOf = new Map(nodes.map((node) => [node.id, node]));
  const ordered = [...candidate].sort((a, b) => a.order - b.order);
  return ordered.map((track, index) => {
    const base = track.kind === 'entity' ? nodeOf.get(track.ref) : undefined;
    const type = (base?.type ?? (track.kind === 'type' ? (track.ref as NodeType) : 'note')) as NodeType;
    const meta = NODE_TYPE_META[type];
    return {
      id: track.id,
      title: track.title || (base ? entityTrackTitle(base) : meta.label),
      kind: track.kind,
      ref: track.ref,
      color: track.color ?? meta.color ?? defaultTrackColor(index),
      items: laneOf(track, items),
    };
  });
}

export function laneItemCount(lanes: readonly TrackLane[]): number {
  return lanes.reduce((sum, lane) => sum + lane.items.length, 0);
}

/** 刻度跨度比例：1 = 整段时间铺满一屏；0.25 = 只看四分之一，横向可滚动 */
export function clampSpanRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 1;
  return Math.min(1, Math.max(0.1, ratio));
}

/** 泳道内部的横向宽度（百分比）：比例越小内容越宽，于是可以横向滚动看细节 */
export function trackWidthPct(ratio: number): number {
  return (1 / clampSpanRatio(ratio)) * 100;
}
