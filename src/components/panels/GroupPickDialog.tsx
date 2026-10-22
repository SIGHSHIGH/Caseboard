import { useMemo } from 'react';
import { addNodesToGroup } from '../../commands';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

/**
 * 「把选中的卡片收进哪个组框」（H5-6）。
 *
 * 触屏上长按多选几张卡片后，右栏会出现「加入组框…」按钮，点它弹出本对话框。
 * 只列已经有成员的组框和空组框都可以选；选中后由 `addNodesToGroup` 负责把卡片摆进框里并撑开组框。
 */
export function GroupPickDialog() {
  const doc = useDocStore((state) => state.doc);
  const dispatch = useDocStore((state) => state.dispatch);
  const groupPick = useUiStore((state) => state.groupPick);
  const consumeGroupPick = useUiStore((state) => state.consumeGroupPick);
  const selectGroup = useUiStore((state) => state.selectGroup);
  const exitMultiSelect = useUiStore((state) => state.exitMultiSelect);
  const pushNotice = useUiStore((state) => state.pushNotice);

  const memberCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of doc.nodes) {
      if (!node.groupId) continue;
      counts[node.groupId] = (counts[node.groupId] ?? 0) + 1;
    }
    return counts;
  }, [doc.nodes]);

  if (!groupPick) return null;

  const count = groupPick.nodeIds.length;

  const close = () => consumeGroupPick();

  const pick = (groupId: string, title: string) => {
    dispatch(addNodesToGroup(groupPick.nodeIds, groupId));
    selectGroup(groupId);
    exitMultiSelect();
    consumeGroupPick();
    pushNotice(`已把 ${count} 个卡片收进「${title}」`);
  };

  return (
    <div className="cb-modal__mask" onPointerDown={close}>
      <div
        className="cb-modal cb-group-pick"
        role="dialog"
        aria-label="选择组框"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="cb-modal__head">
          <h3>加入组框</h3>
          <button type="button" className="cb-icon-btn" onClick={close} aria-label="关闭">
            ·
          </button>
        </header>
        <p className="cb-form__subtle">
          把已选的 {count} 个卡片放进一个已有组框；卡片会按顺序排在框内，组框自动撑大。
        </p>
        {doc.groups.length === 0 ? (
          <p className="cb-panel__hint">还没有组框，先在左栏「分组」新建。</p>
        ) : (
          <ul className="cb-group-pick__list">
            {doc.groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  className="cb-group-pick__item"
                  onClick={() => pick(group.id, group.title)}
                >
                  <span className="cb-group-pick__swatch" style={{ background: group.color }} aria-hidden="true" />
                  <span className="cb-group-pick__title">{group.title}</span>
                  <span className="cb-group-pick__meta">
                    {memberCount[group.id] ?? 0} 个成员
                    {group.collapsed ? ' · 已折叠' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="cb-modal__foot">
          <button type="button" className="cb-btn cb-btn--ghost" onClick={close}>
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
