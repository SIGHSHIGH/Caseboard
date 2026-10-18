import { useUiStore } from '../../store/uiStore';
import { NODE_TYPE_META } from '../../lib/theme';
import { NODE_TEMPLATES, NODE_TYPE_ORDER } from '../../lib/nodeTemplates';

/** M2-1 起开放全部 8 类节点；M2-2 增加分组入口。点一下就在画布中心落一个空节点。 */
export function LeftPanel() {
  const requestAdd = useUiStore((s) => s.requestAdd);
  const requestGroup = useUiStore((s) => s.requestGroup);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);

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

      <h2 className="cb-panel__title">分组</h2>
      <div className="cb-group-actions">
        <button type="button" className="cb-btn" onClick={() => requestGroup('rect')}>
          新建矩形组
        </button>
        <button
          type="button"
          className={mode === 'lasso' ? 'cb-btn cb-btn--active' : 'cb-btn'}
          onClick={() => (mode === 'lasso' ? setMode('select') : requestGroup('lasso'))}
        >
          {mode === 'lasso' ? '结束圈选' : '圈选成组'}
        </button>
      </div>
      {mode === 'lasso' ? (
        <p className="cb-panel__note">圈选中：在画布拖框选择对象，Esc 取消</p>
      ) : (
        <p className="cb-panel__note">拖标题栏移动整组，右下角调整大小，折叠后变成超级节点</p>
      )}

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
