/**
 * 自定义证据链命令（M12 / K14c，Gate 0-2 唯一写入口）。
 * 链只记「哪份材料在哪个阶段」，不改材料本身。
 */
import type { CaseDoc, ChainDef, ChainStageId } from '../types';
import { newId } from '../lib/id';
import { isChainStageId } from '../lib/chains';
import type { Command } from './types';

export interface AddChainInput {
  id?: string;
  title: string;
  note?: string;
}

function ensureChains(draft: CaseDoc): ChainDef[] {
  if (!draft.chains) draft.chains = [];
  return draft.chains;
}

export function addChain(input: AddChainInput): Command {
  return {
    label: '新建证据链',
    apply(draft) {
      const title = input.title.trim();
      if (!title) return;
      const chains = ensureChains(draft);
      const chain: ChainDef = {
        id: input.id?.trim() || newId('chain'),
        title,
        entries: [],
      };
      if (input.note && input.note.trim()) chain.note = input.note.trim();
      if (chains.some((item) => item.id === chain.id)) return;
      chains.push(chain);
    },
  };
}

export interface ChainPatch {
  title?: string;
  note?: string | null;
}

export function updateChain(id: string, patch: ChainPatch): Command {
  return {
    label: '重命名证据链',
    apply(draft) {
      const chain = draft.chains?.find((item) => item.id === id);
      if (!chain) return;
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (title) chain.title = title;
      }
      if (patch.note !== undefined) {
        const note = (patch.note ?? '').trim();
        if (note) chain.note = note;
        else delete chain.note;
      }
    },
  };
}

export function deleteChain(id: string): Command {
  return {
    label: '删除证据链',
    apply(draft) {
      if (!draft.chains) return;
      draft.chains = draft.chains.filter((item) => item.id !== id);
      if (draft.chains.length === 0) delete draft.chains;
    },
  };
}

/** stageId = null 表示把材料从这条链里移出 */
export function setChainEntry(chainId: string, nodeId: string, stageId: ChainStageId | null): Command {
  return {
    label: stageId ? '把材料归入证据链阶段' : '把材料移出证据链',
    apply(draft) {
      const chain = draft.chains?.find((item) => item.id === chainId);
      if (!chain) return;
      if (!draft.nodes.some((node) => node.id === nodeId)) return;
      chain.entries = chain.entries.filter((entry) => entry.nodeId !== nodeId);
      if (stageId && isChainStageId(stageId)) chain.entries.push({ nodeId, stageId });
    },
  };
}
