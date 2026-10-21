import { useState } from 'react';
import { FilterPanel } from './FilterPanel';
import { LayoutPanel } from './LayoutPanel';
import { PathPanel } from './PathPanel';

type SubTab = 'filter' | 'path' | 'layout';

const SUB_TABS: Array<{ id: SubTab; label: string; hint: string }> = [
  { id: 'filter', label: '过滤与聚焦', hint: '按类型 / 状态 / 标签 / 时间收窄画布' },
  { id: 'path', label: '路径与中心度', hint: '找两点之间的最短与全部路径，看谁处在关键位置' },
  { id: 'layout', label: '自动布局', hint: '一键整理整板坐标，锁定选中项保持原位' },
];

/** 左栏「分析」页签的二级导航：过滤聚焦 / 路径中心度（M5-2、M5-3） */
export function AnalysisPanel() {
  const [tab, setTab] = useState<SubTab>('filter');
  return (
    <div className="cb-analysis">
      <div className="cb-subtabs" role="tablist">
        {SUB_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            title={item.hint}
            aria-selected={tab === item.id}
            className={tab === item.id ? 'cb-subtab is-active' : 'cb-subtab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'filter' ? <FilterPanel /> : tab === 'path' ? <PathPanel /> : <LayoutPanel />}
    </div>
  );
}
