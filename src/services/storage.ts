/**
 * 文档持久化的统一入口（决策 D5 的 M4 阶段）：
 * - Tauri 运行时 → SQLite（tauri-plugin-sql），带版本快照与全文索引；
 * - 网页/dev 运行时 → localStorage 兜底，保证 M1 的行为不回退。
 *
 * docStore 只调用这里，不关心跑在哪里；切换实现不影响上层。
 */
import type { CaseDoc } from '../types';
import { loadAutosave, saveAutosave } from '../store/persist';
import {
  listSnapshots,
  listTrash,
  listTrashItems,
  loadLatestCase,
  loadSnapshot,
  moveToTrash,
  purgeTrash,
  pushSnapshot,
  saveCase,
  searchDoc,
  takeTrashItem,
  type SnapshotMeta,
  type SqlDriver,
  type TrashItem,
  type TrashRow as RepoTrashRow,
} from './db/repo';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let driverPromise: Promise<SqlDriver | null> | null = null;

export function getDriver(): Promise<SqlDriver | null> {
  if (!driverPromise) {
    driverPromise = isTauri()
      ? import('./db/tauri').then((mod) => mod.openPluginSqlDriver())
      : Promise.resolve(null);
  }
  return driverPromise;
}

export type SaveResult = { backend: 'sqlite' | 'local'; savedAt: string };

/** 保存当前文档：SQLite 时整表重写并重建 FTS 索引。 */
export async function saveDocToStorage(doc: CaseDoc): Promise<SaveResult> {
  const savedAt = new Date().toISOString();
  const driver = await getDriver();
  if (!driver) {
    saveAutosave(doc);
    return { backend: 'local', savedAt };
  }
  await saveCase(driver, doc);
  // localStorage 始终留一份镜像：极端情况下（数据库损坏）还能救回最近内容。
  saveAutosave(doc);
  return { backend: 'sqlite', savedAt };
}

/** 启动时读回最近一次保存的案件；没有则 null（由 store 退回演示数据）。 */
export async function loadDocFromStorage(): Promise<{ doc: CaseDoc | null; backend: 'sqlite' | 'local' }> {
  const driver = await getDriver();
  if (!driver) return { doc: loadAutosave(), backend: 'local' };
  try {
    const doc = await loadLatestCase(driver);
    return { doc: doc ?? loadAutosave(), backend: 'sqlite' };
  } catch {
    // 数据库读失败时至少别让应用打不开
    return { doc: loadAutosave(), backend: 'local' };
  }
}

export async function createSnapshot(doc: CaseDoc, label = ''): Promise<boolean> {
  const driver = await getDriver();
  if (!driver) return false;
  await pushSnapshot(driver, doc, label);
  return true;
}

/** 版本快照列表（桌面端 SQLite 才有；网页端返回空数组）。 */
export async function listSnapshotsInStorage(caseId: string): Promise<SnapshotMeta[]> {
  const driver = await getDriver();
  if (!driver) return [];
  return listSnapshots(driver, caseId);
}

/** 读回某个快照的完整文档：恢复时用 replaceDocument 命令走撤销栈。 */
export async function loadSnapshotFromStorage(id: number): Promise<CaseDoc | null> {
  const driver = await getDriver();
  if (!driver) return null;
  return loadSnapshot(driver, id);
}

export interface TrashRow {
  id: number;
  kind: string;
  entityId: string;
  label: string;
  deletedAt: string;
}

/** 把删除的实体写进回收站（失败只留日志，不阻断删除动作）。 */
export async function pushTrashToStorage(caseId: string, items: TrashItem[]): Promise<void> {
  if (items.length === 0) return;
  const driver = await getDriver();
  if (!driver) return;
  await moveToTrash(driver, caseId, items);
}

export async function listTrashInStorage(caseId: string): Promise<TrashRow[]> {
  const driver = await getDriver();
  if (!driver) return [];
  return listTrash(driver, caseId);
}

/** 回收站明细（带 payload）：恢复实体时要连带恢复一起删掉的关系。 */
export async function listTrashItemsInStorage(caseId: string): Promise<RepoTrashRow[]> {
  const driver = await getDriver();
  if (!driver) return [];
  return listTrashItems(driver, caseId);
}

/** 取出并删除一条回收站记录（恢复前调用，避免重复恢复同一行）。 */
export async function takeTrashFromStorage(id: number): Promise<TrashItem | null> {
  const driver = await getDriver();
  if (!driver) return null;
  return takeTrashItem(driver, id);
}

export async function purgeTrashInStorage(caseId: string): Promise<void> {
  const driver = await getDriver();
  if (!driver) return;
  await purgeTrash(driver, caseId);
}

export async function searchInStorage(caseId: string, query: string, limit = 30): Promise<{ kind: string; entityId: string; title: string; body: string }[]> {
  const driver = await getDriver();
  if (!driver) return [];
  return searchDoc(driver, caseId, query, limit);
}
