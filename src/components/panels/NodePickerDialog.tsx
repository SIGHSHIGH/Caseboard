import { useEffect, useMemo, useState } from 'react';
import { addNodesToGroup } from '../../commands';
import { NODE_TYPE_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

/**
 * 「挑实体加入组框」对话框（H5.3）。
 *
 * 需求：组框的对象总览与分组总览都要能直接选节点加入，不必靠拖动。
 * 入口：右栏分组表单的「选择实体加入…」、左栏分组总览每行的「＋」。
 * 走 Command（addNodesToGroup），加入后卡片会被摆进框内并自动撑开组框。
 */
export function NodePickerDialog() {
  const pick = useUiStore((s) => s.nodePick);
  const consume = useUiStore((s) => s.consumeNodePick);
  const pushNotice = useUiStore((s) => s.pushNotice);
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const [checked, setChecked] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');

  const group = pick ? doc.groups.find((item) => item.id === pick.groupId) ?? null : null;

  useEffect(() => {
    if (pick) {
      setChecked([]);
      setKeyword('');
    }
  }, [pick]);

  const candidates = useMemo(() => {
    if (!group) return [];
    const inside = new Set(
      doc.nodes.filter((node) => node.groupId === group.id).map((node) => node.id),
    );
    const text = keyword.trim();
    return doc.nodes
      .filter((node) => !inside.has(node.id) && node.type !== 'clusterPin')
      .filter((node) => (text.length === 0 ? true : node.title.includes(text)))
      .slice(0, 200);
  }, [doc.nodes, group, keyword]);

  if (!pick || !group) return null;

  const close = () => {
    consume();
    setChecked([]);
  };

  const toggle = (id: string) => {
    setChecked((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));
  };

  const confirm = () => {
    if (checked.length === 0) {
      close();
      return;
    }
    dispatch(addNodesToGroup(checked, group.id));
    pushNotice(`已把 ${checked.length} 个实体收进「${group.title}」`);
    close();
  };

  return (
    <div className="cb-modal__mask" onClick={close}>
      <div className="cb-modal cb-group-pick" onClick={(event) => event.stopPropagation()}>
        <div className="cb-modal__head">
          <h2>加入组框 · {group.title}</h2>
          <button type="button" className="cb-modal__close" onClick={close} aria-label="关闭">
            ·
          </button>
        </div>
        <p className="cb-form__subtle">
          勾选要收进这个组框的实体；勾好后它们会按顺序排进框内，组框自动撑大。
        </p>
        <input
          className="cb-input"
          placeholder="按标题筛选…"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {candidates.length === 0 ? (
          <p className="cb-form__subtle">没有可加入的实体：组框外的实体都已经在这个组里了。</p>
        ) : (
          <ul className="cb-group-pick__list">
            {candidates.map((node) => (
              <li key={node.id}>
                <label className="cb-group-pick__item">
                  <input
                    type="checkbox"
                    checked={checked.includes(node.id)}
                    onChange={() => toggle(node.id)}
                  />
                  <span
                    className="cb-group-pick__dot"
                    style={{ background: NODE_TYPE_META[node.type].color }}
                    aria-hidden="true"
                  >
                    {NODE_TYPE_META[node.type].icon}
                  </span>
                  <span className="cb-group-pick__title">{node.title}</span>
                  <span className="cb-group-pick__type">{NODE_TYPE_META[node.type].label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="cb-modal__foot">
          <button type="button" className="cb-btn cb-btn--ghost" onClick={close}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={confirm} disabled={checked.length === 0}>
            加入 {checked.length} 个实体
          </button>
        </div>
      </div>
    </div>
  );
}
