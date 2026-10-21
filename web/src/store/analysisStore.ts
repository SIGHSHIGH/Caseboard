import { create } from 'zustand';
import { analyzePaths, type CentralityMetric, type PathAnalysis } from '../lib/analysis';
import type { CaseDoc } from '../types';

/**
 * 分析高亮状态（M5-3）：路径与中心度。
 * 只影响画布渲染（高亮 / 热力），从不写进 doc，因此可以随意切换而不产生撤销记录。
 */
interface AnalysisStore {
  pathFrom: string;
  pathTo: string;
  result: PathAnalysis | null;
  /** 当前高亮的路径序号：0 = 最短路径，-1 = 全部路径 */
  activePath: number;
  centrality: CentralityMetric;
  setEndpoint: (side: 'from' | 'to', id: string) => void;
  analyze: (doc: CaseDoc) => void;
  setActivePath: (index: number) => void;
  setCentrality: (metric: CentralityMetric) => void;
  clearPath: () => void;
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  pathFrom: '',
  pathTo: '',
  result: null,
  activePath: 0,
  centrality: 'off',
  setEndpoint: (side, id) =>
    set((state) => ({
      pathFrom: side === 'from' ? id : state.pathFrom,
      pathTo: side === 'to' ? id : state.pathTo,
      result: null,
    })),
  analyze: (doc) => {
    const { pathFrom, pathTo } = get();
    const result = analyzePaths(doc, pathFrom, pathTo);
    set({ result, activePath: result.found ? 0 : -1 });
  },
  setActivePath: (activePath) => set({ activePath }),
  setCentrality: (centrality) => set({ centrality }),
  clearPath: () => set({ pathFrom: '', pathTo: '', result: null, activePath: -1 }),
}));
