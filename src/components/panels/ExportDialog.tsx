/**
 * 导出与项目文件面板（M4）：整板 PNG / SVG / 多页 PDF / 案件图片包 / .caseboard / JSON / 脱敏。
 * 组件只负责交互，全部落盘动作在 src/services/exporters.ts。
 */
import { useState } from 'react';
import { replaceDocument } from '../../commands';
import { toJson } from '../../serializers/json';
import {
  exportBoardPdf,
  exportBoardPng,
  exportBoardSvg,
  exportCaseboardFile,
  exportImagePackage,
  exportRedactedAsset,
  openCaseboardFile,
  redactableAssets,
  errorText,
  type ExportResult,
} from '../../services/exporters';
import { fileService } from '../../services/file';
import { useDocStore } from '../../store/docStore';
import { MANIFEST_HEADER } from '../../services/exporters';

interface ExportDialogProps {
  onClose: () => void;
}

type ActionKey = 'png' | 'svg' | 'pdf' | 'zip' | 'caseboard' | 'json' | 'open' | `redact:${string}`;

export function ExportDialog({ onClose }: ExportDialogProps) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const redactables = redactableAssets(doc);

  const run = async (key: ActionKey, action: () => Promise<ExportResult | null>, done: (result: ExportResult) => string) => {
    if (busy) return;
    setBusy(key);
    setStatus('');
    setError('');
    try {
      const result = await action();
      if (result) setStatus(result.path ? done(result) + ' → ' + result.path : done(result) + '（浏览器下载）');
    } catch (problem) {
      setError('导出失败：' + errorText(problem));
    } finally {
      setBusy(null);
    }
  };

  const onExportJson = () =>
    run('json', async () => ({ path: null, summary: 'JSON 数据（' + doc.nodes.length + ' 实体 / ' + doc.edges.length + ' 关系）' }), (result) => {
      fileService.downloadText('案件-' + (doc.meta.caseNo ?? doc.meta.id) + '.json', toJson(doc));
      return result.summary;
    });

  const onOpen = async () => {
    if (busy) return;
    setBusy('open');
    setError('');
    setStatus('');
    try {
      const opened = await openCaseboardFile();
      if (!opened) return;
      dispatch(replaceDocument(opened.doc));
      setStatus('已打开项目：' + opened.doc.meta.title + ' · ' + opened.assets + ' 个素材' + (opened.warnings.length ? ' · ' + opened.warnings.join(' ') : ''));
    } catch (problem) {
      setError('打开失败：' + errorText(problem));
    } finally {
      setBusy(null);
    }
  };

  const items: Array<{ key: ActionKey; title: string; desc: string; action: () => Promise<ExportResult | null>; label: string; done: (result: ExportResult) => string }> = [
    { key: 'png', title: '整板 PNG', desc: '模型驱动渲染，2 倍像素；含贝塞尔线、组、图例与图片节点', action: () => exportBoardPng(doc), label: '导出 PNG', done: (r) => r.summary },
    { key: 'svg', title: '整板 SVG', desc: '矢量，可放进取证报告或用设计软件二次编辑', action: () => exportBoardSvg(doc), label: '导出 SVG', done: (r) => r.summary },
    { key: 'pdf', title: '多页 PDF', desc: 'A4 横向按比例切片分页，适合打印与汇报', action: () => exportBoardPdf(doc), label: '导出 PDF', done: (r) => r.summary },
    { key: 'zip', title: '案件图片包', desc: 'images/ 原件 + manifest.csv（' + MANIFEST_HEADER.join('/') + '）', action: () => exportImagePackage(doc), label: '导出图片包', done: (r) => r.summary },
    { key: 'caseboard', title: '项目文件 .caseboard', desc: '单文件包含数据库、素材原件、DSL 文本与缩略图，可拷机移交', action: () => exportCaseboardFile(doc), label: '保存项目', done: (r) => r.summary },
    { key: 'open', title: '打开项目', desc: '选择 .caseboard 文件，在另一台机器/另一个目录直接打开', action: async () => null, label: '打开', done: (r) => r.summary },
    { key: 'json', title: 'JSON 数据', desc: '纯数据导出，便于排查与外部工具处理', action: async () => null, label: '导出 JSON', done: (r) => r.summary },
  ];

  return (
    <div className="cb-modal" role="dialog" aria-modal="true" aria-label="导出与项目文件">
      <div className="cb-modal__panel cb-export">
        <header className="cb-modal__head">
          <h2>导出与项目文件</h2>
          <button type="button" className="cb-modal__icon" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <ul className="cb-export__list">
          {items.map((item) => (
            <li key={item.key} className="cb-export__item">
              <div className="cb-export__text">
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
              <button
                type="button"
                className="cb-btn"
                disabled={busy !== null}
                onClick={() => {
                  if (item.key === 'open') void onOpen();
                  else if (item.key === 'json') void onExportJson();
                  else void run(item.key, item.action, item.done);
                }}
              >
                {busy === item.key ? '处理中…' : item.label}
              </button>
            </li>
          ))}
        </ul>

        <section className="cb-export__redact">
          <h3>脱敏导出（马赛克不可逆）</h3>
          <p className="cb-panel__note">
            在标注编辑器里对区域勾选「导出时打码」，这里即可导出脱敏图。马赛克按格子取平均色后整格覆盖，导出的是全新 PNG，原图不被修改。
          </p>
          {redactables.length === 0 ? (
            <p className="cb-export__empty">还没有标记为脱敏的素材：打开素材的标注编辑器，选中区域并勾选「导出时打码」。</p>
          ) : (
            <ul className="cb-export__redactlist">
              {redactables.map((asset) => (
                <li key={asset.id}>
                  <span>{asset.no ?? asset.id}　{asset.name ?? '未命名素材'}　{asset.annotations.filter((item) => item.redact).length} 处打码</span>
                  <button
                    type="button"
                    className="cb-btn"
                    disabled={busy !== null}
                    onClick={() => void run(('redact:' + asset.id) as ActionKey, () => exportRedactedAsset(doc, asset.id), (r) => r.summary)}
                  >
                    {busy === 'redact:' + asset.id ? '处理中…' : '脱敏导出'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {status ? <p className="cb-export__status">{status}</p> : null}
        {error ? <p className="cb-panel__note cb-panel__note--warn">{error}</p> : null}

        <footer className="cb-modal__actions">
          <span className="cb-import__hint">全部导出在本机完成，不联网；桌面端走原生保存对话框。</span>
          <button type="button" className="cb-btn cb-btn--primary" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ExportDialog;
