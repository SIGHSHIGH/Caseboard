/**
 * 假设面板（M7-1 / M7-2）：多假设并排比较 + 证据链六阶段 + 区域锚点。
 *
 * 设计要点：
 * - 假设与立场全部走 hypothesisCommands（唯一写入口，可撤销）；
 * - 支持度由 src/lib/hypothesis.ts 纯函数计算，界面只展示，不自行加权；
 * - 反驳按 REFUTE_WEIGHT 折价，避免「互相指责」把分数推高；
 * - 区域锚点只读，点击后跳到素材库并聚焦对应的框。
 */
import { useMemo, useState } from 'react';
import { addHypothesis, clearStance, deleteHypothesis, setStance } from '../../commands';
import { annotationsForNode } from '../../lib/annotation';
import { buildEvidenceChain } from '../../lib/evidenceChain';
import { STANCE_META, compareHypotheses, rankHypotheses, targetLabel } from '../../lib/hypothesis';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { EvidenceStance } from '../../types';

interface HypothesisPanelProps {
  onClose: () => void;
}

type Tab = 'compare' | 'chain';

const STANCES: EvidenceStance[] = ['support', 'refute'];

function scoreText(score: number): string {
  return (score > 0 ? '+' : '') + score;
}

function timeText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function HypothesisPanel({ onClose }: HypothesisPanelProps) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const setAnchorFocus = useUiStore((s) => s.setAnchorFocus);
  const selectAsset = useUiStore((s) => s.selectAsset);
  const setLeftTab = useUiStore((s) => s.setLeftTab);
  const [tab, setTab] = useState<Tab>('compare');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [activeId, setActiveId] = useState<string | null>(doc.hypotheses[0]?.id ?? null);
  const [error, setError] = useState('');

  const ranking = useMemo(() => rankHypotheses(doc), [doc]);
  const comparison = useMemo(() => compareHypotheses(doc), [doc]);
  const chain = useMemo(() => buildEvidenceChain(doc), [doc]);
  const anchors = useMemo(
    () => (selectedNodeId ? annotationsForNode(doc, selectedNodeId) : []),
    [doc, selectedNodeId],
  );

  const target = selectedNodeId
    ? { id: selectedNodeId, kind: 'node' as const }
    : selectedEdgeId
      ? { id: selectedEdgeId, kind: 'edge' as const }
      : selectedAssetId
        ? { id: selectedAssetId, kind: 'asset' as const }
        : null;
  const targetName = target ? targetLabel(doc, target.id, target.kind) : '';
  const active = doc.hypotheses.find((item) => item.id === activeId) ?? doc.hypotheses[0] ?? null;

  const run = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  };

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('请先给假设起一个标题');
      return;
    }
    run(() => {
      const created = addHypothesis({ title: trimmed, createdAt: new Date().toISOString() });
      dispatch(created);
      setTitle('');
    });
  };

  const mark = (stance: EvidenceStance) => {
    if (!target || !active) return;
    run(() =>
      dispatch(
        setStance({
          hypothesisId: active.id,
          targetId: target.id,
          targetKind: target.kind,
          stance,
          note: note.trim() || undefined,
        }),
      ),
    );
    setNote('');
  };

  const unmark = () => {
    if (!target || !active) return;
    run(() => dispatch(clearStance(active.id, target.id, target.kind)));
  };

  const jumpToAnchor = (assetId: string, annotationId: string) => {
    selectAsset(assetId);
    setLeftTab('assets');
    setAnchorFocus({ assetId, annotationId });
  };

  return (
    <div className="cb-modal__mask" role="dialog" aria-modal="true" aria-label="假设与证据链">
      <div className="cb-modal cb-hyp">
      <div className="cb-hyp__head">
        <div>
          <h2>假设与证据链</h2>
          <p className="cb-hyp__sub">支持与反驳都作用在现有实体/关系/素材上；分差 = 支持权重 − 反驳权重 × 0.6。</p>
        </div>
        <div className="cb-hyp__tabs">
          <button type="button" className={'cb-btn' + (tab === 'compare' ? ' is-active' : '')} onClick={() => setTab('compare')}>
            并排比较（{doc.hypotheses.length}）
          </button>
          <button type="button" className={'cb-btn' + (tab === 'chain' ? ' is-active' : '')} onClick={() => setTab('chain')}>
            证据链（{chain.covered}/{chain.total}）
          </button>
        </div>
        <button type="button" className="cb-btn" onClick={onClose}>关闭</button>
      </div>

      {error ? <div className="cb-hyp__error">{error}</div> : null}

      {tab === 'compare' ? (
        <div className="cb-hyp__body">
          <section className="cb-hyp__side">
            <h3 className="cb-hyp__h3">假设排行</h3>
            <ul className="cb-hyp__list">
              {ranking.map(({ hypothesis: item, score }) => {
                return (
                  <li
                    key={item.id}
                    className={'cb-hyp__item' + (active && active.id === item.id ? ' is-active' : '')}
                    onClick={() => setActiveId(item.id)}
                  >
                    <div className="cb-hyp__item-head">
                      <strong>{item.title}</strong>
                      <span className={score.score >= 0 ? 'cb-hyp__score is-pos' : 'cb-hyp__score is-neg'}>{scoreText(score.score)}</span>
                    </div>
                    <div className="cb-hyp__bar">
                      <span style={{ width: Math.min(100, Math.abs(score.score)) + '%' }} />
                    </div>
                    <p className="cb-hyp__meta">
                      支持 {score.supportCount} · 反驳 {score.refuteCount} · {timeText(item.createdAt)}
                    </p>
                    <div className="cb-hyp__ops">
                      <button
                        type="button"
                        className="cb-btn cb-btn--tiny"
                        onClick={(event) => {
                          event.stopPropagation();
                          run(() => dispatch(deleteHypothesis(item.id)));
                        }}
                      >
                        删除假设
                      </button>
                    </div>
                  </li>
                );
              })}
              {ranking.length === 0 ? <li className="cb-hyp__empty">还没有假设。先写一个「谁主导」的问句，再用支持/反驳标注证据。</li> : null}
            </ul>
            <div className="cb-hyp__add">
              <input
                value={title}
                placeholder="例如：张建国主导了这起诈骗"
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleAdd();
                }}
              />
              <button type="button" className="cb-btn cb-btn--primary" onClick={handleAdd}>新增假设</button>
            </div>

            {active ? (
              <div className="cb-hyp__stance">
                <h3 className="cb-hyp__h3">给「{active.title}」标证据</h3>
                <p className="cb-hyp__target">
                  {target ? '当前选中：' + targetName : '先在画布上选中一个实体、关系或素材'}
                </p>
                <input
                  value={note}
                  placeholder="备注（可留空）：为什么它支持/反驳这个假设"
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="cb-hyp__stance-ops">
                  {STANCES.map((stance) => (
                    <button
                      key={stance}
                      type="button"
                      className="cb-btn"
                      style={{ borderColor: STANCE_META[stance].color, color: STANCE_META[stance].color }}
                      disabled={!target}
                      onClick={() => mark(stance)}
                    >
                      {stance === 'support' ? '＋ 支持' : '－ 反驳'}
                    </button>
                  ))}
                  <button type="button" className="cb-btn cb-btn--tiny" disabled={!target} onClick={unmark}>
                    清除标注
                  </button>
                </div>
                <ul className="cb-hyp__stances">
                  {active.stances.map((stance) => (
                    <li key={stance.targetKind + stance.targetId}>
                      <span style={{ color: STANCE_META[stance.stance].color }}>{STANCE_META[stance.stance].label}</span>
                      <span className="cb-hyp__stance-name">{targetLabel(doc, stance.targetId, stance.targetKind)}</span>
                      {stance.note ? <em className="cb-hyp__note">{stance.note}</em> : null}
                    </li>
                  ))}
                  {active.stances.length === 0 ? <li className="cb-hyp__empty">这条假设还没有任何证据。</li> : null}
                </ul>
              </div>
            ) : null}

            <div className="cb-hyp__anchors">
              <h3 className="cb-hyp__h3">区域锚点（{anchors.length}）</h3>
              {selectedNodeId ? (
                anchors.length > 0 ? (
                  <ul className="cb-hyp__anchor-list">
                    {anchors.map((anchor) => (
                      <li key={anchor.annotationId}>
                        <button type="button" className="cb-link" onClick={() => jumpToAnchor(anchor.assetId, anchor.annotationId)}>
                          {anchor.assetNo ?? anchor.assetName}
                          {anchor.text ? ' · ' + anchor.text : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cb-hyp__empty">这张图片里还没有绑定到该实体的框。在素材「标注」里画区域锚点即可绑定。</p>
                )
              ) : (
                <p className="cb-hyp__empty">选中一个实体后，这里列出它在照片里被框出的位置。</p>
              )}
            </div>
          </section>

          <section className="cb-hyp__main">
            <h3 className="cb-hyp__h3">并排比较</h3>
            {comparison.hypotheses.length === 0 ? (
              <p className="cb-hyp__empty">至少需要一条假设。</p>
            ) : (
              <table className="cb-hyp__table">
                <thead>
                  <tr>
                    <th>证据 / 主张</th>
                    {comparison.hypotheses.map((item) => (
                      <th key={item.id}>{item.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.targetKind + row.targetId} className={row.divergent ? 'is-divergent' : ''}>
                      <td>
                        {row.label}
                        {row.divergent ? <span className="cb-hyp__diff">分歧</span> : null}
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.hypothesisId}>
                          {cell.stance ? (
                            <span style={{ color: STANCE_META[cell.stance].color }}>
                              {cell.stance === 'support' ? '＋ 支持' : '－ 反驳'}
                            </span>
                          ) : (
                            <span className="cb-hyp__none">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="cb-hyp__meta">共 {comparison.rows.length} 条被标注过的证据，其中 {comparison.divergent.length} 条存在分歧。</p>
          </section>
        </div>
      ) : (
        <div className="cb-hyp__chain">
          <p className="cb-hyp__sub">
            动机 → 预谋 → 准备 → 实施 → 逃离 → 销赃。覆盖 {chain.covered}/{chain.total} 段，缺口：
            {chain.gaps.length > 0 ? chain.gaps.map((gap) => chain.stages.find((stage) => stage.id === gap)?.label).join('、') : '无'}
          </p>
          <ol className="cb-hyp__stages">
            {chain.stages.map((stage) => (
              <li key={stage.id} className={'cb-hyp__stage' + (stage.missing ? ' is-missing' : '')}>
                <div className="cb-hyp__stage-head">
                  <strong>{stage.label}</strong>
                  <span className={stage.missing ? 'cb-hyp__badge is-missing' : 'cb-hyp__badge'}>
                    {stage.missing ? '断点' : stage.items.length + ' 项'}
                  </span>
                </div>
                <p className="cb-hyp__meta">{stage.hint}</p>
                <ul>
                  {stage.items.map((item) => (
                    <li key={item.nodeId}>
                      {item.title}
                      {item.weak ? <span className="cb-hyp__weak">待核实</span> : null}
                      {item.evidenceIds.length > 0 ? (
                        <span className="cb-hyp__evidence">证据 {item.evidenceIds.length}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
      </div>
    </div>
  );
}
