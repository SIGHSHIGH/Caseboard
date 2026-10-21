/**
 * SQLite 能力：对应桌面 src/services/db/repo.ts 的 SqlDriver 接口。
 * 接口只有 execute(sql, params) 与 select(sql, params) 两个异步方法，
 * 这里保持同形状，前端 harmony 驱动层零适配。
 */
import { relationalStore } from '@kit.ArkData';
import { AppContext } from '../common/AppContext';
import { PlatformService } from './PlatformService';
import { SelectResultJson } from '../common/Types';

const DEFAULT_DB_NAME: string = 'caseboard.db';

/**
 * 表结构（版本 1），与桌面 `src-tauri/src/migrations.rs` 的 V1_SQL 逐句一致。
 *
 * 为什么不改一个字：`src/services/db/repo.ts` 的 SQL 直接按列名读写这些表，
 * 任何列名/顺序漂移都会让「数据库 → Document Model」不再无损（违反硬约束 1）。
 * 语句全部 IF NOT EXISTS，可重复执行。
 */
const V1_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    case_no TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    doc_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nodes (
    case_id TEXT NOT NULL,
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    group_id TEXT,
    x REAL NOT NULL,
    y REAL NOT NULL,
    w REAL NOT NULL,
    h REAL NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (case_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS edges (
    case_id TEXT NOT NULL,
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    rel_type TEXT NOT NULL,
    style TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (case_id, id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (case_id, source)',
  'CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (case_id, target)',
  `CREATE TABLE IF NOT EXISTS groups (
    case_id TEXT NOT NULL,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (case_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    case_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT,
    zone TEXT NOT NULL DEFAULT 'evidence',
    ai_generated INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    PRIMARY KEY (case_id, id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_assets_sha ON assets (case_id, sha256)',
  `CREATE TABLE IF NOT EXISTS views (
    case_id TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (case_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    label TEXT NOT NULL,
    nodes INTEGER NOT NULL,
    edges INTEGER NOT NULL,
    doc_json TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_snapshots_case ON snapshots (case_id, created_at DESC)',
  `CREATE TABLE IF NOT EXISTS trash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    label TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_trash_case ON trash (case_id, deleted_at DESC)'
];

/**
 * FTS5 全文索引表。单独执行：HarmonyOS 的 SQLite 可能未编入 FTS5，
 * 这里失败只降级搜索，不能让整个应用打不开。
 */
const FTS5_SQL: string = `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  case_id UNINDEXED,
  kind UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
)`;

let fts5Ready: boolean = false;

/** 全文索引是否可用：false 时上层搜索必须显式降级（不静默） */
export function isFts5Ready(): boolean {
  return fts5Ready;
}

export class DbService {
  private static store: relationalStore.RdbStore | undefined = undefined;
  private static dbName: string = DEFAULT_DB_NAME;

  private static async ensureStore(): Promise<relationalStore.RdbStore> {
    const existing = DbService.store;
    if (existing !== undefined) {
      return existing;
    }
    const config: relationalStore.StoreConfig = {
      name: DbService.dbName,
      securityLevel: relationalStore.SecurityLevel.S1
    };
    const store = await relationalStore.getRdbStore(AppContext.getContext(), config);
    DbService.store = store;
    return store;
  }

  static async open(dbName: string): Promise<void> {
    const name = dbName.trim().length === 0 ? DEFAULT_DB_NAME : dbName.trim();
    if (DbService.store !== undefined && DbService.dbName === name) {
      return;
    }
    DbService.close();
    DbService.dbName = name;
    await DbService.ensureStore();
    await DbService.applySchema();
  }

  /** 建表（幂等）：核心表失败直接抛，FTS5 失败只降级搜索。 */
  private static async applySchema(): Promise<void> {
    const store = await DbService.ensureStore();
    for (const sql of V1_SQL) {
      await store.executeSql(sql);
    }
    try {
      await store.executeSql(FTS5_SQL);
      fts5Ready = true;
    } catch (err) {
      fts5Ready = false;
      PlatformService.log('warn', `FTS5 建表失败，全文搜索降级为 LIKE: ${JSON.stringify(err)}`);
    }
  }

  /** JSON 数组字符串 → relationalStore.ValueType[] */
  private static parseArgs(paramsJson: string): relationalStore.ValueType[] {
    const args: relationalStore.ValueType[] = [];
    const raw = paramsJson.trim();
    if (raw.length === 0) {
      return args;
    }
    const parsed: Object[] = JSON.parse(raw) as Object[];
    for (const item of parsed) {
      if (item === null || item === undefined) {
        args.push(null);
      } else if (typeof item === 'number') {
        args.push(item as number);
      } else if (typeof item === 'string') {
        args.push(item as string);
      } else if (typeof item === 'boolean') {
        args.push(item as boolean);
      } else {
        // 复杂类型不支持直接绑定，转成字符串避免静默错绑
        args.push(JSON.stringify(item));
      }
    }
    return args;
  }

  /** 单个单元格 → JSON 字面量，保留 number/boolean 原类型 */
  private static cellToJson(value: relationalStore.ValueType): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'number') {
      return String(value as number);
    }
    if (typeof value === 'boolean') {
      return (value as boolean) ? 'true' : 'false';
    }
    if (typeof value === 'string') {
      return JSON.stringify(value as string);
    }
    if (value instanceof Uint8Array) {
      // 二进制列不在 bridge 层展开，前端按需另取
      return JSON.stringify('[blob]');
    }
    return JSON.stringify(String(value));
  }

  static async execute(sql: string, paramsJson: string): Promise<void> {
    const store = await DbService.ensureStore();
    const args = DbService.parseArgs(paramsJson);
    if (args.length === 0) {
      await store.executeSql(sql);
    } else {
      await store.executeSql(sql, args);
    }
  }

  /** 返回 {"columns":[...],"rows":[[...]]}，行内保持原类型 */
  static async select(sql: string, paramsJson: string): Promise<string> {
    const store = await DbService.ensureStore();
    const args = DbService.parseArgs(paramsJson);
    const rs = args.length === 0 ? await store.querySql(sql) : await store.querySql(sql, args);
    try {
      const columns = rs.columnNames;
      const colIndexes: number[] = [];
      for (const c of columns) {
        colIndexes.push(rs.getColumnIndex(c));
      }
      const rows: string[] = [];
      while (rs.goToNextRow()) {
        const cells: string[] = [];
        for (const idx of colIndexes) {
          cells.push(DbService.cellToJson(rs.getValue(idx)));
        }
        rows.push(`[${cells.join(',')}]`);
      }
      const result: SelectResultJson = {
        columns: columns,
        rows: []
      };
      // columns 已单独序列化，rows 逐行拼接以免二次解析
      const head = JSON.stringify(result.columns);
      return `{"columns":${head},"rows":[${rows.join(',')}]}`;
    } finally {
      rs.close();
    }
  }

  static close(): void {
    const store = DbService.store;
    if (store !== undefined) {
      DbService.store = undefined;
    }
  }

  static path(): string {
    return PlatformService.dbPath();
  }

  /** FTS5 能力探测：H0 必须明确结论，不允许静默降级 */
  static async probeFts5(): Promise<boolean> {
    try {
      const store = await DbService.ensureStore();
      await store.executeSql('CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x)');
      await store.executeSql('DROP TABLE IF EXISTS __fts_probe');
      return true;
    } catch (err) {
      PlatformService.log('warn', `FTS5 不可用，搜索需降级: ${JSON.stringify(err)}`);
      return false;
    }
  }
}
