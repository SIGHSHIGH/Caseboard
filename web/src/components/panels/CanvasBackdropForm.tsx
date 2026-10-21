import { useDocStore } from '../../store/docStore';
import { setCanvasImage, setCanvasSkin } from '../../commands';
import {
  CANVAS_OPACITY_DEFAULT,
  CANVAS_SKINS,
  CANVAS_SKIN_META,
  normalizeCanvasSkin,
} from '../../lib/canvasSkin';
import type { CanvasSkin } from '../../types';
import { useCanvasImagePicker } from '../hooks/useCanvasImage';

/**
 * 右栏「案件概览」里的画布底衬与背景图（M14）。
 * 顶栏「背景·XX」只做快捷循环切换，导入/不透明度/清除集中在这里。
 */
export function CanvasBackdropForm() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const pickCanvasImage = useCanvasImagePicker();

  const canvas = doc.settings.canvas;
  const skin = normalizeCanvasSkin(canvas?.skin);
  const asset = canvas?.assetId ? doc.assets.find((item) => item.id === canvas.assetId) ?? null : null;
  const opacity = Math.round((canvas?.opacity ?? CANVAS_OPACITY_DEFAULT) * 100);

  return (
    <div className="cb-form__section cb-canvasopt">
      <span className="cb-form__subtitle">画布底衬与背景图</span>
      <label className="cb-field">
        <span>底衬</span>
        <select value={skin} onChange={(event) => dispatch(setCanvasSkin(event.target.value as CanvasSkin))}>
          {CANVAS_SKINS.map((item) => (
            <option key={item} value={item}>
              {CANVAS_SKIN_META[item].label}
            </option>
          ))}
        </select>
      </label>
      <p className="cb-form__subtle">{CANVAS_SKIN_META[skin].hint}</p>
      <div className="cb-geo__ops">
        <button type="button" className="cb-btn" onClick={() => void pickCanvasImage()}>
          导入背景图…
        </button>
        {canvas?.assetId ? (
          <button type="button" className="cb-btn cb-btn--ghost" onClick={() => dispatch(setCanvasImage(null))}>
            清除背景图
          </button>
        ) : null}
      </div>
      {canvas?.assetId ? (
        <label className="cb-field">
          <span>背景不透明度 {opacity}%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={opacity}
            onChange={(event) => dispatch(setCanvasImage(canvas.assetId ?? null, Number(event.target.value) / 100))}
          />
        </label>
      ) : null}
      {asset ? <p className="cb-form__subtle">当前背景图：{asset.name ?? asset.path}</p> : null}
    </div>
  );
}
