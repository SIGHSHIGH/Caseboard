import { useMemo, useState } from 'react';
import { applyLayout, optimizeEdgeGeometry } from '../../commands';
import { computeLayout, type LayoutKind } from '../../lib/layout';
import { detectEdgeConflicts } from '../../lib/edgeOptimize';
import { useDocStore } from '../../store/docStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useUiStore } from '../../store/uiStore';

const KINDS: Array<{ id: LayoutKind; label: string; hint: string }> = [
  { id: 'force', label: '力导向', hint: '关系越近越聚在一起，适合看团伙结构' },
  { id: 'hierarchical', label: '分层', hint: '按关系方向从左到右分层（也写作「层级」），适合看资金与指令流向' },
  { id: 'radial', label: '径向', hint: '以关键人物为中心向外扩散，适合看辐射范围' },
  { id: 'circle', label: '环形', hint: '均匀排成一圈，适合逐项核对' },
  { id: 'grid', label: '网格', hint: '整齐网格，适合整理素材与笔记' },
];

/** 左栏「分析 → 自动布局」：一键整理整板坐标（M5-4） */
export function LayoutPanel() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const undo = useDocStore((s) => s.undo);
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds);
  const kind = useLayoutStore((s) => s.kind);
  const lockSelected = useLayoutStore((s) => s.lockSelected);
  const status = useLayoutStore((s) => s.status);
  const setKind = useLayoutStore((s) => s.setKind);
  const setLockSelected = useLayoutStore((s) => s.setLockSelected);
  const setStatus = useLayoutStore((s) => s.setStatus);

  const lockedIds = useMemo(
    () => (lockSelected ? selectedNodeIds : []),
    [lockSelected, selectedNodeIds],
  );

  const run = () => {
    const result = computeLayout(doc, { kind, lockedIds });
    if (result.moved === 0) {
      setStatus('没有可移动的实体：要么都已经在目标位置，要么全部被锁定。');
      return;
    }
    dispatch(applyLayout(result));
    const parts = [`已整理 ${result.moved} 个实体`];
    if (result.separatePasses > 0) parts.push(`推开重叠 ${result.separatePasses} 轮`);
    if (result.groupClamped > 0) parts.push(`${result.groupClamped} 个回到组内`);
    parts.push('可 Ctrl+Z 一次还原');
    setStatus(parts.join(' · '));
  };

  const [edgeStatus, setEdgeStatus] = useState('');

  /** M18：只梳理关系线，不动坐标；一次操作压一条撤销记录 */
  const tidyEdges = () => {
    const before = detectEdgeConflicts(doc);
    if (doc.edges.length === 0) {
      setEdgeStatus('当前案卷还没有关系线。');
      return;
    }
    dispatch(optimizeEdgeGeometry());
    const after = detectEdgeConflicts(useDocStore.getState().doc);
    setEdgeStatus(
      `梳理完成：压卡 ${before.nodeHits} → ${after.nodeHits} 处 · 交叉 ${before.crossings} → ${after.crossings} 处。可 Ctrl+Z 一次还原。`,
    );
  };

  const checkEdges = () => {
    const report = detectEdgeConflicts(doc);
    if (report.nodeHits === 0 && report.crossings === 0) {
      setEdgeStatus('检测通过：没有线穿过卡片，也没有线互相交叉。');
      return;
    }
    setEdgeStatus(
      `检测到压卡 ${report.nodeHits} 处、交叉 ${report.crossings} 处（${report.nodeHitEdgeIds.length} 条线压到卡片），可点上面的按钮自动梳理。`,
    );
  };

  return (
    <div className="cb-layout">
      <div className="cb-filter__summary">
        <strong>{KINDS.find((item) => item.id === kind)?.label}</strong> 布局 · {doc.nodes.length} 个实体
        {lockedIds.length > 0 ? ` · 锁定 ${lockedIds.length}` : ''}
      </div>
      <div className="cb-chips" role="group" aria-label="布局类型">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.hint}
            className={kind === item.id ? 'cb-chip is-active' : 'cb-chip'}
            onClick={() => setKind(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="cb-filter__section">
        <label className="cb-filter__check">
          <input
            type="checkbox"
            checked={lockSelected}
            onChange={(event) => setLockSelected(event.target.checked)}
          />
          锁定选中的实体（{selectedNodeIds.length}）
        </label>
        <p className="cb-filter__hint">
          锁定后这些实体保持原位，只整理其余实体；组内成员会被夹回组框，不会跑出分组。
        </p>
        <div className="cb-filter__row">
          <button type="button" className="cb-btn cb-btn--primary" onClick={run}>
            应用布局
          </button>
          <button type="button" className="cb-btn" onClick={undo}>
            撤销上一次
          </button>
        </div>
        {status ? <p className="cb-filter__hint cb-layout__status">{status}</p> : null}
        <p className="cb-filter__hint">
          自动布局只改坐标，不改关系与属性；一次应用只压一条撤销记录。
        </p>
      </section>

      <section className="cb-filter__section">
        <h3 className="cb-filter__title">关系线自动梳理（M18）</h3>
        <p className="cb-filter__hint">
          只重排关系线：给每条线挑两端最合适的连接点（四边中点 + 四角，共 8 个），再挑一个不穿过卡片、少交叉的弧度。
          卡片坐标不动，钉住连接点的线（右栏关掉「受自动梳理影响」）也不会被改。
        </p>
        <div className="cb-filter__row">
          <button type="button" className="cb-btn" onClick={tidyEdges}>
            关系线单独自动调整
          </button>
          <button type="button" className="cb-btn" onClick={checkEdges}>
            检测交叉与压卡
          </button>
        </div>
        {edgeStatus ? <p className="cb-filter__hint cb-layout__status">{edgeStatus}</p> : null}
      </section>
    </div>
  );
}
