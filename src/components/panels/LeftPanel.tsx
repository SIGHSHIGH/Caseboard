import { useUiStore, type LeftTab } from '../../store/uiStore';
import { NODE_TYPE_META } from '../../lib/theme';
import { NODE_TEMPLATES, NODE_TYPE_ORDER } from '../../lib/nodeTemplates';
import { AssetLibrary } from './AssetLibrary';

const TABS: Array<{ id: LeftTab; label: string }> = [
  { id: 'nodes', label: '对象' },
  { id: 'assets', label: '素材' },
  { id: 'groups', label: '分组' },
];

/** 左栏：对象类型 / 素材库 / 分组 三个标签。点类型按钮就在画布中心落一个空节点。 */
export function LeftPanel() {
  const leftTab = useUiStore((s) => s.leftTab);
  const setLeftTab = useUiStore((s) => s.setLeftTab);
  const requestAdd = useUiStore((s) => s.requestAdd);
  const requestGroup = useUiStore((s) => s.requestGroup);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);

  return (
    <aside className="cb-panel cb-panel--left">
      <div className="cb-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={leftTab === tab.id}
            className={leftTab === tab.id ? 'cb-tab cb-tab--active' : 'cb-tab'}
            onClick={() => setLeftTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {leftTab === 'nodes' ? (
        <>
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
          <p className="cb-panel__note">右栏按类型给出专属字段模板，模板外的字段也可自行添加。</p>
        </>
      ) : null}

      {leftTab === 'assets' ? <AssetLibrary /> : null}

      {leftTab === 'groups' ? (
        <>
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
        </>
      ) : null}

      <div className="cb-panel__hint">
        <p>· 双击画布空白处：新增便签</p>
        <p>· 拖动节点四边圆点：拉出关系</p>
        <p>· 双击节点标题 / 关系标签：就地改名</p>
        <p>· 选中后按 Delete 删除</p>
        <p>· 图片可直接拖进画布，Ctrl+V 粘贴截图</p>
      </div>
    </aside>
  );
}
