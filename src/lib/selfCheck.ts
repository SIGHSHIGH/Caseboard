/**
 * 案件自检（M16）：把「这份案子是否立得住」变成机器可复算的清单。
 *
 * 只读：不修改文档、不产生命令，任何一条都只给出结论与可点击的实体 id。
 * 放在 `src/lib/` 而不是 `services/` 是为了让 `scripts/smoke.cjs` 能直接 require（见 AGENTS.md）。
 *
 * 检查口径（与 Gate 0 对齐）：
 * - 结构完整性：关系两端、分组引用、图片素材与吸附目标都必须存在；
 * - 时间与坐标：填了「发生时刻 / 经纬度」这类字段却解析不出来，是最常见的静默失效；
 * - 线型即语义（Gate 0-3）：实线代表已证实，置信度偏低的实线要提示；
 * - AI 生成图（Gate 0-5）：进入 ai 分区就必须有 aiGenerated 与完整 aiMeta。
 */
import type { CaseDoc, CaseNode } from '../types';
import { GEO_KEYS, GEO_LAT_KEYS, GEO_LNG_KEYS, parseGeo } from './map';
import { tagLinkCandidates, tagLinkLabel } from './tagLink';
import { TIME_FIELD_KEYS, nodesWithoutTime, parseTimelineTime } from './timeline';

export type CheckLevel = 'pass' | 'warn' | 'fail';

export interface SelfCheckItem {
  id: string;
  title: string;
  level: CheckLevel;
  /** 结论一句话，直接显示在面板上 */
  detail: string;
  /** 涉及到的实体 id，面板里可以点进去定位 */
  nodeIds: string[];
}

export interface SelfCheckReport {
  items: SelfCheckItem[];
  pass: number;
  warn: number;
  fail: number;
  checkedAt: string;
}

/** 实线 = 已证实；低于这个置信度的实线要提示（与关系面板的默认刻度一致）。 */
export const SOLID_MIN_CONFIDENCE = 60;
/** 每条检查最多点名几个实体，避免面板被长列表撑爆。 */
const MAX_NAMED = 6;

function nameOf(node: CaseNode): string {
  const title = node.title.trim();
  return title.length > 0 ? title : '未命名';
}

function clip(ids: string[], max = MAX_NAMED): string[] {
  return ids.slice(0, max);
}

function timeFieldHits(node: CaseNode): string[] {
  const fields = node.fields ?? {};
  const hits: string[] = [];
  for (const key of TIME_FIELD_KEYS) {
    const raw = fields[key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text.length === 0) continue;
    hits.push(text);
  }
  return hits;
}

function geoKeysOf(node: CaseNode): string[] {
  const fields = node.fields ?? {};
  const keys = [...GEO_KEYS, ...GEO_LAT_KEYS, ...GEO_LNG_KEYS];
  return keys.filter((key) => {
    const raw = fields[key];
    return raw !== undefined && raw !== null && String(raw).trim().length > 0;
  });
}

function checkEdges(doc: CaseDoc): SelfCheckItem {
  const ids = new Set(doc.nodes.map((node) => node.id));
  const broken = doc.edges.filter((edge) => !ids.has(edge.source) || !ids.has(edge.target));
  if (broken.length === 0) {
    return {
      id: 'edges',
      title: '关系两端都存在',
      level: 'pass',
      detail: `${doc.edges.length} 条关系全部指向画布上已有的实体`,
      nodeIds: [],
    };
  }
  return {
    id: 'edges',
    title: '关系两端都存在',
    level: 'fail',
    detail: `${broken.length} 条关系指向了不存在的实体，画布上会显示为悬空线`,
    nodeIds: clip([...new Set(broken.flatMap((edge) => [edge.source, edge.target]))].filter((id) => ids.has(id))),
  };
}

