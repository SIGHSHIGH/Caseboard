import { useMemo } from 'react';
import {
  CENTRALITY_OPTIONS,
  formatCentralityScore,
  topCentrality,
  type CentralityMetric,
} from '../../lib/analysis';
import { NODE_TYPE_META } from '../../lib/theme';
import { useAnalysisStore } from '../../store/analysisStore';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

/** 左栏「分析 → 路径」：两点间最短路径 / 全部简单路径 + 中心度热力（M5-3） */
export function PathPanel() {
  const doc = useDocStore((s) => s.doc);
  const pathFrom = useAnalysisStore((s) => s.pathFrom);
  const pathTo = useAnalysisStore((s) => s.pathTo);
  const result = useAnalysisStore((s) => s.result);
  const activePath = useAnalysisStore((s) => s.activePath);
  const centrality = useAnalysisStore((s) => s.centrality);
  const setEndpoint = useAnalysisStore((s) => s.setEndpoint);
  const analyze = useAnalysisStore((s) => s.analyze);
  const setActivePath = useAnalysisStore((s) => s.setActivePath);
  const setCentrality = useAnalysisStore((s) => s.setCentrality);
  const clearPath = useAnalysisStore((s) => s.clearPath);
  const selectNode = useUiStore((s) => s.selectNode);
  const focusEntity = useUiStore((s) => s.focusEntity);

  const titles = useMemo(() => new Map(doc.nodes.map((node) => [node.id, node.title])), [doc.nodes]);
  const top = useMemo(() => topCentrality(doc, centrality, 6), [doc, centrality]);
  const metric = centrality as CentralityMetric;

  const labelOf = (id: string): string => titles.get(id) ?? id;
  const canAnalyze = pathFrom !== '' && pathTo !== '' && pathFrom !== pathTo;

  return (
    <div className="cb-path">
      <section className="cb-filter__section">
        <h3 className="cb-filter__title">两点之间</h3>
        <div className="cb-path__endpoints">
          <label className="cb-path__field">
            <span>起点</span>
            <select className="cb-input" value={pathFrom} onChange={(event) => setEndpoint('from', event.target.value)}>
              <option value="">选择实体…</option>
              {doc.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {NODE_TYPE_META[node.type].label} · {node.title}
                </option>
              ))}
            </select>
          </label>
          <label className="cb-path__field">
            <span>终点</span>
            <select className="cb-input" value={pathTo} onChange={(event) => setEndpoint('to', event.target.value)}>
              <option value="">选择实体…</option>
              {doc.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {NODE_TYPE_META[node.type].label} · {node.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cb-filter__row">
          <button type="button" className="cb-btn cb-btn--primary" disabled={!canAnalyze} onClick={() => analyze(doc)}>
            计算路径
          </button>
          <button type="button" className="cb-btn" disabled={!result} onClick={clearPath}>
            清除
          </button>
        </div>
        <p className="cb-filter__hint">路径会高亮到画布上；虚线 / 点线说明这段关系本身还没被证实。</p>
      </section>

      {result ? (
        result.found ? (
          <section className="cb-filter__section">
            <h3 className="cb-filter__title">
              结果 <span className="cb-filter__value">{result.paths.length} 条</span>
            </h3>
            <p className="cb-path__shortest">
              最短 {result.shortest ? result.shortest.nodes.length - 1 : 0} 跳：
              <strong>{result.shortest ? result.shortest.nodes.map(labelOf).join(' → ') : '—'}</strong>
            </p>
            <div className="cb-chips">
              <button
                type="button"
                className={activePath === -1 ? 'cb-chip is-active' : 'cb-chip'}
                onClick={() => setActivePath(-1)}
              >
                全部路径
              </button>
              {result.paths.slice(0, 12).map((path, index) => (
                <button
                  key={path.nodes.join('>') + index}
                  type="button"
                  className={activePath === index ? 'cb-chip is-active' : 'cb-chip'}
                  onClick={() => setActivePath(index)}
                  title={path.edges.join('、')}
                >
                  {index + 1}. {path.nodes.length - 1} 跳
                </button>
              ))}
            </div>
            <ul className="cb-path__list">
              {result.paths.slice(0, 6).map((path, index) => (
                <li key={path.nodes.join('>') + index} className={activePath === index || activePath === -1 ? 'cb-path__item is-active' : 'cb-path__item'}>
                  <button type="button" onClick={() => setActivePath(index)}>
                    {path.nodes.map(labelOf).join(' → ')}
                  </button>
                </li>
              ))}
            </ul>
            {result.truncated ? <p className="cb-filter__hint">只列出前 12 条；路径过多时请增加条件或缩小范围。</p> : null}
          </section>
        ) : (
          <p className="cb-filter__empty">两点之间没有可达路径（可能处在不同的连通分量）。</p>
        )
      ) : null}

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">中心度热力</h3>
        <div className="cb-chips">
          {CENTRALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              className={centrality === option.id ? 'cb-chip is-active' : 'cb-chip'}
              onClick={() => setCentrality(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {metric === 'off' ? (
          <p className="cb-filter__hint">颜色越深，越处在关系网络的关键位置。</p>
        ) : (
          <ol className="cb-path__ranks">
            {top.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="cb-path__rank"
                  onClick={() => {
                    selectNode(entry.id);
                    focusEntity(entry.id, 'node');
                  }}
                  title="在画布上定位"
                >
                  <span className="cb-path__rank-no">{index + 1}</span>
                  <span className="cb-path__rank-name">{labelOf(entry.id)}</span>
                  <span className="cb-path__rank-score">{formatCentralityScore(entry.score, metric)}</span>
                  <span className="cb-path__rank-bar" style={{ width: Math.max(6, (top[0]?.score ? entry.score / top[0].score : 0) * 100) + '%' }} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
