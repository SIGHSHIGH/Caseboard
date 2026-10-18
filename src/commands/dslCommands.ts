import type { CaseDoc, CaseEdge, CaseNode, Group, View } from '../types';
import type { DocChange, EntityKind } from '../dsl/diff';
import type { Command } from './types';

type Entity = CaseNode | CaseEdge | Group | View;

function listOf(doc: CaseDoc, kind: EntityKind): Entity[] {
  switch (kind) {
    case 'node':
      return doc.nodes as unknown as Entity[];
    case 'edge':
      return doc.edges as unknown as Entity[];
    case 'group':
      return doc.groups as unknown as Entity[];
    case 'view':
      return doc.views as unknown as Entity[];
  }
}

function findIn(doc: CaseDoc, kind: EntityKind, id: string): Entity | undefined {
  return listOf(doc, kind).find((entity) => entity.id === id);
}

/**
 * M3-3：一批代码改动 = 一条 Command = 一次撤销（验收 4：不出现重复撤销）。
 * 改动来自 mergeDslEdit 的 changes，已剔除与图形侧冲突的字段。
 */
export function applyDslChanges(changes: DocChange[]): Command {
  return {
    label: '代码编辑',
    apply(draft) {
      for (const change of changes) {
        if (change.op === 'update') {
          const entity = findIn(draft, change.kind, change.id);
          if (!entity) continue;
          const record = entity as unknown as Record<string, unknown>;
          if (change.after === undefined) delete record[change.field as string];
          else record[change.field as string] = change.after;
          continue;
        }
        if (change.op === 'remove') {
          const list = listOf(draft, change.kind);
          const index = list.findIndex((entity) => entity.id === change.id);
          if (index >= 0) list.splice(index, 1);
          continue;
        }
        listOf(draft, change.kind).push(JSON.parse(JSON.stringify(change.entity)) as Entity);
      }
      if (changes.length > 0) draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