function checkGroups(doc: CaseDoc): SelfCheckItem {
  const groupIds = new Set(doc.groups.map((group) => group.id));
  const orphanNodes = doc.nodes.filter((node) => node.groupId && !groupIds.has(node.groupId));
  const orphanGroups = doc.groups.filter((group) => group.parentId && !groupIds.has(group.parentId));
  if (orphanNodes.length === 0 && orphanGroups.length === 0) {
    return {
      id: 'groups',
      title: '分组引用有效',
      level: 'pass',
      detail: `${doc.groups.length} 个分组，成员与上下级引用都是一致的`,
      nodeIds: [],
    };
  }
  const parts: string[] = [];
  if (orphanNodes.length > 0) parts.push(`${orphanNodes.length} 个实体挂在已删除的分组上`);
  if (orphanGroups.length > 0) parts.push(`${orphanGroups.length} 个分组的上级已不存在`);
  return {
    id: 'groups',
    title: '分组引用有效',
    level: 'fail',
    detail: parts.join('；'),
    nodeIds: clip(orphanNodes.map((node) => node.id)),
  };
}

function checkImages(doc: CaseDoc): SelfCheckItem {
  const assetIds = new Set(doc.assets.map((asset) => asset.id));
  const nodeIds = new Set(doc.nodes.map((node) => node.id));
  const missingAsset = doc.imageNodes.filter((image) => !assetIds.has(image.assetId));
  const missingHost = doc.imageNodes.filter((image) => image.linkedNodeId !== undefined && !nodeIds.has(image.linkedNodeId));
  if (missingAsset.length === 0 && missingHost.length === 0) {
    return {
      id: 'images',
      title: '图片节点引用有效',
      level: 'pass',
      detail: `${doc.imageNodes.length} 个图片节点，素材与吸附目标都在`,
      nodeIds: [],
    };
  }
  const parts: string[] = [];
  if (missingAsset.length > 0) parts.push(`${missingAsset.length} 张图片的素材已从素材库删除`);
  if (missingHost.length > 0) parts.push(`${missingHost.length} 张图片吸附的卡片已删除`);
  return {
    id: 'images',
    title: '图片节点引用有效',
    level: 'fail',
    detail: parts.join('；'),
    nodeIds: [],
  };
}

function checkTitles(doc: CaseDoc): SelfCheckItem {
  const blank = doc.nodes.filter((node) => node.title.trim().length === 0);
  const seen = new Map<string, string[]>();
  for (const node of doc.nodes) {
    const key = node.title.trim();
    if (key.length === 0) continue;
    const list = seen.get(key);
    if (list) list.push(node.id);
    else seen.set(key, [node.id]);
  }
  const dup = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  if (blank.length === 0 && dup.length === 0) {
    return {
      id: 'titles',
      title: '标题完整且不重复',
      level: 'pass',
      detail: `${doc.nodes.length} 个实体都有独立标题`,
      nodeIds: [],
    };
  }
  const parts: string[] = [];
  if (blank.length > 0) parts.push(`${blank.length} 个实体没有标题`);
  if (dup.length > 0) parts.push(`${dup.length} 组同名实体（${dup.slice(0, 3).map(([key]) => key).join('、')}）`);
  return {
    id: 'titles',
    title: '标题完整且不重复',
    level: 'warn',
    detail: parts.join('；'),
    nodeIds: clip([...blank.map((node) => node.id), ...dup.flatMap(([, ids]) => ids)]),
  };
}

function checkTime(doc: CaseDoc): SelfCheckItem {
  const unparsed = doc.nodes.filter((node) => {
    const hits = timeFieldHits(node);
    if (hits.length === 0) return false;
    if (parseTimelineTime(node.time?.start)) return false;
    return hits.every((text) => parseTimelineTime(text) === null);
  });
  const scheduled = doc.nodes.length - nodesWithoutTime(doc).length;
  if (unparsed.length > 0) {
    return {
      id: 'time',
      title: '时间字段可解析',
      level: 'warn',
      detail: `${unparsed.length} 个实体的时间写法无法识别，举例「${timeFieldHits(unparsed[0] as CaseNode)[0] ?? ''}」，建议写成 2026-09-03 20:10`,
      nodeIds: clip(unparsed.map((node) => node.id)),
    };
  }
  if (doc.nodes.length > 0 && scheduled === 0) {
    return {
      id: 'time',
      title: '时间字段可解析',
      level: 'warn',
      detail: '所有实体都没有可识别的时间，时间线与播放会是空的',
      nodeIds: [],
    };
  }
  return {
    id: 'time',
    title: '时间字段可解析',
    level: 'pass',
    detail: `${scheduled} / ${doc.nodes.length} 个实体能进时间线`,
    nodeIds: [],
  };
}

