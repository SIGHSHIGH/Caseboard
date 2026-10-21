/**
 * 内置规则抽取器（离线，M6 验收主力通道）。
 *
 * 定位：不依赖任何模型，按中文笔录里可判定的句式抽取实体与关系；
 * 所有产出都是「草稿」，带 evidenceQuote，进待确认队列，采纳前不碰 Model（Gate 0-4）。
 * 宁可少抽，也不虚构：每条关系都要求句子里有明确动词或书证行。
 */
import type { NodeType, TimeRange } from '../types';
import type { AiEdgeDraft, AiExtractResult, AiNodeDraft, AdoptionScore, AliasCandidate } from '../services/ai/types';

interface NamedHit { name: string; index: number }

const PERSON_STOP = new Set([
  '时间', '地点', '询问', '回答', '问题', '第二天', '次日', '当晚', '晚上', '上午', '下午',
  '金额', '账户', '手机', '电话', '身份', '姓名', '住址', '单位', '关系', '经过', '事情',
  '当时', '现在', '后来', '之后', '然后', '因为', '所以', '但是', '我们', '你们', '他们',
  '她们', '自己', '一个', '这个', '那个', '什么', '怎么', '为什么', '民警', '警官', '公安',
]);

const ORG_SUFFIX = '(?:公司|集团|事务所|银行|财务)';
const PLACE_SUFFIX = '(?:KTV|酒店|宾馆|小区|公寓|广场|大厦|会所|茶楼|酒吧)';

const PERSON_PATTERNS: RegExp[] = [
  /(?:被询问人|当事人|嫌疑人|证人|报案人|受害人)[：:]\s*([\u4e00-\u9fff]{2,4})/g,
  /(?:^|[，。；、：:\s])([\u4e00-\u9fff]{2,4})（(?:外号|绰号|别名)[“"]/g,
  /(?:^|[，。；、：:\s])([\u4e00-\u9fff]{2,4})（(?:男|女)[，,]\s*\d{1,3}岁/g,
  /(?:认识|见到|联系|通知|指使|伙同|与|和|向|给|让)([\u4e00-\u9fff]{2,4})(?=在|说|称|表示|承认|供述|自称|留|转账|联系|见面|认识|喝|吃|走|来|去|（|，|。|、|的)/g,
  /([\u4e00-\u9fff]{2,4})(?:说|称|表示|承认|供述|自称)(?=[，。：:”]|$)/g,
];

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value);
}

