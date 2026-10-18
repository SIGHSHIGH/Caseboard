import type { CaseDoc } from '../types';
import type { Command } from './types';

/** 导入 JSON 也是 Command：可撤销，且不会绕开单一数据源。 */
export function replaceDocument(next: CaseDoc): Command {
  return {
    label: '导入案件 JSON',
    apply(draft) {
      draft.meta = next.meta;
      draft.nodes = next.nodes;
      draft.edges = next.edges;
      draft.groups = next.groups;
      draft.assets = next.assets;
      draft.views = next.views;
      draft.settings = next.settings;
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
