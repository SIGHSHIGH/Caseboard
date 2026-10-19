import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useViewport, type Node, type NodeProps } from '@xyflow/react';
import {
  resizeImageNode,
  rotateImageNode,
  setImageLayer,
  updateImageNode,
} from '../../commands';
import { resizeImageRect, snapRotation, type ResizeHandle } from '../../lib/imageNode';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
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
  /** 起始旋转角：缩放过程中图片可能被旋转，位移要投到图片本地轴 */
  rotation: number;
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
function pointerAngle(event: { clientX: number; clientY: number }, center: { x: number; y: number }): number {
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

  /** 拖动过程中的最新值：window 监听器读取 ref，避免闭包拿到旧状态 */
  const dragRef = useRef<DragState>(null);
  const previewRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const previewRotationRef = useRef<number | null>(null);

  const thumb = useAssetThumb(image.assetId, 1024);
  const rotation = previewRotation ?? image.rotation;
  const border = image.borderStyle ?? 'photo';
  const rect = preview ?? { x: image.x, y: image.y, w: image.w, h: image.h };
  const title = useMemo(() => asset?.name ?? asset?.no ?? '图片', [asset]);
  const isAi = asset?.zone === 'ai' || asset?.aiGenerated === true;
  const hoverNodeId = useUiStore((s) => s.hoverNodeId);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds);
  const selectNode = useUiStore((s) => s.selectNode);
  const anchorFocus = useUiStore((s) => s.anchorFocus);
  const nodes = useDocStore((s) => s.doc.nodes);
  /** 区域锚点（M7-2）：照片里框出的区域绑定到实体，悬停/选中该实体时高亮 */
  const anchors = useMemo(
    () => (asset?.annotations ?? []).filter((item) => item.shape === 'anchor' && item.linkedNodeId),
    [asset],
  );
  /**
   * T3：高亮集合 = 悬停实体 ∪ 多选中的实体 ∪ 单选实体 ∪ 「假设面板跳转过来的锚点关联实体」。
   * 之前只认 `hoverNodeId ?? selectedNodeId` 一次一个，多选和面板跳转都不亮，看起来像功能坏了。
   */
  const highlightIds = useMemo(() => {
    const set = new Set<string>();
    if (hoverNodeId) set.add(hoverNodeId);
    if (selectedNodeId) set.add(selectedNodeId);
    for (const id of selectedNodeIds) set.add(id);
    if (anchorFocus && anchorFocus.assetId === image.assetId) {
      const focused = anchors.find((item) => item.id === anchorFocus.annotationId);
      if (focused?.linkedNodeId) set.add(focused.linkedNodeId);
    }
    return set;
  }, [hoverNodeId, selectedNodeId, selectedNodeIds, anchorFocus, anchors, image.assetId]);
  const titleOfNode = (id: string) => nodes.find((node) => node.id === id)?.title ?? '已删除的实体';

  const centerOf = () => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return { x: 0, y: 0 };
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };

  /**
   * 缩放/旋转统一走 window 指针事件（M4 人工验收 A1/A2）：
   * 手柄在 React Flow 节点内部，d3-drag 会抢 pointerdown，历史上只做到「拖动节点」。
   * 现在手柄带 nodrag，并且按下后直接监听 window，指针移出手柄也跟手。
   */
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (current.mode === 'resize') {
        const dx = (event.clientX - current.startX) / zoom;
        const dy = (event.clientY - current.startY) / zoom;
        const rad = (current.rotation * Math.PI) / 180;
        const localDx = dx * Math.cos(rad) + dy * Math.sin(rad);
        const localDy = -dx * Math.sin(rad) + dy * Math.cos(rad);
        const next = resizeImageRect(current.origin, current.handle, localDx, localDy, { lockAspect: event.shiftKey });
        previewRef.current = next;
        setPreview(next);
        return;
      }
      const delta = pointerAngle(event, centerOf()) - current.startAngle;
      const next = snapRotation(current.origin + delta);
      previewRotationRef.current = next;
      setPreviewRotation(next);
    };
    const finish = () => {
      const current = dragRef.current;
      const box = previewRef.current;
      const angle = previewRotationRef.current;
      dragRef.current = null;
      previewRef.current = null;
      previewRotationRef.current = null;
      setDrag(null);
      setPreview(null);
      setPreviewRotation(null);
      if (current?.mode === 'resize' && box) dispatch(resizeImageNode(image.id, box));
      if (current?.mode === 'rotate' && angle !== null) dispatch(rotateImageNode(image.id, angle));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [drag, dispatch, image.id, zoom]);

  const startResize = (handle: ResizeHandle) => (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const next: ResizeDrag = {
      mode: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: image.x, y: image.y, w: image.w, h: image.h },
      rotation: image.rotation,
    };
    dragRef.current = next;
    previewRef.current = next.origin;
    setDrag(next);
    setPreview(next.origin);
  };

  const startRotate = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const next: RotateDrag = {
      mode: 'rotate',
      startX: event.clientX,
      startY: event.clientY,
      startAngle: pointerAngle(event, centerOf()),
      origin: image.rotation,
    };
    dragRef.current = next;
    previewRotationRef.current = image.rotation;
    setDrag(next);
    setPreviewRotation(image.rotation);
  };

  const offsetX = preview ? preview.x - image.x : 0;
  const offsetY = preview ? preview.y - image.y : 0;

  // M11（I6）：压缩成小圆点模式——只占 26×26，方便拖到卡片角吸附，双击圆点展开
  if (image.dotMode) {
    return (
      <div
        className={`cb-img-dot${selected ? ' is-selected' : ''}${attachTarget ? ' is-attach-target' : ''}`}
        title={`${title}（小圆点模式：拖到卡片角即可吸附，右键或用右栏可展开）`}
        onDoubleClick={(event) => {
          event.stopPropagation();
          dispatch(updateImageNode(image.id, { dotMode: false }));
        }}
      >
        <span className="cb-img-dot__core" aria-hidden="true" />
        {image.linkedNodeId ? <span className="cb-img-dot__linked" aria-hidden="true" /> : null}
        <button
          type="button"
          className="cb-img-dot__expand nodrag nopan"
          title="展开成正常图片"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatch(updateImageNode(image.id, { dotMode: false }));
          }}
        >
          ⤢
        </button>
      </div>
    );
  }

  return (
    <div
      className={`cb-free-image${selected ? ' is-selected' : ''}${attachTarget ? ' is-attach-target' : ''}`}
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={frameRef}
        className={`cb-free-image__frame cb-free-image__frame--${border}${isAi ? ' is-ai' : ''}`}
        style={{
          width: rect.w,
          height: rect.h,
          transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
        }}
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

        {anchors.map((anchor) => {
          const linked = anchor.linkedNodeId as string;
          const highlight = highlightIds.has(linked);
          return (
            <div
              key={anchor.id}
              className={'cb-free-image__anchor nodrag nopan' + (highlight ? ' is-hlit' : '')}
              style={{
                left: anchor.geom.x * 100 + '%',
                top: anchor.geom.y * 100 + '%',
                width: anchor.geom.w * 100 + '%',
                height: anchor.geom.h * 100 + '%',
                borderColor: anchor.color ?? '#C0392B',
              }}
              title={
                '区域锚点：' +
                titleOfNode(linked) +
                (anchor.text ? ' · ' + anchor.text : '') +
                '（点击选中该实体）'
              }
              onClick={(event) => {
                event.stopPropagation();
                selectNode(linked);
              }}
            >
              {highlight ? (
                <span className="cb-free-image__anchor-tag">
                  {anchor.text ?? titleOfNode(linked)}
                </span>
              ) : null}
            </div>
          );
        })}

        {image.pinned ? <span className="cb-free-image__pin" title="图钉装饰" /> : null}
        {image.linkedNodeId ? <span className="cb-free-image__linked">已吸附</span> : null}
        {isAi ? <span className="cb-free-image__ai">AI 生成 · 模拟图</span> : null}

        {selected
          ? HANDLES.map((handle) => (
              <span
                key={handle}
                className={`cb-img-handle cb-img-handle--${handle} nodrag`}
                onPointerDown={startResize(handle)}
                title="拖动缩放（Shift 等比）"
              />
            ))
          : null}

        {selected ? (
          <span className="cb-img-rotate nodrag" title="拖动旋转（15° 吸附）" onPointerDown={startRotate} />
        ) : null}
      </div>

      {selected ? (
        <div
          className="cb-free-image__bar nodrag nopan"
          title="图片工具条（竖排，避免压住顶部旋转手柄）"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'front'))} title="置顶">
            <span className="cb-free-image__bar-icon" aria-hidden="true">⇈</span>
            <span>置顶</span>
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'up'))} title="上移一层">
            <span className="cb-free-image__bar-icon" aria-hidden="true">↑</span>
            <span>上移</span>
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'down'))} title="下移一层">
            <span className="cb-free-image__bar-icon" aria-hidden="true">↓</span>
            <span>下移</span>
          </button>
          <button type="button" onClick={() => dispatch(setImageLayer(image.id, 'back'))} title="置底">
            <span className="cb-free-image__bar-icon" aria-hidden="true">⇊</span>
            <span>置底</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch(updateImageNode(image.id, { pinned: !image.pinned }))}
            title="图钉装饰"
          >
            <span className="cb-free-image__bar-icon" aria-hidden="true">{image.pinned ? '⏏' : '⌖'}</span>
            <span>{image.pinned ? '去图钉' : '图钉'}</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch(updateImageNode(image.id, { dotMode: true }))}
            title="压缩成小圆点（方便拖到卡片角吸附）"
          >
            <span className="cb-free-image__bar-icon" aria-hidden="true">◍</span>
            <span>圆点</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const FreeImageNode = memo(FreeImageNodeInner);
