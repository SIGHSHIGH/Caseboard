import type { CaseDoc } from '../types';

export const AUTOSAVE_KEY = 'caseboard-autosave';

/** M1 只做 localStorage；M4 由 service 层换成 SQLite（决策 D5）。 */
export function saveAutosave(doc: CaseDoc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch {
    // 存储配额或隐私模式失败时不阻断编辑
  }
}

export function loadAutosave(): CaseDoc | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCaseDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCaseDoc(value: unknown): value is CaseDoc {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as Partial<CaseDoc>;
  return (
    typeof doc.meta === 'object' &&
    doc.meta !== null &&
    Array.isArray(doc.nodes) &&
    Array.isArray(doc.edges) &&
    Array.isArray(doc.groups) &&
    Array.isArray(doc.assets) &&
    Array.isArray(doc.views)
  );
}
