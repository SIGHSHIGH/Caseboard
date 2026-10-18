/**
 * SQLite 持久化仓库层。
 *
 * 只依赖一个三方法的 driver 接口（execute / select / 事务可选），
 * 这样：真实运行时接 tauri-plugin-sql；smoke 里可以用内存假驱动验证 SQL 往返；
 * 网页模式退化成 localStorage（services/storage.ts）。
 *
 * 表结构见 src-tauri/src/migrations.rs（V1_SQL），两边字段必须一致。
 */
import type { CaseDoc } from '../../types';
import type { CaseRow, EntityRows, NodeRow } from './mapping';
import { docToRows, rowsToDoc, searchRowsFor } from './mapping';

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface CaseSummary {
  id: string;
  title: string;
  caseNo?: string;
  createdAt: string;
  updatedAt: string;
}

/** 插入语句用 ON CONFLICT 覆盖，保存幂等。 */
const SQL = {
  upsertCase: `INSERT INTO cases (id, title, case_no, created_at, updated_at, doc_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, case_no=excluded.case_no,
      updated_at=excluded.updated_at, doc_json=excluded.doc_json`,
  listCases: 'SELECT id, title, case_no, created_at, updated_at FROM cases ORDER BY updated_at DESC',
  getCase: 'SELECT * FROM cases WHERE id = ?',
  deleteCaseRows: (table: string) => `DELETE FROM ${table} WHERE case_id = ?`,
  insertNode: `INSERT INTO nodes (case_id, id, type, title, status, confidence, group_id, x, y, w, h, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  insertEdge: `INSERT INTO edges (case_id, id, source, target, rel_type, style, confidence, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  insertGroup: 'INSERT INTO groups (case_id, id, title, payload) VALUES (?, ?, ?, ?)',
  insertAsset: `INSERT INTO assets (case_id, id, name, kind, sha256, zone, ai_generated, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  insertView: 'INSERT INTO views (case_id, id, kind, name, payload) VALUES (?, ?, ?, ?, ?)',
  insertSearch: 'INSERT INTO search_index (case_id, kind, entity_id, title, body) VALUES (?, ?, ?, ?, ?)',
  selectNodes: 'SELECT * FROM nodes WHERE case_id = ?',
  selectEdges: 'SELECT * FROM edges WHERE case_id = ?',
  selectGroups: 'SELECT * FROM groups WHERE case_id = ?',
  selectAssets: 'SELECT * FROM assets WHERE case_id = ?',
  selectViews: 'SELECT * FROM views WHERE case_id = ?',
  insertSnapshot: 'INSERT INTO snapshots (case_id, created_at, label, nodes, edges, doc_json) VALUES (?, ?, ?, ?, ?, ?)',
  listSnapshots: 'SELECT id, created_at, label, nodes, edges FROM snapshots WHERE case_id = ? ORDER BY id DESC',
  getSnapshot: 'SELECT id, case_id, created_at, label, doc_json FROM snapshots WHERE id = ?',
  trimSnapshots: `DELETE FROM snapshots WHERE case_id = ? AND id NOT IN
    (SELECT id FROM snapshots WHERE case_id = ? ORDER BY id DESC LIMIT ?)`,
  insertTrash: 'INSERT INTO trash (case_id, deleted_at, kind, entity_id, label, payload) VALUES (?, ?, ?, ?, ?, ?)',
  listTrash: 'SELECT id, case_id, deleted_at, kind, entity_id, label FROM trash WHERE case_id = ? ORDER BY id DESC',
  listTrashItems: 'SELECT id, case_id, deleted_at, kind, entity_id, label, payload FROM trash WHERE case_id = ? ORDER BY id DESC',
  getTrash: 'SELECT * FROM trash WHERE id = ?',
  deleteTrash: 'DELETE FROM trash WHERE id = ?',
  purgeTrash: 'DELETE FROM trash WHERE case_id = ?',
  clearSearch: 'DELETE FROM search_index WHERE case_id = ?',
  search: `SELECT kind, entity_id, title, body FROM search_index
    WHERE case_id = ? AND search_index MATCH ? ORDER BY rank LIMIT ?`,
} as const;

export const SNAPSHOT_KEEP = 50;
/** 自动保存时多久留一个版本快照（毫秒），避免每次编辑都存快照。 */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** 单个案件的全部实体表整表替换（事务由调用方保证，或按顺序执行）。 */
async function replaceEntities(driver: SqlDriver, rows: EntityRows): Promise<void> {
  const caseId = rows.caseRow.id;
  for (const table of ['nodes', 'edges', 'groups', 'assets', 'views']) {
    await driver.execute(SQL.deleteCaseRows(table), [caseId]);
  }
  for (const batch of chunk(rows.nodeRows, 50)) {
    for (const row of batch) {
      await driver.execute(SQL.insertNode, [row.case_id, row.id, row.type, row.title, row.status, row.confidence, row.group_id, row.x, row.y, row.w, row.h, row.payload]);
    }
  }
  for (const batch of chunk(rows.edgeRows, 50)) {
    for (const row of batch) {
      await driver.execute(SQL.insertEdge, [row.case_id, row.id, row.source, row.target, row.rel_type, row.style, row.confidence, row.payload]);
    }
  }
  for (const row of rows.groupRows) {
    await driver.execute(SQL.insertGroup, [row.case_id, row.id, row.title, row.payload]);
  }
  for (const row of rows.assetRows) {
    await driver.execute(SQL.insertAsset, [row.case_id, row.id, row.name, row.kind, row.sha256, row.zone, row.ai_generated, row.payload]);
  }
  for (const row of rows.viewRows) {
    await driver.execute(SQL.insertView, [row.case_id, row.id, row.kind, row.name, row.payload]);
  }
}

/** 全文索引重建：先清空该案件的索引行，再按当前文档重建。 */
export async function reindexSearch(driver: SqlDriver, doc: CaseDoc): Promise<number> {
  const caseId = doc.meta.id;
  await driver.execute(SQL.clearSearch, [caseId]);
  const rows = searchRowsFor(caseId, doc);
  for (const batch of chunk(rows, 50)) {
    for (const row of batch) {
      await driver.execute(SQL.insertSearch, [row.case_id, row.kind, row.entity_id, row.title, row.body]);
    }
  }
  return rows.length;
}

/** 保存整份文档：cases 行 + 实体行 + 全文索引，全部按当前 Model 重写。 */
export async function saveCase(driver: SqlDriver, doc: CaseDoc): Promise<void> {
  const rows = docToRows(doc);
  await driver.execute(SQL.upsertCase, [rows.caseRow.id, rows.caseRow.title, rows.caseRow.case_no, rows.caseRow.created_at, rows.caseRow.updated_at, rows.caseRow.doc_json]);
  await replaceEntities(driver, rows);
  await reindexSearch(driver, doc);
}

export async function listCases(driver: SqlDriver): Promise<CaseSummary[]> {
  const rows = await driver.select<CaseRow>(SQL.listCases);
  return rows.map((row) => ({ id: row.id, title: row.title, caseNo: row.case_no ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }));
}

/** 读取最新保存的案件；没有则返回 null（首启用演示数据）。 */
export async function loadLatestCase(driver: SqlDriver): Promise<CaseDoc | null> {
  const cases = await listCases(driver);
  const first = cases[0];
  if (!first) return null;
  return loadCase(driver, first.id);
}

export async function loadCase(driver: SqlDriver, caseId: string): Promise<CaseDoc | null> {
  const caseRows = await driver.select<CaseRow>(SQL.getCase, [caseId]);
  const caseRow = caseRows[0];
  if (!caseRow) return null;
  const nodeRows = await driver.select<NodeRow>(SQL.selectNodes, [caseId]);
  const edgeRows = await driver.select(SQL.selectEdges, [caseId]);
  const groupRows = await driver.select(SQL.selectGroups, [caseId]);
  const assetRows = await driver.select(SQL.selectAssets, [caseId]);
  const viewRows = await driver.select(SQL.selectViews, [caseId]);
  return rowsToDoc({
    caseRow,
    nodeRows,
    edgeRows: edgeRows as never,
    groupRows: groupRows as never,
    assetRows: assetRows as never,
    viewRows: viewRows as never,
  });
}

export async function deleteCase(driver: SqlDriver, caseId: string): Promise<void> {
  for (const table of ['nodes', 'edges', 'groups', 'assets', 'views']) {
    await driver.execute(SQL.deleteCaseRows(table), [caseId]);
  }
  await driver.execute(SQL.clearSearch, [caseId]);
  await driver.execute('DELETE FROM cases WHERE id = ?', [caseId]);
}

export interface SnapshotMeta {
  id: number;
  createdAt: string;
  label: string;
  nodes: number;
  edges: number;
}

export async function pushSnapshot(driver: SqlDriver, doc: CaseDoc, label = ''): Promise<void> {
  const caseId = doc.meta.id;
  await driver.execute(SQL.insertSnapshot, [caseId, new Date().toISOString(), label, doc.nodes.length, doc.edges.length, JSON.stringify(doc)]);
  await driver.execute(SQL.trimSnapshots, [caseId, caseId, SNAPSHOT_KEEP]);
}

export async function listSnapshots(driver: SqlDriver, caseId: string): Promise<SnapshotMeta[]> {
  const rows = await driver.select<{ id: number; created_at: string; label: string; nodes: number; edges: number }>(SQL.listSnapshots, [caseId]);
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at, label: row.label, nodes: row.nodes, edges: row.edges }));
}

export async function loadSnapshot(driver: SqlDriver, id: number): Promise<CaseDoc | null> {
  const rows = await driver.select<{ doc_json: string }>(SQL.getSnapshot, [id]);
  const row = rows[0];
  if (!row) return null;
  return JSON.parse(row.doc_json) as CaseDoc;
}

/** 每次保存最多 50 个实体，方便断言「保存行数 = 模型实体数」。 */
export async function countRows(driver: SqlDriver, caseId: string): Promise<{ nodes: number; edges: number; groups: number; assets: number; views: number; search: number }> {
  const one = async (sql: string): Promise<number> => {
    const rows = await driver.select<{ n: number }>(sql, [caseId]);
    return Number(rows[0]?.n ?? 0);
  };
  return {
    nodes: await one('SELECT COUNT(*) AS n FROM nodes WHERE case_id = ?'),
    edges: await one('SELECT COUNT(*) AS n FROM edges WHERE case_id = ?'),
    groups: await one('SELECT COUNT(*) AS n FROM groups WHERE case_id = ?'),
    assets: await one('SELECT COUNT(*) AS n FROM assets WHERE case_id = ?'),
    views: await one('SELECT COUNT(*) AS n FROM views WHERE case_id = ?'),
    search: await one('SELECT COUNT(*) AS n FROM search_index WHERE case_id = ?'),
  };
}

/** 全文检索：返回命中条目（kind + entityId），供面板跳转。 */
export async function searchDoc(driver: SqlDriver, caseId: string, query: string, limit = 30): Promise<{ kind: string; entityId: string; title: string; body: string }[]> {
  const term = query.trim();
  if (!term) return [];
  // FTS5 语法：把用户输入整体加引号，避免 - * ( 等符号被当运算符。
  const safe = '"' + term.replace(/"/g, '') + '"';
  const rows = await driver.select<{ kind: string; entity_id: string; title: string; body: string }>(SQL.search, [caseId, safe, limit]);
  return rows.map((row) => ({ kind: row.kind, entityId: row.entity_id, title: row.title, body: row.body ?? '' }));
}

export interface TrashItem {
  kind: 'node' | 'edge' | 'group' | 'asset';
  entityId: string;
  label: string;
  payload: unknown;
}

export async function moveToTrash(driver: SqlDriver, caseId: string, items: TrashItem[]): Promise<void> {
  const now = new Date().toISOString();
  for (const item of items) {
    await driver.execute(SQL.insertTrash, [caseId, now, item.kind, item.entityId, item.label, JSON.stringify(item.payload)]);
  }
}

export async function listTrash(driver: SqlDriver, caseId: string): Promise<{ id: number; kind: string; entityId: string; label: string; deletedAt: string }[]> {
  const rows = await driver.select<{ id: number; deleted_at: string; kind: string; entity_id: string; label: string }>(SQL.listTrash, [caseId]);
  return rows.map((row) => ({ id: row.id, kind: row.kind, entityId: row.entity_id, label: row.label, deletedAt: row.deleted_at }));
}

/** 回收站明细（带 payload）：恢复实体时要把一起删进回收站的关系捞出来一起还回去。 */
export interface TrashRow extends TrashItem {
  id: number;
  deletedAt: string;
}

export async function listTrashItems(driver: SqlDriver, caseId: string): Promise<TrashRow[]> {
  const rows = await driver.select<{ id: number; deleted_at: string; kind: string; entity_id: string; label: string; payload: string }>(
    SQL.listTrashItems,
    [caseId],
  );
  return rows.map((row) => {
    let payload: unknown = null;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      payload = null;
    }
    return { id: row.id, kind: row.kind as TrashItem['kind'], entityId: row.entity_id, label: row.label, deletedAt: row.deleted_at, payload };
  });
}

export async function takeTrashItem(driver: SqlDriver, id: number): Promise<TrashItem | null> {
  const rows = await driver.select<{ kind: string; entity_id: string; label: string; payload: string }>(SQL.getTrash, [id]);
  const row = rows[0];
  if (!row) return null;
  await driver.execute(SQL.deleteTrash, [id]);
  return { kind: row.kind as TrashItem['kind'], entityId: row.entity_id, label: row.label, payload: JSON.parse(row.payload) };
}

export async function purgeTrash(driver: SqlDriver, caseId: string): Promise<void> {
  await driver.execute(SQL.purgeTrash, [caseId]);
}
