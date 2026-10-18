import { newId } from '../lib/id';
import { formatAssetNo, parseAssetNo } from '../lib/assetMeta';
import { THUMB_LARGE, THUMB_SMALL } from '../lib/assetMeta';
import { imageStore } from './imageStore';
import type { ExifInfo } from './exif';
import type { Asset } from '../types';

/** 预处理结果：哈希 / 尺寸 / 两级缩略图 / EXIF，全部在主线程之外算好 */
export interface PreparedImage {
  file: File;
  hash: string;
  width: number;
  height: number;
  small: Blob;
  large: Blob;
  exif: ExifInfo | null;
}

export interface PrepareFailure {
  name: string;
  error: string;
}

export interface PrepareProgress {
  done: number;
  total: number;
  name: string;
}

export interface PrepareResult {
  prepared: PreparedImage[];
  failed: PrepareFailure[];
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

type WorkerReply = WorkerSuccess | WorkerFailure;

interface PendingJob {
  resolve: (value: WorkerSuccess) => void;
  reject: (error: Error) => void;
}

/** 固定 3 个 worker 的池子：500 张导入时并发受控，避免一次性占满内存 */
class ImageWorkerPool {
  private workers: Worker[] = [];
  private free: Worker[] = [];
  private queue: Array<() => void> = [];
  private pending = new Map<string, PendingJob>();

  constructor(private readonly size = 3) {}

  private ensureWorkers(): void {
    if (this.workers.length > 0) return;
    if (typeof Worker === 'undefined') throw new Error('当前环境不支持 Web Worker，无法预处理图片');
    for (let index = 0; index < this.size; index += 1) {
      const worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        const job = this.pending.get(reply.id);
        this.pending.delete(reply.id);
        this.free.push(worker);
        if (!job) return;
        if (reply.ok) job.resolve(reply);
        else job.reject(new Error(reply.error));
        const next = this.queue.shift();
        if (next) next();
      };
      worker.onerror = (event) => {
        const message = event.message || '图片处理线程异常';
        this.pending.forEach((job, id) => {
          this.pending.delete(id);
          job.reject(new Error(message));
        });
        this.free.push(worker);
      };
      this.workers.push(worker);
      this.free.push(worker);
    }
  }

  run(file: File): Promise<WorkerSuccess> {
    this.ensureWorkers();
    return new Promise<WorkerSuccess>((resolve, reject) => {
      const start = () => {
        const worker = this.free.pop();
        if (!worker) {
          this.queue.push(start);
          return;
        }
        const id = newId('job');
        this.pending.set(id, { resolve, reject });
        worker.postMessage({ id, file });
      };
      start();
    });
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.free = [];
    this.pending.clear();
    this.queue = [];
  }
}

let pool: ImageWorkerPool | null = null;

function poolOf(): ImageWorkerPool {
  if (!pool) pool = new ImageWorkerPool(3);
  return pool;
}

export function disposeImagePool(): void {
  pool?.dispose();
  pool = null;
}

export interface SaveAssetOptions {
  source?: Asset['source'];
  zone?: Asset['zone'];
  /** 来源文字标签（导入向导里统一选择：现场照片 / 书证翻拍 …） */
  sourceLabel?: string;
  /** 统一覆盖拍摄时间（向导里可改），未传时用 EXIF */
  capturedAt?: string;
  /** 起始编号，如 IMG-0007；不传则从 IMG-0001 开始 */
  startNo?: string;
}

function nextNo(seq: number): string {
  return formatAssetNo(seq);
}

export const imageService = {
  /** 批量预处理（可由拖入 / 粘贴 / 批选 / 目录监视四处共用） */
  async prepare(files: File[], onProgress?: (progress: PrepareProgress) => void): Promise<PrepareResult> {
    const images = files.filter((file) => file.type.startsWith('image/'));
    const failed: PrepareFailure[] = files
      .filter((file) => !file.type.startsWith('image/'))
      .map((file) => ({ name: file.name || '未命名文件', error: 'M2-3 只处理图片；PDF/视频见 M2-5' }));
    const prepared: PreparedImage[] = [];
    let done = 0;
    const runOne = async (file: File) => {
      try {
        const result = await poolOf().run(file);
        prepared.push({
          file,
          hash: result.hash,
          width: result.width,
          height: result.height,
          small: result.small,
          large: result.large,
          exif: result.exif,
        });
      } catch (error) {
        failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
      } finally {
        done += 1;
        onProgress?.({ done, total: images.length, name: file.name });
      }
    };
    await Promise.all(images.map((file) => runOne(file)));
    // 保持传入顺序，便于向导列表与用户预期一致
    const order = new Map(images.map((file, index) => [file, index]));
    prepared.sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0));
    return { prepared, failed };
  },

  /** 落库：原件 + 两级缩略图写入 IndexedDB，返回可直接塞进 CaseDoc 的元数据 */
  async save(prepared: PreparedImage[], options: SaveAssetOptions = {}): Promise<Asset[]> {
    let seq = parseAssetNo(options.startNo) || 1;
    const assets: Asset[] = [];
    for (const item of prepared) {
      const id = newId('a');
      await imageStore.putOriginal(id, item.file);
      await imageStore.putThumb(id, THUMB_SMALL, item.small);
      await imageStore.putThumb(id, THUMB_LARGE, item.large);
      const asset: Asset = {
        id,
        path: `assets/${id}`,
        kind: 'image',
        hash: item.hash,
        thumbnails: [`${id}:${THUMB_SMALL}`, `${id}:${THUMB_LARGE}`],
        source: options.source ?? 'import',
        sourceLabel: options.sourceLabel,
        zone: options.zone ?? 'evidence',
        width: item.width,
        height: item.height,
        name: item.file.name,
        size: item.file.size,
        mimeType: item.file.type,
        no: nextNo(seq),
        capturedAt: options.capturedAt || item.exif?.capturedAt,
        camera: item.exif?.camera,
        gps: item.exif?.gps,
        addedAt: new Date().toISOString(),
        annotations: [],
      };
      assets.push(asset);
      seq += 1;
    }
    return assets;
  },
};
