/**
 * 标注编辑器（M2-5）：六种图形画在 canvas 上，几何归一化后存进 Asset.annotations。
 * 画布与导出共用一个绘制函数 drawAnnotations（D17），保证所见即所得。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Annotation, AnnotationShape, XY } from '../../types';
import {
  ANNOTATION_COLORS,
  ANNOTATION_SHAPES,
  DEFAULT_ANNOTATION_COLOR,
  SHAPE_HINTS,
  SHAPE_LABELS,
  createAnnotation,
  hitAnnotation,
  normalizeGeom,
  rectFromPoints,
} from '../../lib/annotation';
import { NODE_TYPE_META } from '../../lib/theme';
import { useDoc, useDocStore } from '../../store/docStore';
import { addAnnotation, deleteAnnotation, linkAnnotation, updateAnnotation } from '../../commands';
import { imageStore, thumbUrl } from '../../services/imageStore';
import { drawAnnotations, renderAnnotatedBlob } from '../../services/annotate';
import { fileService } from '../../services/file';

const MAX_CANVAS_W = 880;
const MAX_CANVAS_H = 560;
const MIN_DRAW = 0.006;

type Tool = AnnotationShape | 'select';

interface AnnotationEditorProps {
  assetId: string;
  onClose(): void;
}

export function AnnotationEditor({ assetId, onClose }: AnnotationEditorProps) {
  const doc = useDoc();
  const dispatch = useDocStore((s) => s.dispatch);
  const asset = doc.assets.find((item) => item.id === assetId);
  const annotations = asset?.annotations ?? [];

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 绘制中的草稿只放在 ref 里给 paint 读；state 仅用于触发重绘 */
  const [, setDraft] = useState<Annotation | null>(null);
  const [textPoint, setTextPoint] = useState<XY | null>(null);
  const [textValue, setTextValue] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageMissing, setImageMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  /** 原图优先，取不到时退到 1024 缩略图（旧存档/别处导入的素材） */
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setImage(null);
    setImageMissing(false);
    const load = async (src: string) => {
      const img = new Image();
      img.onload = () => {
        if (alive) setImage(img);
      };
      img.onerror = () => {
        if (alive) setImageMissing(true);
      };
      img.src = src;
    };
    void (async () => {
      try {
        const blob = await imageStore.getOriginal(assetId);
        if (!alive) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          load(objectUrl);
          return;
        }
        const fallback = await thumbUrl(assetId, 1024);
        if (!alive) return;
        if (fallback) load(fallback);
        else setImageMissing(true);
      } catch {
        if (alive) setImageMissing(true);
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  const canvasSize = useMemo(() => {
    const width = asset?.width && asset.width > 0 ? asset.width : 4;
    const height = asset?.height && asset.height > 0 ? asset.height : 3;
    const ratio = Math.min(MAX_CANVAS_W / width, MAX_CANVAS_H / height);
    return { w: Math.max(160, Math.round(width * ratio)), h: Math.max(120, Math.round(height * ratio)) };
  }, [asset?.width, asset?.height]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#EFEBE4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const list = draftRef.current ? [...annotations, draftRef.current] : annotations;
    drawAnnotations(ctx, list, canvas.width, canvas.height, canvas, { selectedId });
  }, [annotations, image, selectedId]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    if (textPoint) textInputRef.current?.focus();
  }, [textPoint]);

  const toNorm = (event: ReactPointerEvent<HTMLCanvasElement>): XY => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width;
    const height = rect.height || canvas.height;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)),
    };
  };

  const resetDraft = () => {
    draftRef.current = null;
    setDraft(null);
  };

  const commitDraft = () => {
    const current = draftRef.current;
    resetDraft();
    if (!current) return;
    const geom = normalizeGeom(current.geom);
    if (geom.w < MIN_DRAW && geom.h < MIN_DRAW && (geom.points?.length ?? 0) < 2) return;
    const annotation = createAnnotation(current.shape, geom, { color: current.color, id: current.id });
    emitAdd(annotation);
  };

  const emitAdd = (annotation: Annotation) => {
    if (!asset) return;
    setSelectedId(annotation.id);
    dispatch(addAnnotation(asset.id, annotation));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!asset) return;
    const point = toNorm(event);
    if (tool === 'select') {
      const hit = [...annotations].reverse().find((item) => hitAnnotation(item, point, 0.015));
      setSelectedId(hit ? hit.id : null);
      return;
    }
    if (tool === 'text') {
      setTextPoint(point);
      setTextValue('');
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = createAnnotation(tool, rectFromPoints(point, point), { color });
    if (tool === 'pen' || tool === 'arrow') {
      base.geom.points = [point, point];
    }
    draftRef.current = base;
    setDraft(base);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = draftRef.current;
    if (!current) return;
    const point = toNorm(event);
    if (current.shape === 'pen') {
      const points = current.geom.points ?? [];
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.004) return;
      const next = { ...current, geom: { ...current.geom, points: [...points, point] } };
      draftRef.current = next;
      setDraft(next);
      return;
    }
    if (current.shape === 'arrow') {
      const start = (current.geom.points ?? [point])[0];
      const geom = { ...current.geom, points: [start, point] };
      const next = { ...current, geom };
      draftRef.current = next;
      setDraft(next);
      return;
    }
    const anchor = { x: current.geom.x, y: current.geom.y };
    const next = { ...current, geom: { ...current.geom, ...rectFromPoints(anchor, point) } };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = () => {
    if (!draftRef.current) return;
    commitDraft();
  };

  const commitText = () => {
    if (!asset || !textPoint) return;
    const text = textValue.trim();
    setTextPoint(null);
    setTextValue('');
    if (!text) return;
    emitAdd(createAnnotation('text', { x: textPoint.x, y: textPoint.y, w: 0, h: 0 }, { text, color }));
  };

  const selected = annotations.find((item) => item.id === selectedId) ?? null;

  const onDeleteSelected = () => {
    if (!asset || !selectedId) return;
    setSelectedId(null);
    dispatch(deleteAnnotation(asset.id, selectedId));
  };

  const onExport = async () => {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      const original = await imageStore.getOriginal(asset.id);
      if (!original) {
        setError('原件不在本机，无法导出标注图');
        return;
      }
      const blob = await renderAnnotatedBlob(original, annotations);
      fileService.downloadBlob(`${asset.no ?? asset.id}-标注.png`, blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  if (!asset) {
    return (
      <div className="cb-modal__mask" role="dialog" aria-modal="true">
        <div className="cb-modal cb-annot">
          <div className="cb-annot__head">
            <h3 className="cb-modal__title">标注</h3>
            <button type="button" className="cb-annot__close" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
          <p className="cb-panel__hint">素材不存在，可能已被删除。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cb-modal__mask" role="dialog" aria-modal="true">
      <div className="cb-modal cb-annot">
        <div className="cb-annot__head">
          <h3 className="cb-modal__title">标注 · {asset.no ?? asset.name ?? asset.id}</h3>
          <span className="cb-annot__count">{annotations.length} 处</span>
          <button type="button" className="cb-annot__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="cb-annot__toolbar">
          <button
            type="button"
            className={`cb-btn${tool === 'select' ? ' cb-btn--active' : ''}`}
            onClick={() => setTool('select')}
            title="选择已有标注"
          >
            选择
          </button>
          {ANNOTATION_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              className={`cb-btn${tool === shape ? ' cb-btn--active' : ''}`}
              onClick={() => setTool(shape)}
              title={SHAPE_HINTS[shape]}
            >
              {SHAPE_LABELS[shape]}
            </button>
          ))}
          <span className="cb-annot__colors">
            {ANNOTATION_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={`cb-color-dot${color === item ? ' is-active' : ''}`}
                style={{ background: item }}
                onClick={() => setColor(item)}
                aria-label={`描边色 ${item}`}
              />
            ))}
          </span>
        </div>

        <div className="cb-annot__stage">
          <div className="cb-annot__frame" style={{ width: canvasSize.w, height: canvasSize.h }}>
            <canvas
              ref={canvasRef}
              className={`cb-annot__canvas${tool === 'select' ? ' is-select' : ''}`}
              width={canvasSize.w}
              height={canvasSize.h}
              style={{ width: canvasSize.w, height: canvasSize.h }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {imageMissing ? <span className="cb-annot__missing">原件不在本机，仅可编辑标注几何</span> : null}
            {textPoint ? (
              <input
                ref={textInputRef}
                className="cb-annot__text"
                style={{ left: textPoint.x * canvasSize.w, top: textPoint.y * canvasSize.h }}
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitText();
                  if (event.key === 'Escape') {
                    setTextPoint(null);
                    setTextValue('');
                  }
                }}
                onBlur={commitText}
                placeholder="输入文字后回车"
              />
            ) : null}
          </div>

          <aside className="cb-annot__side">
            <p className="cb-annot__tip">
              {tool === 'select' ? '点击画布上的标注可选中并删除' : SHAPE_HINTS[tool]}
            </p>
            <ul className="cb-annot__list">
              {annotations.length === 0 ? <li className="cb-annot__empty">还没有标注</li> : null}
              {annotations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`cb-annot__item${item.id === selectedId ? ' is-active' : ''}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      setTool('select');
                    }}
                  >
                    <span className="cb-annot__swatch" style={{ background: item.color ?? DEFAULT_ANNOTATION_COLOR }} />
                    {SHAPE_LABELS[item.shape]}
                    {item.text ? `：${item.text}` : ''}
                    {item.shape === 'anchor' && item.linkedNodeId ? ' · 已关联' : ''}
                  </button>
                </li>
              ))}
            </ul>

            {selected ? (
              <div className="cb-annot__detail">
                {selected.shape === 'anchor' ? (
                  <label className="cb-field">
                    <span>关联实体</span>
                    <select
                      value={selected.linkedNodeId ?? ''}
                      onChange={(event) => dispatch(linkAnnotation(asset.id, selected.id, event.target.value || null))}
                    >
                      <option value="">未关联</option>
                      {doc.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {NODE_TYPE_META[node.type].label}｜{node.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {selected.shape === 'text' ? (
                  <label className="cb-field">
                    <span>文字</span>
                    <input
                      key={selected.id + (selected.text ?? '')}
                      defaultValue={selected.text ?? ''}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (selected.text ?? '')) dispatch(updateAnnotation(asset.id, selected.id, { text: value }));
                      }}
                    />
                  </label>
                ) : null}
                <button type="button" className="cb-btn cb-btn--danger" onClick={onDeleteSelected}>
                  删除该标注
                </button>
              </div>
            ) : null}
          </aside>
        </div>

        {error ? <p className="cb-panel__note cb-panel__note--warn">{error}</p> : null}

        <footer className="cb-modal__actions">
          <span className="cb-import__hint">标注随素材保存，导出图会带上全部标注与「AI 生成 · 模拟图」角标规则（AI 素材）。</span>
          <button type="button" className="cb-btn" onClick={onExport} disabled={busy || annotations.length === 0}>
            {busy ? '导出中…' : '导出标注图'}
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AnnotationEditor;