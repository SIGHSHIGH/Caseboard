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

/** 缩略图按需解析：原生环境是沙箱文件 URL（caseboard://asset/…），浏览器是 IndexedDB objectURL；取不到时降级成占位块 */
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

/** 长按起拖：阈值之内移动超过 8px 就当作滚动 / 点选，不再起拖（H5 触屏）
 *  H5.5：480ms 太长（用户手测「要按住久一点才动」），降到 100ms——
 *  按下就已经给了缩放反馈（.cb-asset--pressing），100ms 后起拖手感更跟手。 */
const LONG_PRESS_MS = 100;
const LONG_PRESS_SLOP = 8;

/** 触屏输入：ArkWeb 长按 draggable 元素会自起一套原生拖拽，必须挡掉（H5.5） */
function isTouchInput(): boolean {
  return document.documentElement.dataset.input === 'touch';
}

function AssetTile({ asset, selected, onSelect }: { asset: Asset; selected: boolean; onSelect: () => void }) {
  const url = useThumb(asset.id);
  const timerRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const [pressing, setPressing] = useState(false);
  const suppressClickRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const winRef = useRef<{
    move: ((event: PointerEvent) => void) | null;
    up: ((event: PointerEvent) => void) | null;
    cancel: (() => void) | null;
  }>({ move: null, up: null, cancel: null });

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // H5.4：起拖之后手势跟着 window 走，而不是绑在这张卡上。
  // 原因：手指从左侧素材栏移进画布时，ArkWeb 会在这里把这一串触摸判成滚动并派 pointercancel，
  // 卡片上的监听随即断掉，缩略影就「卡」在画布边上、素材再也拖不动。挂到 window 上不怕元素离开手指。
  const detachWindow = () => {
    const bound = winRef.current;
    if (!bound.move) return;
    window.removeEventListener('pointermove', bound.move);
    if (bound.up) window.removeEventListener('pointerup', bound.up);
    if (bound.cancel) window.removeEventListener('pointercancel', bound.cancel);
    winRef.current = { move: null, up: null, cancel: null };
  };

  const attachWindow = () => {
    if (winRef.current.move) return;
    const move = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      lastPosRef.current = { x: event.clientX, y: event.clientY };
      useUiStore.getState().moveAssetDrag(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      lastPosRef.current = { x: event.clientX, y: event.clientY };
      detachWindow();
      if (!draggingRef.current) return;
      draggingRef.current = false;
      useUiStore.getState().endAssetDrag(event.clientX, event.clientY);
    };
    const cancel = () => {
      // 不当作「放弃」：放弃等于缩略影凭空消失、这次拖动白做。按「就地松手」收尾，
      // 落点还在画布上就照常建图片节点，不在画布上就什么也不发生。
      detachWindow();
      if (!draggingRef.current) return;
      draggingRef.current = false;
      useUiStore.getState().endAssetDrag(lastPosRef.current.x, lastPosRef.current.y);
    };
    winRef.current = { move, up, cancel };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  useEffect(
    () => () => {
      clearTimer();
      detachWindow();
    },
    [],
  );

  // H5：HTML5 拖放不会由手指触发（Chromium 只从鼠标事件起 dragstart），
  // 所以触屏下改走「长按起拖 + 跟手缩略图影」，落点由 Board 换算成画布坐标。
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return;
    // H5.3：按下立刻给反馈（缩放 + 描边），长按阈值期间不再像没响应
    setPressing(true);
    originRef.current = { x: event.clientX, y: event.clientY };
    lastPosRef.current = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPressing(false);
      draggingRef.current = true;
      suppressClickRef.current = true;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // 指针已经抬起：放弃捕获，后面的 pointerup 仍会到元素上
      }
      useUiStore.getState().startAssetDrag(asset.id, originRef.current.x, originRef.current.y);
      attachWindow();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingRef.current) return;
    if (timerRef.current === null) return;
    const dx = event.clientX - originRef.current.x;
    const dy = event.clientY - originRef.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) {
      clearTimer();
      setPressing(false);
    }
  };

  const onPointerUp = () => {
    clearTimer();
    setPressing(false);
    if (draggingRef.current) return;
  };

  const onPointerCancel = () => {
    clearTimer();
    setPressing(false);
    if (draggingRef.current) return;
  };

  return (
    <button
      type="button"
      className={
        'cb-asset' + (selected ? ' cb-asset--selected' : '') + (pressing ? ' cb-asset--pressing' : '')
      }
      onClick={() => {
        // 一次成功的拖拽不应该顺带改选中项（Board 已选新建的图片节点）
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onSelect();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      draggable
      onDragStart={(event) => {
        // H5.5：触屏长按过 draggable 元素时 ArkWeb 会额外起一套原生拖拽（整块缩略图跟着手指，
        // 并把背后的页面做高斯模糊），和我们的方形缩略影重复。触屏一律掐掉原生拖拽。
        if (isTouchInput()) {
          event.preventDefault();
          return;
        }
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

/** 素材库：证据素材 / AI 生成 两个分区，索引进 doc.assets，图片二进制在沙箱文件仓（桌面/鸿蒙）或 IndexedDB（浏览器） */
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
          原件与缩略图存在本机（{list.length} 张当前分区）；SHA-256 用于秒级去重。
        </p>
      ) : null}

      {extractOpen ? <ExtractDialog onClose={() => setExtractOpen(false)} /> : null}
    </div>
  );
}
