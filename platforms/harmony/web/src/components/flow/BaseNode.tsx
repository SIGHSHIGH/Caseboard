import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { updateNode } from '../../commands';
import { CLUSTER_PIN_H, CLUSTER_PIN_W, stickyText, stickyVisible } from '../../lib/clusterPin';
import { NODE_TYPE_META, STATUS_META } from '../../lib/theme';
import { fieldEntriesOf } from '../../lib/nodeTemplates';
import type { EdgeAnchor } from '../../lib/edgeCurve';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseNode } from '../../types';

export type BaseNodeData = {
  node: CaseNode;
  attachTarget?: boolean;
  dimmed?: boolean;
  /** 中心度热力，0–1（M5-3） */
  heat?: number;
  /** 是否落在当前高亮路径上（M5-3） */
  onPath?: boolean;
};
export type BaseFlowNode = Node<BaseNodeData, 'base'>;

/** 八个连接点（M10）：四边中点 + 四个角。角的横向位置用内联 left 覆盖 React Flow 的居中默认值。 */
const SIDES: Array<{ id: EdgeAnchor; position: Position; left?: string }> = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
  { id: 'tl', position: Position.Top, left: '0%' },
  { id: 'tr', position: Position.Top, left: '100%' },
  { id: 'bl', position: Position.Bottom, left: '0%' },
  { id: 'br', position: Position.Bottom, left: '100%' },
];

const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP = 8;

