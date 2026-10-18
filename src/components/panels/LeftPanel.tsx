import { useUiStore } from '../../store/uiStore';
import { NODE_TYPE_META } from '../../lib/theme';
import { NODE_TEMPLATES, NODE_TYPE_ORDER } from '../../lib/nodeTemplates';

/** M2-1 起开放全部 8 类节点；每类带模板说明，点一下就在画布中心落一个空节点。 */
export function LeftPanel() {
  const requestAdd = useUiStore((s) => s.requestAdd);

  return (
    <aside className="cb-panel cb-panel--left">
      <h2 className="cb-panel__title">节点类型</h2>
      <div className="cb-type-list">
        {NODE_TYPE_ORDER.map((type) => {
          const meta = NODE_TYPE_META[type];
          const template = NODE_TEMPLATES[type];
          return (
            <button
              key={type}
              type="button"
              className="cb-type-btn"
              onClick={() => requestAdd(type)}
              title={`新增${meta.label}节点｜${template.hint}`}
            >
              <span className="cb-type-btn__icon" style={{ background: meta.color }}>
                {meta.icon}
              </span>
              <span className="cb-type-btn__label">{meta.label}</span>
              <span className="cb-type-btn__hint">{template.fields.length} 项字段</span>
            </button>
          );
        })}
      </div>

      <div className="cb-panel__hint">
        <p>· 双击画布空白处：新增便签</p>
        <p>· 拖动节点四边圆点：拉出关系</p>
        <p>· 双击节点标题 / 关系标签：就地改名</p>
        <p>· 选中后按 Delete 删除</p>
        <p>· 右栏按类型给出专属字段模板</p>
      </div>
    </aside>
  );
}
