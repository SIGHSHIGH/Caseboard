/**
 * 顶栏按钮溢出（M14 / M8）：窗口变窄时按钮不再互相重叠，
 * 放不下的按钮收进右侧「⋯」菜单。这里只做纯计算，组件负责量宽度与渲染。
 */
export interface OverflowItem {
  key: string;
  width: number;
  /** 数字越小越优先保留在顶栏上 */
  priority: number;
}

export interface OverflowPlan {
  /** 留在顶栏上的按钮，保持原有顺序 */
  inline: string[];
  /** 收进「⋯」菜单的按钮，保持原有顺序 */
  overflow: string[];
  /** 顶栏实际占用的宽度（含间距与菜单按钮） */
  used: number;
}

export interface OverflowOptions {
  gap?: number;
  /** 「⋯」按钮自身的宽度，出现溢出时要给它留位 */
  menuWidth?: number;
}

/**
 * 中文按 13px、西文按 6.8px 估算标签宽度：用来给「还没量到真实宽度」的按钮兜底，
 * 也用于 jsdom 这类没有布局的环境。真实 DOM 里组件会用 offsetWidth 覆盖它。
 */
export function estimateLabelWidth(label: string): number {
  let width = 26; // 左右内边距 + 边框
  for (const char of label) {
    width += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 13 : 6.8;
  }
  return Math.round(width);
}

/**
 * 贪心：先假设全部放得下；放不下就按优先级从低到高逐个收进菜单，
 * 直到「剩余按钮 + 间距 + 菜单按钮」装得下为止。
 */
export function planTopbarOverflow(items: OverflowItem[], availWidth: number, options?: OverflowOptions): OverflowPlan {
  const gap = options?.gap ?? 6;
  const menuWidth = options?.menuWidth ?? 40;
  const safeItems = items.filter((item) => item.key.length > 0);
  const total = safeItems.reduce((sum, item) => sum + Math.max(0, item.width), 0) + gap * Math.max(0, safeItems.length - 1);
  if (!Number.isFinite(availWidth) || availWidth <= 0 || total <= availWidth) {
    return { inline: safeItems.map((item) => item.key), overflow: [], used: total };
  }

  // 要放「⋯」就得先给它让位
  const budget = Math.max(0, availWidth - menuWidth - gap);
  const byPriority = [...safeItems].sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  const inlineKeys = new Set<string>();
  let used = 0;
  for (const item of byPriority) {
    const cost = Math.max(0, item.width) + (inlineKeys.size > 0 ? gap : 0);
    if (used + cost > budget) continue;
    inlineKeys.add(item.key);
    used += cost;
  }

  const inline = safeItems.filter((item) => inlineKeys.has(item.key)).map((item) => item.key);
  const overflow = safeItems.filter((item) => !inlineKeys.has(item.key)).map((item) => item.key);
  const spaced = inline.length > 0 ? used : 0;
  return { inline, overflow, used: spaced + menuWidth + gap };
}
