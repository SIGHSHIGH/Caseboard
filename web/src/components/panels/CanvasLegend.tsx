import { useEffect, useRef, useState } from 'react';
import { LINE_STYLE_META } from '../../lib/theme';
import type { LineStyle } from '../../types';

const LEGEND: LineStyle[] = ['solid', 'dashed', 'dotted'];

/**
 * 画布图示（M10）：线型语义常驻规则不变（Gate 0-3），但不再常驻顶栏——
 * 顶栏被它挤到没地方放案件编号与操作按钮。改成右下角一个「图示」小标签，点开才展开，
 * 内容 = 三种线型语义 + 画布操作提示（原左栏底部那段长文字也收进这里）。
 */
export function CanvasLegend() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点面板外面自动收起，避免一直挡着画布右下角
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  return (
    <div className="cb-legend-fab-root" ref={rootRef}>
      {open ? (
        <div className="cb-legend-panel" role="dialog" aria-label="图示与操作提示">
          <div className="cb-legend-panel__head">
            <strong>图示</strong>
            <button
              type="button"
              className="cb-legend-panel__close"
              title="收起图示"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="cb-legend-panel__lines" title="线型即语义，固定不可关闭">
            <span className="cb-legend__caption">线型语义</span>
            {LEGEND.map((style) => (
              <span key={style} className="cb-legend__item">
                <svg width="34" height="10" aria-hidden="true">
                  <line
                    x1="1"
                    y1="5"
                    x2="33"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeDasharray={LINE_STYLE_META[style].dash}
                  />
                </svg>
                <span>
                  {LINE_STYLE_META[style].label} = {LINE_STYLE_META[style].meaning}
                </span>
              </span>
            ))}
          </div>
          <div className="cb-legend-panel__hints">
            <p>· 拖动节点四边中点或四角圆点：拉出关系（八个方向都能连）</p>
            <p>· 双击画布空白处：新建节点；双击节点标题：就地改名</p>
            <p>· 吸附：图片拖到卡片四角附近自动吸附，之后跟随卡片移动</p>
            <p>· 按住空格 / 右键拖动平移，滚轮缩放，Ctrl + 点选可加选</p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={'cb-legend-fab' + (open ? ' is-open' : '')}
        title="展开线型语义与操作提示"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        图示
      </button>
    </div>
  );
}
