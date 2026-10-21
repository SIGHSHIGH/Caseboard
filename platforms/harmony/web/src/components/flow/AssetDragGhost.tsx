import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { thumbUrl } from '../../services/imageStore';
import { useUiStore } from '../../store/uiStore';

/**
 * 触屏拖拽素材时的「跟手缩略图影」（H5）。
 *
 * 为什么需要它：ArkWeb（Chromium）的手指触摸不会产生 HTML5 dragstart，
 * 桌面版那套 dataTransfer 拖放搬不过来，于是改为「长按起拖 → 影子跟随手指 → 松手落点」。
 * 影子挂在 body 上（portal），否则会被左栏的滚动容器裁掉、也不该参与命中测试。
 */
export function AssetDragGhost() {
  const drag = useUiStore((s) => s.assetDrag);
  const assetId = drag?.assetId ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let alive = true;
    thumbUrl(assetId, 256)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [assetId]);

  if (!drag || typeof document === 'undefined') return null;

  return createPortal(
    <div className="cb-asset-drag" style={{ left: drag.x, top: drag.y }} aria-hidden>
      {url ? <img src={url} alt="" /> : <span className="cb-asset-drag__ph">素材</span>}
    </div>,
    document.body,
  );
}
