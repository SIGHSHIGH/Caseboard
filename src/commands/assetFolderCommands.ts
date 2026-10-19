import type { AssetFolder } from '../types';
import type { Command } from './types';

/**
 * 素材文件夹命令（M10）：素材库从「只有证据/AI 两个分区」升级成可自建文件夹。
 * 文件夹只是分类标签，不影响原有 zone 语义（AI 分区规则仍然生效）。
 */

export interface AddAssetFolderInput {
  id: string;
  title: string;
  parentId?: string | null;
  order?: number;
}

export function addAssetFolder(input: AddAssetFolderInput): Command {
  return {
    label: `新建素材文件夹「${input.title}」`,
    apply(draft) {
      const folders = draft.assetFolders ?? [];
      if (folders.some((folder) => folder.id === input.id)) return;
      const folder: AssetFolder = {
        id: input.id,
        title: input.title,
        order: input.order ?? folders.length,
      };
      if (input.parentId) folder.parentId = input.parentId;
      draft.assetFolders = [...folders, folder];
    },
  };
}

export interface AssetFolderPatch {
  title?: string;
  parentId?: string | null;
}

/** 是否会把文件夹挪到自己的子孙下面（会造成环，必须拒绝） */
function createsCycle(folders: AssetFolder[], id: string, parentId: string): boolean {
  let cursor: string | undefined = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = folders.find((folder) => folder.id === cursor)?.parentId;
  }
  return false;
}

export function updateAssetFolder(id: string, patch: AssetFolderPatch): Command {
  return {
    label: '修改素材文件夹',
    apply(draft) {
      const folders = draft.assetFolders ?? [];
      const folder = folders.find((item) => item.id === id);
      if (!folder) return;
      if (patch.title !== undefined && patch.title.trim().length > 0) folder.title = patch.title.trim();
      if (patch.parentId !== undefined) {
        if (patch.parentId && createsCycle(folders, id, patch.parentId)) return;
        if (patch.parentId) folder.parentId = patch.parentId;
        else delete folder.parentId;
      }
      draft.assetFolders = folders;
    },
  };
}

/** 删除文件夹：子文件夹上提到它的父级，素材回到「未分类」，不删任何素材 */
export function deleteAssetFolder(id: string): Command {
  return {
    label: '删除素材文件夹',
    apply(draft) {
      const folders = draft.assetFolders ?? [];
      const target = folders.find((item) => item.id === id);
      if (!target) return;
      for (const folder of folders) {
        if (folder.parentId !== id) continue;
        if (target.parentId) folder.parentId = target.parentId;
        else delete folder.parentId;
      }
      for (const asset of draft.assets) {
        if (asset.folderId === id) delete asset.folderId;
      }
      draft.assetFolders = folders.filter((item) => item.id !== id);
    },
  };
}

/** 把素材放进文件夹（null = 移出到未分类） */
export function moveAssetsToFolder(assetIds: readonly string[], folderId: string | null): Command {
  return {
    label: folderId ? '素材移入文件夹' : '素材移出文件夹',
    apply(draft) {
      const ids = new Set(assetIds);
      for (const asset of draft.assets) {
        if (!ids.has(asset.id)) continue;
        if (folderId) asset.folderId = folderId;
        else delete asset.folderId;
      }
    },
  };
}
