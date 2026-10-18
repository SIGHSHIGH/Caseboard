import { memo, useState } from 'react';
import { useViewport, type Node, type NodeProps } from '@xyflow/react';
import {
  DEFAULT_GROUP_OPACITY,
  MIN_GROUP_H,
  MIN_GROUP_W,
  resizeGroup,
  toggleGroupCollapsed,
} from '../../commands';
import { hexToRgba } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import type { Group } from '../../types';

export type GroupRectNodeData = { group: Group; memberCount: number; childCount: number };
export type GroupRectFlowNode = Node<GroupRectNodeData, 'groupRect'>;

interface DragState {
  mode: 'resize';
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
}

/**
 * 展开态的组：画在 React Flow 节点层里（zIndex -1），所以拖动、缩放天然跟视口一致；
 * 只有标题栏和右下角把手接收指针，中间空白不挡下面节点的点击。
 */
function GroupRectNodeInner({ data, selected }: NodeProps<GroupRectFlowNode>) {
  const { group, memberCount, childCount } = data;
  const dispatch = useDocStore((s) => s.dispatch);
  const { zoom } = useViewport();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      mode: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...group.bounds },
    });
    setPreview({ w: group.bounds.w, h: group.bounds.h });
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    // 指针位移是屏幕像素，除以缩放才是世界坐标里的尺寸（等价于 coords.ts 的换算）
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    setPreview({
      w: Math.max(MIN_GROUP_W, Math.round(drag.origin.w + dx)),
      h: Math.max(MIN_GROUP_H, Math.round(drag.origin.h + dy)),
    });
  };

  const endResize = () => {
    if (drag && preview) {
      dispatch(resizeGroup(group.id, { ...drag.origin, w: preview.w, h: preview.h }));
    }
    setDrag(null);
    setPreview(null);
  };

  const opacity = group.opacity ?? DEFAULT_GROUP_OPACITY;

  return (
    <div
      className={`cb-group${selected ? ' is-selected' : ''}`}
      style={{
        width: preview ? preview.w : '100%',
        height: preview ? preview.h : '100%',
        background: hexToRgba(group.color, opacity),
        borderColor: hexToRgba(group.color, selected ? 0.95 : 0.5),
        borderStyle: selected ? 'solid' : 'dashed',
      }}
    >
      <div className="cb-group__header" style={{ background: hexToRgba(group.color, 0.92) }}>
        <span className="cb-group__title">{group.title}</span>
        <span className="cb-group__count">
          {memberCount} 个对象{childCount > 0 ? ` · ${childCount} 子组` : ''}
        </span>
        <button
          type="button"
          className="cb-group__fold"
          title="折叠为超级节点"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatch(toggleGroupCollapsed(group.id));
          }}
        >
          折叠
        </button>
      </div>

      <div
        className="cb-group__resize"
        title="拖动调整分组大小"
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
    </div>
  );
}

export const GroupRectNode = memo(GroupRectNodeInner);