function checkGeo(doc: CaseDoc): SelfCheckItem {
  const broken = doc.nodes.filter((node) => geoKeysOf(node).length > 0 && parseGeo(node.fields) === null);
  if (broken.length === 0) {
    const mapped = doc.nodes.filter((node) => parseGeo(node.fields) !== null).length;
    return {
      id: 'geo',
      title: '经纬度可解析',
      level: 'pass',
      detail: mapped > 0 ? `${mapped} 个实体有可用坐标，能上地图` : '还没有实体写坐标（不影响其它功能）',
      nodeIds: [],
    };
  }
  return {
    id: 'geo',
    title: '经纬度可解析',
    level: 'warn',
    detail: `${broken.length} 个实体的坐标写法无法识别，应为「纬度,经度」，例如 31.783300,119.950000`,
    nodeIds: clip(broken.map((node) => node.id)),
  };
}

function checkLineSemantics(doc: CaseDoc): SelfCheckItem {
  const weakSolid = doc.edges.filter((edge) => edge.style === 'solid' && edge.confidence < SOLID_MIN_CONFIDENCE);
  if (weakSolid.length === 0) {
    return {
      id: 'lines',
      title: '线型与置信度一致',
      level: 'pass',
      detail: '没有「画成已证实、置信度却偏低」的关系',
      nodeIds: [],
    };
  }
  return {
    id: 'lines',
    title: '线型与置信度一致',
    level: 'warn',
    detail: `${weakSolid.length} 条实线关系的置信度低于 ${SOLID_MIN_CONFIDENCE}，实线代表已证实，建议改成虚线或核实后提高置信度`,
    nodeIds: clip(weakSolid.map((edge) => edge.source)),
  };
}

function checkAiAssets(doc: CaseDoc): SelfCheckItem {
  const aiAssets = doc.assets.filter((asset) => asset.zone === 'ai' || asset.aiGenerated === true);
  const broken = aiAssets.filter((asset) => asset.aiGenerated !== true || asset.aiMeta === undefined);
  if (aiAssets.length === 0) {
    return {
      id: 'ai',
      title: 'AI 生成图合规',
      level: 'pass',
      detail: '本案没有 AI 生成图',
      nodeIds: [],
    };
  }
  if (broken.length === 0) {
    return {
      id: 'ai',
      title: 'AI 生成图合规',
      level: 'pass',
      detail: `${aiAssets.length} 张 AI 生成图都带 aiGenerated 与完整 aiMeta`,
      nodeIds: [],
    };
  }
  return {
    id: 'ai',
    title: 'AI 生成图合规',
    level: 'fail',
    detail: `${broken.length} 张 AI 生成图缺 aiGenerated 或 aiMeta，不能进入证据分区也不能标为已证实`,
    nodeIds: [],
  };
}

function checkHypotheses(doc: CaseDoc): SelfCheckItem {
  const nodeIds = new Set(doc.nodes.map((node) => node.id));
  const edgeIds = new Set(doc.edges.map((edge) => edge.id));
  const assetIds = new Set(doc.assets.map((asset) => asset.id));
  const broken: string[] = [];
  for (const hypothesis of doc.hypotheses) {
    for (const stance of hypothesis.stances) {
      const exists =
        stance.targetKind === 'node'
          ? nodeIds.has(stance.targetId)
          : stance.targetKind === 'edge'
            ? edgeIds.has(stance.targetId)
            : assetIds.has(stance.targetId);
      if (!exists) broken.push(hypothesis.id);
    }
  }
  if (broken.length === 0) {
    return {
      id: 'hypotheses',
      title: '假设引用有效',
      level: 'pass',
      detail: `${doc.hypotheses.length} 条假设的支撑/反驳都指向现存对象`,
      nodeIds: [],
    };
  }
  return {
    id: 'hypotheses',
    title: '假设引用有效',
    level: 'warn',
    detail: `${[...new Set(broken)].length} 条假设引用了已删除的对象`,
    nodeIds: [],
  };
}

