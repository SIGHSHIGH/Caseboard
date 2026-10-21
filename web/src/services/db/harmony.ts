/**
 * 鸿蒙 SQLite driver（H1 平台缝之一）：把 `repo.ts` 的 SqlDriver 接到
 * 原生 `@ohos.data.relationalStore`。
 *
 * 与桌面版 `db/tauri.ts` 的差别只在**传输格式**：tauri-plugin-sql 直接收发
 * 对象数组；ArkTS 桥只认字符串，所以 `dbSelect` 返回
 * `{ columns: string[], rows: string[][] }`，这里再折回对象数组。
 *
 * SQL 与表结构一个字都没改——单一数据源在存储层不被破坏。
 */
import type { SqlDriver } from './repo';
import { callNative } from '../harmony';

interface SelectResultJson {
  columns: string[];
  rows: unknown[][];
}

function paramsJson(params?: unknown[]): string {
  return JSON.stringify(params ?? []);
}

export function createHarmonySqlDriver(): SqlDriver {
  return {
    async execute(sql: string, params?: unknown[]): Promise<void> {
      await callNative<string>('dbExecute', sql, paramsJson(params));
    },
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const result = await callNative<SelectResultJson>('dbSelect', sql, paramsJson(params));
      if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows)) return [];
      const { columns, rows } = result;
      return rows.map((row) => {
        const record: Record<string, unknown> = {};
        for (let index = 0; index < columns.length; index += 1) record[columns[index]] = row[index];
        return record as T;
      });
    },
  };
}

let driverPromise: Promise<SqlDriver> | null = null;

/**
 * 打开（按需建表）数据库并返回 driver。
 * 建库/迁移交给原生侧：`dbOpen` 在 ArkTS 内执行与桌面 `migrations.rs` 等价的建表语句，
 * 前端这边只负责 SQL 往返。
 */
export function openHarmonySqlDriver(): Promise<SqlDriver> {
  if (!driverPromise) {
    driverPromise = (async () => {
      await callNative<string>('dbOpen', 'caseboard.db');
      return createHarmonySqlDriver();
    })();
  }
  return driverPromise;
}
