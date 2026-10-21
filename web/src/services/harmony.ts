/**
 * 鸿蒙原生桥（H1 平台缝之一）。
 *
 * ArkTS 侧 `pages/Index.ets` 用 `.javaScriptProxy({ name: '__CASEBOARD_NATIVE__',
 * asyncMethodList: BRIDGE_METHODS })` 把 `CaseBoardBridge` 挂到 window 上。
 *
 * 【H0 上机实测的调用契约 —— 与「异步代理返回 Promise」的直觉不同】
 *   ArkWeb 对 asyncMethodList 里的方法**不会把 ArkTS 的返回值送回 JS**：
 *   页面里 `B.ping()` 拿到的是数字 0（受理码），ArkTS 返回的 Promise 被丢弃。
 *   真正能回传结果的通道是：**页面在参数表末尾多传一个回调函数**，ArkTS 侧收下并在
 *   完成（含异步完成）后调用它。实测 `B.pingCb(fn)` → `fn("pong-callback")` 生效。
 *
 * 因此本文件把「回调式」包成 Promise，让上层（platform/db/file/ocr）继续用 await：
 *    - 每次调用造一个 done 回调，塞到参数表最后；
 *    - ArkTS 永远回 `{"ok":true,"value":...}` 或 `{"ok":false,"error":"..."}`；
 *    - ok=false 或超时都 reject 成中文错误，不让 Promise 悬着。
 *
 * 本文件是唯一允许直接触达 `__CASEBOARD_NATIVE__` 的地方，
 * 其余代码只走 platform.ts / db / file 这些平台缝。
 */

/** 与 ArkTS `BRIDGE_NAME` 保持一致（entry/src/main/ets/bridge/CaseBoardBridge.ets）。 */
export const BRIDGE_NAME = '__CASEBOARD_NATIVE__';

/** 原生桥单次调用超时：超时不代表失败语义，只说明桥断了，必须显式报错而不是挂死。 */
const NATIVE_TIMEOUT_MS = 20000;

/** 桥的方法表签名（末位回调由 callNative 注入，调用方不写）。 */
interface NativeBridge {
  ping: (...args: unknown[]) => unknown;
  // ---- db ----
  dbOpen: (...args: unknown[]) => unknown;
  dbExecute: (...args: unknown[]) => unknown;
  dbSelect: (...args: unknown[]) => unknown;
  dbClose: (...args: unknown[]) => unknown;
  dbPath: (...args: unknown[]) => unknown;
  // ---- platform ----
  getAppInfo: (...args: unknown[]) => unknown;
  log: (...args: unknown[]) => unknown;
  readRawfileBase64: (...args: unknown[]) => unknown;
  writeAppFile: (...args: unknown[]) => unknown;
  readAppFile: (...args: unknown[]) => unknown;
  deleteAppFile: (...args: unknown[]) => unknown;
  listAppDir: (...args: unknown[]) => unknown;
  assetUrl: (...args: unknown[]) => unknown;
  selftest: (...args: unknown[]) => unknown;
  // ---- file ----
  saveFile: (...args: unknown[]) => unknown;
  openFile: (...args: unknown[]) => unknown;
  readPickedFile: (...args: unknown[]) => unknown;
  pickImages: (...args: unknown[]) => unknown;
  // ---- clipboard ----
  copyText: (...args: unknown[]) => unknown;
  pasteText: (...args: unknown[]) => unknown;
  // ---- ocr ----
  ocrAvailable: (...args: unknown[]) => unknown;
  ocrRecognize: (...args: unknown[]) => unknown;
  // ---- image ----
  decodeImageInfo: (...args: unknown[]) => unknown;
  shrinkImage: (...args: unknown[]) => unknown;
}

type BridgeMethod = keyof NativeBridge;
type BridgeArg = string | number | boolean;

/** ArkTS 侧统一信封 */
interface BridgeEnvelope<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function nativeBridge(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as Record<string, unknown>)[BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as Record<string, unknown>;
}

/** 是否运行在鸿蒙 ArkWeb 里（由原生侧注入的桥来判断，而不是 UA）。 */
export function isHarmony(): boolean {
  return nativeBridge() !== null;
}

/**
 * 调用原生桥，返回已解析的 value。
 * 桥不存在、方法缺失、原生侧报错、超时——都抛**中文错误**，调用方按平台能力差异决定降级还是上抛。
 */
export function callNative<T>(method: BridgeMethod, ...args: BridgeArg[]): Promise<T> {
  const bridge = nativeBridge();
  if (!bridge) {
    return Promise.reject(
      new Error('鸿蒙原生桥未注入：__CASEBOARD_NATIVE__ 不存在（页面需由 Web 组件加载，且 javaScriptProxy 已注册）'),
    );
  }
  const fn = bridge[method];
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('鸿蒙原生桥缺少方法：' + method));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, value?: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value as T);
    };
    const timer = setTimeout(() => {
      finish(new Error('鸿蒙原生桥调用超时：' + method));
    }, NATIVE_TIMEOUT_MS);

    const done = (raw: unknown): void => {
      if (settled) return;
      if (typeof raw !== 'string') {
        finish(new Error('鸿蒙原生桥返回类型异常（' + method + '）：' + typeof raw));
        return;
      }
      let envelope: BridgeEnvelope<T> | null = null;
      try {
        envelope = JSON.parse(raw) as BridgeEnvelope<T>;
      } catch {
        finish(new Error('鸿蒙原生桥返回非法 JSON（' + method + '）：' + raw.slice(0, 160)));
        return;
      }
      if (!envelope || envelope.ok !== true) {
        finish(new Error('鸿蒙原生桥报错（' + method + '）：' + String(envelope?.error ?? raw)));
        return;
      }
      finish(null, envelope.value as T);
    };

    try {
      (fn as (...rest: unknown[]) => unknown).apply(bridge, [...args, done]);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** 调用原生桥并**吞掉所有错误**，用于诊断/日志这类不能影响主流程的通道。 */
export async function tryNative<T>(method: BridgeMethod, ...args: BridgeArg[]): Promise<T | null> {
  try {
    return await callNative<T>(method, ...args);
  } catch {
    return null;
  }
}

/** 计算 SHA-256（十六进制小写）：ArkWeb 有完整 WebCrypto，无需原生侧代劳。 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // 复制到独立的 ArrayBuffer：byteOffset 非零或底层是 SharedArrayBuffer 时
  // crypto.subtle.digest 会拒收，拷一份最省心（素材文件级别，成本可接受）。
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer);
  const view = new Uint8Array(digest);
  let out = '';
  for (let index = 0; index < view.length; index += 1) out += view[index].toString(16).padStart(2, '0');
  return out;
}
