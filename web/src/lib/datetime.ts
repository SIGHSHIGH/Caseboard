import type { TimeRange } from '../types';

/**
 * M9 新增：日期时间控件 ↔ 文档里时间字符串的互换。
 * 约定：fields 里存给人看的 `YYYY-MM-DD HH:mm`，node.time.start 存 ISO 风格的
 * `YYYY-MM-DDTHH:mm`（timeline.ts 的 parseTimelineTime 认得这种写法，且不带时区，按墙上时间处理）。
 */

const DATE_TIME_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const YEAR_ONLY = /^(\d{4})$/;
const LOOSE = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[T ](\d{1,2}):(\d{2}))?/;

function pad(value: number): string {
  return value < 10 ? '0' + value : String(value);
}

/** 把任意时间文本规范成 `YYYY-MM-DDTHH:mm`（控件可用的最小粒度是分钟），无法解析返回 '' */
export function toDateTimeInput(text: string | undefined | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  const strict = DATE_TIME_INPUT.exec(trimmed);
  if (strict) return `${strict[1]}-${strict[2]}-${strict[3]}T${strict[4]}:${strict[5]}`;
  // 只写年份的老数据（时间线也认这种写法）补成当年 1 月 1 日零点
  const yearOnly = YEAR_ONLY.exec(trimmed);
  if (yearOnly) return `${yearOnly[1]}-01-01T00:00`;
  const loose = LOOSE.exec(trimmed);
  if (!loose) return '';
  const year = loose[1];
  const month = pad(Number(loose[2] ?? 1));
  const day = pad(Number(loose[3] ?? 1));
  const hour = pad(Number(loose[4] ?? 0));
  const minute = pad(Number(loose[5] ?? 0));
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** 控件值 → 文档里的展示文本 `YYYY-MM-DD HH:mm`；空值返回 '' */
export function fromDateTimeInput(value: string): string {
  const iso = toDateTimeInput(value);
  if (iso.length === 0) return '';
  return iso.replace('T', ' ');
}

/** 控件值 → node.time；空值返回 null（调用方据此删掉 node.time） */
export function timeRangeFromInput(value: string): TimeRange | null {
  const iso = toDateTimeInput(value);
  if (iso.length === 0) return null;
  return { start: iso };
}
