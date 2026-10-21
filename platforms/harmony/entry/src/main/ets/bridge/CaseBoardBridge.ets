/**
 * ArkWeb ↔ ArkTS 的唯一桥。
 *
 * 【H0 实测定稿的调用契约，与最初设想不同，务必照此实现】
 *   1) 25 个方法全部注册进 asyncMethodList（同步代理会双向阻塞主线程）。
 *   2) **asyncMethodList 方法的返回值不会传回 JS**：页面侧调用 `B.ping()` 拿到的是
 *      数字 0（受理码），ArkTS 返回的 Promise/值都被吞掉。实测：
 *        B.ping()        → typeof number, 0
 *        B.pingPromise() → typeof number, 0
 *        B.pingCb(fn)    → fn("pong-callback") 被真正调用
 *      所以每个方法必须**在参数表最后收一个 JS 回调**，用该回调把结果送回去。
 *   3) 参数与返回值一律 JSON 字符串：跨 proxy 只能稳传 string/number/boolean。
 *   4) 统一信封：成功 `{"ok":true,"value":<json>}`，失败 `{"ok":false,"error":"<中文说明>"}`。
 *      失败也走回调（不抛给 ArkWeb），否则 JS 侧的 Promise 永远不落地。
 *
 * 用 Web 组件的 .javaScriptProxy() 属性形式注册（构建期生效，页面随后加载），
 * 避免 registerJavaScriptProxy 的「下次 (re)load 才生效」顺序坑。
 */
import { util } from '@kit.ArkTS';
import { AppInfoJson, SelfTestJson, SelectResultJson } from '../common/Types';
import { PlatformService } from '../service/PlatformService';
import { DbService } from '../service/DbService';
import { FileService } from '../service/FileService';
import { ClipboardService } from '../service/ClipboardService';
import { OcrService } from '../service/OcrService';
import { ImageService } from '../service/ImageService';

/** 注入到网页的全局对象名：window.__CASEBOARD_NATIVE__ */
export const BRIDGE_NAME: string = '__CASEBOARD_NATIVE__';

/** 定稿的 25 个方法（ping + 24） */
export const BRIDGE_METHODS: string[] = [
  'ping',
  // db
  'dbOpen', 'dbExecute', 'dbSelect', 'dbClose', 'dbPath',
  // platform
  'getAppInfo', 'log', 'readRawfileBase64', 'writeAppFile', 'readAppFile',
  'deleteAppFile', 'listAppDir', 'assetUrl', 'selftest',
  // file
  'saveFile', 'openFile', 'readPickedFile', 'pickImages',
  // clip
  'copyText', 'pasteText',
  // ocr
  'ocrAvailable', 'ocrRecognize',
  // image
  'decodeImageInfo', 'shrinkImage'
];

/** JS 侧传入的结果回调（参数是信封 JSON 字符串） */
type BridgeCallback = (result: string) => void;

function replyValue(cb: BridgeCallback, json: string): void {
  cb('{"ok":true,"value":' + json + '}');
}

function replyError(cb: BridgeCallback, message: string): void {
  cb('{"ok":false,"error":' + JSON.stringify(message) + '}');
}

function errText(err: object): string {
  if (err instanceof Error) {
    return err.message;
  }
  return JSON.stringify(err);
}

export class CaseBoardBridge {
  /** 同步逻辑 + 统一异常兜底 */
  private runSync(cb: BridgeCallback, task: () => string): void {
    try {
      replyValue(cb, task());
    } catch (err) {
      replyError(cb, errText(err as object));
    }
  }

  /** 异步逻辑 + 统一异常兜底（结果仍通过 JS 回调回传） */
  private runAsync(cb: BridgeCallback, task: () => Promise<string>): void {
    task().then((payload: string) => {
      replyValue(cb, payload);
    }).catch((err: object) => {
      replyError(cb, errText(err));
    });
  }

  // ---------------- core ----------------
  ping(cb: BridgeCallback): void {
    this.runSync(cb, () => JSON.stringify('pong'));
  }

