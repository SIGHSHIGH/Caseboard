/**
 * caseboard:// 自定义 scheme：把 $rawfile 里的前端产物当成「同源静态站点」伺服。
 *
 * 为什么必须这么做（H0 实测结论，不是设计偏好）：
 *  用 resource://rawfile/index.html 加载时，页面是 opaque origin（origin 'null'），
 *  ArkWeb 对 `type="module"` 脚本做 CORS 校验并直接拒绝：
 *    "Access to script at 'resource://rawfile/assets/index-xxx.js' from origin 'null'
 *     has been blocked by CORS policy: Cross origin requests are only supported for
 *     protocol schemes: arkweb, arkweb-extension, chrome, chrome-extension,
 *     chrome-untrusted, data, http, https."
 *  → 白屏。Vite 产物必然是 ESM（还带 `new Worker(new URL(...), {type:'module'})`），
 *    所以只能换一个「真实 origin」的协议。自定义 scheme 同时解决三件事：
 *      1) module 脚本与 module worker 有真 origin，CORS 通过；
 *      2) isSecure:true 让页面成为 secure context，crypto.subtle（素材 SHA-256）可用；
 *      3) 资源路径仍是 `./assets/x.js` 这种相对写法，不用改前端产物。
 */
import { webview, WebNetErrorList } from '@kit.ArkWeb';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { AppContext } from '../common/AppContext';

const DOMAIN: number = 0xC0DE;
const TAG: string = 'CaseBoard';

export const APP_SCHEME: string = 'caseboard';
export const APP_HOST: string = 'rawfile';
export const APP_ENTRY_URL: string = `${APP_SCHEME}://${APP_HOST}/index.html`;
const URL_PREFIX: string = `${APP_SCHEME}://${APP_HOST}/`;

