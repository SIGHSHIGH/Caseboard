import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { updateNode } from '../../commands';
import { NODE_TYPE_META, STATUS_META } from '../../lib/theme';
import { fieldEntriesOf } from '../../lib/nodeTemplates';
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

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

function BaseNodeInner({ data, selected }: NodeProps<BaseFlowNode>) {
  const node = data.node;
  const attachTarget = data.attachTarget === true;
  const heat = data.heat ?? 0;
  const onPath = data.onPath === true;
  const meta = NODE_TYPE_META[node.type];
  const status = STATUS_META[node.status];
  const dispatch = useDocStore((s) => s.dispatch);
  const setHoverNode = useUiStore((s) => s.setHoverNode);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={`cb-node${selected ? ' is-selected' : ''}${attachTarget ? ' is-attach-target' : ''}${data.dimmed ? ' is-dim' : ''}${onPath ? ' is-path' : ''}`}
      data-heat={heat > 0 ? heat.toFixed(2) : undefined}
      onMouseEnter={() => setHoverNode(node.id)}
      onMouseLeave={() => setHoverNode(null)}
      style={{ width: node.w }}
      data-type={node.type}
    >
      {/* 每边放两个连接点：target 只做几何锚点（React Flow 计算连线路径需要 target 侧边界），
          source 负责拖拽发起；两者重叠，target 不接收指针事件，避免抢走拖拽。 */}
      {SIDES.map((side) => (
        <Handle
          key={`t-${side.id}`}
          id={side.id}
          type="target"
          position={side.position}
          className="cb-handle cb-handle--target"
          isConnectable={false}
        />
      ))}
      {SIDES.map((side) => (
        <Handle
          key={`s-${side.id}`}
          id={side.id}
          type="source"
          position={side.position}
          className="cb-handle cb-handle--source"
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
