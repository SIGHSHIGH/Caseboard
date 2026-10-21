import { useMemo } from 'react';
import { applyView, collectTags, isEmptyFilter } from '../../lib/filter';
import { NODE_TYPE_META, REL_PRESETS, STATUS_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { useViewStore } from '../../store/viewStore';
import type { NodeType, Status } from '../../types';

const MODES: Array<{ id: 'dim' | 'show' | 'hide'; label: string; hint: string }> = [
  { id: 'dim', label: '淡化其余', hint: '命中项全亮，其余半透明（默认，保留上下文）' },
  { id: 'show', label: '只显示命中', hint: '隐藏所有不满足条件的内容' },
  { id: 'hide', label: '隐藏命中', hint: '用排除法看图：把满足条件的先藏起来' },
];

const NODE_TYPES: NodeType[] = ['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note', 'relation'];
const STATUSES: Status[] = ['todo', 'checking', 'confirmed', 'ruledout'];

/** 左栏「分析」页签：过滤条件 + 聚焦（M5-2）。命中数实时来自 src/lib/filter.ts */
export function FilterPanel() {
  const doc = useDocStore((s) => s.doc);
  const filter = useViewStore((s) => s.filter);
  const focus = useViewStore((s) => s.focus);
  const setFilter = useViewStore((s) => s.setFilter);
  const setMode = useViewStore((s) => s.setMode);
  const toggleNodeType = useViewStore((s) => s.toggleNodeType);
  const toggleStatus = useViewStore((s) => s.toggleStatus);
  const toggleTag = useViewStore((s) => s.toggleTag);
  const toggleRelType = useViewStore((s) => s.toggleRelType);
  const resetFilter = useViewStore((s) => s.resetFilter);
  const setFocus = useViewStore((s) => s.setFocus);
  const setFocusDepth = useViewStore((s) => s.setFocusDepth);
  const clearFocus = useViewStore((s) => s.clearFocus);
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds);

  const view = useMemo(() => applyView(doc, filter, focus), [doc, filter, focus]);
  const tags = useMemo(() => collectTags(doc), [doc]);
  const active = !isEmptyFilter(filter);
  const relTypesInDoc = useMemo(() => {
    const seen = new Set(doc.edges.map((edge) => edge.relType));
    const presets = REL_PRESETS.filter((preset) => seen.has(preset.value));
    const extra = Array.from(seen).filter((relType) => !presets.some((preset) => preset.value === relType)).sort();
    return [...presets.map((preset) => preset.value), ...extra];
  }, [doc.edges]);

  return (
    <div className="cb-filter">
      <div className="cb-filter__summary">
        <strong>
          命中 {view.filterActive || view.focusActive ? view.matchedNodes.size : doc.nodes.length} / {doc.nodes.length}
        </strong>{' '}
        个实体 · {view.visibleNodeCount} 个可见
        <span className="cb-filter__summary-sub">
          关系 {view.matchedEdges.size} / {doc.edges.length}
        </span>
      </div>
      <div className="cb-filter__modes" role="group" aria-label="过滤模式">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter.mode === item.id ? 'cb-filter__mode is-active' : 'cb-filter__mode'}
            title={item.hint}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">实体类型</h3>
        <div className="cb-chips">
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={filter.nodeTypes.includes(type) ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => toggleNodeType(type)}
            >
              {NODE_TYPE_META[type].label}
            </button>
          ))}
        </div>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">核查状态</h3>
        <div className="cb-chips">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={filter.statuses.includes(status) ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => toggleStatus(status)}
            >
              {STATUS_META[status].label}
            </button>
          ))}
        </div>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">关系类别</h3>
        <div className="cb-chips">
          {relTypesInDoc.length === 0 ? <span className="cb-filter__empty">当前没有关系</span> : null}
          {relTypesInDoc.map((relType) => (
            <button
              key={relType}
              type="button"
              className={filter.relTypes.includes(relType) ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => toggleRelType(relType)}
            >
              {REL_PRESETS.find((preset) => preset.value === relType)?.label ?? relType}
            </button>
          ))}
        </div>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">标签</h3>
        <div className="cb-chips">
          {tags.length === 0 ? <span className="cb-filter__empty">还没有标签</span> : null}
          {tags.map((item) => (
            <button
              key={item.tag}
              type="button"
              className={filter.tags.includes(item.tag) ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => toggleTag(item.tag)}
              title={'共 ' + item.count + ' 个实体使用'}
            >
              {item.tag}
              <span className="cb-chip__count">{item.count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">
          最低置信度 <span className="cb-filter__value">{filter.minConfidence}</span>
        </h3>
        <input
          className="cb-filter__range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={filter.minConfidence}
          onChange={(event) => setFilter({ minConfidence: Number(event.target.value) })}
          aria-label="最低置信度"
        />
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">时间窗</h3>
        <div className="cb-filter__row">
          <input
            className="cb-input"
            type="date"
            value={filter.timeFrom}
            onChange={(event) => setFilter({ timeFrom: event.target.value })}
            aria-label="起始时间"
          />
          <span className="cb-filter__dash">→</span>
          <input
            className="cb-input"
            type="date"
            value={filter.timeTo}
            onChange={(event) => setFilter({ timeTo: event.target.value })}
            aria-label="结束时间"
          />
        </div>
        <p className="cb-filter__hint">没有时间的实体在设置时间窗后会被排除；区间事件按重叠判断。</p>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">文本检索</h3>
        <input
          className="cb-input"
          type="search"
          value={filter.query}
          placeholder="标题 / 别名 / 标签 / 字段 / 备注"
          onChange={(event) => setFilter({ query: event.target.value })}
        />
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">聚焦</h3>
        {focus ? (
          <p className="cb-filter__focus">
            已聚焦 {focus.seeds.length} 个起点 · {focus.depth} 跳（{view.dimNodes.size} 项淡化）
          </p>
        ) : (
          <p className="cb-filter__focus">未聚焦；选实体后点下方按钮，只突出与它相关的部分。</p>
        )}
        <div className="cb-filter__row">
          <button
            type="button"
            className="cb-btn cb-btn--primary"
            disabled={selectedNodeIds.length === 0}
            onClick={() => setFocus(selectedNodeIds, focus?.depth ?? 1)}
            title={selectedNodeIds.length === 0 ? '先在画布上选中实体' : '聚焦到所选实体'}
          >
            聚焦所选（{selectedNodeIds.length}）
          </button>
          <button type="button" className="cb-btn" disabled={!focus} onClick={clearFocus}>
            退出聚焦
          </button>
        </div>
        <div className="cb-chips">
          {[1, 2, 3].map((depth) => (
            <button
              key={depth}
              type="button"
              className={(focus?.depth ?? 1) === depth ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => setFocusDepth(depth)}
              disabled={!focus}
            >
              {depth} 跳
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="cb-btn cb-filter__reset" disabled={!active && !focus} onClick={() => { resetFilter(); clearFocus(); }}>
        重置全部筛选与聚焦
      </button>
    </div>
  );
}
