/**
 * 文件夹监视（图片四路导入的第 4 路）。
 * M2 用 File System Access API + 轮询（浏览器没有真正的 watch 事件）；
 * M4 接 Tauri 后换成 notify crate 的推送，接口保持不变。
 */
export interface WatchOptions {
  intervalMs?: number;
  /** 新出现或大小/修改时间变化的图片 */
  onFiles: (files: File[]) => void;
  onError?: (message: string) => void;
}

export interface WatchHandle {
  readonly active: boolean;
  readonly directoryName: string;
  stop(): void;
}

interface DirEntryLike {
  kind: string;
  name: string;
  getFile?: () => Promise<File>;
}

interface DirHandleLike {
  name: string;
  values: () => AsyncIterable<DirEntryLike>;
}

interface PickerWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandleLike>;
}

export function supportsDirectoryWatch(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function';
}

function signatureOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function startDirectoryWatch(options: WatchOptions): Promise<WatchHandle> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('当前浏览器不支持文件夹监视（需要 File System Access API）');
  const handle = await picker({ mode: 'read' });
  const known = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const interval = Math.max(1500, options.intervalMs ?? 4000);

  const scan = async (): Promise<File[]> => {
    const changed: File[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !entry.getFile) continue;
      if (!/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(entry.name)) continue;
      try {
        const file = await entry.getFile();
        const signature = signatureOf(file);
        if (known.has(signature)) continue;
        known.add(signature);
        changed.push(file);
      } catch {
        // 单个文件读不到（权限/占用）不应中断整轮扫描
      }
    }
    return changed;
  };

  const initial = await scan();
  if (initial.length > 0) options.onFiles(initial);

  const tick = async () => {
    if (stopped) return;
    try {
      const changed = await scan();
      if (changed.length > 0) options.onFiles(changed);
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : String(error));
    }
    if (!stopped) timer = setTimeout(() => void tick(), interval);
  };
  timer = setTimeout(() => void tick(), interval);

  return {
    get active() {
      return !stopped;
    },
    directoryName: handle.name,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
