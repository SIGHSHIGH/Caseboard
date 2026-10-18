import { useEffect, useMemo, useState } from 'react';
import { presentationDeck } from '../../lib/present';
import { LINE_STYLE_META, NODE_TYPE_META, STATUS_META, relLabel } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { useViewModeStore } from '../../store/viewModeStore';

function fieldRows(fields: Record<string, string | number | boolean>): Array<[string, string]> {
  return Object.entries(fields)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]);
}

/** 演示视图：按固定讲解顺序逐项过实体与关联（M5-5） */
export function PresentationView() {
  const doc = useDocStore((s) => s.doc);
  const selectNode = useUiStore((s) => s.selectNode);
  const setMode = useViewModeStore((s) => s.setMode);
  const deck = useMemo(() => presentationDeck(doc), [doc]);
  const [index, setIndex] = useState(0);

  // 文档变短（删实体 / 换案件）时把游标夹回范围内
  useEffect(() => {
    if (deck.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    if (index > deck.length - 1) setIndex(deck.length - 1);
  }, [deck.length, index]);

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), Math.max(deck.length - 1, 0)));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        setIndex((current) => Math.min(current + 1, Math.max(deck.length - 1, 0)));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((current) => Math.max(current - 1, 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deck.length]);

  if (deck.length === 0) {
    return (
      <div className="cb-present cb-present--empty">
        <strong>演示</strong>
        <p>画布上还没有实体，先在画布上建一个再回来。</p>
      </div>
    );
  }

  const slide = deck[Math.min(index, deck.length - 1)];
  const meta = NODE_TYPE_META[slide.node.type];
  const status = STATUS_META[slide.node.status];
  const fields = fieldRows(slide.node.fields);

  return (
    <div className="cb-present">
      <div className="cb-present__head">
        <strong>演示</strong>
        <span className="cb-present__hint">按 ← → 或点击按钮逐项讲解；最后一屏是全部关联关系</span>
        <span className="cb-present__progress">
          第 {index + 1} / {deck.length} 个实体
        </span>
      </div>

      <article className="cb-present__card" style={{ borderTopColor: meta.color }}>
        <div className="cb-present__type" style={{ color: meta.color }}>
          {meta.icon} {meta.label}
        </div>
        <h2 className="cb-present__title">{slide.node.title}</h2>
        <div className="cb-present__badges">
          <span className="cb-present__badge" style={{ borderColor: status.color, color: status.color }}>
            {status.label}
          </span>
          <span className="cb-present__badge">置信度 {slide.node.confidence}</span>
          {slide.node.aliases?.length ? <span className="cb-present__badge">别名 {slide.node.aliases.join(' / ')}</span> : null}
          {slide.node.tags.map((tag) => (
            <span key={tag} className="cb-present__badge">
              #{tag}
            </span>
          ))}
        </div>

        {fields.length > 0 ? (
          <dl className="cb-present__fields">
            {fields.map(([key, value]) => (
              <div key={key} className="cb-present__field">
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {slide.node.notes ? <p className="cb-present__notes">{slide.node.notes}</p> : null}

        <div className="cb-present__related">
          <div className="cb-present__related-head">关联关系 {slide.related.length} 条</div>
          {slide.related.length === 0 ? (
            <p className="cb-present__hint">这个实体还没有连线。</p>
          ) : (
            <ul className="cb-present__related-list">
              {slide.related.map((item) => (
                <li key={item.edge.id} className="cb-present__related-item">
                  <span className="cb-present__arrow">{item.direction === 'out' ? '→' : item.direction === 'in' ? '←' : '↔'}</span>
                  <span className="cb-present__other">{item.other.title}</span>
                  <span className="cb-present__rel">
                    {item.edge.label || relLabel(item.edge.relType)}
                  </span>
                  <span className="cb-present__style" title={LINE_STYLE_META[item.edge.style].meaning}>
                    {LINE_STYLE_META[item.edge.style].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      <div className="cb-present__bar">
        <button type="button" className="cb-btn" onClick={() => go(index - 1)} disabled={index === 0}>
          ← 上一个
        </button>
        <button
          type="button"
          className="cb-btn"
          onClick={() => {
            selectNode(slide.node.id);
            setMode('board');
          }}
          title="回到画布并选中这个实体"
        >
          在画布中查看
        </button>
        <button type="button" className="cb-btn cb-btn--primary" onClick={() => go(index + 1)} disabled={index === deck.length - 1}>
          下一个 →
        </button>
      </div>
    </div>
  );
}
