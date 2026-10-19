import { useEffect, useRef, useState } from 'react';
import { useDocStore } from '../../store/docStore';
import { useImportStore } from '../../store/importStore';
import { useUiStore } from '../../store/uiStore';
import { addAssetFolder, deleteAssetFolder, updateAssetFolder } from '../../commands';import { fileService } from '../../services/file';
import { thumbUrl } from '../../services/imageStore';
import { startDirectoryWatch, supportsDirectoryWatch, type WatchHandle } from '../../services/watch';
import { formatBytes } from '../../lib/assetMeta';
import { ASSET_GROUP_MODES, groupAssets, type AssetGroupMode } from '../../lib/assetGroups';
import { ASSET_DND_TYPE } from '../../lib/dnd';
import { newId } from '../../lib/id';
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
  const folders = useDocStore((s) => s.doc.assetFolders);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const selectAsset = useUiStore((s) => s.selectAsset);
  const startImport = useImportStore((s) => s.startImport);
  const busy = useImportStore((s) => s.busy);
  const progress = useImportStore((s) => s.progress);
  const importError = useImportStore((s) => s.error);
  const ocrNotice = useImportStore((s) => s.ocrNotice);
  const clearOcrNotice = useImportStore((s) => s.clearOcrNotice);

  const [zone, setZone] = useState<Zone>('evidence');
  const [groupMode, setGroupMode] = useState<AssetGroupMode>('folder');
  const [extractOpen, setExtractOpen] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const watchRef = useRef<WatchHandle | null>(null);
  const supported = supportsDirectoryWatch();

  const folderList = folders ?? [];
  const activeTitle = folderList.find((item) => item.id === activeFolder)?.title ?? '';

  const handleAddFolder = () => {
    const title = newFolder.trim();
    if (title.length === 0) return;
    dispatch(addAssetFolder({ id: newId('fld'), title, parentId: activeFolder }));
    setNewFolder('');
  };

  const handleRenameFolder = () => {
    if (!activeFolder) return;
    const title = newFolder.trim();
    if (title.length === 0) {
      setRenaming(null);
      return;
    }
    dispatch(updateAssetFolder(activeFolder, { title }));
    setRenaming(null);
    setNewFolder('');
  };

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
    if (files.length > 0) await startImport(files, 'import', activeFolder ?? undefined);
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

      <div className="cb-assets__groupby">
        <span>分组</span>
        {ASSET_GROUP_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={groupMode === item.id ? 'cb-tab cb-tab--active' : 'cb-tab'}
            onClick={() => setGroupMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {groupMode === 'folder' ? (
        <div className="cb-assets__folders">
          <div className="cb-assets__folderlist">
            <button
              type="button"
              className={activeFolder === null ? 'cb-folder-chip cb-folder-chip--active' : 'cb-folder-chip'}
              onClick={() => {
                setActiveFolder(null);
                setRenaming(null);
              }}
              title="不选中任何文件夹时，新建的文件夹是顶层文件夹"
            >
              顶层
            </button>
            {folderList.map((folder) => {
              const count = assets.filter((asset) => asset.folderId === folder.id).length;
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={activeFolder === folder.id ? 'cb-folder-chip cb-folder-chip--active' : 'cb-folder-chip'}
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setRenaming(null);
                  }}
                  title={`${folder.title} · ${count} 张`}
                >
                  {folder.title} · {count}
                </button>
              );
            })}
          </div>
          <div className="cb-assets__folderops">
            {renaming === activeFolder && activeFolder ? (
              <>
                <input
                  className="cb-assets__folderinput"
                  value={newFolder}
                  autoFocus
                  placeholder={activeTitle}
                  onChange={(event) => setNewFolder(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleRenameFolder();
                    if (event.key === 'Escape') {
                      setRenaming(null);
                      setNewFolder('');
                    }
                  }}
                />
                <button type="button" className="cb-link-btn" onClick={handleRenameFolder}>
                  保存
                </button>
              </>
            ) : (
              <>
                <input
                  className="cb-assets__folderinput"
                  value={newFolder}
                  placeholder={activeFolder ? `在「${activeTitle}」下新建` : '新建文件夹'}
                  onChange={(event) => setNewFolder(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddFolder();
                  }}
                />
                <button type="button" className="cb-link-btn" onClick={handleAddFolder} disabled={newFolder.trim().length === 0}>
                  新建
                </button>
                {activeFolder ? (
                  <>
                    <button
                      type="button"
                      className="cb-link-btn"
                      onClick={() => {
                        setNewFolder(activeTitle);
                        setRenaming(activeFolder);
                      }}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="cb-link-btn"
                      onClick={() => {
                        dispatch(deleteAssetFolder(activeFolder));
                        setActiveFolder(null);
                      }}
                      title="删除文件夹：子文件夹上提，素材回到未分类"
                    >
                      删除
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

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
      {ocrNotice ? (
        <p className="cb-panel__note cb-panel__note--warn">
          {ocrNotice}
          <button type="button" className="cb-link-btn" onClick={clearOcrNotice}>
            知道了
          </button>
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="cb-assets__empty">
          {zone === 'ai'
            ? '尚无 AI 生成图。M7 接入生图预设后，产物一律进入此分区并带「AI 生成 · 模拟图」角标。'
            : '尚无证据素材。点「导入图片」或把图片拖进画布，支持批量、粘贴与目录监视。'}
        </p>
      ) : (
        <div className="cb-assets__groups">
          {groupAssets(list, groupMode, folderList).map((group) => (
            <section key={group.key} className="cb-assets__group">
          {groupMode === 'none' ? null : (
            <div className="cb-assets__grouphead">
              <span>{group.label}</span>
              <span className="cb-assets__groupcount">{group.items.length} 张</span>
            </div>
          )}
              <div className="cb-assets__grid">
                {group.items.map((asset) => (
                  <AssetTile
                    key={asset.id}
                    asset={asset}
                    selected={asset.id === selectedAssetId}
                    onSelect={() => selectAsset(asset.id)}
                  />
                ))}
              </div>
            </section>
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
