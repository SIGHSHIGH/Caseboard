/**
 * P6 自然语言编辑 —— 确定性中文指令解析（离线可用，也是纯本地模式的兜底）。
 *
 * 设计约束（Gate 0）：
 * - 只生成命令与 diff 预览，未经用户确认不落盘；
 * - 删除类指令必须二次确认（plan.hasDelete）；
 * - 指代不明时宁可不生成命令，把问题写进 plan.questions。
 */
import type { CaseDoc, LineStyle, NodeType } from '../types';
import type { NlCommand, NlPlan, NlPreviewLine } from '../services/ai/types';
import {
  addEdge,
  addGroup,
  addNode,
  assignNodesToGroup,
  deleteNode,
  updateNode,
} from '../commands';
import type { Command } from '../commands';

const TYPE_WORDS: Array<{ re: RegExp; type: NodeType }> = [
  { re: /公司|集团|银行|事务所|财务|机构|单位/, type: 'org' },
  { re: /KTV|酒店|宾馆|小区|公寓|广场|大厦|会所|茶楼|酒吧|地点|场所/, type: 'place' },
  { re: /证据|流水|记录|截图|照片|合同|账本|凭证/, type: 'evidence' },
  { re: /\d{4}\s*[-年]|\d{1,2}\s*月\s*\d{1,2}\s*日|事件|案发/, type: 'event' },
  { re: /时间|日期/, type: 'time' },
  { re: /便签|备注|线索/, type: 'note' },
];

const REL_WORDS = ['转账', '通话', '合作', '同伙', '亲属', '认识', '供职', '场所', '关联', '上下级', '雇佣', '资金往来'];

function inferType(title: string, explicit?: string): NodeType {
  if (explicit && /人物|人员|嫌疑人|证人|受害人|报案人/.test(explicit)) return 'person';
  for (const item of TYPE_WORDS) {
    if (item.re.test(title)) return item.type;
  }
  return 'person';
}

function typeLabel(type: NodeType): string {
  return { person: '人物', org: '机构', place: '地点', item: '物品', event: '事件', evidence: '证据', time: '时间', note: '便签' }[type];
}

function findNode(doc: CaseDoc, name: string) {
  const clean = name.trim();
  return doc.nodes.find((node) => node.title === clean || (node.aliases ?? []).includes(clean));
}

