import type { Command } from './types';
import type { Asset } from '../types';

function labelOf(asset: Asset): string {
  return asset.name ? `新增素材 ${asset.name}` : `新增素材 ${asset.no ?? asset.id}`;
}

export function addAsset(asset: Asset): Command {
  return {
    label: labelOf(asset),
    apply(draft) {
      if (!draft.assets.some((item) => item.id === asset.id)) draft.assets.push(asset);
    },
  };
}

/** 批量入账：整批素材压成一条命令，撤销一次全部退回，避免 500 张时要点 500 次撤销 */
export function addAssets(assets: Asset[]): Command {
  return {
    label: assets.length === 1 ? labelOf(assets[0]) : `批量导入 ${assets.length} 张素材`,
    apply(draft) {
      const existing = new Set(draft.assets.map((item) => item.id));
      for (const asset of assets) {
        if (!existing.has(asset.id)) {
          draft.assets.push(asset);
          existing.add(asset.id);
        }
      }
    },
  };
}

export interface AssetPatch {
  no?: string;
  source?: Asset['source'];
  sourceLabel?: string;
  capturedAt?: string;
  camera?: string;
  ocrText?: string;
  zone?: Asset['zone'];
  annotations?: Asset['annotations'];
}

export function updateAsset(assetId: string, patch: AssetPatch): Command {
  return {
    label: `修改素材 ${assetId}`,
    apply(draft) {
      const asset = draft.assets.find((item) => item.id === assetId);
      if (!asset) return;
      if (patch.no !== undefined) asset.no = patch.no;
      if (patch.source !== undefined) asset.source = patch.source;
      if (patch.sourceLabel !== undefined) asset.sourceLabel = patch.sourceLabel;
      if (patch.capturedAt !== undefined) asset.capturedAt = patch.capturedAt;
      if (patch.camera !== undefined) asset.camera = patch.camera;
      if (patch.ocrText !== undefined) asset.ocrText = patch.ocrText;
      if (patch.zone !== undefined) asset.zone = patch.zone;
      if (patch.annotations !== undefined) asset.annotations = patch.annotations;
    },
  };
}

export interface EvidenceNodeDraft {
  id: string;
  title: string;
  x: number;
  y: number;
  fields?: Record<string, string | number | boolean>;
  attachments: string[];
}

export interface ImportBundle {
  assets: Asset[];
  /** 统一建证据节点时传入；与素材同一条命令，撤销一次全部回退 */
  evidenceNodes?: EvidenceNodeDraft[];
  /** 素材同时挂到这个节点的附件列表（导入向导里的「关联实体」） */
  linkNodeId?: string;
}

export function importAssets(bundle: ImportBundle): Command {
  const assetIds = bundle.assets.map((asset) => asset.id);
  return {
    label: bundle.assets.length === 1 ? `导入素材 ${bundle.assets[0].no ?? bundle.assets[0].name ?? ''}` : `导入 ${bundle.assets.length} 张素材`,
    apply(draft) {
      const existing = new Set(draft.assets.map((item) => item.id));
      for (const asset of bundle.assets) {
        if (!existing.has(asset.id)) {
          draft.assets.push(asset);
          existing.add(asset.id);
        }
      }
      for (const node of bundle.evidenceNodes ?? []) {
        if (draft.nodes.some((item) => item.id === node.id)) continue;
        draft.nodes.push({
          id: node.id,
          type: 'evidence',
          title: node.title,
          x: node.x,
          y: node.y,
          w: 208,
          h: 112,
          fields: node.fields ?? {},
          tags: ['图片导入'],
          status: 'todo',
          confidence: 30,
          attachments: node.attachments,
          notes: '由照片导入生成，待核实来源与拍摄时间。',
        });
      }
      if (bundle.linkNodeId) {
        const host = draft.nodes.find((item) => item.id === bundle.linkNodeId);
        if (host) {
          const merged = new Set(host.attachments);
          for (const id of assetIds) merged.add(id);
          host.attachments = [...merged];
        }
      }
    },
  };
}

/** 删素材：同时摘掉节点上的附件引用，避免悬空 id */
export function deleteAsset(assetId: string): Command {
  return {
    label: `删除素材 ${assetId}`,
    apply(draft) {
      draft.assets = draft.assets.filter((item) => item.id !== assetId);
      for (const node of draft.nodes) {
        if (node.attachments.includes(assetId)) {
          node.attachments = node.attachments.filter((id) => id !== assetId);
        }
      }
    },
  };
}
