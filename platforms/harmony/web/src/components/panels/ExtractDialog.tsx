/**
 * PDF 抽页 / 视频抽帧（M2-5）：产出 PNG 后直接交给既有导入流水线，
 * 哈希、缩略图、去重、导入向导全部复用，不另起一条入库路径。
 */
import { useEffect, useRef, useState } from 'react';
import { extractedName, formatDuration, parsePageRange, planFrameTimes } from '../../lib/mediaPlan';
import { fileService } from '../../services/file';
import type { PdfJob } from '../../services/pdf';
import { VIDEO_ACCEPT, grabFrame, probeVideo, type VideoInfo } from '../../services/video';
import { useImportStore } from '../../store/importStore';

type Mode = 'pdf' | 'video';

interface ExtractItem {
  name: string;
  previewUrl: string;
  file: File;
}

interface ExtractDialogProps {
  initialMode?: Mode;
  onClose(): void;
}

export function ExtractDialog({ initialMode = 'pdf', onClose }: ExtractDialogProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [items, setItems] = useState<ExtractItem[]>([]);
  const [pdf, setPdf] = useState<{ job: PdfJob; name: string } | null>(null);
  const [video, setVideo] = useState<{ file: File; name: string; info: VideoInfo } | null>(null);
  const [range, setRange] = useState('1');
  const [frameCount, setFrameCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pdfRef = useRef<PdfJob | null>(null);
  const startImport = useImportStore((s) => s.startImport);
  const setSourceLabel = useImportStore((s) => s.setSourceLabel);

  useEffect(() => {
    pdfRef.current = pdf?.job ?? null;
  }, [pdf]);

  useEffect(
    () => () => {
      void pdfRef.current?.dispose();
    },
    [],
  );

  const resetItems = () => {
    setItems([]);
    setError(null);
    setProgress(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetItems();
    setPdf(null);
    setVideo(null);
  };

  const pickPdf = async () => {
    resetItems();
    setBusy(true);
    try {
      // pdf.js 只在真正抽页时才加载（主包因此不必背 1MB+ 的解析器）
      const { PDF_ACCEPT, PdfJob } = await import('../../services/pdf');
      const files = await fileService.pickFiles(PDF_ACCEPT, false);
      const file = files[0];
      if (!file) return;
      const previous = pdfRef.current;
      if (previous) void previous.dispose();
      const job = await PdfJob.open(file);
      setPdf({ job, name: file.name });
      setRange(`1${job.pageCount > 1 ? '-2' : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 打开失败');
    } finally {
      setBusy(false);
    }
  };

  const pickVideo = async () => {
    resetItems();
    const files = await fileService.pickFiles(VIDEO_ACCEPT, false);
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      const info = await probeVideo(file);
      setVideo({ file, name: file.name, info });
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频读取失败');
    } finally {
      setBusy(false);
    }
  };

  const extractPdf = async () => {
    if (!pdf) return;
    const pages = parsePageRange(range, pdf.job.pageCount);
    if (pages.length === 0) {
      setError('页码范围为空，请填写如 1-3,5 的页码');
      return;
    }
    setBusy(true);
    setError(null);
    const next: ExtractItem[] = [];
    try {
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        setProgress(`正在渲染第 ${page} 页（${index + 1}/${pages.length}）`);
        const rendered = await pdf.job.renderPage(page);
        const name = extractedName(pdf.name, `p${page}`);
        next.push({ name, previewUrl: rendered.previewUrl, file: new File([rendered.blob], name, { type: 'image/png' }) });
      }
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 抽页失败');
      setItems(next);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const extractVideo = async () => {
    if (!video) return;
    const times = planFrameTimes(video.info.duration, frameCount);
    if (times.length === 0) {
      setError('视频时长无效，无法抽帧');
      return;
    }
    setBusy(true);
    setError(null);
    const next: ExtractItem[] = [];
    try {
      for (let index = 0; index < times.length; index += 1) {
        const time = times[index];
        setProgress(`正在抽取 ${formatDuration(time)}（${index + 1}/${times.length}）`);
        const { frame, fileName } = await grabFrame(video.file, time);
        next.push({ name: fileName, previewUrl: frame.previewUrl, file: new File([frame.blob], fileName, { type: 'image/png' }) });
      }
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频抽帧失败');
      setItems(next);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const confirm = async () => {
    if (items.length === 0) return;
    setSourceLabel(mode === 'pdf' ? '书证翻拍' : '监控截图');
    await startImport(items.map((item) => item.file), 'import');
    onClose();
  };

  return (
    <div className="cb-modal__mask" role="dialog" aria-modal="true">
      <div className="cb-modal cb-extract">
        <div className="cb-import__head">
          <h3 className="cb-modal__title">从 PDF / 视频抽取图片</h3>
          <button type="button" className="cb-import__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="cb-tabs cb-extract__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pdf'}
            className={`cb-tab${mode === 'pdf' ? ' cb-tab--active' : ''}`}
            onClick={() => switchMode('pdf')}
          >
            PDF 抽页
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'video'}
            className={`cb-tab${mode === 'video' ? ' cb-tab--active' : ''}`}
            onClick={() => switchMode('video')}
          >
            视频抽帧
          </button>
        </div>

        <div className="cb-import__body">
          {mode === 'pdf' ? (
            <>
              <div className="cb-extract__row">
                <button type="button" className="cb-btn" onClick={pickPdf} disabled={busy}>
                  选择 PDF 文件
                </button>
                <span className="cb-form__subtle">
                  {pdf ? `${pdf.name} · 共 ${pdf.job.pageCount} 页` : '未选择文件'}
                </span>
              </div>
              {pdf ? (
                <div className="cb-extract__row">
                  <label className="cb-field">
                    <span>页码范围</span>
                    <input
                      value={range}
                      onChange={(event) => setRange(event.target.value)}
                      placeholder="如 1-3,5"
                      disabled={busy}
                    />
                  </label>
                  <button type="button" className="cb-btn cb-btn--primary" onClick={extractPdf} disabled={busy}>
                    {busy ? '处理中…' : '抽取页面'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="cb-extract__row">
                <button type="button" className="cb-btn" onClick={pickVideo} disabled={busy}>
                  选择视频文件
                </button>
                <span className="cb-form__subtle">
                  {video
                    ? `${video.name} · 时长 ${formatDuration(video.info.duration)} · ${video.info.width}×${video.info.height}`
                    : '未选择文件'}
                </span>
              </div>
              {video ? (
                <div className="cb-extract__row">
                  <label className="cb-field">
                    <span>抽帧数量</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={frameCount}
                      onChange={(event) => setFrameCount(Number(event.target.value) || 1)}
                      disabled={busy}
                    />
                  </label>
                  <button type="button" className="cb-btn cb-btn--primary" onClick={extractVideo} disabled={busy}>
                    {busy ? '处理中…' : '等距抽帧'}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {progress ? <p className="cb-panel__note">{progress}</p> : null}
          {error ? <p className="cb-panel__note cb-panel__note--warn">{error}</p> : null}

          {items.length > 0 ? (
            <div className="cb-extract__list">
              {items.map((item) => (
                <figure key={item.name} className="cb-extract__tile">
                  <img src={item.previewUrl} alt={item.name} />
                  <figcaption>{item.name}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="cb-import__empty">
              {mode === 'pdf' ? '抽取的页面会先进入导入向导，确认后入库。' : '抽出的帧会先进入导入向导，确认后入库。'}
            </p>
          )}
        </div>

        <footer className="cb-modal__actions">
          <span className="cb-import__hint">产物统一走导入向导：可建证据节点、可只入素材库，哈希与缩略图规则与图片导入一致。</span>
          <button type="button" className="cb-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={confirm} disabled={items.length === 0 || busy}>
            加入导入向导（{items.length}）
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ExtractDialog;
