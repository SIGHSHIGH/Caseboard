import { create } from 'zustand';
import { useDocStore } from './docStore';
import { composeCommands, importAssets, updateAsset } from '../commands';
import { dedupeCandidates, nextAssetNo, type DuplicateEntry, type ImportMode } from '../lib/assetMeta';
import { imageService, type PrepareFailure, type PrepareProgress, type PreparedImage } from '../services/image';
import { OCR_ENGINE_HINT, ocrEngineStatus, recognizeAssetText } from '../services/ocr';
import { newId } from '../lib/id';
import type { Command } from '../commands/types';
import type { Asset } from '../types';

/** 建证据节点时的铺排：三列网格，从画布左上角起排，避免和演示数据打架 */
const LAYOUT_X = 160;
const LAYOUT_Y = 160;
const LAYOUT_STEP_X = 240;
const LAYOUT_STEP_Y = 190;
const LAYOUT_COLS = 3;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * M9：导入后自动 OCR。
 * 只有在系统里找到 OCR 引擎时才跑；跑出来的文字用一条合成命令一次性写回（导入本身已经落库，
 * 所以这里只是补充 ocrText，撤销时不会把素材一起撤掉）。引擎缺失返回安装指引，不阻断导入。
 */
async function runOcrOnImported(assets: Asset[]): Promise<string | null> {
  if (assets.length === 0) return null;
  try {
    const status = await ocrEngineStatus();
    if (!status.available) {
      return '导入完成，但本机没有可用的 OCR 引擎，未自动识别文字。' + (status.hint ? status.hint : OCR_ENGINE_HINT);
    }
    const patches: Command[] = [];
    let failed = 0;
    for (const asset of assets) {
      try {
        const text = (await recognizeAssetText(asset)).trim();
        if (text.length > 0) patches.push(updateAsset(asset.id, { ocrText: text }));
      } catch {
        failed += 1;
      }
    }
    if (patches.length > 0) {
      useDocStore
        .getState()
        .dispatch(composeCommands(`导入后 OCR（${patches.length} 张）`, patches));
    }
    if (failed > 0) {
      return `导入完成：${patches.length} 张已识别文字，${failed} 张识别失败（可在右栏素材区重新识别）。`;
    }
    if (patches.length === 0) return '导入完成：OCR 没有识别出文字。';
    return `导入完成：已自动识别 ${patches.length} 张图片的文字，可在右栏「OCR 文字」里校对。`;
  } catch (error) {
    return `导入完成，但自动 OCR 出错：${messageOf(error)}`;
  }
}

interface ImportStore {
  open: boolean;
  /** 已预处理（哈希 + 缩略图 + EXIF 完成）且通过库内/批内去重的候选 */
  drafts: PreparedImage[];
  duplicates: DuplicateEntry<PreparedImage>[];
  failed: PrepareFailure[];
  progress: PrepareProgress | null;
  busy: boolean;
  error: string | null;
  /** 导入渠道，决定 Asset.source：拖入/批选=import，粘贴=clipboard，监视=watch */
  origin: Asset['source'];
  mode: ImportMode;
  sourceLabel: string;
  capturedAt: string;
  linkedNodeId: string;
  /** M9：导入后的 OCR 结果提示（未装引擎时给安装指引） */
  ocrNotice: string | null;
  startImport: (files: File[], origin: Asset['source']) => Promise<void>;
  confirm: () => Promise<number>;
  reset: () => void;
  clearOcrNotice: () => void;
  setMode: (mode: ImportMode) => void;
  setSourceLabel: (label: string) => void;
  setCapturedAt: (value: string) => void;
  setLinkedNodeId: (id: string) => void;
  dropDraft: (hash: string) => void;
}

