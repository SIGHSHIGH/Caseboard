import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { updateNode } from '../../commands';
import { NODE_TYPE_META, STATUS_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import type { CaseNode } from '../../types';

export type BaseNodeData = { node: CaseNode };
export type BaseFlowNode = Node<BaseNodeData, 'base'>;

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

function BaseNodeInner({ data, selected }: NodeProps<BaseFlowNode>) {
  const node = data.node;
  const meta = NODE_TYPE_META[node.type];
  const status = STATUS_META[node.status];
  const dispatch = useDocStore((s) => s.dispatch);

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
      className={`cb-node${selected ? ' is-selected' : ''}`}
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
        </div>
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
