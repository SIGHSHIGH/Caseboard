import type { CaseDoc, CaseEdge, CaseNode, Group, PinLink, View } from '../types';
import { stableJson } from './serialize';

/**
 * M3-3：文本视图与图形视图之间的字段级三方合并。
 *
 * 三方分别是：
 * - base：文本视图最近一次序列化时的 Model 快照；
 * - codeNext：用户编辑后的文本解析出来的 Model；
 * - current：当前 Model（可能同时被拖拽、改属性等图形操作改动过）。
 *
 * 规则：
 * - 只比较 DSL 能表达的字段（D20），文本里没有的字段一律不删除不进 diff；
 * - 代码侧改动应用在 current 上，图形侧未改的字段互不覆盖；
 * - 两侧都改了同一字段且值不同 → 保留图形侧（用户眼前的画布不跳），记入 conflicts。
 */

export type EntityKind = 'node' | 'edge' | 'group' | 'view' | 'pinLink';

export interface DocChange {
  kind: EntityKind;
  id: string;
  op: 'add' | 'update' | 'remove';
  /** op === 'update' 时表示字段名 */
  field?: string;
  /** update 时的字段原值与新值（undefined 表示该字段被删除） */
  before?: unknown;
  after?: unknown;
  /** op === 'add' 时携带实体快照 */
  entity?: CaseNode | CaseEdge | Group | View | PinLink;
}

export interface MergeReport {
  /** 合并结果（已应用无冲突的代码改动） */
  doc: CaseDoc;
  /** 冲突后实际落库的改动 */
  changes: DocChange[];
  /** 因图形侧同字段已改而放弃的代码改动 */
  conflicts: DocChange[];
}

type Entity = CaseNode | CaseEdge | Group | View | PinLink;

/** DSL 能表达的字段（与 src/dsl/serialize.ts 的输出面保持一致，D20）。 */
export const DSL_NODE_KEYS = [
  'id',
  'type',
  'title',
  'x',
  'y',
  'w',
  'h',
  'groupId',
  'photo',
  'fields',
  'aliases',
  'tags',
  'status',
  'confidence',
  'zIndex',
  'time',
  'attachments',
  'notes',
  'collapsed',
] as const;
export const DSL_EDGE_KEYS = [
  'id',
  'source',
  'target',
  'relType',
  'label',
  'directed',
  'path',
  'style',
  'color',
  'weight',
  'thickness',
  'time',
  'confidence',
  'evidenceIds',
  'notes',
  'scenario',
] as const;
export const DSL_GROUP_KEYS = ['id', 'title', 'bounds', 'color', 'parentId', 'collapsed', 'opacity'] as const;
export const DSL_VIEW_KEYS = ['id', 'kind', 'name', 'filters', 'camera', 'steps'] as const;

const KEY_SETS: Record<EntityKind, readonly string[]> = {
  node: DSL_NODE_KEYS,
  edge: DSL_EDGE_KEYS,
  group: DSL_GROUP_KEYS,
  view: DSL_VIEW_KEYS,
  pinLink: ['id', 'source', 'target'] as const,
};

function entitiesOf(doc: CaseDoc, kind: EntityKind): Entity[] {
  switch (kind) {
    case 'node':
      return doc.nodes;
    case 'edge':
      return doc.edges;
    case 'group':
      return doc.groups;
    case 'view':
      return doc.views;
    case 'pinLink':
      return (doc.pinLinks ?? []) as unknown as Entity[];
  }
}

function valueAt(entity: Entity, key: string): unknown {
  return (entity as unknown as Record<string, unknown>)[key];
}