function BaseNodeInner({ data, selected }: NodeProps<BaseFlowNode>) {
  const node = data.node;
  const attachTarget = data.attachTarget === true;
  const heat = data.heat ?? 0;
  const onPath = data.onPath === true;
  const meta = NODE_TYPE_META[node.type];
  const status = STATUS_META[node.status];
  const dispatch = useDocStore((s) => s.dispatch);
  const setHoverNode = useUiStore((s) => s.setHoverNode);
  const multiSelect = useUiStore((s) => s.multiSelect);
  const enterMultiSelect = useUiStore((s) => s.enterMultiSelect);
  const toggleMultiSelect = useUiStore((s) => s.toggleMultiSelect);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 触屏长按进多选（H5-5）：手指没有 Ctrl，用 480ms 长按当「加选修饰键」。
     长按后再点别的卡片由 Board 的 onNodeClick 转给 toggleMultiSelect 累加。
     一旦移动超过 8px 或抬手就撤销计时器，免得拖动卡片时被误判成多选。 */
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef({ x: 0, y: 0, id: '' });

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  useEffect(() => clearPressTimer, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    clearPressTimer();
    pressOrigin.current = { x: event.clientX, y: event.clientY, id: node.id };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      // 已经在多选态里再长按同一张卡 = 取消它；否则进多选并把它算进选择
      if (useUiStore.getState().multiSelect) toggleMultiSelect(node.id);
      else enterMultiSelect(node.id);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pressTimer.current === null) return;
    if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > LONG_PRESS_SLOP) {
      clearPressTimer();
    }
  };

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(node.title);
  }, [node.title, editing]);

  const commitTitle = () => {
    const title = draft.trim();
    if (title.length > 0 && title !== node.title) {
      dispatch(updateNode(node.id, { title }));
    } else {
      setDraft(node.title);
    }
    setEditing(false);
  };

  /* 集中钉子（H5.3 首版 → H5.5 改进）：节点本体就是一个圆点，
     关系线连接点与圆点同心（只有一个，画在圆点中心）；
     黄色便利贴是挂在圆点正下方（上边中点对齐圆点）的装饰层，默认不显示，可显隐+写字。 */
  if (node.type === 'clusterPin') {
    const paperVisible = stickyVisible(node);
    const text = stickyText(node);
    return (
      <div
        className={`cb-pin${selected ? ' is-selected' : ''}${multiSelect && selected ? ' is-multi' : ''}`}
        style={{ width: CLUSTER_PIN_W, height: CLUSTER_PIN_H }}
        onMouseEnter={() => setHoverNode(node.id)}
        onMouseLeave={() => setHoverNode(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearPressTimer}
        onPointerCancel={clearPressTimer}
        data-type="clusterPin"
      >
        {/* 唯一连接点：与圆点同心（Position.Top + CSS 拉到圆心）。
            H5.6.1：source 负责从这里拖出连线，target 只做几何锚点、不接收指针事件——
            缺了 target 侧时，以钉子为终点的线（例如「红线」）算不出终点，React Flow 直接不画。 */}
        <Handle
          id="right-in"
          type="target"
          position={Position.Top}
          className="cb-handle cb-handle--target cb-pin__handle"
          isConnectable={false}
        />
        <Handle id="right" type="source" position={Position.Top} className="cb-handle cb-pin__handle" />
        <div className="cb-pin__dot" data-pin-id={node.id} title="集中钉子：拖动它带动整个钉集" />
        {paperVisible ? (
          <div className="cb-pin__paper">
            <span className="cb-pin__paper-text">{text}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`cb-node${selected ? ' is-selected' : ''}${attachTarget ? ' is-attach-target' : ''}${data.dimmed ? ' is-dim' : ''}${onPath ? ' is-path' : ''}${multiSelect && selected ? ' is-multi' : ''}`}
      data-heat={heat > 0 ? heat.toFixed(2) : undefined}
      onMouseEnter={() => setHoverNode(node.id)}
      onMouseLeave={() => setHoverNode(null)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      style={{ width: node.w }}
      data-type={node.type}
    >      {/* 每个连接点放两个：target 只做几何锚点（React Flow 计算连线路径需要 target 侧边界），
          source 负责拖拽发起；两者重叠，target 不接收指针事件，避免抢走拖拽。
          M10：一共八处（四边中点 + 四角），关系线不再只能从四条边中间出来。 */}
      {SIDES.map((side) => (
        <Handle
          key={`t-${side.id}`}
          id={side.id}
          type="target"
          position={side.position}
          className={`cb-handle cb-handle--target${side.left ? ' cb-handle--corner' : ''}`}
          style={side.left ? { left: side.left } : undefined}
          isConnectable={false}
        />
      ))}
      {SIDES.map((side) => (
        <Handle
          key={`s-${side.id}`}
          id={side.id}
          type="source"
          position={side.position}
          className={`cb-handle cb-handle--source${side.left ? ' cb-handle--corner' : ''}`}
          style={side.left ? { left: side.left } : undefined}
        />
      ))}

      <div className="cb-node__bar" style={{ background: meta.color }} />

      <div className="cb-node__body">
        <div className="cb-node__head">
          <span className="cb-node__icon" aria-hidden="true">
            {meta.icon}
          </span>
          {editing ? (
            <input
              ref={inputRef}
              className="cb-node__title-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTitle();
                if (event.key === 'Escape') {
                  setDraft(node.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <span
              className="cb-node__title"
              title="双击修改标题"
              onDoubleClick={() => setEditing(true)}
            >
              {node.title}
            </span>
          )}
        </div>

        <div className="cb-node__meta">
          <span className="cb-node__type">{meta.label}</span>
          {node.aliases && node.aliases.length > 0 ? (
            <span className="cb-node__alias">别名：{node.aliases.join('、')}</span>
          ) : null}
          {node.collapsed ? <span className="cb-node__folded">已折叠</span> : null}
          {heat >= 0.33 ? (
            <span
              className={heat >= 0.66 ? 'cb-node__heat is-top' : 'cb-node__heat'}
              title={`中心度 ${Math.round(heat * 100)}%：数值越高，越处在关系网络的关键位置`}
            >
              中心度 {Math.round(heat * 100)}%
            </span>
          ) : null}
        </div>

        {/* 未折叠时给出 2 条最关键的模板字段，替代「打开属性面板才知道节点装了什么」 */}
        {node.collapsed ? null : (
          <ul className="cb-node__fields">
            {fieldEntriesOf(node.type, node.fields)
              .slice(0, 2)
              .map((entry) => (
                <li key={entry.key} className="cb-node__field">
                  <span className="cb-node__field-key">{entry.label}</span>
                  <span className="cb-node__field-val">{entry.value}</span>
                </li>
              ))}
            {node.comments && node.comments.length > 0 ? (
              <li className="cb-node__field">
                <span className="cb-node__field-key">评论</span>
                <span className="cb-node__field-val">{node.comments.length} 条</span>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="cb-node__foot">
        <span className="cb-node__status" style={{ color: status.color }}>
          ● {status.label}
        </span>
        <span className="cb-node__conf">置信度 {node.confidence}</span>
      </div>
    </div>
  );
}

export const BaseNode = memo(BaseNodeInner);