function isPersonName(name: string): boolean {
  if (name.length < 2 || name.length > 4) return false;
  if (PERSON_STOP.has(name)) return false;
  if (/公司|集团|银行|财务|KTV|酒店|公安|民警|笔录|证据/.test(name)) return false;
  if (/(的|了|是|在|和|与|给|让|说|称|被|把|将|有|无|不|我|你|他|她|它)/.test(name)) return false;
  // 句式窗口会吃进前一个动词（「认识张建国」→「识张建国」），按要求剔除动词起首的名字
  if (/^(认|识|见|说|称|给|让|和|与|向|在|是|的|了|把|被|将|对|从|到|同|跟|找|问|答)/.test(name)) return false;
  if (/\d/.test(name)) return false;
  return true;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/[。！？；]/))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function collectPersons(text: string): NamedHit[] {
  const hits: NamedHit[] = [];
  for (const pattern of PERSON_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (isPersonName(name)) hits.push({ name, index: match.index + match[0].indexOf(name) });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function pushNode(nodes: AiNodeDraft[], draft: AiNodeDraft): void {
  const existing = nodes.find((item) => item.type === draft.type && item.title === draft.title);
  if (!existing) {
    nodes.push(draft);
    return;
  }
  for (const alias of draft.aliases) {
    if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
  }
  existing.confidence = Math.max(existing.confidence, draft.confidence);
  for (const [key, value] of Object.entries(draft.fields)) {
    if (existing.fields[key] === undefined) existing.fields[key] = value;
  }
  if (draft.time && !existing.time) existing.time = draft.time;
}

function pushEdge(edges: AiEdgeDraft[], draft: AiEdgeDraft): void {
  const same = edges.find(
    (item) =>
      item.sourceTitle === draft.sourceTitle &&
      item.targetTitle === draft.targetTitle &&
      item.relType === draft.relType,
  );
  if (!same) {
    edges.push(draft);
    return;
  }
  // 书证行（solid）胜过当事人陈述（dotted）：只保留更强的一条，避免重复关系
  if (draft.confidence > same.confidence) {
    same.style = draft.style;
    same.confidence = draft.confidence;
    same.label = draft.label;
    same.evidenceQuote = draft.evidenceQuote;
    if (draft.weight !== undefined) same.weight = draft.weight;
    if (draft.time) same.time = draft.time;
  }
}

const GENERIC_ORG = new Set(['银行', '公司', '集团', '财务', '事务所', '企业', '单位', '账户']);
// 机构/地点正则的捕获窗口可能把前置动词与数量词吃进来（「让我把钱转给恒信财务公司」），
// 名字里出现这些字说明不是名词短语
const NAME_STOP = /[我你他她它让把被给转汇到至在说称要有无不是的了和与向从对将找问答笔张个次元万千万亿\d]/;

function orgTitles(text: string): NamedHit[] {
  const hits: NamedHit[] = [];
  const pattern = new RegExp('(?:^|[，。；、：:\\s]|转给|转账给|转至|付给|汇给|给|向|至|在)(' + '[\\u4e00-\\u9fffA-Za-z0-9]{2,12}' + ORG_SUFFIX + ')', 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const title = match[1];
    // 过滤「证据：银行流水」这类把通用词吃成机构名的误报
    if (title.length < 3 || GENERIC_ORG.has(title) || NAME_STOP.test(title)) continue;
    hits.push({ name: title, index: match.index + match[0].indexOf(title) });
  }
  return hits;
}

function placeTitles(text: string): NamedHit[] {
  const hits: NamedHit[] = [];
  const pattern = new RegExp('(?:^|[，。；、：:\\s]|在|到|去|至)(' + '[\\u4e00-\\u9fffA-Za-z0-9]{2,16}' + PLACE_SUFFIX + ')', 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const title = match[1];
    if (title.length < 4 || NAME_STOP.test(title)) continue;
    hits.push({ name: title, index: match.index + match[0].indexOf(title) });
  }
  return hits;
}

function uniqueByTitle(hits: NamedHit[]): NamedHit[] {
  const seen = new Set<string>();
  const result: NamedHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    result.push(hit);
  }
  return result;
}

function firstSentenceWith(text: string, needle: string): string {
  const found = sentencesOf(text).find((sentence) => sentence.includes(needle));
  return found ?? text.slice(0, 160);
}

function parseAmount(raw: string, hasWan: boolean): number | undefined {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(hasWan ? value * 10000 : value);
}

function amountText(value: number | undefined): string {
  if (value === undefined) return '转账';
  if (value >= 10000 && value % 10000 === 0) return '转账 ' + value / 10000 + ' 万';
  return '转账 ' + value + ' 元';
}

function isEvidenceLine(sentence: string): boolean {
  return /^证据[：:]/.test(sentence.trim());
}

/** 内置抽取主入口：纯函数，重复调用结果完全一致（无随机、无时间依赖）。 */
export function extractFromText(text: string): AiExtractResult {
  const nodes: AiNodeDraft[] = [];
  const edges: AiEdgeDraft[] = [];
  const unresolved: string[] = [];
  const persons = collectPersons(text);
  const orgs = uniqueByTitle(orgTitles(text));
  const places = uniqueByTitle(placeTitles(text));
  const sentences = sentencesOf(text);

  for (const person of uniqueByTitle(persons)) {
    const quote = firstSentenceWith(text, person.name);
    pushNode(nodes, {
      kind: 'node',
      key: 'node:person:' + person.name,
      type: 'person',
      title: person.name,
      aliases: [],
      fields: {},
      confidence: 72,
      evidenceQuote: quote,
    });
  }
  for (const org of orgs) {
    pushNode(nodes, {
      kind: 'node',
      key: 'node:org:' + org.name,
      type: 'org',
      title: org.name,
      aliases: [],
      fields: {},
      confidence: 78,
      evidenceQuote: firstSentenceWith(text, org.name),
    });
  }
  for (const place of places) {
    pushNode(nodes, {
      kind: 'node',
      key: 'node:place:' + place.name,
      type: 'place',
      title: place.name,
      aliases: [],
      fields: {},
      confidence: 78,
      evidenceQuote: firstSentenceWith(text, place.name),
    });
  }

  // 别名：只接受原话里明写的「外号/绰号/别名」，不做猜测合并（P4 规则 2）
  const aliasPattern = /([\u4e00-\u9fff]{2,4})（(?:外号|绰号|别名)[“"]([^”"]{1,8})[”"]）/g;
  let aliasMatch: RegExpExecArray | null;
  while ((aliasMatch = aliasPattern.exec(text)) !== null) {
    const owner = aliasMatch[1];
    const alias = aliasMatch[2];
    const node = nodes.find((item) => item.type === 'person' && item.title === owner);
    if (node && !node.aliases.includes(alias)) node.aliases.push(alias);
    if (node) unresolved.push('别名「' + alias + '」已按原话并入「' + owner + '」，请核实是否同一人。');
  }

  // 证据行：书证/物证直接进证据清单，不再从正文里重复抽一遍
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!isEvidenceLine(trimmed)) continue;
    const body = trimmed.replace(/^证据[：:]\s*/, '');
    const title = body.split(/[（(]/)[0].trim();
    if (title.length === 0) continue;
    pushNode(nodes, {
      kind: 'node',
      key: 'node:evidence:' + title,
      type: 'evidence',
      title,
      aliases: [],
      fields: { 摘要: body },
      confidence: 92,
      evidenceQuote: trimmed,
    });
  }

  // 时间点 → 事件节点（同一时间只建一个）；ISO 墙上时间，不带时区
  const timePattern = /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})时(\d{1,2})分)?/g;
  let timeMatch: RegExpExecArray | null;
  while ((timeMatch = timePattern.exec(text)) !== null) {
    const year = Number(timeMatch[1]);
    const month = Number(timeMatch[2]);
    const day = Number(timeMatch[3]);
    const hour = timeMatch[4] === undefined ? undefined : Number(timeMatch[4]);
    const minute = timeMatch[5] === undefined ? undefined : Number(timeMatch[5]);
    const dateTitle = year + '-' + pad2(month) + '-' + pad2(day) + (hour === undefined ? '' : ' ' + pad2(hour) + ':' + pad2(minute ?? 0));
    const time: TimeRange = { start: year + '-' + pad2(month) + '-' + pad2(day) + 'T' + (hour === undefined ? '00:00' : pad2(hour) + ':' + pad2(minute ?? 0)) + ':00' };
    pushNode(nodes, {
      kind: 'node',
      key: 'node:event:' + dateTitle,
      type: 'event',
      title: dateTitle,
      aliases: [],
      fields: { 原文时间: timeMatch[0] },
      time,
      confidence: 80,
      evidenceQuote: firstSentenceWith(text, timeMatch[0]),
    });
  }

  // 手机号 → 人：用于把证据行里的号码解析回具体人物
  const phoneOwner = new Map<string, string>();
  let lastPerson = '';
  for (const sentence of sentences) {
    const inSentence = persons.filter((person) => sentence.includes(person.name)).map((person) => person.name);
    if (inSentence.length > 0) lastPerson = inSentence[inSentence.length - 1];
    const phones = sentence.match(/1[3-9]\d{9}/g) ?? [];
    for (const phone of phones) {
      const owner = inSentence.find((name) => name !== lastPerson) ?? lastPerson;
      if (owner && !phoneOwner.has(phone)) phoneOwner.set(phone, owner);
      unresolved.push('手机号 ' + phone + ' 的实名机主待核实。');
    }
  }

  const personTitles = new Set(nodes.filter((node) => node.type === 'person').map((node) => node.title));
  const orgTitlesSet = new Set(nodes.filter((node) => node.type === 'org').map((node) => node.title));

  // 遍历句子抽关系：当事人陈述 → dotted；书证行 → solid
  // running 记录「最近一句提到的人」，用于「经查：…」「他给我…」这类省略主语的句子；
  // 句内多人时按出现位置排序，不能用 Set 的插入顺序（否则会把乙的动作记到甲头上）。
  let running = '';
  for (const sentence of sentences) {
    const namesIn = [...personTitles]
      .filter((name) => sentence.includes(name))
      .sort((a, b) => sentence.indexOf(a) - sentence.indexOf(b));
    const orgsIn = [...orgTitlesSet].filter((title) => sentence.includes(title));
    const evidenceLine = isEvidenceLine(sentence);
    const style = evidenceLine ? 'solid' : 'dotted';
    const confidence = evidenceLine ? 88 : 45;
    const subject = namesIn[0] ?? running;

    // 转账：只认「把 X 万元转到」「转账 X 万元」「X 万元的转账」三种完成态句式
    const transferPatterns: Array<{ re: RegExp; hasWan: boolean }> = [
      { re: /把\s*(\d+(?:\.\d+)?)\s*(万)?元?\s*(?:转|汇)(?:到|入|给)/, hasWan: true },
      { re: /(?:转账|转入|汇款|转了)\s*(\d+(?:\.\d+)?)\s*(万)?元?/, hasWan: true },
      { re: /(\d+(?:\.\d+)?)\s*(万)?元?\s*的?\s*(?:转账|汇款)/, hasWan: true },
    ];
    if (orgsIn.length > 0 && subject && namesIn.length + (evidenceLine ? 1 : 0) > 0) {
      for (const { re } of transferPatterns) {
        const matched = sentence.match(re);
        if (!matched) continue;
        const amount = parseAmount(matched[1], matched[2] === '万');
        // 收款方取金额之后最近出现的机构（「在建设银行柜台把50万元转到恒信财务公司」应落到恒信）
        const amountIndex = matched.index ?? 0;
        const orderedOrgs = [...orgsIn].sort((a, b) => sentence.indexOf(a) - sentence.indexOf(b));
        const targetOrg = orderedOrgs.find((title) => sentence.indexOf(title) > amountIndex) ?? orderedOrgs[orderedOrgs.length - 1];
        pushEdge(edges, {
          kind: 'edge',
          key: 'edge:transfer:' + subject + '->' + targetOrg,
          sourceTitle: subject,
          targetTitle: targetOrg,
          relType: '转账',
          label: amountText(amount),
          directed: true,
          style,
          confidence,
          weight: amount,
          evidenceQuote: sentence,
        });
        break;
      }
    }

    // 通话：证据行里「李梅 与 手机号」用号码归属人补全对端
    if (/通话|电话|拨打|联系/.test(sentence) && namesIn.length > 0) {
      const phones = sentence.match(/1[3-9]\d{9}/g) ?? [];
      let other = namesIn.find((name) => name !== namesIn[0]);
      if (!other) {
        for (const phone of phones) {
          const owner = phoneOwner.get(phone);
          if (owner && owner !== namesIn[0]) other = owner;
        }
      }
      if (other) {
        pushEdge(edges, {
          kind: 'edge',
          key: 'edge:call:' + namesIn[0] + '->' + other,
          sourceTitle: namesIn[0],
          targetTitle: other,
          relType: '通话',
          label: '通话',
          directed: false,
          style,
          confidence,
          evidenceQuote: sentence,
        });
      }
    }

    // 认识 / 见面 / 同伙：两人以上同句（或上一句主语）才连边，不猜单方代词
    const relationVerb = /(认识|见面|见过|同伙|亲属|夫妻|朋友)/.exec(sentence);
    if (relationVerb) {
      // 单人名句子（「我在KTV认识张建国」）：动作发出者是上一句提到的人
      const singleOther = namesIn.length === 1 && running && running !== namesIn[0] ? running : '';
      const from = singleOther || subject;
      const target = namesIn.find((name) => name !== from);
      if (from && target) {
        const relType = relationVerb[1] === '同伙' ? '同伙' : relationVerb[1] === '亲属' || relationVerb[1] === '夫妻' ? '亲属' : '认识';
        pushEdge(edges, {
          kind: 'edge',
          key: 'edge:know:' + subject + '->' + target,
          sourceTitle: from,
          targetTitle: target,
          relType,
          label: relType,
          directed: false,
          style: 'dotted',
          confidence: 45,
          evidenceQuote: sentence,
        });
      }
    }

    if (namesIn.length > 0) running = namesIn[namesIn.length - 1];
  }

  // 相对时间 / 指代 / 账号：进 unresolved 交给人工核实
  const relative = /(第二天|次日|当晚|之后|后来)/.exec(text);
  if (relative) unresolved.push('「' + relative[1] + '」是相对时间，缺少明确基准，请核对笔录起始时间。');
  if (/他(?!们)/.test(text)) unresolved.push('笔录中的「他」需人工确认指代对象（抽取时按上下文归到最近提到的人）。');
  const account = text.match(/\b\d{16,19}\b/);
  if (account) unresolved.push('收款账号 ' + account[0] + ' 需向银行核实户名与归属。');

  // 通过「文本中出现过」过滤误报：证据行标题必须真的在原文里
  const finalNodes = nodes.filter((node) => text.includes(node.title) || node.type === 'event');
  const nodeTitles = new Set(finalNodes.map((node) => node.title));
  for (const node of finalNodes) {
    for (const alias of node.aliases) nodeTitles.add(alias);
  }
  const finalEdges = edges.filter((edge) => nodeTitles.has(edge.sourceTitle) && nodeTitles.has(edge.targetTitle));

  // 去重：同一个手机号/账号可能在多句里触发同一条待核实
  return { nodes: finalNodes, edges: finalEdges, unresolved: [...new Set(unresolved)] };
}

