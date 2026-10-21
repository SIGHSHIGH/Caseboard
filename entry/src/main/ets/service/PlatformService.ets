/**
 * 平台能力：应用信息、日志、rawfile 读取、沙箱文件读写、资源 URL。
 * 对应桌面 src/services/platform.ts 的职责，但完全走鸿蒙 API。
 *
 * 安全约定：所有相对路径必须先过 sanitizeRelPath，禁止越出沙箱根。
 */
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { AppContext } from '../common/AppContext';
import { AppInfoJson } from '../common/Types';

const DOMAIN: number = 0xC0DE;
const TAG: string = 'CaseBoard';
const APP_VERSION: string = '1.0.0-beta.1';
const API_VERSION: number = 26;

export class PlatformService {
  /** 沙箱内应用文件根目录 */
  static dataDir(): string {
    return AppContext.getContext().filesDir;
  }

  /** 案件数据库路径 */
  static dbPath(): string {
    return `${PlatformService.dataDir()}/caseboard.db`;
  }

  /** 附件/导出的资源目录 */
  static assetsDir(): string {
    return `${PlatformService.dataDir()}/assets`;
  }

  static log(level: string, msg: string): void {
    if (level === 'error') {
      hilog.error(DOMAIN, TAG, '%{public}s', msg);
    } else if (level === 'warn') {
      hilog.warn(DOMAIN, TAG, '%{public}s', msg);
    } else if (level === 'debug') {
      hilog.debug(DOMAIN, TAG, '%{public}s', msg);
    } else {
      hilog.info(DOMAIN, TAG, '%{public}s', msg);
    }
  }

  static getAppInfo(): string {
    const info: AppInfoJson = {
      version: APP_VERSION,
      platform: 'harmony',
      dataDir: PlatformService.dataDir(),
      dbPath: PlatformService.dbPath(),
      assetsDir: PlatformService.assetsDir(),
      apiVersion: API_VERSION
    };
    return JSON.stringify(info);
  }

  /**
   * 相对路径消毒：拒绝绝对路径、盘符、父级跳转。
   * bridge 直接暴露给网页 JS，这一步不能省。
   */
  static sanitizeRelPath(relPath: string): string {
    const p = relPath.trim();
    if (p.length === 0) {
      throw new Error('路径为空');
    }
    if (p.startsWith('/') || p.startsWith('\\')) {
      throw new Error(`拒绝绝对路径: ${relPath}`);
    }
    if (/^[A-Za-z]:/.test(p)) {
      throw new Error(`拒绝盘符路径: ${relPath}`);
    }
    const parts = p.split(/[\\/]+/);
    for (const seg of parts) {
      if (seg === '..') {
        throw new Error(`拒绝父级跳转: ${relPath}`);
      }
    }
    return p;
  }

  /** 拼出绝对路径并确保父目录存在 */
  static resolveInData(relPath: string): string {
    const safe = PlatformService.sanitizeRelPath(relPath);
    const abs = `${PlatformService.dataDir()}/${safe}`;
    const idx = abs.lastIndexOf('/');
    if (idx > 0) {
      const dir = abs.substring(0, idx);
      if (!fs.accessSync(dir)) {
        fs.mkdirSync(dir, true);
      }
    }
    return abs;
  }

  /** rawfile 内容 → base64（前端用 data URL 展示） */
  static async readRawfileBase64(relPath: string): Promise<string> {
    const safe = PlatformService.sanitizeRelPath(relPath);
    const bytes: Uint8Array = await AppContext.getContext().resourceManager.getRawFileContent(safe);
    return new util.Base64Helper().encodeToStringSync(bytes);
  }

  /** base64 → 沙箱文件（相对 dataDir） */
  static writeAppFile(relPath: string, base64: string): string {
    const abs = PlatformService.resolveInData(relPath);
    const bytes: Uint8Array = new util.Base64Helper().decodeSync(base64);
    const file = fs.openSync(abs, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, bytes.buffer as ArrayBuffer);
    } finally {
      fs.closeSync(file);
    }
    return abs;
  }

  /** 沙箱文件 → base64 */
  static readAppFile(relPath: string): string {
    const abs = PlatformService.resolveInData(relPath);
    const stat = fs.statSync(abs);
    const buf = new ArrayBuffer(stat.size);
    const file = fs.openSync(abs, fs.OpenMode.READ_ONLY);
    try {
      fs.readSync(file.fd, buf);
    } finally {
      fs.closeSync(file);
    }
    return new util.Base64Helper().encodeToStringSync(new Uint8Array(buf));
  }

  static deleteAppFile(relPath: string): boolean {
    const abs = PlatformService.resolveInData(relPath);
    if (fs.accessSync(abs)) {
      fs.unlinkSync(abs);
      return true;
    }
    return false;
  }

  /** 列目录，返回 JSON 数组 [{name,size,isDir}] */
  static listAppDir(relPath: string): string {
    const safe = relPath.trim().length === 0 ? '' : PlatformService.sanitizeRelPath(relPath);
    const abs = safe.length === 0 ? PlatformService.dataDir() : `${PlatformService.dataDir()}/${safe}`;
    if (!fs.accessSync(abs)) {
      return '[]';
    }
    const names: string[] = fs.listFileSync(abs);
    const items: string[] = [];
    for (const n of names) {
      try {
        const st = fs.statSync(`${abs}/${n}`);
        const isDir = st.isDirectory();
        const size = isDir ? 0 : st.size;
        items.push(`{"name":${JSON.stringify(n)},"size":${size},"isDir":${isDir}}`);
      } catch (err) {
        // 单个条目失败不影响整体列目录
      }
    }
    return `[${items.join(',')}]`;
  }

  /**
   * 资源 URL：把沙箱绝对路径转成 ArkWeb 可加载地址。
   * 对应桌面 convertFileSrc 的位置。file:// 需要 Web.fileAccess(true)。
   */
  static assetUrl(path: string): string {
    const p = path.trim();
    if (p.length === 0) {
      return '';
    }
    if (p.startsWith('file://') || p.startsWith('data:') || p.startsWith('resource://')) {
      return p;
    }
    if (p.startsWith('/')) {
      return `file://${p}`;
    }
    return `file://${PlatformService.dataDir()}/${p}`;
  }
}
