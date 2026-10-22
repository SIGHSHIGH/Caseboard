import { pinLinkId } from '../lib/clusterPin';
import type { Command } from './types';

/**
 * 集中钉子之间的红线（H5.6.3）：只维护 `doc.pinLinks`，绝不动 `doc.edges`。
 * 关系数、时间线、地图、导出、代码视图都只认 `edges`，所以红线天然不会被当成关系线。
 */
export function addPinLink(source: string, target: string): Command {
  return {
    label: '画红线',
    apply(draft) {
      if (source === target) return;
      const links = draft.pinLinks ?? (draft.pinLinks = []);
      const exists = links.some(
        (link) =>
          (link.source === source && link.target === target) ||
          (link.source === target && link.target === source),
      );
      if (exists) return;
      links.push({ id: pinLinkId(source, target), source, target });
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

export function removePinLink(id: string): Command {
  return {
    label: '删除红线',
    apply(draft) {
      if (!draft.pinLinks) return;
      draft.pinLinks = draft.pinLinks.filter((link) => link.id !== id);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}

/** 删掉与某个集中钉子相连的所有红线（删节点时连带清理） */
export function removePinLinksOf(nodeId: string): Command {
  return {
    label: '清理钉子上红线',
    apply(draft) {
      if (!draft.pinLinks) return;
      draft.pinLinks = draft.pinLinks.filter((link) => link.source !== nodeId && link.target !== nodeId);
      draft.meta.updatedAt = new Date().toISOString();
    },
  };
}
