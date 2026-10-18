/**
 * tauri-plugin-sql 驱动的实现。
 *
 * 只在真正的 Tauri 里加载（services/storage.ts 用 isTauri 判断后再动态 import），
 * 这样网页模式不会因为缺 __TAURI_INTERNALS__ 而炸掉。
 * 迁移由 Rust 侧 tauri_plugin_sql::Builder::add_migrations 负责，这里只连库。
 *
 * 连接串用**绝对路径**：相对路径会被插件解析到 app_config_dir，而我们希望数据库
 * 跟着设备数据目录走（CASEBOARD_DATA_DIR 可改，见 src-tauri/src/lib.rs 的 data_dir_of）。
 * 绝对路径在插件的 path_mapper 里会整体替换，不会再碰 app_config_dir。
 * 同时传 autoCreate:false——目录与空库文件已经由 Rust 的 ensure_db_file 建好，
 * 插件不必（也不应）去 create_dir_all 平台默认目录。
 */
import Database from '@tauri-apps/plugin-sql';
import { ensureDbFile } from '../platform';
import type { SqlDriver } from './repo';

/** 相对连接串（仅网页端调试或文档展示用）；桌面端实际连的是 ensure_db_file 给的绝对路径。 */
export const DB_NAME = 'caseboard.db';

class PluginSqlDriver implements SqlDriver {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.db.execute(sql, params);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.select<T[]>(sql, params)) as T[];
  }
}

let cached: Promise<SqlDriver> | null = null;

export function openPluginSqlDriver(): Promise<SqlDriver> {
  if (!cached) {
    cached = (async () => {
      const dbPath = await ensureDbFile();
      const db = await Database.load('sqlite:' + dbPath, { autoCreate: false });
      return new PluginSqlDriver(db);
    })();
    // 失败不缓存：下次调用重新尝试建库/连库
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

/** 测试/重置用：丢弃缓存连接。 */
export function resetPluginSqlDriver(): void {
  cached = null;
}
