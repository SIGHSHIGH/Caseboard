import { useEffect, useState } from 'react';
import { imageStore, thumbUrl } from '../../services/imageStore';

/**
 * 素材缩略图的 objectURL 生命周期管理（M2-3 起共用）。
 * IndexedDB 里没有原件时返回 null，由调用方渲染占位，不抛错。
 */
export function useAssetThumb(assetId: string | undefined, size = 256): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!assetId) {
      setUrl(null);
      return () => {
        alive = false;
      };
    }
    void thumbUrl(assetId, size)
      .then((next) => {
        if (alive) setUrl(next);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [assetId, size]);

  return url;
}

/** 原件是否在本地（用于右栏提示「原件不在当前环境」） */
export async function hasOriginal(assetId: string): Promise<boolean> {
  try {
    const blob = await imageStore.getOriginal(assetId);
    return blob !== null && blob !== undefined;
  } catch {
    return false;
  }
}
