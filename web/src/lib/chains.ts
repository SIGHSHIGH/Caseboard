/**
 * 自定义证据链（M12 / K14c，纯函数）。
 *
 * 自动证据链（src/lib/evidenceChain.ts）是按字段 + 关键词现算出来的；
 * 这里处理的是人自己建的链：六阶段里放哪些材料由人决定，可以建多条、
 * 各自独立展示，互不干扰。纯函数放在 lib 里，才能进 smoke 的机器断言。
 */
import type { CaseDoc, CaseNode, ChainDef, ChainStageId } from '../types';
import { CHAIN6_STAGES, type ChainItem, type ChainStage } from './evidenceChain';

export const CHAIN_STAGE_IDS: ChainStageId[] = CHAIN6_STAGES.map((stage) => stage.id);

const STAGE_LABELS = new Map(CHAIN6_STAGES.map((stage) => [stage.id, stage.label]));

export function chainStageLabel(stageId: ChainStageId): string {
  return STAGE_LABELS.get(stageId) ?? stageId;
}

export function isChainStageId(value: unknown): value is ChainStageId {
  return typeof value === 'string' && CHAIN_STAGE_IDS.includes(value as ChainStageId);
}

/** 证据类实体的附件算作支撑材料（与自动链口径一致） */
function evidenceIdsOf(node: CaseNode): string[] {
  return (node.attachments ?? []).slice();
}

/** 把一条自定义链展开成六个阶段（空阶段标成断点，和自动链同样的读法） */
export function customChainStages(doc: CaseDoc, chain: ChainDef): ChainStage[] {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  return CHAIN6_STAGES.map((def) => {
    const items: ChainItem[] = [];
    for (const entry of chain.entries) {
      if (entry.stageId !== def.id) continue;
      const node = byId.get(entry.nodeId);
      if (!node) continue;
      const evidenceIds = evidenceIdsOf(node);
      items.push({
        nodeId: node.id,
        title: node.title,
        type: node.type,
        evidenceIds,
        weak: evidenceIds.length === 0,
      });
    }
    return {
      id: def.id,
      label: def.label,
      hint: def.hint,
      items,
      missing: items.length === 0,
    };
  });
}

export interface ChainCoverage {
  filled: number;
  total: number;
  coverage: number;
  gaps: ChainStageId[];
}

export function chainCoverage(stages: ChainStage[]): ChainCoverage {
  const filled = stages.filter((stage) => stage.items.length > 0).length;
  const total = stages.length;
  return {
    filled,
    total,
    coverage: total === 0 ? 0 : filled / total,
    gaps: stages.filter((stage) => stage.items.length === 0).map((stage) => stage.id),
  };
}

/** 某实体是否已经在本链的某个阶段里（用于下拉去重） */
export function stageOfNode(chain: ChainDef, nodeId: string): ChainStageId | null {
  const hit = chain.entries.find((entry) => entry.nodeId === nodeId);
  return hit ? hit.stageId : null;
}

/** 允许归入某阶段的实体：排除已经在本阶段里的 */
export function assignableNodes(doc: CaseDoc, chain: ChainDef, stageId: ChainStageId): CaseNode[] {
  return doc.nodes.filter((node) => stageOfNode(chain, node.id) !== stageId);
}