function checkChains(doc: CaseDoc): SelfCheckItem {
  const chains = doc.chains ?? [];
  if (chains.length === 0) {
    return {
      id: 'chains',
      title: '自定义证据链完整',
      level: 'pass',
      detail: '没有自定义证据链，当前用「字段 + 关键词」自动链',
      nodeIds: [],
    };
  }
  const nodeIds = new Set(doc.nodes.map((node) => node.id));
  const brokenChains = chains.filter((chain) => chain.entries.some((entry) => !nodeIds.has(entry.nodeId)));
  if (brokenChains.length === 0) {
    return {
      id: 'chains',
      title: '自定义证据链完整',
      level: 'pass',
      detail: `${chains.length} 条自定义链的条目都指向现存实体`,
      nodeIds: [],
    };
  }
  return {
    id: 'chains',
    title: '自定义证据链完整',
    level: 'warn',
    detail: `${brokenChains.length} 条自定义链里有实体已被删除`,
    nodeIds: [],
  };
}

function checkTagLinks(doc: CaseDoc): SelfCheckItem {
  const candidates = tagLinkCandidates(doc);
  if (candidates.length === 0) {
    return {
      id: 'tags',
      title: '标签可扩展关系',
      level: 'pass',
      detail: '没有「同标签但还没连线」的实体对',
      nodeIds: [],
    };
  }
  const first = candidates[0];
  return {
    id: 'tags',
    title: '标签可扩展关系',
    level: 'pass',
    detail: `${candidates.length} 对同标签实体还没连线，例如「${first.sourceTitle}」与「${first.targetTitle}」（${tagLinkLabel(first.tag)}）`,
    nodeIds: clip([first.source, first.target]),
  };
}

function checkTimeCoverage(doc: CaseDoc): SelfCheckItem {
  const missing = nodesWithoutTime(doc);
  const realNodes = doc.nodes.filter((node) => node.type !== 'note');
  if (realNodes.length === 0) {
    return { id: 'coverage', title: '时间线覆盖', level: 'pass', detail: '画布还是空的', nodeIds: [] };
  }
  const missingReal = missing.filter((node) => node.type !== 'note');
  if (missingReal.length === 0) {
    return {
      id: 'coverage',
      title: '时间线覆盖',
      level: 'pass',
      detail: '除便签外的实体都能进时间线',
      nodeIds: [],
    };
  }
  return {
    id: 'coverage',
    title: '时间线覆盖',
    level: 'warn',
    detail: `${missingReal.length} 个实体没有时间，时间线上看不到它们`,
    nodeIds: clip(missingReal.map((node) => node.id)),
  };
}

/** 跑完整套自检。纯函数：同一个文档永远得到同一份结论（checkedAt 除外）。 */
export function runSelfCheck(doc: CaseDoc, now: Date = new Date()): SelfCheckReport {
  const items: SelfCheckItem[] = [
    checkEdges(doc),
    checkGroups(doc),
    checkImages(doc),
    checkTitles(doc),
    checkTime(doc),
    checkGeo(doc),
    checkLineSemantics(doc),
    checkAiAssets(doc),
    checkHypotheses(doc),
    checkChains(doc),
    checkTimeCoverage(doc),
    checkTagLinks(doc),
  ];
  return {
    items,
    pass: items.filter((item) => item.level === 'pass').length,
    warn: items.filter((item) => item.level === 'warn').length,
    fail: items.filter((item) => item.level === 'fail').length,
    checkedAt: now.toISOString(),
  };
}

/** 面板顶部的一句话结论。 */
export function selfCheckSummary(report: SelfCheckReport): string {
  if (report.fail > 0) return `${report.fail} 项必须修的结构问题，${report.warn} 项建议核对`;
  if (report.warn > 0) return `结构完整，${report.warn} 项建议核对`;
  return '全部通过：结构、时间、坐标、线型语义都对得上';
}

/** 实体 id → 标题，面板里显示「涉及：张建国、恒信财务」用。 */
export function namedNodes(doc: CaseDoc, ids: string[]): string[] {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  return ids.map((id) => byId.get(id)).filter((node): node is CaseNode => node !== undefined).map(nameOf);
}
