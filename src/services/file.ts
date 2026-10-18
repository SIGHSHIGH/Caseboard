/**
 * 文件能力走 service 接口（决策 D3）：桌面端用 Tauri 原生对话框 + Rust 读写，
 * 网页端退化为 <input type="file"> 与 a[download]。
 * 组件层只依赖本接口，不得直接碰 Blob / a[download]。
 */
import { open as openDialog, save as saveDialog, type DialogFilter } from '@tauri-apps/plugin-dialog';
import { isTauri, readFileBytes, writeFileBytes } from './platform';

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

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
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

export const fileService: FileService = {
  async saveText(fileName, text, filters) {
    const bytes = new TextEncoder().encode(text);
    return this.saveBytes(fileName, bytes, filters);
  },

  async saveBytes(fileName, bytes, filters) {
    if (!isTauri()) {
      webDownload(fileName, new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
      return null;
    }
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
    if (!isTauri()) {
      const files = await webPick(filters?.flatMap((filter) => filter.extensions.map((ext) => '.' + ext)).join(',') ?? '', false);
      const file = files[0];
      if (!file) return null;
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), path: file.name };
    }
    const path = await openDialog({ multiple: false, directory: false, filters });
    if (!path || typeof path !== 'string') return null;
    const bytes = await readFileBytes(path);
    return { name: baseName(path), bytes, path };
  },

  downloadText(fileName, text, mime = 'application/json;charset=utf-8') {
    webDownload(fileName, new Blob([text], { type: mime }));
  },

  downloadBlob(fileName, blob) {
    webDownload(fileName, blob);
  },

  async pickTextFile(accept) {
    const files = await webPick(accept, false);
    const file = files[0];
    if (!file) return null;
    return { name: file.name, text: await file.text() };
  },

  async pickFiles(accept, multiple = true) {
    return webPick(accept, multiple);
  },
};
