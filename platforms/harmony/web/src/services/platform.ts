/**
 * 平台能力封装（决策 D3 的 M4 侧实现）。
 *
 * 组件层只依赖本文件与 services/*：三处运行时各走各的底层，
 *  - 鸿蒙 ArkWeb → 原生桥 `__CASEBOARD_NATIVE__`（registerJavaScriptProxy）；
 *  - 桌面 Tauri → tauri 命令（Rust 侧只做 IO，不含业务）；
 *  - 浏览器 → Web API 降级。
 *
 * 二进制统一 base64 跨桥：桥只能传字符串，且 Uint8Array 直接过 proxy 会退化成
 * `{"0":137,...}` 这种对象，ArkTS 侧读不成字节数组。
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { callNative, isHarmony, sha256Hex, tryNative } from './harmony';

export { isHarmony };

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 诊断日志：桌面端没有控制台，启动阶段与自检过程都往 <data_dir>/debug.log 追加一行。
 * 鸿蒙端转 hilog（DFX 可抓）。任何失败都吞掉——诊断本身不能影响主流程。
 */
export async function debugLog(line: string): Promise<void> {
  const text = new Date().toISOString().slice(11, 23) + ' ' + line;
  if (isHarmony()) {
    await tryNative<string>('log', 'debug', text);
    return;
  }
  if (!isTauri()) return;
  try {
    await invoke('debug_log', { line: text });
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

/** 原生侧 AppInfoJson（entry/src/main/ets/common/Types.ets） */
interface HarmonyAppInfo {
  version: string;
  platform: string;
  dataDir: string;
  dbPath: string;
  assetsDir: string;
  apiVersion: number;
}

/** 鸿蒙端数据目录（首次 getAppInfo 后缓存，供路径换算复用）。 */
let harmonyDataDir = '';

/**
 * 确保数据库文件存在并取回绝对路径。
 * 鸿蒙端由 `dbOpen` 在原生侧建库并建表（等价于桌面 `ensure_db_file` + migrations）。
 */
export async function ensureDbFile(): Promise<string> {
  if (isHarmony()) return callNative<string>('dbOpen', 'caseboard.db');
  return invoke<string>('ensure_db_file');
}

/** 网页模式返回 null（调用方据此走 Web 实现）。 */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (isHarmony()) {
    const raw = await callNative<HarmonyAppInfo>('getAppInfo');
    harmonyDataDir = raw.dataDir;
    return {
      version: raw.version,
      platform: raw.platform,
      dataDir: raw.dataDir,
      dbPath: raw.dbPath,
      assetsDir: raw.assetsDir,
      selftest: false,
      selftestPhase: 1,
    };
  }
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
  if (isHarmony()) return; // 鸿蒙沙箱目录对用户不可见，不提供「打开数据目录」
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

// ------------------------------------------------------ 鸿蒙沙箱相对路径 ----

/** 绝对沙箱路径 → 应用数据目录内的相对路径（桥只接受相对路径）。 */
function toRelPath(path: string): string {
  if (harmonyDataDir && path.startsWith(harmonyDataDir)) {
    const rest = path.slice(harmonyDataDir.length);
    return rest.replace(/^\/+/, '');
  }
  return path.replace(/^\/+/, '');
}

function toAbsPath(relPath: string): string {
  return harmonyDataDir ? harmonyDataDir + '/' + relPath : relPath;
}

// -------------------------------------------------------------- 文件 IO ----

export async function readFileBytes(path: string): Promise<Uint8Array> {
  if (isHarmony()) {
    const base64 = await callNative<string>('readAppFile', toRelPath(path));
    return base64ToBytes(base64);
  }
  const text = await invoke<string>('read_file_base64', { path });
  return base64ToBytes(text);
}

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<number> {
  if (isHarmony()) {
    const size = await callNative<number | string>('writeAppFile', toRelPath(path), bytesToBase64(bytes));
    return typeof size === 'number' ? size : bytes.length;
  }
  return invoke<number>('write_file_base64', { path, data: bytesToBase64(bytes) });
}

export async function hashFileSha256(path: string): Promise<string> {
  if (isHarmony()) {
    const bytes = await readFileBytes(path);
    return sha256Hex(bytes);
  }
  return invoke<string>('hash_file', { path });
}

// ------------------------------------------------------------ 素材原件 ----

/**
 * 鸿蒙端的素材文件布局（与桌面 Rust 侧一致的语义，目录名不同）：
 *   原件 <data>/assets/<assetId>.<ext>
 *   缩略图 <data>/thumbs/<assetId>_<size>.<ext>
 * 目录清单缓存一次，避免每次渲染都 list 一遍。
 */
const ASSET_DIR = 'assets';
const THUMB_DIR = 'thumbs';
let assetNames: string[] | null = null;
let thumbNames: string[] | null = null;

interface DirEntry {
  name: string;
  size: number;
  isDir: boolean;
}

async function listNames(dir: string): Promise<string[]> {
  const entries = await callNative<DirEntry[]>('listAppDir', dir);
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => !entry.isDir).map((entry) => entry.name);
}

function fileNameFor(assetId: string, ext: string): string {
  return ext ? assetId + '.' + ext.replace(/^\./, '') : assetId;
}

async function findAssetName(assetId: string): Promise<string | null> {
  if (!assetNames) assetNames = await listNames(ASSET_DIR);
  const hit = assetNames.find((name) => name === assetId || name.startsWith(assetId + '.'));
  return hit ?? null;
}

export async function saveAssetBytes(assetId: string, ext: string, bytes: Uint8Array): Promise<string> {
  if (!isHarmony()) {
    return invoke<string>('save_asset_base64', { assetId, ext, data: bytesToBase64(bytes) });
  }
  const relPath = ASSET_DIR + '/' + fileNameFor(assetId, ext);
  await callNative<string>('writeAppFile', relPath, bytesToBase64(bytes));
  assetNames = null;
  return toAbsPath(relPath);
}

export async function readAssetBytes(assetId: string): Promise<Uint8Array> {
  if (!isHarmony()) {
    const text = await invoke<string>('read_asset_base64', { assetId });
    return base64ToBytes(text);
  }
  const name = await findAssetName(assetId);
  if (!name) throw new Error('素材原件不存在：' + assetId);
  const base64 = await callNative<string>('readAppFile', ASSET_DIR + '/' + name);
  return base64ToBytes(base64);
}

export async function assetFilePath(assetId: string): Promise<string | null> {
  if (isHarmony()) {
    const name = await findAssetName(assetId);
    return name ? toAbsPath(ASSET_DIR + '/' + name) : null;
  }
  try {
    return await invoke<string>('asset_file_path', { assetId });
  } catch {
    return null;
  }
}

export async function saveThumbBytes(assetId: string, size: number, ext: string, bytes: Uint8Array): Promise<string> {
  if (!isHarmony()) {
    return invoke<string>('save_thumb_base64', { assetId, size, ext, data: bytesToBase64(bytes) });
  }
  const relPath = THUMB_DIR + '/' + fileNameFor(assetId + '_' + size, ext);
  await callNative<string>('writeAppFile', relPath, bytesToBase64(bytes));
  thumbNames = null;
  return toAbsPath(relPath);
}

export async function readThumbBytes(assetId: string, size: number): Promise<Uint8Array> {
  if (!isHarmony()) {
    const text = await invoke<string>('read_thumb_base64', { assetId, size });
    return base64ToBytes(text);
  }
  const prefix = assetId + '_' + size;
  if (!thumbNames) thumbNames = await listNames(THUMB_DIR);
  const hit = thumbNames.find((name) => name === prefix || name.startsWith(prefix + '.'));
  if (!hit) throw new Error('缩略图不存在：' + prefix);
  const base64 = await callNative<string>('readAppFile', THUMB_DIR + '/' + hit);
  return base64ToBytes(base64);
}

/**
 * 缩略图文件路径（缩略图直接给 `img/src` 用，不再把字节搬进 JS）。
 * 桌面端 Rust 侧没有对应命令，返回 null 由 imageStore 退回字节流；鸿蒙端走沙箱文件名匹配。
 */
export async function thumbFilePath(assetId: string, size: number): Promise<string | null> {
  if (!isHarmony()) return null;
  const prefix = assetId + '_' + size;
  if (!thumbNames) thumbNames = await listNames(THUMB_DIR);
  const hit = thumbNames.find((name) => name === prefix || name.startsWith(prefix + '.'));
  return hit ? toAbsPath(THUMB_DIR + '/' + hit) : null;
}

/**
 * 素材二进制是否落在沙箱真实文件里。
 * 桌面（Tauri 命令）与鸿蒙（原生桥 + 文件仓）都算；只有纯浏览器走 IndexedDB。
 *
 * H5 修正：此前 imageStore 只按 `isTauri()` 分支，鸿蒙被判进 IndexedDB，
 * 于是 platform.ts 里已写好的 `isHarmony()` 文件分支成了死代码，
 * 沙箱里从来没有 `assets/` 与 `thumbs/` 目录，`caseboard://rawfile/asset/…` 必然 404。
 */
export function usesNativeAssetStore(): boolean {
  return isTauri() || isHarmony();
}

export async function removeAssetFiles(assetId: string): Promise<void> {
  if (!isHarmony()) {
    await invoke('remove_asset', { assetId });
    return;
  }
  const assets = await listNames(ASSET_DIR);
  for (const name of assets) {
    if (name === assetId || name.startsWith(assetId + '.')) {
      await tryNative<boolean>('deleteAppFile', ASSET_DIR + '/' + name);
    }
  }
  const thumbs = await listNames(THUMB_DIR);
  for (const name of thumbs) {
    if (name.startsWith(assetId + '_')) {
      await tryNative<boolean>('deleteAppFile', THUMB_DIR + '/' + name);
    }
  }
  assetNames = null;
  thumbNames = null;
}

/**
 * 素材路径 → 可放进 img/src 的 URL。
 * 桌面端走 asset 自定义协议（convertFileSrc）；鸿蒙端走原生 scheme handler 的
 * asset 路由（`caseboard://rawfile/asset/<相对路径>`），由 ArkTS 侧读沙箱字节回给内核。
 */
export function assetFileUrl(path: string): string {
  if (!isHarmony()) return convertFileSrc(path);
  const normalized = path.replace(/\\/g, '/');
  // H5 修正：此前先剥掉开头的斜杠、再拿 '/data/…/files/' 去比前缀，永远比不中，
  // 于是把整条绝对路径塞进了 URL（asset/data/storage/el2/…/thumbs/x.jpg）→ 404、缩略图空白。
  // 现在先把沙箱前缀切掉：优先用 getAppInfo 拿到的真实数据目录，其次退回到
  // 「从最后一个 /assets/ 或 /thumbs/ 起算」——两者都只留下 assets/… 或 thumbs/…。
  let rel = toRelPath(normalized);
  const marker = /(?:^|\/)(assets|thumbs)\//.exec(normalized);
  if (marker && !/^(assets|thumbs)\//.test(rel)) {
    rel = normalized.slice(marker.index).replace(/^\/+/, '');
  }
  rel = rel.replace(/^\/+/, '');
  // 页面跑在 caseboard:// 上，file:// 会被跨 scheme 拒掉（缩略图空白、背景图不显示）
  const encoded = rel
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(segment) : segment))
    .join('/');
  return 'caseboard://rawfile/asset/' + encoded;
}

/** 验收自检结束：桌面端写报告并退出；鸿蒙端只回报结果，不退出应用。 */
export async function reportSelftest(report: string): Promise<string> {
  if (isHarmony()) {
    await tryNative<string>('log', 'info', 'selftest report: ' + report);
    return report;
  }
  return invoke<string>('selftest_report', { report });
}
