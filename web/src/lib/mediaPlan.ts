/**
 * PDF 抽页 / 视频抽帧的纯规划函数（M2-5，无 DOM，smoke 直接测）。
 */

/** 解析页码范围："1-3,5,8-9" → [1,2,3,5,8,9]，去重升序并夹到 1..total */
export function parsePageRange(input: string, total: number): number[] {
  const limit = Math.max(0, Math.floor(total));
  if (limit === 0) return [];
  const pages = new Set<number>();
  const chunks = input.split(/[,，、;；\s]+/).filter(Boolean);
  for (const chunk of chunks) {
    const match = /^(\d+)\s*[-–—~]\s*(\d+)$/.exec(chunk);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const low = Math.max(1, Math.min(start, end));
      const high = Math.min(limit, Math.max(start, end));
      for (let page = low; page <= high; page += 1) pages.add(page);
      continue;
    }
    const single = Number(chunk);
    if (Number.isFinite(single) && single >= 1 && single <= limit) pages.add(Math.floor(single));
  }
  return [...pages].sort((a, b) => a - b);
}

/** 等距抽帧时间点：把时长按 count 等分后取每段中点（避开片头片尾黑屏） */
export function planFrameTimes(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const total = Math.max(1, Math.min(24, Math.round(count)));
  const step = duration / total;
  const times: number[] = [];
  for (let index = 0; index < total; index += 1) {
    times.push(Number((step * index + step / 2).toFixed(3)));
  }
  return times;
}

/** 秒 → "1:23" 或 "1:02:03" */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}`;
}

/** 抽页/抽帧产物的文件名：保留原名主干，加后缀 */
export function extractedName(sourceName: string, suffix: string): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${stem}-${suffix}.png`;
}
