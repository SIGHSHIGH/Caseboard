/**
 * 示例案卷面板（M16）：把内置示例当作「带内容的模板」载入。
 *
 * 载入走 `replaceDocument`，会清空撤销历史，所以这里先弹一次确认再落库；
 * 面板本身只读 `demos.ts`，不做任何渲染期的数据构造。
 */
import { replaceDocument } from '../../commands';
import { DEMO_CASES } from '../../data/demos';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { useViewModeStore } from '../../store/viewModeStore';

interface DemoDialogProps {
  onClose: () => void;
}

export function DemoDialog({ onClose }: DemoDialogProps) {
  const dispatch = useDocStore((state) => state.dispatch);
  const clearSelection = useUiStore((state) => state.clearSelection);
  const setViewMode = useViewModeStore((state) => state.setMode);

  const load = (id: string) => {
    const demo = DEMO_CASES.find((item) => item.id === id);
    if (!demo) return;
    const ok = window.confirm(
      '载入示例会替换当前案卷，并清空撤销历史。\n\n如果当前内容还要用，请先「保存项目」。\n\n继续载入「' +
        demo.title +
        '」？',
    );
    if (!ok) return;
    dispatch(replaceDocument(demo.build()));
    clearSelection();
    setViewMode('board');
    onClose();
  };

  return (
    <div
      className="cb-modal__mask"
      role="dialog"
      aria-modal="true"
      aria-label="示例案卷"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cb-modal cb-demo">
        <header className="cb-modal__head">
          <h2>示例案卷</h2>
          <button type="button" className="cb-modal__icon" onClick={onClose} title="关闭">
            ×
          </button>
        </header>
        <p className="cb-modal__hint">
          示例只是「填好内容的案卷」，载入后可以用全部功能继续改：画布、代码视图、时间线、地图、假设与自动检验。
        </p>
        <ul className="cb-demo__list">
          {DEMO_CASES.map((demo) => (
            <li key={demo.id} className="cb-demo__item">
              <div className="cb-demo__head">
                <strong className="cb-demo__title">{demo.title}</strong>
                <span className="cb-demo__no">{demo.caseNo}</span>
              </div>
              <p className="cb-demo__summary">{demo.summary}</p>
              <div className="cb-demo__tags">
                {demo.highlights.map((text) => (
                  <span key={text} className="cb-demo__tag">
                    {text}
                  </span>
                ))}
              </div>
              <div className="cb-demo__ops">
                <button type="button" className="cb-btn cb-btn--primary" onClick={() => load(demo.id)}>
                  载入这份案卷
                </button>
              </div>
            </li>
          ))}
        </ul>
        <footer className="cb-modal__actions">
          <button type="button" className="cb-btn cb-btn--ghost" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
