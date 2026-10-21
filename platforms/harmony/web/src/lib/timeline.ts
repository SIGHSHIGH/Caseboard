/**
 * 时间线内核（M5-1）：把文档里的时间字段归一化成可播放的游标区间。
 *
 * 设计约束：
 * - 纯函数 + **UTC 口径**：解析与格式化都按 UTC 处理，同一份文档在任何时区
 *   得到同一批刻度（M5 验收 4a 要求游标切片可复现）。
 * - 只认字符串，不猜时区：带 Z / ±hh:mm 的走 Date.parse，其余按「墙上时间」。
 * - 区间事件（time.start + time.end）在游标落入区间时算「进行中」；
 *   只有起点的点事件在游标到达该时刻后算「已发生」。
 */
import type { CaseDoc, CaseNode, NodeType, Status } from '../types';

export interface TimelineScale {
  min: number;
  max: number;
  span: number;
  /** 文档里没有任何可解析时间 */
  empty: boolean;
  startText: string;
  endText: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  type: NodeType;
  /** 泳道键：按节点类型分道 */
  lane: NodeType;
  status: Status;
  confidence: number;
  /** UTC 毫秒 */
  start: number;
  end: number;
  /** start ≠ end，说明是区间事件 */
  hasRange: boolean;
  timeText: string;
}

export interface TimelineSlice {
  past: TimelineItem[];
  running: TimelineItem[];
  future: TimelineItem[];
}

const TIME_PATTERN = /^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?(?:[T ](\d{1,2}):(\d{2}))?(?::(\d{2}))?/;

/**
 * 宽松解析：2026 / 2026-09 / 2026-09-03 / 2026-09-03 20:10 / 2026-09-03T20:10:30+08:00。
 * 解析不出来返回 null。
 */
export function parseTimelineTime(text: string | undefined | null): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const match = TIME_PATTERN.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const at = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(at) ? at : null;
}

/** 游标刻度显示：2026-09-03 20:10 */
export function formatTimelineTime(at: number): string {
  if (!Number.isFinite(at)) return '';
  const iso = new Date(at).toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

/** 只显示日期：2026-09-03 */
export function formatTimelineDate(at: number): string {
  if (!Number.isFinite(at)) return '';
  return new Date(at).toISOString().slice(0, 10);
}

/** S4：node.time 缺失时，回退读这些字段键（按优先级） */
export const TIME_FIELD_KEYS = ['发生时刻', '时间', '交易时间', '日期', '案发时间'];

/**
 * 取实体的时间范围。
 * M9 / S4：老数据里大量节点只填了「发生时刻」这类字段而没有 node.time，
 * 结果新节点进不了时间线、滑杆与播放都是空的。这里在 node.time 缺失时回退读 fields。
 */
export function nodeTimeRange(node: CaseNode): { start: number; end: number } | null {
  let start = parseTimelineTime(node.time?.start);
  if (start === null) {
    const fields = node.fields ?? {};
    for (const key of TIME_FIELD_KEYS) {
      const raw = fields[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const parsed = parseTimelineTime(String(raw));
      if (parsed !== null) {
        start = parsed;
        break;
      }
    }
  }
  if (start === null) return null;
  let end = start;
  const parsedEnd = parseTimelineTime(node.time?.end);
  if (parsedEnd !== null && parsedEnd >= start) end = parsedEnd;
  return { start, end };
}

export function buildTimeline(doc: CaseDoc): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const node of doc.nodes) {
    const range = nodeTimeRange(node);
    if (!range) continue;
    items.push({
      id: node.id,
      title: node.title,
      type: node.type,
      lane: node.type,
      status: node.status,
      confidence: node.confidence,
      start: range.start,
      end: range.end,
      hasRange: range.end > range.start,
      timeText: formatTimelineRange({ start: range.start, end: range.end }),
    });
  }
  items.sort((a, b) => (a.start !== b.start ? a.start - b.start : a.id < b.id ? -1 : 1));
  return items;
}

/** 有区间显示区间，点事件只显示时刻 */
export function formatTimelineRange(item: { start: number; end?: number }): string {
  const startText = formatTimelineTime(item.start);
  if (item.end === undefined || item.end <= item.start) return startText;
  return startText + ' → ' + formatTimelineTime(item.end);
}

/** 文档时间刻度：最早起点 → 最晚终点（区间事件算终点） */
export function timelineScale(doc: CaseDoc): TimelineScale {
  const items = buildTimeline(doc);
  if (items.length === 0) {
    return { min: 0, max: 0, span: 0, empty: true, startText: '', endText: '' };
  }
  let min = items[0].start;
  let max = items[0].end;
  for (const item of items) {
    if (item.start < min) min = item.start;
    if (item.end > max) max = item.end;
  }
  return {
    min,
    max,
    span: max - min,
    empty: false,
    startText: formatTimelineTime(min),
    endText: formatTimelineTime(max),
  };
}

