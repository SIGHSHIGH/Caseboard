import { useEffect, useMemo, useState } from 'react';
import { addEdge, composeCommands } from '../../commands';
import { collectTags, tagLinkCandidates, tagLinkLabel } from '../../lib/tagLink';
import { useDocStore } from '../../store/docStore';
import { useTagLinkStore } from '../../store/tagLinkStore';

/**
 * M9 新增：「按 tag 自动连线」的人工确认面板。
 * 不做任何自动落库——先列出候选（共享 tag、且尚无关系），勾选后才压一条命令。
 * 候选关系一律 dotted + 低置信度（推测），符合 Gate 0-3 / 0-4。
 */
export function TagLinkDialog() {
  const open = useTagLinkStore((s) => s.open);
  const tags = useTagLinkStore((s) => s.tags);
  const closeDialog = useTagLinkStore((s) => s.closeDialog);
  const toggleTag = useTagLinkStore((s) => s.toggleTag);
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const [selected, setSelected] = useState<string[]>([]);

  const stats = useMemo(() => collectTags(doc), [doc]);
  // 一个标签都没勾时按「全部标签」计算候选（与面板里的提示文案一致），
  // 否则从无标签的实体点进来永远是空列表，看着像坏掉了。
  const candidates = useMemo(() => tagLinkCandidates(doc, tags.length > 0 ? tags : undefined), [doc, tags]);

  // 换 tag / 文档变化后候选会变，勾选状态回到「全选」
  useEffect(() => {
    setSelected(candidates.map((item) => item.id));
  }, [candidates]);

  if (!open) return null;

  const toggleCandidate = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const chosen = candidates.filter((item) => selected.includes(item.id));

  const confirm = () => {
    if (chosen.length === 0) {
      closeDialog();
      return;
    }
    dispatch(
      composeCommands(
        `按 tag 自动连线（${chosen.length} 条）`,
        chosen.map((item) =>
          addEdge({
            source: item.source,
            target: item.target,
            relType: 'related',
            label: tagLinkLabel(item.tag),
            directed: false,
            // 推测关系：点线 + 低置信度，绝不写成「已证实」
            style: 'dotted',
            confidence: 35,
          }),
        ),
      ),
    );
    closeDialog();
  };

  return (
    <div className="cb-modal__mask" role="dialog" aria-modal="true" aria-label="按 tag 自动连线">
      <div className="cb-modal cb-taglink">
        <div className="cb-modal__head">
          <h2>按 tag 自动连线</h2>
          <button type="button" className="cb-modal__icon" title="关闭" onClick={closeDialog}>
            ×
          </button>
        </div>

        <p className="cb-modal__hint">
          共享同一个标签、且彼此还没有关系的实体会列成候选。确认后新建的关系是
          <strong> 点线（待核实）</strong>，置信度 35，可随时在右栏改成实线或删除。
        </p>

        <div className="cb-taglink__body">
          <div className="cb-taglink__side">
            <h3 className="cb-form__subtitle">选择标签</h3>
            {stats.length === 0 ? (
              <p className="cb-form__subtle">还没有标签：先在右栏给实体加标签。</p>
            ) : (
              <ul className="cb-taglink__tags">
                {stats.map((item) => (
                  <li key={item.tag}>
                    <label className="cb-taglink__tag">
                      <input
                        type="checkbox"
                        checked={tags.includes(item.tag)}
                        onChange={() => toggleTag(item.tag)}
                      />
                      <span>{item.tag}</span>
                      <span className="cb-taglink__count">{item.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {tags.length > 0 ? (
              <p className="cb-form__subtle">已选 {tags.length} 个标签；不选则按全部标签计算。</p>
            ) : null}
          </div>

          <div className="cb-taglink__main">
            <h3 className="cb-form__subtitle">
              候选关系（{candidates.length}）
              {chosen.length > 0 ? <span className="cb-form__subtle"> · 将新建 {chosen.length} 条</span> : null}
            </h3>
            {candidates.length === 0 ? (
              <p className="cb-form__subtle">
                没有可连线的实体对：要么标签只出现在一个实体上，要么这些实体之间已经有关系了。
              </p>
            ) : (
              <>
                <div className="cb-taglink__ops">
                  <button type="button" className="cb-btn" onClick={() => setSelected(candidates.map((item) => item.id))}>
                    全选
                  </button>
                  <button type="button" className="cb-btn" onClick={() => setSelected([])}>
                    全不选
                  </button>
                </div>
                <ul className="cb-taglink__list">
                  {candidates.map((item) => (
                    <li key={item.id}>
                      <label className="cb-taglink__item">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggleCandidate(item.id)}
                        />
                        <span className="cb-taglink__pair">
                          {item.sourceTitle} — {item.targetTitle}
                        </span>
                        <span className="cb-taglink__tag-chip">{item.tag}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="cb-modal__actions">
          <button type="button" className="cb-btn" onClick={closeDialog}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={confirm} disabled={chosen.length === 0}>
            确认连线（{chosen.length}）
          </button>
        </div>
      </div>
    </div>
  );
}
