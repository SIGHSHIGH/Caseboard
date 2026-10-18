import { useUiStore } from '../../store/uiStore';
import { NODE_TYPE_META } from '../../lib/theme';
import type { NodeType } from '../../types';

/** M1 只开放规格要求的最小类型集；其余类型（org/place/item/time）M2 随模板开放。 */
const M1_TYPES: NodeType[] = ['person', 'event', 'evidence', 'note'];

export function LeftPanel() {
  const requestAdd = useUiStore((s) => s.requestAdd);

  return (
    <aside className="cb-panel cb-panel--left">
      <h2 className="cb-panel__title">节点类型</h2>
      <div className="cb-type-list">
        {M1_TYPES.map((type) => {
          const meta = NODE_TYPE_META[type];
          return (
            <button
              key={type}
              type="button"
              className="cb-type-btn"
              onClick={() => requestAdd(type)}
              title={`新增${meta.label}节点`}
            >
              <span className="cb-type-btn__icon" style={{ background: meta.color }}>
                {meta.icon}
              </span>
              <span className="cb-type-btn__label">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="cb-panel__hint">
        <p>· 双击画布空白处：新增便签</p>
        <p>· 拖动节点四边圆点：拉出关系</p>
        <p>· 双击节点标题 / 关系标签：就地改名</p>
        <p>· 选中后按 Delete 删除</p>
      </div>
    </aside>
  );
}