/** 扩展名 → MIME。ArkTS 下用 Map 比 Record 索引更安全。 */
const MIME_TABLE: Map<string, string> = new Map<string, string>([
  ['html', 'text/html'],
  ['js', 'text/javascript'],
  ['mjs', 'text/javascript'],
  ['css', 'text/css'],
  ['json', 'application/json'],
  ['map', 'application/json'],
  ['svg', 'image/svg+xml'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['bmp', 'image/bmp'],
  ['wasm', 'application/wasm'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['txt', 'text/plain']
]);

function mimeOf(relPath: string): string {
  const dot: number = relPath.lastIndexOf('.');
  if (dot < 0 || dot === relPath.length - 1) {
    return 'application/octet-stream';
  }
  const ext: string = relPath.substring(dot + 1).toLowerCase();
  const hit: string | undefined = MIME_TABLE.get(ext);
  return hit === undefined ? 'application/octet-stream' : hit;
}

/**
 * URL → rawfile 相对路径。
 * 拒绝越权：绝对路径、`..` 一律视为非法，返回 null。
 */
function relPathOf(url: string): string | null {
  if (!url.startsWith(URL_PREFIX)) {
    return null;
  }
  let path: string = url.substring(URL_PREFIX.length);
  const query: number = path.indexOf('?');
  if (query >= 0) {
    path = path.substring(0, query);
  }
  const hash: number = path.indexOf('#');
  if (hash >= 0) {
    path = path.substring(0, hash);
  }
  if (path.length === 0) {
    path = 'index.html';
  }
  if (path.startsWith('/') || path.indexOf('..') >= 0) {
    return null;
  }
  return path;
}

/**
 * 把一个沙箱文件（素材/缩略图）回给 Web 内核。
 * 只允许 assets/ 与 thumbs/ 两个目录，且拒绝 `..`，避免变成任意文件读取漏洞。
 */
function serveFromSandbox(relPath: string, resourceHandler: webview.WebResourceHandler): void {
  const allowed: boolean = relPath.startsWith('assets/') || relPath.startsWith('thumbs/');
  if (!allowed || relPath.indexOf('..') >= 0) {
    hilog.error(DOMAIN, TAG, '[scheme] 拒绝沙箱路径：%{public}s', relPath);
    resourceHandler.didFail(WebNetErrorList.ERR_ACCESS_DENIED);
    return;
  }
  const absPath: string = AppContext.getContext().filesDir + '/' + relPath;
  try {
    const stat = fs.statSync(absPath);
    const buffer: ArrayBuffer = new ArrayBuffer(stat.size);
    const file = fs.openSync(absPath, fs.OpenMode.READ_ONLY);
    fs.readSync(file.fd, buffer);
    fs.closeSync(file);
    const response: webview.WebSchemeHandlerResponse = new webview.WebSchemeHandlerResponse();
    response.setStatus(200);
    response.setStatusText('OK');
    response.setMimeType(mimeOf(relPath));
    // 二进制资源不要设 encoding，设了会被当文本转码
    response.setHeaderByName('Access-Control-Allow-Origin', '*', true);
    response.setHeaderByName('Cache-Control', 'no-cache', true);
    resourceHandler.didReceiveResponse(response);
    resourceHandler.didReceiveResponseBody(buffer);
    resourceHandler.didFinish();
  } catch (err) {
    hilog.error(DOMAIN, TAG, '[scheme] 读取沙箱文件失败 %{public}s: %{public}s',
      absPath, (err as Error).message);
    resourceHandler.didFail(WebNetErrorList.ERR_FILE_NOT_FOUND);
  }
}

/**
 * 把一个 caseboard:// 请求从 rawfile 读出来回给 Web 内核。
 * 全程异步；本函数返回后回调继续推进，符合 onRequestStart 的同步返回约定。
 */
export function serveFromRawfile(url: string, resourceHandler: webview.WebResourceHandler): void {
  const relPath: string | null = relPathOf(url);
  if (relPath === null) {
    hilog.error(DOMAIN, TAG, '[scheme] 非法请求，拒绝：%{public}s', url);
    resourceHandler.didFail(WebNetErrorList.ERR_ACCESS_DENIED);
    return;
  }
  // caseboard://asset/<相对路径> —— 沙箱素材/缩略图。
  // 页面跑在 caseboard:// 上，<img src="file://…"> 会被跨 scheme 拒掉，
  // 所以素材与背景图必须走这条同源通路上来。
  if (relPath.startsWith('asset/')) {
    serveFromSandbox(relPath.substring('asset/'.length), resourceHandler);
    return;
  }
  AppContext.getContext().resourceManager.getRawFileContent(relPath).then((bytes: Uint8Array) => {
    const response: webview.WebSchemeHandlerResponse = new webview.WebSchemeHandlerResponse();
    response.setStatus(200);
    response.setStatusText('OK');
    response.setMimeType(mimeOf(relPath));
    response.setEncoding('utf-8');
    response.setHeaderByName('Access-Control-Allow-Origin', '*', true);
    resourceHandler.didReceiveResponse(response);
    // 独立拷贝一份 ArrayBuffer：rawfile 的 Uint8Array 可能带着非零 byteOffset。
    const copy: Uint8Array = new Uint8Array(bytes.length);
    copy.set(bytes);
    resourceHandler.didReceiveResponseBody(copy.buffer as ArrayBuffer);
    resourceHandler.didFinish();
  }).catch((err: Error) => {
    hilog.error(DOMAIN, TAG, '[scheme] 读取 rawfile 失败 %{public}s: %{public}s',
      relPath, err.message);
    resourceHandler.didFail(WebNetErrorList.ERR_FILE_NOT_FOUND);
  });
}

/**
 * 注册自定义 scheme。必须在**创建 Web 组件之前**调用（EntryAbility.onCreate 里）。
 * isStandard:true 让 URL 按标准 scheme://host/path 解析；
 * isSecure:true 让页面进入 secure context（crypto.subtle 依赖）。
 */
export function registerAppScheme(): void {
  webview.WebviewController.customizeSchemes([{
    schemeName: APP_SCHEME,
    isSupportCORS: true,
    isSupportFetch: true,
    isStandard: true,
    isLocal: false,
    isDisplayIsolated: true,
    isSecure: true,
    isCspBypassing: false,
    isCodeCacheSupported: false
  }]);
  hilog.info(DOMAIN, TAG, '%{public}s', `[scheme] 已注册 ${APP_SCHEME}://`);
}

/** 构造绑定到某个 controller 的 scheme handler */
export function createAppSchemeHandler(): webview.WebSchemeHandler {
  const handler: webview.WebSchemeHandler = new webview.WebSchemeHandler();
  handler.onRequestStart((request: webview.WebSchemeHandlerRequest,
    resourceHandler: webview.WebResourceHandler): boolean => {
    serveFromRawfile(request.getRequestUrl(), resourceHandler);
    return true;
  });
  return handler;
}
