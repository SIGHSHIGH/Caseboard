/**
 * 图片二进制仓库（决策 D10）：原件与两级缩略图都放 IndexedDB，
 * CaseDoc 里只留 Asset 元数据。M4 接 Tauri 后只需替换本文件实现。
 */
const DB_NAME = 'caseboard-assets';
const DB_VERSION = 1;
const ORIGINAL_STORE = 'originals';
const THUMB_STORE = 'thumbs';

export const THUMB_SMALL = 256;
export const THUMB_LARGE = 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前环境不支持 IndexedDB，无法保存图片原件'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ORIGINAL_STORE)) db.createObjectStore(ORIGINAL_STORE);
        if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('打开素材库数据库失败：' + (request.error?.message ?? '未知错误')));
    });
  }
  return dbPromise;
}

function requestOf<T>(store: string, mode: IDBTransactionMode, run: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('素材库读写失败：' + (request.error?.message ?? '未知错误')));
      }),
  );
}

function keyOf(assetId: string, size: number): string {
  return `${assetId}:${size}`;
}

export const imageStore = {
  putOriginal(assetId: string, blob: Blob): Promise<IDBValidKey> {
    return requestOf(ORIGINAL_STORE, 'readwrite', (store) => store.put(blob, assetId));
  },

  getOriginal(assetId: string): Promise<Blob | undefined> {
    return requestOf<Blob | undefined>(ORIGINAL_STORE, 'readonly', (store) => store.get(assetId) as IDBRequest<Blob | undefined>);
  },

  putThumb(assetId: string, size: number, blob: Blob): Promise<IDBValidKey> {
    return requestOf(THUMB_STORE, 'readwrite', (store) => store.put(blob, keyOf(assetId, size)));
  },

  getThumb(assetId: string, size: number): Promise<Blob | undefined> {
    return requestOf<Blob | undefined>(THUMB_STORE, 'readonly', (store) => store.get(keyOf(assetId, size)) as IDBRequest<Blob | undefined>);
  },

  async remove(assetId: string): Promise<void> {
    await requestOf(THUMB_STORE, 'readwrite', (store) => store.delete(keyOf(assetId, THUMB_SMALL)));
    await requestOf(THUMB_STORE, 'readwrite', (store) => store.delete(keyOf(assetId, THUMB_LARGE)));
    await requestOf(ORIGINAL_STORE, 'readwrite', (store) => store.delete(assetId));
  },

  async stats(): Promise<{ originals: number; thumbs: number }> {
    const originals = await requestOf<number>(ORIGINAL_STORE, 'readonly', (store) => store.count());
    const thumbs = await requestOf<number>(THUMB_STORE, 'readonly', (store) => store.count());
    return { originals, thumbs };
  },
};

/** 缩略图 objectURL 缓存：同一素材同一尺寸只创建一次，卸载时统一 revoke */
const urlCache = new Map<string, string>();

export async function thumbUrl(assetId: string, size: number = THUMB_SMALL): Promise<string | null> {
  const key = keyOf(assetId, size);
  const cached = urlCache.get(key);
  if (cached) return cached;
  try {
    const blob = await imageStore.getThumb(assetId, size);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export function releaseThumbUrl(assetId: string, size: number = THUMB_SMALL): void {
  const key = keyOf(assetId, size);
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export function releaseAllThumbUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
