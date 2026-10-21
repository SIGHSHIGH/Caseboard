import { useEffect, useState } from 'react';
import { useDocStore } from '../../store/docStore';
import { useImportStore } from '../../store/importStore';
import { ASSET_SOURCES, formatBytes } from '../../lib/assetMeta';
import { NODE_TYPE_META } from '../../lib/theme';
import type { PreparedImage } from '../../services/image';

/** 预览图用预处理阶段生成的大缩略图 Blob，卸载时必须 revoke，避免内存泄漏 */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function DraftTile({ item, onDrop }: { item: PreparedImage; onDrop: () => void }) {
  const url = useBlobUrl(item.small);
  const exif = item.exif;
  return (
    <div className="cb-import__tile">
      <div className="cb-import__thumb">{url ? <img src={url} alt={item.file.name} /> : null}</div>
      <div className="cb-import__meta">
        <strong title={item.file.name}>{item.file.name}</strong>
        <span>
          {item.width}×{item.height} · {formatBytes(item.file.size)}
        </span>
        <span title={item.hash}>SHA-256 {item.hash.slice(0, 10)}…</span>
        {exif?.capturedAt ? <span>拍摄 {exif.capturedAt.slice(0, 19).replace('T', ' ')}</span> : null}
        {exif?.camera ? <span>{exif.camera}</span> : null}
        {exif?.gps ? (
          <span>
            定位 {exif.gps.lat.toFixed(4)}, {exif.gps.lng.toFixed(4)}
          </span>
        ) : null}
      </div>
      <button type="button" className="cb-link-btn" onClick={onDrop}>
        移除
      </button>
    </div>
  );
}

/** 导入向导：预处理完成后统一确认去向（仅入素材库 / 建证据节点 / 关联到某个实体） */
export function ImportWizard() {
  const open = useImportStore((s) => s.open);
  const drafts = useImportStore((s) => s.drafts);
  const duplicates = useImportStore((s) => s.duplicates);
  const failed = useImportStore((s) => s.failed);
  const busy = useImportStore((s) => s.busy);
  const error = useImportStore((s) => s.error);
  const mode = useImportStore((s) => s.mode);
  const sourceLabel = useImportStore((s) => s.sourceLabel);
  const capturedAt = useImportStore((s) => s.capturedAt);
  const linkedNodeId = useImportStore((s) => s.linkedNodeId);
  const setMode = useImportStore((s) => s.setMode);
  const setSourceLabel = useImportStore((s) => s.setSourceLabel);
  const setCapturedAt = useImportStore((s) => s.setCapturedAt);
  const setLinkedNodeId = useImportStore((s) => s.setLinkedNodeId);
  const dropDraft = useImportStore((s) => s.dropDraft);
  const confirm = useImportStore((s) => s.confirm);
  const reset = useImportStore((s) => s.reset);
  const nodes = useDocStore((s) => s.doc.nodes);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, reset]);

  if (!open) return null;

  const total = drafts.length + duplicates.length + failed.length;

  return (
    <div className="cb-modal__mask" role="dialog" aria-modal="true" aria-label="导入图片">
      <div className="cb-modal cb-import">
        <header className="cb-import__head">
          <h3 className="cb-modal__title">导入图片 · {total} 个文件</h3>
          <button type="button" className="cb-import__close" onClick={reset} aria-label="关闭">
            ×
          </button>
        </header>

        {error ? <p className="cb-panel__note cb-panel__note--warn">{error}</p> : null}

        <div className="cb-import__body">
          {drafts.length > 0 ? (
            <div className="cb-import__list">
              {drafts.map((item) => (
                <DraftTile key={item.hash} item={item} onDrop={() => dropDraft(item.hash)} />
              ))}
            </div>
          ) : (
            <p className="cb-import__empty">没有可导入的新图片。</p>
          )}

          {duplicates.length > 0 ? (
            <div className="cb-import__dupes">
              <h4>已跳过的重复文件（{duplicates.length}）</h4>
              <ul>
                {duplicates.map((entry) => (
                  <li key={entry.item.hash}>
                    {entry.item.file.name}
                    <span>{entry.reason === 'hash' ? '与素材库已有图片相同' : '本批次内重复'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {failed.length > 0 ? (
            <div className="cb-import__dupes">
              <h4>无法处理的文件（{failed.length}）</h4>
              <ul>
                {failed.map((entry) => (
                  <li key={entry.name}>
                    {entry.name}
                    <span>{entry.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="cb-import__options">
          <fieldset className="cb-import__mode">
            <legend>导入方式</legend>
            <label>
              <input type="radio" checked={mode === 'library'} onChange={() => setMode('library')} /> 仅加入素材库
            </label>
            <label>
              <input type="radio" checked={mode === 'evidence-node'} onChange={() => setMode('evidence-node')} /> 建为证据节点（铺到画布）
            </label>
          </fieldset>

          <div className="cb-import__fields">
            <label>
              证据来源
              <select value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)}>
                {ASSET_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label>
              拍摄时间（统一）
              <input type="date" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
            </label>
            <label>
              关联实体
              <select value={linkedNodeId} onChange={(event) => setLinkedNodeId(event.target.value)}>
                <option value="">不关联</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {NODE_TYPE_META[node.type].label}｜{node.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <footer className="cb-modal__actions">
          <span className="cb-import__hint">
            {mode === 'evidence-node' ? '每张图片建一个证据节点，状态「待查」' : '只入库，不建节点'}
          </span>
          <button type="button" className="cb-btn" onClick={reset} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="cb-btn cb-btn--primary"
            onClick={() => void confirm()}
            disabled={busy || drafts.length === 0}
          >
            {busy ? '保存中…' : `确认导入 ${drafts.length} 张`}
          </button>
        </footer>
      </div>
    </div>
  );
}
