import { parseExif, type ExifInfo } from '../services/exif';
import { THUMB_LARGE, THUMB_SMALL, computeThumbSize } from '../lib/assetMeta';

/** 图片预处理 Worker：SHA-256 + 两级缩略图 + EXIF，避免 500 张批量导入时卡死主线程（M2 风险项） */
interface WorkerRequest {
  id: string;
  file: File;
}

interface WorkerSuccess {
  id: string;
  ok: true;
  hash: string;
  width: number;
  height: number;
  small: Blob;
  large: Blob;
  exif: ExifInfo | null;
}

interface WorkerFailure {
  id: string;
  ok: false;
  error: string;
}

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerSuccess | WorkerFailure) => void;
};

const scope = self as unknown as WorkerScope;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

async function makeThumb(bitmap: ImageBitmap, maxEdge: number): Promise<Blob> {
  const size = computeThumbSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = new OffscreenCanvas(size.w, size.h);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建缩略图画布');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.w, size.h);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.w, size.h);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

scope.onmessage = (event) => {
  const { id, file } = event.data;
  void (async () => {
    try {
      const buffer = await file.arrayBuffer();
      const hash = toHex(await crypto.subtle.digest('SHA-256', buffer));
      const exif = parseExif(buffer);
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      const small = await makeThumb(bitmap, THUMB_SMALL);
      const large = await makeThumb(bitmap, THUMB_LARGE);
      bitmap.close();
      scope.postMessage({ id, ok: true, hash, width, height, small, large, exif });
    } catch (error) {
      scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
};