function findGroup(doc: CaseDoc, name: string) {
  const clean = name.trim().replace(/^[「“"']+/, '').replace(/[」”"']+$/, '');
  return doc.groups.find((group) => group.title === clean);
}

function cleanName(raw: string): string {
  return raw.trim().replace(/^[「“"']+/, '').replace(/[」”"']+$/, '').replace(/[，,。]$/, '').trim();
}

function splitClauses(text: string): string[] {
  return text
    .split(/[。；;\n]+/)
    .flatMap((part) => part.split(/，并(?:且)?|然后|接着/))
    .map((part) => cleanName(part))
    .filter((part) => part.length > 0);
}

function styleFromWording(sentence: string): { style: LineStyle; confidence: number } {
  if (/已证实|已确认|确证|查实/.test(sentence)) return { style: 'solid', confidence: 85 };
  if (/推测|怀疑|可能|疑似/.test(sentence)) return { style: 'dashed', confidence: 55 };
  return { style: 'dotted', confidence: 40 };
}

interface ParsedClause {
  command?: NlCommand;
  text?: string;
  problem?: string;
}

/** 解析一条指令；返回 problem 表示无法识别（不生成命令）。 */
function parseClause(doc: CaseDoc, clause: string): ParsedClause {
  // 提问类：不产生修改，只作为查询
  if (/[?？]$/.test(clause) || /^(查询|查找|搜索|列出|统计|哪些|是否|有没有|多少)/.test(clause)) {
    return { command: { kind: 'query', question: clause }, text: '查询：' + clause };
  }

  let match = /^(?:删除|删掉|移除|去掉)\s*(.+)$/.exec(clause);
  if (match) {
    const node = findNode(doc, cleanName(match[1]));
    if (!node) return { problem: '没有找到「' + cleanName(match[1]) + '」，删除指令未生成。' };
    return { command: { kind: 'deleteNode', id: node.id }, text: '删除实体：' + node.title };
  }

  match = /^(?:把|将)?\s*[「“"']?(.+?)[」”"']?\s*(?:改名为|改名成|改成|更名为|重命名为)\s*[「“"']?(.+?)[」”"']?$/.exec(clause);
  if (match) {
    const node = findNode(doc, cleanName(match[1]));
    const nextTitle = cleanName(match[2]);
    if (!node) return { problem: '没有找到「' + cleanName(match[1]) + '」，改名指令未生成。' };
    if (!nextTitle) return { problem: '改名指令缺少新名称。' };
    return {
      command: { kind: 'updateNode', id: node.id, title: nextTitle, patch: { title: nextTitle } },
      text: '改名：' + node.title + ' → ' + nextTitle,
    };
  }

  match = /^(?:把|将)?\s*[「“"']?(.+?)[」”"']?\s*(?:和|与)\s*[「“"']?(.+?)[」”"']?\s*(?:连(?:起)?来|连接|连线|建立关系|添加关系|关联)(?:.*?关系(?:为|是|：:)?\s*[「“"']?(.+?)[」”"']?)?$/.exec(clause);
  if (match) {
    const a = findNode(doc, cleanName(match[1]));
    const b = findNode(doc, cleanName(match[2]));
    const missing = [!a ? cleanName(match[1]) : '', !b ? cleanName(match[2]) : ''].filter(Boolean);
    if (missing.length > 0) return { problem: '没有找到「' + missing.join('」「') + '」，连线指令未生成。' };
    const wording = match[3] ? cleanName(match[3]) : '';
    const relType = REL_WORDS.find((word) => wording.includes(word)) ?? '关联';
    const { style, confidence } = styleFromWording(clause);
    return {
      command: { kind: 'addEdge', source: a!.id, target: b!.id, relType, label: wording || relType, style, confidence },
      text:
        '新增关系：' + a!.title + ' —' + relType + '→ ' + b!.title +
        '（' + (style === 'solid' ? '已证实' : style === 'dashed' ? '推测' : '待核实') + '）',
    };
  }

  match = /^(?:把|将)\s*[「“"']?(.+?)[」”"']?\s*(?:放进|放入|移到|移动到|归入|加入)\s*[「“"']?(.+?)[」”"']?(?:组|分组)?$/.exec(clause);
  if (match) {
    const node = findNode(doc, cleanName(match[1]));
    const groupName = cleanName(match[2]).replace(/组$/, '');
    const group = findGroup(doc, groupName);
    if (!node) return { problem: '没有找到「' + cleanName(match[1]) + '」，移动指令未生成。' };
    if (!group) return { problem: '没有找到分组「' + groupName + '」，请先创建分组。' };
    return { command: { kind: 'moveNode', id: node.id, targetGroupId: group.id }, text: '移到分组：' + node.title + ' → ' + group.title };
  }

  match = /^(?:新建|建立|创建)\s*(?:一个)?\s*(?:分组|组)\s*[：:]?\s*(.+)$/.exec(clause);
  if (match) {
    const title = cleanName(match[1]);
    if (!title) return { problem: '新建分组指令缺少名称。' };
    return { command: { kind: 'addGroup', title, nodeIds: [] }, text: '新建分组：' + title };
  }

  match = /^(?:新增|添加|增加|新建)\s*(?:(人物|人员|嫌疑人|证人|公司|机构|地点|场所|事件|证据|便签|线索)\s*)?(?:节点|卡片|实体)?\s*[：:]?\s*(.+)$/.exec(clause);
  if (match) {
    const title = cleanName(match[2]);
    if (!title) return { problem: '新增实体指令缺少名称。' };
    const type = inferType(title, match[1]);
    return { command: { kind: 'addNode', type, title, confidence: 60 }, text: '新增' + typeLabel(type) + '：' + title };
  }

  return { problem: '没看懂这条指令：' + clause };
}

export function parseNlEdit(doc: CaseDoc, text: string): NlPlan {
  const clauses = splitClauses(text);
  const commands: NlCommand[] = [];
  const preview: NlPreviewLine[] = [];
  const questions: string[] = [];

  for (const clause of clauses) {
    const parsed = parseClause(doc, clause);
    if (parsed.command) {
      commands.push(parsed.command);
      preview.push({ command: parsed.command, text: parsed.text ?? clause, ready: true });
    } else {
      const problem = parsed.problem ?? '无法识别这条指令。';
      questions.push(problem);
      preview.push({ command: { kind: 'query', question: clause }, text: '未生成命令：' + problem, ready: false, problem });
    }
  }

  const hasDelete = commands.some((command) => command.kind === 'deleteNode' || command.kind === 'deleteEdge');
  const readyCount = preview.filter((line) => line.ready).length;
  const summary =
    readyCount === 0
      ? '没有可执行的修改，请补充更明确的指令。'
      : '将执行 ' + readyCount + ' 条修改' + (questions.length > 0 ? '，另有 ' + questions.length + ' 条需要澄清' : '') + '。';

  return { commands, preview, needsConfirmation: true, summary, questions, hasDelete };
}

/** 把已确认的 plan 转成可 dispatch 的命令（调用方用 composeCommands 合成一条撤销）。 */
export function buildNlCommands(doc: CaseDoc, plan: NlPlan): Command[] {
  const commands: Command[] = [];
  let right = 0;
  let top = Number.POSITIVE_INFINITY;
  for (const node of doc.nodes) {
    right = Math.max(right, node.x + node.w);
    top = Math.min(top, node.y);
  }
  if (!Number.isFinite(top)) top = 80;
  let newIndex = 0;

  for (const command of plan.commands) {
    if (command.kind === 'addNode') {
      commands.push(
        addNode({
          type: command.type,
          title: command.title,
          x: right + 64 + (newIndex % 3) * 240,
          y: top + Math.floor(newIndex / 3) * 128,
          status: 'todo',
          confidence: command.confidence ?? 60,
        }),
      );
      newIndex += 1;
      continue;
    }
    if (command.kind === 'updateNode') {
      const title = command.title ?? (typeof command.patch.title === 'string' ? command.patch.title : undefined);
      if (title) commands.push(updateNode(command.id, { title }));
      continue;
    }
    if (command.kind === 'deleteNode') {
      commands.push(deleteNode(command.id));
      continue;
    }
    if (command.kind === 'addEdge') {
      commands.push(
        addEdge({
          source: command.source,
          target: command.target,
          relType: command.relType,
          label: command.label,
          style: command.style,
          confidence: command.confidence,
          directed: true,
        }),
      );
      continue;
    }
    if (command.kind === 'moveNode') {
      commands.push(assignNodesToGroup([command.id], command.targetGroupId));
      continue;
    }
    if (command.kind === 'addGroup') {
      commands.push(addGroup({ title: command.title, x: right + 64, y: top, nodeIds: command.nodeIds }));
      continue;
    }
  }
  return commands;
}