export const useImportStore = create<ImportStore>((set, get) => ({
  open: false,
  drafts: [],
  duplicates: [],
  failed: [],
  progress: null,
  busy: false,
  error: null,
  origin: 'import',
  mode: 'library',
  sourceLabel: '现场照片',
  capturedAt: '',
  linkedNodeId: '',
  ocrNotice: null,

  startImport: async (files, origin) => {
    if (files.length === 0) return;
    const doc = useDocStore.getState().doc;
    set({
      open: true,
      busy: true,
      error: null,
      ocrNotice: null,
      drafts: [],
      duplicates: [],
      failed: [],
      origin,
      progress: { done: 0, total: files.length, name: '' },
    });
    try {
      const result = await imageService.prepare(files, (progress) => set({ progress }));
      // 去重：先比库内已有哈希，再比本批次内部重复
      const dedupe = dedupeCandidates(doc.assets, result.prepared);
      let error: string | null = null;
      if (result.failed.length > 0) {
        error = `${result.failed.length} 个文件无法导入：${result.failed[0].error}`;
      }
      if (dedupe.fresh.length === 0) {
        error =
          dedupe.duplicates.length > 0
            ? '所选图片与素材库已有图片的 SHA-256 相同，没有新图片可导入。'
            : (error ?? '没有可导入的图片文件。');
      } else {
        // 有可导入项时，重复项只作为提示，不阻断向导
      }
      set({
        drafts: dedupe.fresh,
        duplicates: dedupe.duplicates,
        failed: result.failed,
        busy: false,
        progress: null,
        error,
        open: dedupe.fresh.length > 0,
      });
      const firstExif = dedupe.fresh.find((item) => item.exif?.capturedAt);
      if (get().capturedAt === '' && firstExif?.exif?.capturedAt) {
        set({ capturedAt: firstExif.exif.capturedAt.slice(0, 10) });
      }
    } catch (error) {
      set({ busy: false, progress: null, open: false, error: `图片预处理失败：${messageOf(error)}` });
    }
  },

  confirm: async () => {
    const { drafts, mode, sourceLabel, capturedAt, linkedNodeId, origin } = get();
    if (drafts.length === 0) return 0;
    set({ busy: true, error: null });
    try {
      const doc = useDocStore.getState().doc;
      const assets = await imageService.save(drafts, {
        source: origin,
        zone: 'evidence',
        sourceLabel: sourceLabel || undefined,
        capturedAt: capturedAt || undefined,
        startNo: nextAssetNo(doc.assets),
      });
      const evidenceNodes =
        mode === 'evidence-node'
          ? assets.map((asset, index) => ({
              id: newId('n'),
              title: `照片 ${asset.no ?? index + 1}`,
              x: LAYOUT_X + (index % LAYOUT_COLS) * LAYOUT_STEP_X,
              y: LAYOUT_Y + Math.floor(index / LAYOUT_COLS) * LAYOUT_STEP_Y,
              fields: (sourceLabel ? { 来源: sourceLabel } : {}) as Record<string, string | number | boolean>,
              attachments: [asset.id],
            }))
          : undefined;
      useDocStore.getState().dispatch(
        importAssets({ assets, evidenceNodes, linkNodeId: linkedNodeId || undefined }),
      );
      // M9：导入后自动 OCR —— 引擎缺失只给安装指引，绝不阻断导入
      const notice = await runOcrOnImported(assets);
      set({
        open: false,
        drafts: [],
        duplicates: [],
        failed: [],
        progress: null,
        busy: false,
        ocrNotice: notice,
      });
      return assets.length;
    } catch (error) {
      set({ busy: false, error: `保存图片失败：${messageOf(error)}` });
      return 0;
    }
  },

  reset: () =>
    set({ open: false, drafts: [], duplicates: [], failed: [], progress: null, busy: false, error: null }),
  clearOcrNotice: () => set({ ocrNotice: null }),
  setMode: (mode) => set({ mode }),
  setSourceLabel: (sourceLabel) => set({ sourceLabel }),
  setCapturedAt: (capturedAt) => set({ capturedAt }),
  setLinkedNodeId: (linkedNodeId) => set({ linkedNodeId }),
  dropDraft: (hash) => set((state) => ({ drafts: state.drafts.filter((item) => item.hash !== hash) })),
}));
