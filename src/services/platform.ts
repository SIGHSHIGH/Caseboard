/**
 * 平台能力封装（决策 D3 的 M4 侧实现）。
 *
 * 组件层只依赖本文件与 services/*：浏览器里退化为 Web API，
 * 桌面端走 Tauri 命令（Rust 侧只做 IO，不含业务）。
 *
 * 二进制统一 base64 跨 IPC：前端 invoke 走 JSON，Uint8Array 会被序列化成
 * {"0":137,...} 这种对象，serde 读不成 Vec<u8>。
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 诊断日志：桌面端没有控制台，启动阶段与自检过程都往 <data_dir>/debug.log 追加一行。
 * 任何失败都吞掉——诊断本身不能影响主流程。
 */
export async function debugLog(line: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('debug_log', { line: new Date().toISOString().slice(11, 23) + ' ' + line });
  } catch {
    /* 诊断通道不可用时不报错 */
  }
}

export interface AppInfo {
  version: string;
  platform: string;
  dataDir: string;
  dbPath: string;
  assetsDir: string;
  selftest: boolean;
  /** 自检轮次：1 = 首轮建数据，2 = 重启后校验数据仍在（--selftest=2） */
  selftestPhase: number;
}

interface AppInfoRaw {
  version: string;
  platform: string;
  data_dir: string;
  db_path: string;
  assets_dir: string;
  selftest: boolean;
  selftest_phase: number;
}

/**
 * 确保数据库文件存在并取回绝对路径（桌面端）。
 *
 * 数据目录可能被 CASEBOARD_DATA_DIR 改到别处（便携模式 / 验收），
 * 这时 tauri-plugin-sql 的自动建库会去建它自己的 app_config_dir 并失败，
 * 所以统一由 Rust 按同一个数据目录建库文件，前端再用绝对路径连库。
 */
export async function ensureDbFile(): Promise<string> {
  return invoke<string>('ensure_db_file');
}

/** 网页模式返回 null（调用方据此走 Web 实现）。 */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  const raw = await invoke<AppInfoRaw>('app_info');
  return {
    version: raw.version,
    platform: raw.platform,
    dataDir: raw.data_dir,
    dbPath: raw.db_path,
    assetsDir: raw.assets_dir,
    selftest: raw.selftest === true,
    selftestPhase: raw.selftest_phase ?? 1,
  };
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return;
  await invoke('open_data_dir');
}

// ------------------------------------------------------------- base64 ----

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// -------------------------------------------------------------- 文件 IO ----

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const text = await invoke<string>('read_file_base64', { path });
  return base64ToBytes(text);
}

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<number> {
  return invoke<number>('write_file_base64', { path, data: bytesToBase64(bytes) });
}

export async function hashFileSha256(path: string): Promise<string> {
  return invoke<string>('hash_file', { path });
}

// ------------------------------------------------------------ 素材原件 ----

export async function saveAssetBytes(assetId: string, ext: string, bytes: Uint8Array): Promise<string> {
  return invoke<string>('save_asset_base64', { assetId, ext, data: bytesToBase64(bytes) });
}

export async function readAssetBytes(assetId: string): Promise<Uint8Array> {
  const text = await invoke<string>('read_asset_base64', { assetId });
  return base64ToBytes(text);
}

export async function assetFilePath(assetId: string): Promise<string | null> {
  try {
    return await invoke<string>('asset_file_path', { assetId });
  } catch {
    return null;
  }
}

export async function saveThumbBytes(assetId: string, size: number, ext: string, bytes: Uint8Array): Promise<string> {
  return invoke<string>('save_thumb_base64', { assetId, size, ext, data: bytesToBase64(bytes) });
}

export async function readThumbBytes(assetId: string, size: number): Promise<Uint8Array> {
  const text = await invoke<string>('read_thumb_base64', { assetId, size });
  return base64ToBytes(text);
}

export async function removeAssetFiles(assetId: string): Promise<void> {
  await invoke('remove_asset', { assetId });
}

/** 素材路径 → 可放进 img/src 的 URL（asset 协议，无需读字节）。 */
export function assetFileUrl(path: string): string {
  return convertFileSrc(path);
}

/** 验收自检结束：写报告并退出应用。 */
export async function reportSelftest(report: string): Promise<string> {
  return invoke<string>('selftest_report', { report });
}