/** 深比较：对象键顺序不影响结果。 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  const aJson = stableJson(a);
  const bJson = stableJson(b);
  return aJson === bJson;
}

/** 只比较 DSL 可见字段，得到 before → after 的字段级差异。 */
export function diffDocs(before: CaseDoc, after: CaseDoc): DocChange[] {
  const changes: DocChange[] = [];
  for (const kind of ['node', 'edge', 'group', 'view', 'pinLink'] as const) {
    const beforeMap = new Map(entitiesOf(before, kind).map((entity) => [entity.id, entity]));
    const afterMap = new Map(entitiesOf(after, kind).map((entity) => [entity.id, entity]));
    for (const [id, entity] of afterMap) {
      const old = beforeMap.get(id);
      if (!old) {
        changes.push({ kind, id, op: 'add', entity });
        continue;
      }
      for (const key of KEY_SETS[kind]) {
        if (key === 'id') continue;
        const next = valueAt(entity, key);
        const prev = valueAt(old, key);
        if (sameValue(prev, next)) continue;
        changes.push({ kind, id, op: 'update', field: key, before: prev, after: next });
      }
    }
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) changes.push({ kind, id, op: 'remove' });
    }
  }
  return changes;
}

function cloneDoc(doc: CaseDoc): CaseDoc {
  return JSON.parse(JSON.stringify(doc)) as CaseDoc;
}

function findEntity(doc: CaseDoc, kind: EntityKind, id: string): Entity | undefined {
  return entitiesOf(doc, kind).find((entity) => entity.id === id);
}

function setField(entity: Entity, key: string, value: unknown): void {
  const record = entity as unknown as Record<string, unknown>;
  if (value === undefined) delete record[key];
  else record[key] = value;
}

function removeEntity(doc: CaseDoc, kind: EntityKind, id: string): void {
  const list = entitiesOf(doc, kind) as Entity[];
  const index = list.findIndex((entity) => entity.id === id);
  if (index >= 0) list.splice(index, 1);
}

function addEntity(doc: CaseDoc, kind: EntityKind, entity: Entity): void {
  const list = entitiesOf(doc, kind) as Entity[];
  list.push(JSON.parse(JSON.stringify(entity)) as Entity);
}

/**
 * 三方合并：把「文本侧改动」叠加到「当前 Model」上。
 * @param base 文本视图最近一次序列化时的快照
 * @param codeNext 新文本解析出来的文档
 * @param current 当前 Model
 */
export function mergeDslEdit(base: CaseDoc, codeNext: CaseDoc, current: CaseDoc): MergeReport {
  const codeChanges = diffDocs(base, codeNext);
  const modelChanges = diffDocs(base, current);
  const merged = cloneDoc(current);
  const changes: DocChange[] = [];
  const conflicts: DocChange[] = [];

  // 图形侧改动过就记下来：同一字段的代码改动要礼让（保留画布现状）
  const modelTouched = (kind: EntityKind, id: string, field: string): boolean => {
    const entity = findEntity(current, kind, id);
    const old = findEntity(base, kind, id);
    if (!entity || !old) return false;
    return modelChanges.some((change) => change.kind === kind && change.id === id && change.op === 'update' && change.field === field);
  };

  for (const change of codeChanges) {
    if (change.op === 'update') {
      const field = change.field as string;
      if (modelTouched(change.kind, change.id, field)) {
        conflicts.push(change);
        continue;
      }
      const entity = findEntity(merged, change.kind, change.id);
      if (!entity) {
        conflicts.push(change);
        continue;
      }
      setField(entity, field, change.after);
      changes.push(change);
      continue;
    }
    if (change.op === 'add') {
      if (findEntity(merged, change.kind, change.id)) {
        conflicts.push(change);
        continue;
      }
      addEntity(merged, change.kind, change.entity as Entity);
      changes.push(change);
      continue;
    }
    // remove：图形侧动过这个对象就保留（删除是破坏性的，宁可让用户确认）
    if (modelChanges.some((modelChange) => modelChange.kind === change.kind && modelChange.id === change.id)) {
      conflicts.push(change);
      continue;
    }
    removeEntity(merged, change.kind, change.id);
    changes.push(change);
  }

  return { doc: merged, changes, conflicts };
}
