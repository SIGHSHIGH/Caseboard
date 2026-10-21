import type { CaseDoc } from '../types';
import { normalizeDoc } from '../serializers/migrate';

export const AUTOSAVE_KEY = 'caseboard-autosave';

/** M1 只做 localStorage；M4 由 service 层换成 SQLite（决策 D5）。 */
export function saveAutosave(doc: CaseDoc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch {
    // 存储配额或隐私模式失败时不阻断编辑
  }
}

/** 读回时一律走 normalizeDoc：老版本存档缺字段也能打开（M2-1）。 */
export function loadAutosave(): CaseDoc | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeDoc(parsed);
  } catch {
    return null;
  }
}
