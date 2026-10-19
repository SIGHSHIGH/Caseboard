import type { Asset, AssetFolder } from '../types';

/**
 * M9：素材库分组。
 * 素材一多（一次导入几十张照片、再抽帧、再 AI 生图）只靠「证据 / AI」两个分区翻不过来，
 * 这里给出按来源渠道、按导入日期、按自建文件夹三种分组维度。
 * 纯函数放 lib：tsconfig.smoke.json 能 require 到，机器可断言。
 */

export type AssetGroupMode = 'folder' | 'source' | 'date' | 'none';

export const ASSET_GROUP_MODES: Array<{ id: AssetGroupMode; label: string }> = [
  { id: 'folder', label: '按文件夹' },
  { id: 'source', label: '按来源' },
  { id: 'date', label: '按日期' },
  { id: 'none', label: '不分' },
];

export const ASSET_SOURCE_LABELS: Record<string, string> = {
  import: '手动导入',
  clipboard: '粘贴',
  watch: '监视文件夹',
  ai: 'AI 生成',
  extract: 'PDF / 视频抽图',
};

export interface AssetGroup {
  key: string;
  label: string;
  items: Asset[];
}

const UNKNOWN_SOURCE = 'unknown';
/** 未归入任何文件夹的素材组 key */
export const NO_FOLDER_KEY = 'no-folder';
export const NO_FOLDER_LABEL = '未分类';

/** 文件夹的显示路径（父 > 子），用于分组标题 */
export function folderPath(folders: readonly AssetFolder[], folderId: string | undefined): string {
  if (!folderId) return NO_FOLDER_LABEL;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  let cursor: string | undefined = folderId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break;
    parts.unshift(folder.title);
    cursor = folder.parentId;
  }
  return parts.length > 0 ? parts.join(' / ') : NO_FOLDER_LABEL;
}

/** 素材来源渠道的中文名；没有渠道字段时归到「未标注」 */
export function sourceLabelOf(asset: Asset): string {
  const source = asset.source;
  if (!source) return '未标注';
  return ASSET_SOURCE_LABELS[source] ?? source;
}

/** 导入日期 `YYYY-MM-DD`；没有时间戳返回 '' */
export function dateOf(asset: Asset): string {
  const stamp = asset.addedAt;
  if (!stamp) return '';
  const text = String(stamp);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * 分组：组内保持传入顺序（调用方已按编号排好），组按「组名」排序，
 * `none` 模式返回单组（key='all'），方便组件只写一套渲染。
 * `folders` 只在 `mode === 'folder'` 时用到，未分组素材统一进「未分类」并排最后。
 */
export function groupAssets(assets: Asset[], mode: AssetGroupMode, folders: readonly AssetFolder[] = []): AssetGroup[] {
  if (mode === 'none') {
    return assets.length > 0 ? [{ key: 'all', label: '全部素材', items: assets }] : [];
  }
  if (mode === 'folder') {
    const buckets = new Map<string, { label: string; items: Asset[] }>();
    for (const asset of assets) {
      const key = asset.folderId ?? NO_FOLDER_KEY;
      const label = asset.folderId ? folderPath(folders, asset.folderId) : NO_FOLDER_LABEL;
      const bucket = buckets.get(key);
      if (bucket) bucket.items.push(asset);
      else buckets.set(key, { label, items: [asset] });
    }
    return [...buckets.entries()]
      .map(([key, value]) => ({ key, label: value.label, items: value.items }))
      .sort((a, b) => {
        const aLast = a.key === NO_FOLDER_KEY;
        const bLast = b.key === NO_FOLDER_KEY;
        if (aLast !== bLast) return aLast ? 1 : -1;
        return a.label.localeCompare(b.label, 'zh-CN');
      });
  }
  const buckets = new Map<string, { label: string; items: Asset[] }>();
  for (const asset of assets) {
    const rawKey =
      mode === 'source' ? (asset.source ?? UNKNOWN_SOURCE) : dateOf(asset).length > 0 ? dateOf(asset) : UNKNOWN_SOURCE;
    const label =
      mode === 'source'
        ? sourceLabelOf(asset)
        : dateOf(asset).length > 0
          ? dateOf(asset)
          : '没有导入日期';
    const bucket = buckets.get(rawKey);
    if (bucket) {
      bucket.items.push(asset);
    } else {
      buckets.set(rawKey, { label, items: [asset] });
    }
  }
  return [...buckets.entries()]
    .map(([key, value]) => ({ key, label: value.label, items: value.items }))
    .sort((a, b) => {
      // 「没有导入日期 / 未标注」永远排最后，其余按组名倒序（新日期在前）
      const aLast = a.key === UNKNOWN_SOURCE;
      const bLast = b.key === UNKNOWN_SOURCE;
      if (aLast !== bLast) return aLast ? 1 : -1;
      return b.key.localeCompare(a.key, 'zh-CN');
    });
}

/** 分组后的素材总数（用于校验没有把任何素材漏在组外） */
export function countGrouped(groups: AssetGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}
