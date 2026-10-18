import { memo, useMemo, useRef, useState } from 'react';
import { useViewport, type Node, type NodeProps } from '@xyflow/react';
import {
  resizeImageNode,
  rotateImageNode,
  setImageLayer,
  updateImageNode,
} from '../../commands';
import { resizeImageRect, snapRotation, type ResizeHandle } from '../../lib/imageNode';
import { useDocStore } from '../../store/docStore';
import type { Asset, ImageNode } from '../../types';
import { useAssetThumb } from '../hooks/useAssetThumb';

export type FreeImageNodeData = {
  image: ImageNode;
  asset?: Asset;
  /** 拖到卡片上高亮：松手即吸附为头像/附件 */
  attachTarget?: boolean;
};
export type FreeImageFlowNode = Node<FreeImageNodeData, 'freeImage'>;

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface ResizeDrag {
  mode: 'resize';
  handle: ResizeHandle;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
}

interface RotateDrag {
  mode: 'rotate';
  startX: number;
  startY: number;
  startAngle: number;
  origin: number;
}

type DragState = ResizeDrag | RotateDrag | null;

/** 指针相对元素中心的极角（度，screen 坐标系，正方向为顺时针） */
function pointerAngle(event: React.PointerEvent, center: { x: number; y: number }): number {
  return (Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180) / Math.PI;
}

function FreeImageNodeInner({ data, selected }: NodeProps<FreeImageFlowNode>) {
  const { image, asset, attachTarget } = data;
  const dispatch = useDocStore((s) => s.dispatch);
  const { zoom } = useViewport();
  const frameRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number | null>(null);

  const thumb = useAssetThumb(image.assetId, 1024);
  const rotation = previewRotation ?? image.rotation;
  const border = image.borderStyle ?? 'photo';
  const rect = preview ?? { x: image.x, y: image.y, w: image.w, h: image.h };
  const title = useMemo(() => asset?.name ?? asset?.no ?? '图片', [asset]);
  const isAi = asset?.zone === 'ai' || asset?.aiGenerated === true;

  const centerOf = () => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return { x: 0, y: 0 };
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };

  const startResize = (handle: ResizeHandle) => (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      mode: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: image.x, y: image.y, w: image.w, h: image.h },
    });
    setPreview({ x: image.x, y: image.y, w: image.w, h: image.h });
  };

  const startRotate = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      mode: 'rotate',
      startX: event.clientX,
      startY: event.clientY,
      startAngle: pointerAngle(event, centerOf()),
      origin: image.rotation,
    });
    setPreviewRotation(image.rotation);
  };

  const onMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (drag.mode === 'resize') {
      // 旋转后的图片：把屏幕位移投到图片本地轴，再交给纯函数算新矩形
      const rad = (image.rotation * Math.PI) / 180;
      const localDx = dx * Math.cos(rad) + dy * Math.sin(rad);
      const localDy = -dx * Math.sin(rad) + dy * Math.cos(rad);
      setPreview(resizeImageRect(drag.origin, drag.handle, localDx, localDy, { lockAspect: event.shiftKey }));
      return;
    }
    const delta = pointerAngle(event, centerOf()) - drag.startAngle;
    setPreviewRotation(snapRotation(drag.origin + delta));
  };

  const endDrag = () => {
    if (drag && preview) dispatch(resizeImageNode(image.id, preview));
    if (drag && drag.mode === 'rotate' && previewRotation !== null) {
      dispatch(rotateImageNode(image.id, previewRotation));
    }
    setDrag(null);
    setPreview(null);
    setPreviewRotation(null);
  };

  const offsetX = preview ? preview.x - image.x : 0;
  const offsetY = preview ? preview.y - image.y : 0;

  return (
    <div
      className={`cb-free-image${selected ? ' is-selected' : ''}${attachTarget ? ' is-attach-target' : ''}`}
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={frameRef}
        className={`cb-free-image__frame cb-free-image__frame--${border}`}
        style={{
          width: rect.w,
          height: rect.h,
          transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
        }}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title={title}
      >
        {thumb ? (
          <img className="cb-free-image__img" src={thumb} alt={title} draggable={false} />
        ) : (
          <div className="cb-free-image__ph">
            <span>无预览</span>
            <small>{asset?.no ?? '素材不在本机'}</small>
          </div>
        )}

        {image.pinned ? <span className="cb-free-image__pin" title="图钉装饰" /> : null}
        {image.linkedNodeId ? <span className="cb-free-image__linked">已吸附</span> : null}
        {isAi ? <span className="cb-free-image__ai">AI 生成 · 模拟图</span> : null}

        {selected
          ? HANDLES.map((handle) => (
              <span
                key={handle}
                className={`cb-img-handle cb-img-handle--${handle}`}
                onPointerDown={startResize(handle)}
                title="拖动缩放（Shift 等比）"
              />
            ))
          : null}

        {selected ? (
          <span className="cb-img-rotate" title="拖动旋转（15° 吸附）" onPointerDown={startRotate} />
        ) : null}
      </div>

      {selected ? (
        <div className="cb-free-image__bar" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'front'))} title="置顶">
            置顶
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'up'))} title="上移一层">
            上移
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'down'))} title="下移一层">
            下移
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'back'))} title="置底">
            置底
          </button>
          <button
            type="button"
            onClick={() => dispatch(updateImageNode(image.id, { pinned: !image.pinned }))}
            title="图钉装饰"
          >
            {image.pinned ? '去图钉' : '图钉'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const FreeImageNode = memo(FreeImageNodeInner);