/** 别名合并候选：同类型、标题相同/包含、或共享别名；只提示，不自动合并。 */
export function aliasCandidates(nodes: Array<{ id: string; type: NodeType; title: string; aliases?: string[] }>): AliasCandidate[] {
  const result: AliasCandidate[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.type !== b.type) continue;
      const aliasesA = a.aliases ?? [];
      const aliasesB = b.aliases ?? [];
      let reason = '';
      if (a.title === b.title) reason = '标题完全相同';
      else if (aliasesA.includes(b.title) || aliasesB.includes(a.title)) reason = '一个标题是另一个的别名';
      else if (a.title.length >= 2 && b.title.length > a.title.length && b.title.includes(a.title)) reason = '标题包含关系';
      else if (aliasesA.some((alias) => aliasesB.includes(alias))) reason = '共享别名';
      if (!reason) continue;
      result.push({ aId: a.id, aTitle: a.title, bId: b.id, bTitle: b.title, reason });
    }
  }
  return result;
}

/** 采纳率：抽取结果命中人工参考答案的比例（M6 验收 6，≥70% 为通过）。 */
export function adoptionScore(
  result: AiExtractResult,
  reference: {
    nodes: Array<{ type: NodeType; title: string }>;
    edges: Array<{ sourceTitle: string; targetTitle: string; relType: string }>;
  },
): AdoptionScore {
  const missing: string[] = [];
  let matched = 0;
  for (const expected of reference.nodes) {
    const hit = result.nodes.find(
      (node) => node.type === expected.type && (node.title === expected.title || node.aliases.includes(expected.title)),
    );
    if (hit) matched += 1;
    else missing.push(expected.title);
  }
  for (const expected of reference.edges) {
    const hit = result.edges.find(
      (edge) =>
        edge.relType === expected.relType &&
        ((edge.sourceTitle === expected.sourceTitle && edge.targetTitle === expected.targetTitle) ||
          (edge.sourceTitle === expected.targetTitle && edge.targetTitle === expected.sourceTitle)),
    );
    if (hit) matched += 1;
    else missing.push(expected.sourceTitle + ' —' + expected.relType + '→ ' + expected.targetTitle);
  }
  const total = reference.nodes.length + reference.edges.length;
  return { matched, total, rate: total === 0 ? 0 : Math.round((matched / total) * 1000) / 1000, missing };
}

/** 与人物相关的直接关系（报告/审查共用）。 */
export function relationsOf(result: AiExtractResult, title: string): AiEdgeDraft[] {
  return result.edges.filter((edge) => edge.sourceTitle === title || edge.targetTitle === title);
}
