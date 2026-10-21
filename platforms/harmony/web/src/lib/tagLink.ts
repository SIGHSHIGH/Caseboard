import type { CaseDoc } from '../types';

/**
 * M9 新增：「按 tag 自动连线」的候选推导。
 * 放在 src/lib 而不是组件里，因为 tsconfig.smoke.json 只编译 lib/types/commands/store，
 * 需要机器断言的逻辑必须在 lib 里（M8 的教训）。
 *
 * 语义约束（Gate 0-4）：tag 推断出来的关系是「推测」，所以命令层固定写 dotted + 低置信度，
 * 且必须先走人工确认面板，不允许直接改 Model。
 */
export interface TagLinkCandidate {
  /** 稳定 id：tag + 两端，便于确认面板做勾选状态 */
  id: string;
  tag: string;
  source: string;
  target: string;
  sourceTitle: string;
  targetTitle: string;
}

export interface TagStat {
  tag: string;
  count: number;
}

/** 单个候选的兜底上限，避免一个热门 tag 生成上千条边把画布拖垮 */
export const TAG_LINK_MAX = 200;

/** 全部 tag 及出现次数，按次数降序（同次数按中文序） */
export function collectTags(doc: CaseDoc): TagStat[] {
  const map = new Map<string, number>();
  for (const node of doc.nodes) {
    for (const raw of node.tags ?? []) {
      const tag = raw.trim();
      if (tag.length === 0) continue;
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

/**
 * 生成 tag 自动连线的候选：
 * - 只考虑指定 tag（不传则全部），出现次数 < 2 的 tag 直接跳过；
 * - 已经有关系（任意方向）的实体对跳过，避免重复连线；
 * - 同一对实体只出一条候选（共享多个 tag 时取字典序最小的 tag，避免多边叠加）。
 */
export function tagLinkCandidates(doc: CaseDoc, tags?: string[]): TagLinkCandidate[] {
  const wanted = tags && tags.length > 0 ? new Set(tags.map((item) => item.trim()).filter((item) => item.length > 0)) : null;
  const byTag = new Map<string, string[]>();
  for (const node of doc.nodes) {
    for (const raw of node.tags ?? []) {
      const tag = raw.trim();
      if (tag.length === 0) continue;
      if (wanted && !wanted.has(tag)) continue;
      const list = byTag.get(tag);
      if (list) list.push(node.id);
      else byTag.set(tag, [node.id]);
    }
  }

  const connected = new Set<string>();
  for (const edge of doc.edges) {
    connected.add(edge.source + '\u0000' + edge.target);
    connected.add(edge.target + '\u0000' + edge.source);
  }

  const titleOf = new Map<string, string>();
  for (const node of doc.nodes) titleOf.set(node.id, node.title);

  const out: TagLinkCandidate[] = [];
  const paired = new Set<string>();
  const tagNames = [...byTag.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  for (const tag of tagNames) {
    const ids = byTag.get(tag) ?? [];
    if (ids.length < 2) continue;
    // 按实体在 doc.nodes 里的顺序输出，画布上连线方向与文档顺序一致，结果可复现
    const ordered = ids.filter((id, index) => ids.indexOf(id) === index);
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const source = ordered[i];
        const target = ordered[j];
        if (connected.has(source + '\u0000' + target)) continue;
        const pairKey = source < target ? source + '\u0000' + target : target + '\u0000' + source;
        if (paired.has(pairKey)) continue;
        paired.add(pairKey);
        out.push({
          id: tag + '|' + source + '|' + target,
          tag,
          source,
          target,
          sourceTitle: titleOf.get(source) ?? source,
          targetTitle: titleOf.get(target) ?? target,
        });
        if (out.length >= TAG_LINK_MAX) return out;
      }
    }
  }
  return out;
}

/** 候选关系在画布上的标签文案 */
export function tagLinkLabel(tag: string): string {
  return '同标签：' + tag;
}
