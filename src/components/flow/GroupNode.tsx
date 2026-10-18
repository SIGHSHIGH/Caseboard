import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { toggleGroupCollapsed } from '../../commands';
import type { RenderSuperNode } from '../../lib/groups';
import { hexToRgba } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';

export type GroupNodeData = { superNode: RenderSuperNode };
export type GroupFlowNode = Node<GroupNodeData, 'group'>;

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

/** 折叠组在画布上的替身：显示组名与成员数量，双击展开 */
function GroupNodeInner({ data, selected }: NodeProps<GroupFlowNode>) {
  const { group, memberCount, childCount } = data.superNode;
  const dispatch = useDocStore((s) => s.dispatch);

  return (
    <div
      className={`cb-node cb-node--super${selected ? ' is-selected' : ''}`}
      style={{ background: hexToRgba(group.color, 0.06), borderColor: hexToRgba(group.color, 0.65) }}
      onDoubleClick={() => dispatch(toggleGroupCollapsed(group.id))}
      title="双击展开分组"
    >
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

      <div className="cb-node__bar" style={{ background: group.color }} />
      <div className="cb-node__body">
        <div className="cb-node__head">
          <span className="cb-node__icon" aria-hidden="true">
            📁
          </span>
          <span className="cb-node__title">{group.title}</span>
        </div>
        <div className="cb-node__meta">
          <span className="cb-node__type">折叠分组</span>
          <span className="cb-node__alias">{memberCount} 个对象</span>
          {childCount > 0 ? <span className="cb-node__alias">{childCount} 个子组</span> : null}
        </div>
      </div>
      <div className="cb-node__foot">
        <span className="cb-node__status" style={{ color: group.color }}>
          ● 已折叠
        </span>
        <span className="cb-node__conf">双击展开</span>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeInner);
