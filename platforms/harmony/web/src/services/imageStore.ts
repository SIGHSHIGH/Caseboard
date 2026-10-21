/**
 * 图片二进制仓库（决策 D10 / D3）：原件与两级缩略图。
 *
 * - 桌面端（M4）：原件落 <数据目录>/assets/<id>.<ext>，缩略图落 assets/thumbs/，
 *   CaseDoc 里只留 Asset 元数据；通过 platform.ts 的 Rust 命令读写。
 * - 网页端：IndexedDB（M2 起的实现，保留以便浏览器里开发调试）。
 *
 * 对外 API 不变：调用方不需要知道自己跑在哪里。
 */
import {
  assetFileUrl,
  assetFilePath,
  readAssetBytes,
  readThumbBytes,
  removeAssetFiles,
  saveAssetBytes,
  saveThumbBytes,
  thumbFilePath,
  usesNativeAssetStore,
} from './platform';

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
  return assetId + ':' + size;
}

function extOfMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'bin';
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** TS 5.9 起 Uint8Array 带 ArrayBufferLike 泛型，直接塞进 Blob 会类型报错，这里复制成独立 ArrayBuffer。 */
function bytesToBlob(bytes: Uint8Array, type = ''): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer as ArrayBuffer], { type });
}

/** 旧数据兼容：原生文件仓里没有时再看一眼 IndexedDB（鸿蒙 H5 早期把素材存在那里） */
async function idbGetOriginal(assetId: string): Promise<Blob | undefined> {
  try {
    return await requestOf<Blob | undefined>(ORIGINAL_STORE, 'readonly', (store) => store.get(assetId) as IDBRequest<Blob | undefined>);
  } catch {
    return undefined;
  }
}

async function idbGetThumb(assetId: string, size: number): Promise<Blob | undefined> {
  try {
    return await requestOf<Blob | undefined>(THUMB_STORE, 'readonly', (store) => store.get(keyOf(assetId, size)) as IDBRequest<Blob | undefined>);
  } catch {
    return undefined;
  }
}

export const imageStore = {
  /** 原件落盘，返回可直接塞进 img/导出 的路径（原生环境为沙箱绝对路径） */
  async putOriginal(assetId: string, blob: Blob): Promise<string> {
    if (usesNativeAssetStore()) {
      const bytes = await blobToBytes(blob);
      return saveAssetBytes(assetId, extOfMime(blob.type), bytes);
    }
    await requestOf(ORIGINAL_STORE, 'readwrite', (store) => store.put(blob, assetId));
    return 'assets/' + assetId;
  },

  async getOriginal(assetId: string): Promise<Blob | undefined> {
    if (usesNativeAssetStore()) {
      try {
        const bytes = await readAssetBytes(assetId);
        return bytesToBlob(bytes);
      } catch {
        return idbGetOriginal(assetId);
      }
    }
    return requestOf<Blob | undefined>(ORIGINAL_STORE, 'readonly', (store) => store.get(assetId) as IDBRequest<Blob | undefined>);
  },

  /** 原件字节（.caseboard 打包 / 图片包导出用，省一次 Blob 转换） */
  async originalBytes(assetId: string): Promise<Uint8Array | null> {
    if (usesNativeAssetStore()) {
      try {
        return await readAssetBytes(assetId);
      } catch {
        const blob = await idbGetOriginal(assetId);
        return blob ? blobToBytes(blob) : null;
      }
    }
    const blob = await requestOf<Blob | undefined>(ORIGINAL_STORE, 'readonly', (store) => store.get(assetId) as IDBRequest<Blob | undefined>);
    return blob ? blobToBytes(blob) : null;
  },

  async putThumb(assetId: string, size: number, blob: Blob): Promise<string | void> {
    if (usesNativeAssetStore()) {
      const bytes = await blobToBytes(blob);
      return saveThumbBytes(assetId, size, extOfMime(blob.type), bytes);
    }
    await requestOf(THUMB_STORE, 'readwrite', (store) => store.put(blob, keyOf(assetId, size)));
  },

  async getThumb(assetId: string, size: number): Promise<Blob | undefined> {
    if (usesNativeAssetStore()) {
      try {
        const bytes = await readThumbBytes(assetId, size);
        return bytesToBlob(bytes, 'image/jpeg');
      } catch {
        return idbGetThumb(assetId, size);
      }
    }
    return requestOf<Blob | undefined>(THUMB_STORE, 'readonly', (store) => store.get(keyOf(assetId, size)) as IDBRequest<Blob | undefined>);
  },

  async remove(assetId: string): Promise<void> {
    if (usesNativeAssetStore()) {
      await removeAssetFiles(assetId);
      return;
    }
    await requestOf(THUMB_STORE, 'readwrite', (store) => store.delete(keyOf(assetId, THUMB_SMALL)));
    await requestOf(THUMB_STORE, 'readwrite', (store) => store.delete(keyOf(assetId, THUMB_LARGE)));
    await requestOf(ORIGINAL_STORE, 'readwrite', (store) => store.delete(assetId));
  },

  async stats(): Promise<{ originals: number; thumbs: number }> {
    if (usesNativeAssetStore()) return { originals: -1, thumbs: -1 };
    const originals = await requestOf<number>(ORIGINAL_STORE, 'readonly', (store) => store.count());
    const thumbs = await requestOf<number>(THUMB_STORE, 'readonly', (store) => store.count());
    return { originals, thumbs };
  },
};

/** 缩略图 URL 缓存：同一素材同一尺寸只解析一次（原生是文件 URL，浏览器是 objectURL） */
const urlCache = new Map<string, string>();

export async function thumbUrl(assetId: string, size: number = THUMB_SMALL): Promise<string | null> {
  const key = keyOf(assetId, size);
  const cached = urlCache.get(key);
  if (cached) return cached;
  // 缩略图已经是沙箱里的真实文件（桌面端 <数据目录>/thumbs，鸿蒙端 filesDir/thumbs），
  // 直接交给内核按 URL 取最省事：不用把字节经 base64 过一遍原生桥。
  // 前提是 ArkWeb 的图片加载真的开着——见 Index.ets 里 onlineImageAccess 的教训，
  // 那个开关一关，连 data: 图片都 complete=false，跟 URL 方案无关。
  if (usesNativeAssetStore()) {
    const filePath = await thumbFilePath(assetId, size);
    if (filePath) {
      const url = assetFileUrl(filePath);
      urlCache.set(key, url);
      return url;
    }
  }
  // 兜底：文件不在（或纯浏览器环境）时用字节造 objectURL。
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
    // 文件 URL 不能 revoke，只有 objectURL 才需要释放
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export function releaseAllThumbUrls(): void {
  for (const url of urlCache.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  urlCache.clear();
}

/** 素材原件是否在本机（右栏提示、.caseboard 打包判断用） */
export async function hasOriginalBytes(assetId: string): Promise<boolean> {
  const bytes = await imageStore.originalBytes(assetId);
  return !!bytes && bytes.length > 0;
}

export { assetFilePath };