/** 把游标限制在刻度范围内；空刻度的游标固定为 0 */
export function clampCursor(scale: TimelineScale, at: number): number {
  if (scale.empty) return 0;
  if (!Number.isFinite(at)) return scale.min;
  return Math.min(Math.max(at, scale.min), scale.max);
}

/** 0–1 比例 → 时刻（播放条拖动用） */
export function cursorFromRatio(scale: TimelineScale, ratio: number): number {
  if (scale.empty) return 0;
  const clamped = Math.min(Math.max(Number.isFinite(ratio) ? ratio : 0, 0), 1);
  return clampCursor(scale, scale.min + scale.span * clamped);
}

/** 时刻 → 0–1 比例（播放条位置用）；空刻度返回 0 */
export function ratioFromCursor(scale: TimelineScale, at: number): number {
  if (scale.empty || scale.span <= 0) return 0;
  return Math.min(Math.max((clampCursor(scale, at) - scale.min) / scale.span, 0), 1);
}

/** 播放推进：speed 倍速、deltaMs 帧间隔（或真实流逝毫秒） */
export function advanceCursor(scale: TimelineScale, at: number, speed: number, deltaMs: number): number {
  if (scale.empty) return 0;
  const step = Math.max(0, deltaMs) * Math.max(0, speed);
  return clampCursor(scale, clampCursor(scale, at) + step);
}

/** 游标切片：已发生 / 进行中 / 未发生（同刻按已发生算，避免播放时闪烁） */
export function sliceTimeline(items: TimelineItem[], cursor: number): TimelineSlice {
  const slice: TimelineSlice = { past: [], running: [], future: [] };
  for (const item of items) {
    if (item.end < cursor) slice.past.push(item);
    else if (item.start > cursor) slice.future.push(item);
    else slice.running.push(item);
  }
  return slice;
}

/** 泳道分组：按首次出现顺序分道（items 需已按时间排序） */
export function laneGroups(items: TimelineItem[]): Array<{ lane: NodeType; items: TimelineItem[] }> {
  const lanes = new Map<NodeType, TimelineItem[]>();
  for (const item of items) {
    const bucket = lanes.get(item.lane) ?? [];
    bucket.push(item);
    lanes.set(item.lane, bucket);
  }
  return Array.from(lanes.entries()).map(([lane, laneItems]) => ({ lane, items: laneItems }));
}

/** 区间条带的横向几何（0–1 比例），点事件不产生条带（M5 验收 4） */
export interface TimelineBand {
  id: string;
  /** 起点在整条刻度上的比例 */
  left: number;
  /** 宽度比例（(end - start) / span），下限交给样式兜底 */
  width: number;
}

export function timelineBands(items: TimelineItem[], scale: TimelineScale): TimelineBand[] {
  if (scale.empty || scale.span <= 0) return [];
  const bands: TimelineBand[] = [];
  for (const item of items) {
    if (!item.hasRange) continue;
    const left = ratioFromCursor(scale, item.start);
    const right = ratioFromCursor(scale, item.end);
    bands.push({ id: item.id, left, width: Math.max(0, right - left) });
  }
  return bands.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 没有可解析时间的节点（时间线视图里要给「未排期」提示） */
export function nodesWithoutTime(doc: CaseDoc): CaseNode[] {
  return doc.nodes.filter((node) => nodeTimeRange(node) === null).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 时间片竖向排布步长（px）——同一时刻的多个事件靠它错行，避免互相遮挡（M12 / K8） */
export const CHIP_ROW_HEIGHT = 22;

/** 两个时间片之间至少间隔的比例，小于它就算「同一时刻」 */
export const CHIP_MIN_GAP = 0.045;

/**
 * 把一条泳道里的时间片按比例错行：比例接近的排到下一行，
 * 保证每个标题都露出来，而不是后一个把前一个压住。
 * 返回 id → 行号（0 起），以及总行数。
 */
export function stackChips(
  entries: Array<{ id: string; ratio: number }>,
  minGap = CHIP_MIN_GAP,
): { rows: Map<string, number>; rowCount: number } {
  const rows = new Map<string, number>();
  const last: number[] = [];
  const sorted = [...entries].sort((a, b) => a.ratio - b.ratio || (a.id < b.id ? -1 : 1));
  for (const entry of sorted) {
    const ratio = Number.isFinite(entry.ratio) ? Math.min(Math.max(entry.ratio, 0), 1) : 0;
    let row = last.findIndex((value) => ratio - value >= minGap);
    if (row < 0) {
      row = last.length;
      last.push(ratio);
    } else {
      last[row] = ratio;
    }
    rows.set(entry.id, row);
  }
  return { rows, rowCount: last.length };
}

/** 时间片所在的泳道高度：至少 40px，错行时按行数撑开 */
export function chipTrackHeight(rowCount: number): number {
  return Math.max(40, rowCount * CHIP_ROW_HEIGHT + 18);
}