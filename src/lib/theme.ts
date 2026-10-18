import type { LineStyle, NodeType, Status } from '../types';

/** 主色：中性深灰 + 证据红（规格 P1 验收项） */
export const COLORS = {
  bg: '#F5F3EF',
  panel: '#FBFAF7',
  panelBorder: '#E2DED5',
  text: '#2B2B2B',
  textMuted: '#6E6862',
  accent: '#C0392B',
  accentSoft: 'rgba(192, 57, 43, 0.08)',
  canvasDot: '#D9D4CA',
  cardBg: '#FFFFFF',
  cardBorder: '#E2DED5',
  selected: '#C0392B',
};

/** #RRGGBB → rgba()：分组底色与标题栏整块用同一主色，只调透明度 */
export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return `rgba(110, 104, 98, ${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const NODE_TYPE_META: Record<NodeType, { label: string; color: string; icon: string }> = {
  person: { label: '人物', color: '#C0392B', icon: '👤' },
  org: { label: '组织', color: '#7B5B3A', icon: '🏛' },
  place: { label: '地点', color: '#2E7D64', icon: '📍' },
  item: { label: '物品', color: '#8C7A2E', icon: '📦' },
  event: { label: '事件', color: '#B5651D', icon: '🗓' },
  evidence: { label: '证据', color: '#4A5568', icon: '📄' },
  time: { label: '时间', color: '#5F6B7A', icon: '⏱' },
  note: { label: '便签', color: '#C8A02C', icon: '📝' },
};

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  todo: { label: '待查', color: '#8A857E' },
  checking: { label: '核查中', color: '#B5651D' },
  confirmed: { label: '已证实', color: '#2E7D64' },
  ruledout: { label: '已排除', color: '#9A948C' },
};

/** 线型语义固定，不可被 UI 绕过（Gate 0-4） */
export const LINE_STYLE_META: Record<LineStyle, { label: string; dash?: string; meaning: string }> = {
  solid: { label: '实线', meaning: '已证实' },
  dashed: { label: '虚线', dash: '9 6', meaning: '推测' },
  dotted: { label: '点线', dash: '2 5', meaning: '待核实' },
};

export const REL_COLORS: Record<string, string> = {
  transfer: '#C0392B',
  call: '#2E6DA4',
  message: '#2E6DA4',
  relative: '#8E44AD',
  know: '#8E44AD',
  cooperate: '#D35400',
  default: '#6E6862',
};

export function relColor(relType: string): string {
  return REL_COLORS[relType] ?? REL_COLORS.default;
}

export interface RelPreset {
  value: string;
  label: string;
}

export const REL_PRESETS: RelPreset[] = [
  { value: 'transfer', label: '资金往来' },
  { value: 'call', label: '通讯' },
  { value: 'message', label: '信息' },
  { value: 'cooperate', label: '合作 / 同伙' },
  { value: 'relative', label: '亲属' },
  { value: 'know', label: '认识' },
  { value: 'employ', label: '供职' },
  { value: 'place', label: '场所' },
  { value: 'other', label: '其他' },
];

export function relLabel(relType: string): string {
  return REL_PRESETS.find((preset) => preset.value === relType)?.label ?? relType;
}
