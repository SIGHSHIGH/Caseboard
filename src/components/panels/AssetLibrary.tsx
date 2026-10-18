import { useEffect, useRef, useState } from 'react';
import { useDocStore } from '../../store/docStore';
import { useImportStore } from '../../store/importStore';
import { useUiStore } from '../../store/uiStore';
import { fileService } from '../../services/file';
import { thumbUrl } from '../../services/imageStore';
import { startDirectoryWatch, supportsDirectoryWatch, type WatchHandle } from '../../services/watch';
import { formatBytes } from '../../lib/assetMeta';
import { ASSET_DND_TYPE } from '../../lib/dnd';
import { ExtractDialog } from './ExtractDialog';
import type { Asset } from '../../types';

type Zone = Asset['zone'];

/** 缩略图按需从 IndexedDB 取 objectURL；取不到（旧文档 / 无 IndexedDB）时降级成占位块 */
function useThumb(assetId: string, size: number = 256): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    thumbUrl(assetId, size)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [assetId, size]);
  return url;
}

function AssetTile({ asset, selected, onSelect }: { asset: Asset; selected: boolean; onSelect: () => void }) {
  const url = useThumb(asset.id);
  return (
    <button
      type="button"
      className={selected ? 'cb-asset cb-asset--selected' : 'cb-asset'}
      onClick={onSelect}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DND_TYPE, asset.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      title={`${asset.no ?? '未编号'} · ${asset.name ?? '未命名'} · ${formatBytes(asset.size)}`}
    >
      <span className="cb-asset__thumb">
        {url ? <img src={url} alt={asset.name ?? '素材缩略图'} /> : <span className="cb-asset__ph">无预览</span>}
      </span>
      <span className="cb-asset__no">{asset.no ?? '未编号'}</span>
    </button>
  );
}

/** 素材库：证据素材 / AI 生成 两个分区，索引进 doc.assets，图片二进制在 IndexedDB */
export function AssetLibrary() {
  const assets = useDocStore((s) => s.doc.assets);
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const selectAsset = useUiStore((s) => s.selectAsset);
  const startImport = useImportStore((s) => s.startImport);
  const busy = useImportStore((s) => s.busy);
  const progress = useImportStore((s) => s.progress);
  const importError = useImportStore((s) => s.error);

  const [zone, setZone] = useState<Zone>('evidence');
  const [extractOpen, setExtractOpen] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const watchRef = useRef<WatchHandle | null>(null);
  const supported = supportsDirectoryWatch();

  useEffect(
    () => () => {
      watchRef.current?.stop();
      watchRef.current = null;
    },
    [],
  );

  const list = assets.filter((asset) => asset.zone === zone);
  const evidenceCount = assets.filter((asset) => asset.zone === 'evidence').length;
  const aiCount = assets.filter((asset) => asset.zone === 'ai').length;

  const handlePick = async () => {
    const files = await fileService.pickFiles('image/*');
    if (files.length > 0) await startImport(files, 'import');
  };

  const handleWatch = async () => {
    if (watchRef.current) {
      watchRef.current.stop();
      watchRef.current = null;
      setWatching(null);
      return;
    }
    setWatchError(null);
    try {
      const handle = await startDirectoryWatch({
        onFiles: (files) => {
          void startImport(files, 'watch');
        },
        onError: (message) => setWatchError(message),
      });
      watchRef.current = handle;
      setWatching(handle.directoryName);
    } catch (error) {
      setWatchError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="cb-assets">
      <div className="cb-assets__zones">
        <button
          type="button"
          className={zone === 'evidence' ? 'cb-tab cb-tab--active' : 'cb-tab'}
          onClick={() => setZone('evidence')}
        >
          证据素材 · {evidenceCount}
        </button>
        <button type="button" className={zone === 'ai' ? 'cb-tab cb-tab--active' : 'cb-tab'} onClick={() => setZone('ai')}>
          AI 生成 · {aiCount}
        </button>
      </div>

      <div className="cb-assets__actions">
        <button type="button" className="cb-btn" onClick={handlePick} disabled={busy}>
          导入图片
        </button>
        <button
          type="button"
          className={watching ? 'cb-btn cb-btn--active' : 'cb-btn'}
          onClick={handleWatch}
          disabled={!supported}
          title={supported ? '选择一个文件夹，新增图片会自动进入导入向导' : '当前环境不支持目录监视（需要浏览器 File System Access API）'}
        >
          {watching ? `停止监视：${watching}` : '监视文件夹'}
        </button>
        <button type="button" className="cb-btn" onClick={() => setExtractOpen(true)} title="PDF 逐页渲染 / 视频等距抽帧，产物进导入向导">
          PDF / 视频抽图
        </button>
      </div>

      {busy ? (
        <p className="cb-panel__note">
          正在解析图片 {progress ? `${progress.done}/${progress.total}` : ''}
          {progress?.name ? ` · ${progress.name}` : ''}
        </p>
      ) : null}
      {watchError ? <p className="cb-panel__note cb-panel__note--warn">{watchError}</p> : null}
      {importError ? <p className="cb-panel__note cb-panel__note--warn">{importError}</p> : null}

      {list.length === 0 ? (
        <p className="cb-assets__empty">
          {zone === 'ai'
            ? '尚无 AI 生成图。M7 接入生图预设后，产物一律进入此分区并带「AI 生成 · 模拟图」角标。'
            : '尚无证据素材。点「导入图片」或把图片拖进画布，支持批量、粘贴与目录监视。'}
        </p>
      ) : (
        <div className="cb-assets__grid">
          {list.map((asset) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              selected={asset.id === selectedAssetId}
              onSelect={() => selectAsset(asset.id)}
            />
          ))}
        </div>
      )}

      {assets.length > 0 ? (
        <p className="cb-panel__note">
          原件与缩略图存在本机 IndexedDB（{list.length} 张当前分区）；SHA-256 用于秒级去重。
        </p>
      ) : null}

      {extractOpen ? <ExtractDialog onClose={() => setExtractOpen(false)} /> : null}
    </div>
  );
}
