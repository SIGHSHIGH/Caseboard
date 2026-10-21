import type { Asset } from '../types';

/** 两级缩略图上限边长：小图用于素材库网格，大图用于画布卡片 */
export const THUMB_SMALL = 256;
export const THUMB_LARGE = 1024;
/** 素材编号前缀与位数：IMG-0001 */
export const ASSET_NO_PREFIX = 'IMG';
export const ASSET_NO_PAD = 4;

export interface Size {
  w: number;
  h: number;
}

/** 等比缩放到 maxEdge 以内；尺寸非法时返回正方形兜底，保证画布不会出现 0 宽高 */
export function computeThumbSize(width: number, height: number, maxEdge: number): Size {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { w: maxEdge, h: maxEdge };
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export function formatAssetNo(seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${ASSET_NO_PREFIX}-${String(n).padStart(ASSET_NO_PAD, '0')}`;
}

export function parseAssetNo(no: string | undefined): number {
  if (!no) return 0;
  const matched = /^IMG-(\d+)$/.exec(no.trim());
  return matched ? Number(matched[1]) : 0;
}

/** 下一个可用编号：取全库最大序号 +1（删除素材不回收编号，避免归档引用错位） */
export function nextAssetNo(assets: readonly Asset[]): string {
  let max = 0;
  for (const asset of assets) max = Math.max(max, parseAssetNo(asset.no));
  return formatAssetNo(max + 1);
}

export function hashShort(hash: string, length = 8): string {
  return hash.slice(0, length);
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatBytesPerSecond(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB/s`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`;
}

export interface DedupeCandidate {
  hash: string;
  name?: string;
}

export interface DuplicateEntry<T> {
  item: T;
  /** 命中库内已有素材时给出其 id */
  existingId?: string;
  /** hash：与库内已有素材重复；batch：本批内部重复 */
  reason: 'hash' | 'batch';
}

export interface DedupeResult<T> {
  fresh: T[];
  duplicates: DuplicateEntry<T>[];
}

/**
 * 哈希去重（验收标准 2）：先比库内已有素材，再比本批内重复。
 * 纯函数，便于在 smoke 里直接断言。
 */
export function dedupeCandidates<T extends DedupeCandidate>(
  existing: readonly { id: string; hash: string }[],
  items: readonly T[],
): DedupeResult<T> {
  const byHash = new Map<string, string>();
  for (const asset of existing) byHash.set(asset.hash, asset.id);
  const seen = new Set<string>();
  const fresh: T[] = [];
  const duplicates: DuplicateEntry<T>[] = [];
  for (const item of items) {
    const existingId = byHash.get(item.hash);
    if (existingId) {
      duplicates.push({ item, existingId, reason: 'hash' });
      continue;
    }
    if (seen.has(item.hash)) {
      duplicates.push({ item, reason: 'batch' });
      continue;
    }
    seen.add(item.hash);
    fresh.push(item);
  }
  return { fresh, duplicates };
}

/** 导入向导里的处理方式 */
export type ImportMode = 'library' | 'evidence-node';

export interface ImportDefaults {
  source: string;
  capturedAt: string;
  linkedNodeId: string;
}

export const ASSET_SOURCES = ['现场照片', '书证翻拍', '监控截图', '电子数据', '电子物证', '其他'] as const;
