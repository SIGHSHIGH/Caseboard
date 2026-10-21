/**
 * 文件能力走 service 接口（决策 D3）：
 *  - 鸿蒙端：原生桥 `saveFile` / `openFile` / `readPickedFile`（DocumentViewPicker）；
 *  - 桌面端：Tauri 原生对话框 + Rust 读写；
 *  - 网页端：`<input type="file">` 与 `a[download]`（ArkWeb 下不启用，见下）。
 * 组件层只依赖本接口，不得直接碰 Blob / a[download]。
 */
import { base64ToBytes, bytesToBase64, isHarmony, isTauri, readFileBytes, writeFileBytes } from './platform';
import { callNative } from './harmony';

/** 与 Tauri DialogFilter 同形的过滤器（这里自带一份，免去运行时依赖 tauri 包）。 */
export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface PickedFile {
  name: string;
  text: string;
  path?: string;
}

export interface PickedBytes {
  name: string;
  bytes: Uint8Array;
  path: string;
}

export interface FileService {
  /** 保存文本（JSON 导出 / SVG / 清单等），返回落盘路径；用户取消返回 null */
  saveText(fileName: string, text: string, filters?: DialogFilter[]): Promise<string | null>;
  /** 保存二进制（PNG / PDF / .caseboard / zip） */
  saveBytes(fileName: string, bytes: Uint8Array, filters?: DialogFilter[]): Promise<string | null>;
  /** 打开文本文件（JSON / DSL） */
  openText(filters?: DialogFilter[]): Promise<PickedFile | null>;
  /** 打开二进制文件（.caseboard / 图片 / PDF） */
  openBytes(filters?: DialogFilter[]): Promise<PickedBytes | null>;
  // ---------- 以下为网页模式的旧入口，桌面端仍可用于缩略图快速下载 ----------
  downloadText(fileName: string, text: string, mime?: string): void;
  downloadBlob(fileName: string, blob: Blob): void;
  pickTextFile(accept: string): Promise<PickedFile | null>;
  /** 批量选择文件（图片导入向导的入口之一） */
  pickFiles(accept: string, multiple?: boolean): Promise<File[]>;
}

interface PickedFileJson {
  name: string;
  uri: string;
  size: number;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Tauri 过滤器 → DocumentViewPicker 的 `fileSuffixFilters` 口令（"描述|.a,.b"）。 */
function toSuffixChoices(filters?: DialogFilter[]): string {
  if (!filters || filters.length === 0) return '[]';
  const choices = filters
    .filter((filter) => filter.extensions.length > 0)
    .map((filter) => filter.name + '|' + filter.extensions.map((ext) => (ext.startsWith('.') ? ext : '.' + ext)).join(','));
  return JSON.stringify(choices);
}

/** `<input accept>` → 后缀口令：".json,.txt" 这种写法直接搬。 */
function acceptToSuffixes(accept: string): string {
  const parts = accept
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('.'));
  if (parts.length === 0) return '[]';
  return JSON.stringify(['文件|' + parts.join(',')]);
}

function webDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function webPick(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

async function harmonySave(fileName: string, bytes: Uint8Array, mimeType: string, filters?: DialogFilter[]): Promise<string | null> {
  const uri = await callNative<string>('saveFile', fileName, mimeType, bytesToBase64(bytes), toSuffixChoices(filters));
  return typeof uri === 'string' && uri.length > 0 ? uri : null;
}

async function harmonyPick(suffixesJson: string, multiple: boolean): Promise<PickedFileJson[]> {
  const list = await callNative<PickedFileJson[]>('openFile', suffixesJson, multiple);
  return Array.isArray(list) ? list : [];
}

export const fileService: FileService = {
  async saveText(fileName, text, filters) {
    const bytes = new TextEncoder().encode(text);
    return this.saveBytes(fileName, bytes, filters);
  },

  async saveBytes(fileName, bytes, filters) {
    if (isHarmony()) {
      return harmonySave(fileName, bytes, 'application/octet-stream', filters);
    }
    if (!isTauri()) {
      webDownload(fileName, new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
      return null;
    }
    const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
    const path = await saveDialog({ defaultPath: fileName, filters });
    if (!path) return null;
    await writeFileBytes(path, bytes);
    return path;
  },

  async openText(filters) {
    const picked = await this.openBytes(filters);
    if (!picked) return null;
    return { name: picked.name, text: new TextDecoder().decode(picked.bytes), path: picked.path };
  },

  async openBytes(filters) {
    if (isHarmony()) {
      const picked = await harmonyPick(toSuffixChoices(filters), false);
      const first = picked[0];
      if (!first) return null;
      const base64 = await callNative<string>('readPickedFile', first.uri);
      return { name: first.name || baseName(first.uri), bytes: base64ToBytes(base64), path: first.uri };
    }
    if (!isTauri()) {
      // ArkWeb 没有下载管理器，`<input type=file>` 也要 onShowFileSelector 才会弹选择器，
      // 所以「网页降级路径」在鸿蒙下必须显式关掉，避免用户点了没反应。
      const files = await webPick(filters?.flatMap((filter) => filter.extensions.map((ext) => '.' + ext)).join(',') ?? '', false);
      const file = files[0];
      if (!file) return null;
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), path: file.name };
    }
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const path = await openDialog({ multiple: false, directory: false, filters });
    if (!path || typeof path !== 'string') return null;
    const bytes = await readFileBytes(path);
    return { name: baseName(path), bytes, path };
  },

  downloadText(fileName, text, mime = 'application/json;charset=utf-8') {
    if (isHarmony()) {
      // 无下载管理器：转成「另存为」由用户挑位置（保留一次显式交互，不静默丢文件）
      void this.saveBytes(fileName, new TextEncoder().encode(text), [{ name: '文件', extensions: [fileName.split('.').pop() ?? 'txt'] }]).catch((error: unknown) => {
        console.error('[caseboard] 另存为失败', error);
      });
      return;
    }
    webDownload(fileName, new Blob([text], { type: mime }));
  },

  downloadBlob(fileName, blob) {
    if (isHarmony()) {
      void blob.arrayBuffer().then((buffer) => this.saveBytes(fileName, new Uint8Array(buffer), [{
        name: '文件',
        extensions: [fileName.split('.').pop() ?? 'bin'],
      }])).catch((error: unknown) => {
        console.error('[caseboard] 另存为失败', error);
      });
      return;
    }
    webDownload(fileName, blob);
  },

  async pickTextFile(accept) {
    if (isHarmony()) {
      const picked = await harmonyPick(acceptToSuffixes(accept), false);
      const first = picked[0];
      if (!first) return null;
      const base64 = await callNative<string>('readPickedFile', first.uri);
      return { name: first.name || baseName(first.uri), text: new TextDecoder().decode(base64ToBytes(base64)) };
    }
    const files = await webPick(accept, false);
    const file = files[0];
    if (!file) return null;
    return { name: file.name, text: await file.text() };
  },

  async pickFiles(accept, multiple = true) {
    if (isHarmony()) {
      const picked = await harmonyPick(acceptToSuffixes(accept), multiple);
      const out: File[] = [];
      for (const item of picked) {
        const base64 = await callNative<string>('readPickedFile', item.uri);
        const bytes = base64ToBytes(base64);
        out.push(new File([new Uint8Array(bytes)], item.name || baseName(item.uri)));
      }
      return out;
    }
    return webPick(accept, multiple);
  },
};