  // ---------------- db：对应 SqlDriver ----------------
  dbOpen(dbName: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      await DbService.open(dbName);
      return JSON.stringify(DbService.path());
    });
  }

  dbExecute(sql: string, paramsJson: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      await DbService.execute(sql, paramsJson);
      return 'null';
    });
  }

  dbSelect(sql: string, paramsJson: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      return await DbService.select(sql, paramsJson);
    });
  }

  dbClose(cb: BridgeCallback): void {
    this.runSync(cb, () => {
      DbService.close();
      return 'null';
    });
  }

  dbPath(cb: BridgeCallback): void {
    this.runSync(cb, () => JSON.stringify(DbService.path()));
  }

  // ---------------- platform ----------------
  getAppInfo(cb: BridgeCallback): void {
    this.runSync(cb, () => PlatformService.getAppInfo());
  }

  log(level: string, msg: string, cb: BridgeCallback): void {
    this.runSync(cb, () => {
      PlatformService.log(level, msg);
      return 'null';
    });
  }

  readRawfileBase64(relPath: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      const base64 = await PlatformService.readRawfileBase64(relPath);
      return JSON.stringify(base64);
    });
  }

  writeAppFile(relPath: string, base64: string, cb: BridgeCallback): void {
    this.runSync(cb, () => JSON.stringify(PlatformService.writeAppFile(relPath, base64)));
  }

  readAppFile(relPath: string, cb: BridgeCallback): void {
    this.runSync(cb, () => JSON.stringify(PlatformService.readAppFile(relPath)));
  }

  deleteAppFile(relPath: string, cb: BridgeCallback): void {
    this.runSync(cb, () => (PlatformService.deleteAppFile(relPath) ? 'true' : 'false'));
  }

  listAppDir(relPath: string, cb: BridgeCallback): void {
    this.runSync(cb, () => PlatformService.listAppDir(relPath));
  }

  assetUrl(path: string, cb: BridgeCallback): void {
    this.runSync(cb, () => JSON.stringify(PlatformService.assetUrl(path)));
  }

  /**
   * 自检：一次性验证 db / 文件 / rawfile / FTS5 四条关键通路。
   * 对应桌面 scripts/run-selftest.cjs 的鸿蒙等价物。
   */
  selftest(phase: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      const report: SelfTestJson = {
        phase: phase,
        ok: false,
        dbOk: false,
        fsOk: false,
        rawfileOk: false,
        fts5Ok: false,
        message: ''
      };
      const notes: string[] = [];

      // 1) rawfile
      try {
        const html = await PlatformService.readRawfileBase64('index.html');
        report.rawfileOk = html.length > 0;
        notes.push(`rawfile=${report.rawfileOk}`);
      } catch (err) {
        notes.push(`rawfile 失败: ${errText(err as object)}`);
      }

      // 2) 沙箱文件往返：写 → 读 → 比对 → 删
      try {
        const payload = `selftest-${phase}-${Date.now()}`;
        const relPath = 'selftest/probe.txt';
        const encoder = new util.TextEncoder();
        const helper = new util.Base64Helper();
        PlatformService.writeAppFile(relPath, helper.encodeToStringSync(encoder.encodeInto(payload)));
        const readBack = new util.TextDecoder().decodeToString(
          helper.decodeSync(PlatformService.readAppFile(relPath)));
        report.fsOk = readBack === payload;
        PlatformService.deleteAppFile(relPath);
        notes.push(`fs=${report.fsOk}`);
      } catch (err) {
        notes.push(`fs 失败: ${errText(err as object)}`);
      }

      // 3) 数据库往返
      try {
        await DbService.open('caseboard.db');
        await DbService.execute('CREATE TABLE IF NOT EXISTS __selftest (k TEXT PRIMARY KEY, v TEXT)', '[]');
        await DbService.execute('INSERT OR REPLACE INTO __selftest (k, v) VALUES (?, ?)',
          JSON.stringify(['phase', phase]));
        const raw = await DbService.select('SELECT k, v FROM __selftest', '[]');
        const parsed = JSON.parse(raw) as SelectResultJson;
        report.dbOk = parsed.rows.length >= 1;
        notes.push(`db=${report.dbOk}(${parsed.rows.length} row)`);
        await DbService.execute('DROP TABLE IF EXISTS __selftest', '[]');
      } catch (err) {
        notes.push(`db 失败: ${errText(err as object)}`);
      }

      // 4) FTS5
      try {
        report.fts5Ok = await DbService.probeFts5();
        notes.push(`fts5=${report.fts5Ok}`);
      } catch (err) {
        notes.push('fts5 探测异常');
      }

      report.ok = report.dbOk && report.fsOk && report.rawfileOk;
      report.message = notes.join('; ');
      PlatformService.log('info', `[selftest] phase=${phase} ok=${report.ok} ${report.message}`);
      return JSON.stringify(report);
    });
  }

  // ---------------- file ----------------
  saveFile(fileName: string, mimeType: string, base64: string,
    suffixChoicesJson: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      const saved = await FileService.saveFile(fileName, mimeType, base64, suffixChoicesJson);
      return JSON.stringify(saved);
    });
  }

  openFile(suffixesJson: string, multiple: boolean, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      try {
        return await FileService.openFile(suffixesJson, multiple);
      } catch (err) {
        // 用户取消选择器属正常路径
        PlatformService.log('info', `[file] openFile 取消或失败: ${errText(err as object)}`);
        return '[]';
      }
    });
  }

  readPickedFile(uri: string, cb: BridgeCallback): void {
    // 必须 JSON.stringify：返回值是纯 base64 字符串，直接塞进信封会拼出非法 JSON，
    // 前端 callNative 会报「原生桥返回非法 JSON（readPickedFile）」→ 图片导入静默失败。
    this.runSync(cb, () => JSON.stringify(FileService.readPickedFile(uri)));
  }

  pickImages(multiple: boolean, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      try {
        return await FileService.pickImages(multiple);
      } catch (err) {
        PlatformService.log('info', `[file] pickImages 取消或失败: ${errText(err as object)}`);
        return '[]';
      }
    });
  }

  // ---------------- clip ----------------
  copyText(text: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      await ClipboardService.copyText(text);
      return 'null';
    });
  }

  pasteText(cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      return JSON.stringify(await ClipboardService.pasteText());
    });
  }

  // ---------------- ocr ----------------
  ocrAvailable(cb: BridgeCallback): void {
    this.runSync(cb, () => (OcrService.available() ? 'true' : 'false'));
  }

  ocrRecognize(imageBase64: string, lang: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      return await OcrService.recognize(imageBase64, lang);
    });
  }

  // ---------------- image ----------------
  decodeImageInfo(base64: string, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      return await ImageService.decodeImageInfo(base64);
    });
  }

  shrinkImage(base64: string, maxDim: number, cb: BridgeCallback): void {
    this.runAsync(cb, async (): Promise<string> => {
      const shrunk = await ImageService.shrinkImage(base64, maxDim);
      return JSON.stringify(shrunk);
    });
  }
}
