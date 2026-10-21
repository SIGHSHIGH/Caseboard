import type { CaseDoc } from '../types';
import { createDemoDoc } from './demo';
import { createAbcDoc } from './demoAbc';

/**
 * 内置示例案卷（M16）。
 *
 * 选中后走 `replaceDocument`（会清空撤销历史），所以面板里必须先确认再载入。
 * 示例全是文字与坐标，不含图片素材：离线可用，也不牵扯真实人物。
 */
export interface DemoCase {
  id: string;
  title: string;
  caseNo: string;
  summary: string;
  /** 这个示例可以用来试哪些功能 */
  highlights: string[];
  build: () => CaseDoc;
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'fraud',
    title: '连环诈骗案（演示）',
    caseNo: 'A-2026-1018',
    summary: '本地三线诈骗：嫌疑人、空壳公司、银行流水与一处现场，演示数据补过坐标与标签。',
    highlights: ['基础画布与三种线型', '地图坐标', 'tag 自动连线候选', '时间线回退读「发生时刻」'],
    build: () => createDemoDoc(true),
  },
  {
    id: 'abc',
    title: 'ABC 谋杀案（示范案卷）',
    caseNo: 'ABC-1936',
    summary: '阿加莎·克里斯蒂《ABC 谋杀案》：23 个实体、20 条关系、3 个分组，含自定义证据链与双轨时间线。',
    highlights: ['八方向连线与自动换锚点', '假设并排比较（两条对立假设）', '自定义证据链六个阶段', '多轨时间线（凶案时间点 / 信件与物证）', '自动检验：结构、时间、坐标、线型语义'],
    build: createAbcDoc,
  },
];

export function findDemoCase(id: string): DemoCase | undefined {
  return DEMO_CASES.find((item) => item.id === id);
}
