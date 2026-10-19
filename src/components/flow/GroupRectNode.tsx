import { memo, useState } from 'react';
import { useViewport, type Node, type NodeProps } from '@xyflow/react';
import {
  DEFAULT_GROUP_OPACITY,
  MIN_GROUP_H,
  MIN_GROUP_W,
  resizeGroup,
  toggleGroupCollapsed,
} from '../../commands';
import { memberNodeIds } from '../../lib/groups';
import { hexToRgba } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseNode, Group } from '../../types';

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
 *
 * M9 / A4：右下角把手与折叠按钮必须带 `nodrag`。React Flow v12 用 noDragClassName('nodrag')
 * 决定是否启动 d3-drag；新建组后把手没有 nodrag，指针一按下就被节点拖拽接管并抢走
 * pointer capture，导致「拖右下角改不了尺寸」。
 */
function GroupRectNodeInner({ data, selected }: NodeProps<GroupRectFlowNode>) {
  const { group, memberCount, childCount } = data;
  const dispatch = useDocStore((s) => s.dispatch);
  const doc = useDocStore((s) => s.doc);
  const selectNode = useUiStore((s) => s.selectNode);
  const focusEntity = useUiStore((s) => s.focusEntity);
  const { zoom } = useViewport();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);

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
  // A4：组成员清单——按 id 顺序列出直接成员（含子组内成员），点标题可在画布中定位
  const memberIds = memberNodeIds(doc, group.id, true);
  const memberList = memberIds
    .map((id) => doc.nodes.find((node) => node.id === id))
    .filter((node): node is CaseNode => node !== undefined);
  const childGroups = doc.groups.filter((item) => item.parentId === group.id);

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
      {/* M11（I3）：标题栏本身可以拖（不要 nodrag，否则 d3-drag 不接管、整组拖不动）；
          内部按钮各自带 nodrag，点按钮不会带动分组。 */}
      <div
        className="cb-group__header"
        title="按住标题栏拖动整组"
        style={{ background: hexToRgba(group.color, 0.92) }}
      >
        <span className="cb-group__grip" aria-hidden="true">
          ⠿
        </span>
        <span className="cb-group__title">{group.title}</span>
        <button
          type="button"
          className={`cb-group__count nodrag${listOpen ? ' is-open' : ''}`}
          title="查看组成员清单"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setListOpen((open) => !open);
          }}
        >
          {memberCount} 个对象{childCount > 0 ? ` · ${childCount} 子组` : ''} {listOpen ? '▴' : '▾'}
        </button>
        <button
          type="button"
          className="cb-group__fold nodrag"
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

      {listOpen ? (
        <div className="cb-group__members nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
          <div className="cb-group__members-head">
            组成员（{memberList.length}）
            {childGroups.length > 0 ? ` · 子组 ${childGroups.length}` : ''}
          </div>
          {memberList.length === 0 ? (
            <p className="cb-group__members-empty">还没有成员：把实体拖进分组框即可加入。</p>
          ) : (
            <ul className="cb-group__members-list">
              {memberList.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className="cb-group__member"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectNode(node.id);
                      focusEntity(node.id, 'node');
                      setListOpen(false);
                    }}
                  >
                    <span className={`cb-group__member-dot cb-group__member-dot--${node.type}`} aria-hidden="true" />
                    <span className="cb-group__member-title">{node.title}</span>
                    <span className="cb-group__member-sub">{node.notes ? '有备注' : node.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {childGroups.length > 0 ? (
            <div className="cb-group__members-child">
              子组：
              {childGroups.map((item) => item.title).join('、')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="cb-group__resize nodrag"
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
