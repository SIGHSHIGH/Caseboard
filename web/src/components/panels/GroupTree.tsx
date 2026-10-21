import { useState } from 'react';
import { toggleGroupCollapsed } from '../../commands';
import { memberNodeIds } from '../../lib/groups';
import { NODE_TYPE_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseNode, Group } from '../../types';

/**
 * 左栏「分组」页签里的树形总览（M11 / I3）：
 * 组 → 直接成员实体 + 子组，点条目在画布中定位；组行带折叠与定位按钮。
 */
function GroupRow({ group, depth }: { group: Group; depth: number }) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectGroup = useUiStore((s) => s.selectGroup);
  const selectNode = useUiStore((s) => s.selectNode);
  const focusEntity = useUiStore((s) => s.focusEntity);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const [open, setOpen] = useState(true);

  const children = doc.groups.filter((item) => item.parentId === group.id);
  const directIds = memberNodeIds(doc, group.id, false);
  const members = directIds
    .map((id) => doc.nodes.find((node) => node.id === id))
    .filter((node): node is CaseNode => node !== undefined);
  const total = memberNodeIds(doc, group.id, true).length;
  const active = selectedGroupId === group.id;

  return (
    <li className="cb-gtree__node">
      <div className={`cb-gtree__row${active ? ' is-active' : ''}`} style={{ paddingLeft: 6 + depth * 12 }}>
        <button
          type="button"
          className="cb-gtree__toggle"
          title={open ? '收起' : '展开'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="cb-gtree__dot" style={{ background: group.color }} aria-hidden="true" />
        <button
          type="button"
          className="cb-gtree__title"
          title="选中并在画布中定位这个分组"
          onClick={() => {
            selectGroup(group.id);
            focusEntity(group.id, 'group');
          }}
        >
          {group.title}
        </button>
        <span className="cb-gtree__count" title={`直接成员 ${members.length} · 含子组 ${total}`}>
          {total}
        </span>
        <button
          type="button"
          className={`cb-gtree__fold${group.collapsed ? ' is-on' : ''}`}
          title={group.collapsed ? '展开为组框' : '折叠成超级节点'}
          onClick={() => dispatch(toggleGroupCollapsed(group.id))}
        >
          {group.collapsed ? '展开' : '折叠'}
        </button>
      </div>

      {open ? (
        <ul className="cb-gtree__children">
          {members.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="cb-gtree__member"
                style={{ paddingLeft: 20 + depth * 12 }}
                title={'在画布中定位：' + node.title}
                onClick={() => {
                  selectNode(node.id);
                  focusEntity(node.id, 'node');
                }}
              >
                <span
                  className="cb-gtree__member-icon"
                  style={{ background: NODE_TYPE_META[node.type].color }}
                  aria-hidden="true"
                >
                  {NODE_TYPE_META[node.type].icon}
                </span>
                <span className="cb-gtree__member-title">{node.title}</span>
                <span className="cb-gtree__member-type">{NODE_TYPE_META[node.type].label}</span>
              </button>
            </li>
          ))}
          {children.map((child) => (
            <GroupRow key={child.id} group={child} depth={depth + 1} />
          ))}
          {members.length === 0 && children.length === 0 ? (
            <li>
              <p className="cb-gtree__empty" style={{ paddingLeft: 20 + depth * 12 }}>
                空组：把实体拖进组框即可加入
              </p>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export function GroupTree() {
  const doc = useDocStore((s) => s.doc);
  const roots = doc.groups.filter((group) => !group.parentId);

  if (roots.length === 0) {
    return <p className="cb-panel__note">还没有分组。先「新建矩形组」或「圈选成组」，之后这里会出现整棵组树。</p>;
  }

  return (
    <div className="cb-gtree">
      <div className="cb-gtree__head">
        分组总览 · {doc.groups.length} 组 / {doc.nodes.length} 个实体
      </div>
      <ul className="cb-gtree__root">
        {roots.map((group) => (
          <GroupRow key={group.id} group={group} depth={0} />
        ))}
      </ul>
    </div>
  );
}
