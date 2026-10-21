import type { SyntaxNode, Tree } from '@lezer/common';
import type {
  CaseDoc,
  CaseEdge,
  CaseNode,
  EdgePath,
  Group,
  LineStyle,
  NodeType,
  Status,
  TimeRange,
  View,
} from '../types';
import { NODE_TYPE_ORDER } from '../lib/nodeTemplates';
import { DEFAULT_NODE_H, DEFAULT_NODE_W, DEFAULT_SETTINGS } from '../serializers/migrate';
import { parser } from './generated/caseboard.parser';

/**
 * DSL → Model 的容错解析（M3-2）。
 *
 * 原则（M3 验收 2）：解析失败绝不能抛异常、也不能清空模型 —— 这里永远返回
 * 「能解析多少算多少」的文档 + 诊断列表，由上层（M3-3 diff / M3-4 分屏）决定怎么提示。
 * 诊断带 from/to 偏移与行列号，直接给 CodeMirror 画波浪线用。
 */

export type DslSeverity = 'error' | 'warning';

export interface DslDiagnostic {
  severity: DslSeverity;
  /** 中文说明，直接显示在问题面板 */
  message: string;
  /** 修复建议，显示在提示条 */
  hint?: string;
  from: number;
  to: number;
  /** 1 起 */
  line: number;
  /** 1 起 */
  column: number;
}

export interface ParseResult {
  doc: CaseDoc;
  diagnostics: DslDiagnostic[];
}

export function hasErrors(diagnostics: DslDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

const NODE_TYPES = new Set<string>(NODE_TYPE_ORDER);
const STATUSES = new Set<Status>(['todo', 'checking', 'confirmed', 'ruledout']);
const STYLES = new Set<LineStyle>(['solid', 'dashed', 'dotted']);
const PATHS = new Set<EdgePath>(['bezier', 'straight', 'step']);
const VIEW_KINDS = new Set<View['kind']>(['board', 'timeline', 'map', 'chain', 'presentation', 'scenario']);

/** 语法错误按「出错位置所在的语法节点」给修复建议；都是可直接照抄的示例。 */
const HINTS: Record<string, string> = {
  Document: '文件形如 case "案件名称" caseNo "A-2026-1018" { … }',
  CaseHead: '文件头形如 case "案件名称" caseNo "编号" {，标题必须用英文双引号',
  Block: '检查花括号是否成对；块内语句以实体类型 / view / group / 关系 id 开头',
  Statement:
    '语句可以写成 person zhang "张建国" { … }、status: confirmed、at(10, 20)，或关系 zhang --转账--> li { … }',
  Declaration: '声明形如 类型 id "显示名" { … }，类型是 person/org/place/item/event/evidence/time/note 或 group/view',
  FieldStatement: '字段形如 key: value，值可以是数字、字符串、true/false、数组 [a, b] 或对象 { a: 1 }',
  CallStatement: '坐标写成 at(x, y)，尺寸写成 size(w, h)，参数必须是数字',
  EdgeStatement: '关系形如 zhang --转账--> li { … }；三种线型是 --实线-->、-.虚线.->、..点线..>',
  Array: '数组形如 [a, b]，元素之间用英文逗号分隔',
  ObjectLit: '对象形如 { key: value }，键值之间用英文冒号，不能用中文标点',
};

interface ParsedValue {
  kind: 'string' | 'number' | 'boolean' | 'ident' | 'array' | 'object' | 'empty';
  /** 标量原始文本（字符串已去引号） */
  text?: string;
  value?: string | number | boolean;
  items?: ParsedValue[];
  entries?: Array<{ key: string; value: ParsedValue; node: SyntaxNode }>;
  node?: SyntaxNode;
}

class LineIndex {
  private readonly starts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\n') this.starts.push(i + 1);
    }
  }

  locate(offset: number): { line: number; column: number } {
    const pos = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.starts[mid] <= pos) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: pos - this.starts[low] + 1 };
  }
}

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  let child = node.firstChild;
  while (child) {
    out.push(child);
    child = child.nextSibling;
  }
  return out;
}

function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  let child = node.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

function kindOf(node: SyntaxNode): string {
  return node.name;
}

/** Decimal 数字：只认 ASCII，避免把全角数字当合法值。 */
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'string' ? value : raw;
  } catch {
    // 手动兜底：去掉首尾引号，反转义常见序列
    return raw.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

class Builder {
  readonly diagnostics: DslDiagnostic[] = [];
  private readonly lines: LineIndex;
  /** DSL 名字 → 模型 id（来自 id: 覆盖行，或名字本身） */
  private readonly names = new Map<string, string>();
  private readonly nameNodes = new Map<string, SyntaxNode>();
  private readonly ids = new Set<string>();
  private readonly nodes: CaseNode[] = [];
  private readonly groups: Group[] = [];
  private readonly edges: CaseEdge[] = [];
  private readonly views: View[] = [];
  /** 通过名字登记的声明（按 from 偏移），避免重复声明被二次实例化 */
  private readonly accepted = new Set<number>();
  /** 组的成员先攒着，等所有实体都实例化后再绑定（文本里组可能写在实体前面） */
  private readonly pendingMembers: Array<{ group: Group; members: string[] }> = [];
  /** 边先存原始引用，等名字表齐了再解析（边可能写在实体前面） */
  private readonly rawEdges: Array<{
    source: string;
    target: string;
    style: LineStyle;
    label?: string;
    node: SyntaxNode;
    block: SyntaxNode | null;
    arrowNode: SyntaxNode;
  }> = [];
  private caseTitle = '未命名案件';
  private caseNo: string | undefined;

  constructor(private readonly text: string) {
    this.lines = new LineIndex(text);
  }

  report(severity: DslSeverity, message: string, node: SyntaxNode | null, hint?: string): void {
    const from = node ? node.from : 0;
    const to = node && node.to > from ? node.to : Math.min(from + 1, this.text.length);
    const { line, column } = this.lines.locate(from);
    this.diagnostics.push({ severity, message, hint, from, to, line, column });
  }

  addSyntaxDiagnostics(tree: Tree): void {
    tree.iterate({
      enter: (ref) => {
        if (!ref.type.isError) return;
        const snippet = this.text.slice(ref.from, ref.to).replace(/\s+/g, ' ').trim();
        const hint = HINTS[ref.node.parent?.name ?? 'Statement'] ?? HINTS.Statement;
        const message = snippet.length > 0 ? `此处语法不正确：${snippet.slice(0, 24)}` : '此处缺少内容或标点不正确';
        const fake = ref.node;
        this.report('error', message, fake, hint);
      },
    });
    void kindOf;
  }

  build(tree: Tree): ParseResult {
    this.addSyntaxDiagnostics(tree);
    const top = tree.topNode;
    const caseNode = top.getChild('CaseStatement');
    const container = caseNode ?? top;
    const head = childNamed(container, 'CaseHead');
    const block = childNamed(container, 'Block') ?? container.getChild('Block');

    if (!caseNode) {
      this.report('warning', '缺少 case 文件头，按块内语句解析', top, HINTS.CaseHead);
    } else if (head) {
      const strings = childrenOf(head).filter((node) => node.name === 'QuotedString');
      if (strings.length > 0) this.caseTitle = unquote(this.textOf(strings[0]));
      if (strings.length > 1) this.caseNo = unquote(this.textOf(strings[1]));
      if (strings.length === 0) this.report('error', '案件标题缺失', head, HINTS.CaseHead);
    } else {
      this.report('error', '缺少 case 文件头', top, HINTS.CaseHead);
    }

    const statements = block ? this.statementsOf(block) : this.statementsOf(top);
    if (!block) this.report('error', '缺少 { } 块，无法解析正文', top, HINTS.Block);

    // 第一遍：登记实体与组的名字 → id（边与组的成员可能引用后面的声明）
    const declarations: Array<{ node: SyntaxNode; decl: SyntaxNode; keyword: string }> = [];
    for (const statement of statements) {
      if (statement.name !== 'Declaration') continue;
      const keywordNode = statement.firstChild;
      if (!keywordNode) continue;
      declarations.push({ node: statement, decl: statement, keyword: this.textOf(keywordNode) });
    }
    this.registerNames(declarations);

    // 第二遍：实例化
    for (const statement of statements) {
      if (statement.name === 'Declaration') this.readDeclaration(statement);
      else if (statement.name === 'EdgeStatement') this.readEdge(statement);
      else if (statement.name === 'FieldStatement' || statement.name === 'CallStatement') {
        this.report('warning', '该语句写在块外，已忽略', statement, '字段与 at/size 必须写在实体、组或关系的 { } 里');
      }
    }

    for (const pending of this.pendingMembers) this.assignMembers(pending.group, pending.members);
    this.resolveEdges();

    const doc: CaseDoc = {
      meta: {
        id: 'case_' + hashString(this.caseTitle + '|' + (this.caseNo ?? '')),
        title: this.caseTitle,
        caseNo: this.caseNo,
        createdAt: '',
        updatedAt: '',
      },
      nodes: this.nodes,
      edges: this.edges,
      groups: this.groups,
      assets: [],
      imageNodes: [],
      views: this.views,
      hypotheses: [],
      settings: DEFAULT_SETTINGS,
    };

    this.diagnostics.sort((a, b) => a.from - b.from || a.to - b.to);
    return { doc, diagnostics: this.diagnostics };
  }

  private textOf(node: SyntaxNode | null): string {
    if (!node) return '';
    return this.text.slice(node.from, node.to);
  }

  /** Block 的子节点是 Statement 包装；Declaration/EdgeStatement 等直接子节点也要容忍。 */
  private statementsOf(container: SyntaxNode): SyntaxNode[] {
    const out: SyntaxNode[] = [];
    for (const child of childrenOf(container)) {
      if (child.name === 'Statement') {
        const inner = child.firstChild;
        if (inner && !inner.type.isError) out.push(inner);
      } else if (
        child.name === 'Declaration' ||
        child.name === 'EdgeStatement' ||
        child.name === 'FieldStatement' ||
        child.name === 'CallStatement'
      ) {
        out.push(child);
      }
    }
    return out;
  }

  private registerNames(declarations: Array<{ node: SyntaxNode; decl: SyntaxNode; keyword: string }>): void {
    for (const item of declarations) {
      const keyword = item.keyword;
      const isGroup = keyword === 'group';
      const isView = keyword === 'view';
      const isNode = NODE_TYPES.has(keyword);
      if (!isGroup && !isView && !isNode) {
        this.report(
          'error',
          `未知的声明类型「${keyword}」`,
          item.decl.firstChild,
          '可用类型：' + NODE_TYPE_ORDER.join(' / ') + ' / group / view',
        );
        continue;
      }
      const idents = childrenOf(item.decl).filter((node) => node.name === 'Ident');
      const nameNode = idents[1] ?? null;
      if (!nameNode) {
        this.report('error', '缺少 id（显示名后面的标识符）', item.decl, HINTS.Declaration);
        continue;
      }
      const name = this.textOf(nameNode);
      const block = childNamed(item.decl, 'Block');
      const override = block ? this.readIdOverride(block) : null;
      const id = override ?? name;
      if (this.names.has(name)) {
        this.report('error', `id「${name}」重复声明`, nameNode, '每个实体 / 组的 id 在全文件里必须唯一');
        continue;
      }
      if (this.ids.has(id)) {
        this.report('error', `id「${id}」已被占用`, nameNode, '可改名称，或用 id: "…" 指定另一个稳定 id');
        continue;
      }
      this.names.set(name, id);
      this.nameNodes.set(name, nameNode);
      this.ids.add(id);
      this.accepted.add(item.decl.from);
    }
  }

  /** 块里的 id: "原始 id" 覆盖行 */
  private readIdOverride(block: SyntaxNode): string | null {
    for (const statement of childrenOf(block)) {
      const inner = statement.name === 'Statement' ? statement.firstChild : statement;
      if (!inner || inner.name !== 'FieldStatement') continue;
      const key = inner.firstChild;
      if (!key || this.textOf(key) !== 'id') continue;
      const value = childNamed(inner, 'FieldValue');
      if (!value) return null;
      const parsed = this.readValue(value);
      return typeof parsed.value === 'string' && parsed.value.length > 0 ? parsed.value : null;
    }
    return null;
  }

  private readDeclaration(node: SyntaxNode): void {
    const idents = childrenOf(node).filter((child) => child.name === 'Ident');
    const keywordNode = idents[0] ?? null;
    const nameNode = idents[1] ?? null;
    if (!keywordNode || !nameNode) return;
    const keyword = this.textOf(keywordNode);
    const name = this.textOf(nameNode);
    if (!this.accepted.has(node.from)) return; // 登记阶段已报错（重复 id / 未知类型）
    const id = this.names.get(name) as string;
    const titleNode = childNamed(node, 'QuotedString');
    const title = titleNode ? unquote(this.textOf(titleNode)) : name;
    if (!titleNode) this.report('warning', '缺少显示名，已用 id 代替', nameNode, HINTS.Declaration);
    const block = childNamed(node, 'Block');

    if (keyword === 'group') {
      this.readGroup(node, id, title, block);
      return;
    }
    if (keyword === 'view') {
      this.readView(node, id, title, block);
      return;
    }
    if (!NODE_TYPES.has(keyword)) return; // 未知类型已在登记阶段报错
    this.readNode(node, id, keyword as NodeType, title, block);
  }

  private readNode(_node: SyntaxNode, id: string, type: NodeType, title: string, block: SyntaxNode | null): void {
    const result: CaseNode = {
      id,
      type,
      title,
      x: 0,
      y: 0,
      w: DEFAULT_NODE_W,
      h: DEFAULT_NODE_H,
      fields: {},
      tags: [],
      status: 'todo',
      confidence: 50,
      attachments: [],
    };
    if (block) {
      for (const field of this.fieldStatementsOf(block)) {
        const key = field.firstChild ? this.textOf(field.firstChild) : '';
        const values = childrenOf(field)
          .filter((child) => child.name === 'FieldValue')
          .map((child) => this.readValue(child));
        const value = values[0];
        if (!value) continue;
        switch (key) {
          case 'id':
            break;
          case 'at': {
            const [x, y] = values;
            result.x = this.numberOf(x, field, 'x');
            result.y = this.numberOf(y, field, 'y');
            break;
          }
          case 'size': {
            const [w, h] = values;
            result.w = Math.max(24, this.numberOf(w, field, 'w'));
            result.h = Math.max(24, this.numberOf(h, field, 'h'));
            break;
          }
          case 'status': {
            const text = this.stringOf(value);
            if (text && STATUSES.has(text as Status)) result.status = text as Status;
            else this.report('error', `status 只能是 ${[...STATUSES].join(' / ')}，收到「${text}」`, value.node ?? field, '表示线索可信度阶段：待查 / 核查中 / 已证实 / 已排除');
            break;
          }
          case 'confidence': {
            const confidence = this.numberOf(value, field, 'confidence');
            result.confidence = Math.max(0, Math.min(100, Math.round(confidence)));
            break;
          }
          case 'tags':
            result.tags = this.stringListOf(value, field);
            break;
          case 'aliases': {
            const aliases = this.stringListOf(value, field);
            if (aliases.length > 0) result.aliases = aliases;
            break;
          }
          case 'time': {
            const time = this.timeOf(value);
            if (time) result.time = time;
            else this.report('error', 'time 需要日期或日期区间（写成 2026-09-03 或 2026-09-01/2026-09-10）', value.node ?? field);
            break;
          }
          case 'fields':
            result.fields = this.fieldsOf(value, field);
            break;
          case 'photo': {
            const photo = this.stringOf(value);
            if (photo) result.photo = photo;
            break;
          }
          case 'attachments':
            result.attachments = this.stringListOf(value, field);
            break;
          case 'notes': {
            const notes = this.stringOf(value);
            if (notes) result.notes = notes;
            break;
          }
          case 'collapsed':
            result.collapsed = this.booleanOf(value, field, false);
            break;
          default:
            this.report('warning', `未知字段「${key}」，已忽略`, field.firstChild ?? field, '自定义字段请写进 fields: { 字段名: 值 }');
            break;
        }
      }
    }
    this.nodes.push(result);
  }

  private readGroup(node: SyntaxNode, id: string, title: string, block: SyntaxNode | null): void {
    const group: Group = {
      id,
      title,
      bounds: { x: 0, y: 0, w: 360, h: 260 },
      color: '#6E6862',
      collapsed: false,
    };
    const attrs = childrenOf(node).filter((child) => child.name === 'Attr');
    for (const attr of attrs) {
      const keyNode = attr.firstChild;
      const valueNode = childNamed(attr, 'FieldValue');
      if (!keyNode || !valueNode) continue;
      const key = this.textOf(keyNode);
      const value = this.readValue(valueNode);
      if (key === 'color') {
        const color = this.stringOf(value);
        if (color) group.color = color;
      } else {
        this.report('warning', `未知属性「${key}」，已忽略`, keyNode, '组的属性目前只有 color');
      }
    }
    if (block) {
      const members: string[] = [];
      for (const field of this.fieldStatementsOf(block)) {
        const key = field.firstChild ? this.textOf(field.firstChild) : '';
        const values = childrenOf(field)
          .filter((child) => child.name === 'FieldValue')
          .map((child) => this.readValue(child));
        const value = values[0];
        if (!value) continue;
        switch (key) {
          case 'id':
            break;
          case 'at':
            group.bounds.x = this.numberOf(values[0], field, 'x');
            group.bounds.y = this.numberOf(values[1], field, 'y');
            break;
          case 'size':
            group.bounds.w = Math.max(24, this.numberOf(values[0], field, 'w'));
            group.bounds.h = Math.max(24, this.numberOf(values[1], field, 'h'));
            break;
          case 'nodes':
            for (const item of value.items ?? []) {
              const ref = this.refOf(item);
              if (ref) members.push(ref);
            }
            break;
          case 'parent': {
            const ref = this.refOf(value);
            if (ref) group.parentId = ref;
            break;
          }
          case 'collapsed':
            group.collapsed = this.booleanOf(value, field, false);
            break;
          case 'opacity': {
            const opacity = this.numberOf(value, field, 'opacity');
            group.opacity = Math.max(0.02, Math.min(0.6, opacity));
            break;
          }
          default:
            this.report('warning', `未知字段「${key}」，已忽略`, field.firstChild ?? field, '组支持的字段：at / size / nodes / parent / collapsed / opacity');
            break;
        }
      }
      this.pendingMembers.push({ group, members });
    }
    this.groups.push(group);
  }

  private assignMembers(group: Group, members: string[]): void {
    const nodeIds = new Set(this.nodes.map((node) => node.id));
    for (const member of members) {
      if (!nodeIds.has(member)) {
        this.report('warning', `组「${group.title}」里的成员「${member}」不存在，已跳过`, this.nameNodes.get(member) ?? null);
        continue;
      }
      const target = this.nodes.find((node) => node.id === member);
      if (!target) continue;
      if (target.groupId && target.groupId !== group.id) {
        this.report('error', `实体「${target.title}」已经属于另一组，一个实体只能在一个组里`, this.nameNodes.get(member) ?? null, '先从原组的 nodes 列表里移除');
        continue;
      }
      target.groupId = group.id;
    }
  }

  private readView(node: SyntaxNode, id: string, title: string, block: SyntaxNode | null): void {
    const idents = childrenOf(node).filter((child) => child.name === 'Ident');
    // 第一个 Ident 是关键字 view，第二个才是 kind
    const kindText = idents[1] ? this.textOf(idents[1]) : '';
    let kind: View['kind'] = 'board';
    if (VIEW_KINDS.has(kindText as View['kind'])) kind = kindText as View['kind'];
    else this.report('error', `视图类型只能是 ${[...VIEW_KINDS].join(' / ')}，收到「${kindText}」`, idents[1] ?? node, '例：view timeline "案发经过" { … }');

    const view: View = { id, kind, name: title, filters: {} };
    if (block) {
      for (const field of this.fieldStatementsOf(block)) {
        const key = field.firstChild ? this.textOf(field.firstChild) : '';
        const values = childrenOf(field)
          .filter((child) => child.name === 'FieldValue')
          .map((child) => this.readValue(child));
        const value = values[0];
        if (!value) continue;
        switch (key) {
          case 'id':
            break;
          case 'camera': {
            const zoom = this.numberOf(values[2], field, 'zoom');
            view.camera = {
              x: this.numberOf(values[0], field, 'x'),
              y: this.numberOf(values[1], field, 'y'),
              zoom: zoom === 0 ? 1 : zoom,
            };
            break;
          }
          case 'filters':
            view.filters = this.recordOf(value, field) as Record<string, unknown>;
            break;
          case 'steps':
            view.steps = (value.items ?? []).map((item) => item.value ?? item.text ?? null);
            break;
          default:
            this.report('warning', `未知字段「${key}」，已忽略`, field.firstChild ?? field, '视图支持的字段：camera / filters / steps');
            break;
        }
      }
    }
    this.views.push(view);
  }

  private readEdge(node: SyntaxNode): void {
    const refs = childrenOf(node).filter((child) => child.name === 'Ref');
    const arrow = childNamed(node, 'Arrow');
    if (refs.length < 2 || !arrow) {
      this.report('error', '关系缺少起点或终点', node, HINTS.EdgeStatement);
      return;
    }
    const sourceRef = this.refOfNode(refs[0]);
    const targetRef = this.refOfNode(refs[1]);
    const arrowText = this.textOf(arrow);
    const parsedArrow = parseArrow(arrowText);
    if (!parsedArrow) {
      this.report('error', `箭头「${arrowText}」无法识别`, arrow, HINTS.EdgeStatement);
      return;
    }
    const block = childNamed(node, 'Block');
    this.rawEdges.push({
      source: sourceRef,
      target: targetRef,
      style: parsedArrow.style,
      label: parsedArrow.label,
      node,
      block,
      arrowNode: arrow,
    });
  }

  private resolveEdges(): void {
    const nodeIds = new Set(this.nodes.map((item) => item.id));
    for (const raw of this.rawEdges) {
      const source = this.resolveRef(raw.source, raw.node);
      const target = this.resolveRef(raw.target, raw.node);
      if (!source || !target) continue;
      if (!nodeIds.has(source)) {
        this.report('error', `关系起点「${raw.source}」不存在`, raw.node, '检查 id 拼写；引用的实体必须在本文件里声明');
        continue;
      }
      if (!nodeIds.has(target)) {
        this.report('error', `关系终点「${raw.target}」不存在`, raw.node, '检查 id 拼写；引用的实体必须在本文件里声明');
        continue;
      }
      if (source === target) {
        this.report('error', '关系不能连到自己', raw.node, '关系两端必须是两个不同的实体');
        continue;
      }
      const edge: CaseEdge = {
        id: '',
        source,
        target,
        path: 'bezier',
        relType: 'other',
        directed: true,
        style: raw.style,
        confidence: 50,
        evidenceIds: [],
      };
      if (raw.label && raw.label.length > 0) edge.label = raw.label;
      let explicitStyle: LineStyle | null = null;
      let explicitId: string | null = null;
      if (raw.block) {
        for (const field of this.fieldStatementsOf(raw.block)) {
          const key = field.firstChild ? this.textOf(field.firstChild) : '';
          const values = childrenOf(field)
            .filter((child) => child.name === 'FieldValue')
            .map((child) => this.readValue(child));
          const value = values[0];
          if (!value) continue;
          switch (key) {
            case 'id': {
              const id = this.stringOf(value);
              if (id) explicitId = id;
              break;
            }
            case 'rel': {
              const rel = this.stringOf(value);
              if (rel) edge.relType = rel;
              break;
            }
            case 'style': {
              const style = this.stringOf(value);
              if (style && STYLES.has(style as LineStyle)) explicitStyle = style as LineStyle;
              else this.report('error', `style 只能是 ${[...STYLES].join(' / ')}，收到「${style}」`, value.node ?? field, '线型即语义：实线已证实 / 虚线推测 / 点线待核实');
              break;
            }
            case 'directed':
              edge.directed = this.booleanOf(value, field, true);
              break;
            case 'weight':
              edge.weight = this.numberOf(value, field, 'weight');
              break;
            case 'thickness': {
              // M17：线宽 1–8 像素
              const px = this.numberOf(value, field, 'thickness');
              edge.thickness = Math.max(1, Math.min(8, Math.round(px * 10) / 10));
              break;
            }
            case 'autoAnchor':
              // M18：false = 用户钉住连接点，不参与自动梳理
              if (this.booleanOf(value, field, true) === false) edge.autoAnchor = false;
              break;
            case 'curvature': {
              // M18：自动梳理给出的曲率 -0.9~0.9
              const curve = this.numberOf(value, field, 'curvature');
              edge.curvature = Math.max(-0.9, Math.min(0.9, Math.round(curve * 100) / 100));
              break;
            }
            case 'time': {
              const time = this.timeOf(value);
              if (time) edge.time = time;
              else this.report('error', 'time 需要日期或日期区间（写成 2026-09-03 或 2026-09-01/2026-09-10）', value.node ?? field);
              break;
            }
            case 'evidence':
              edge.evidenceIds = this.stringListOf(value, field);
              break;
            case 'confidence':
              edge.confidence = Math.max(0, Math.min(100, Math.round(this.numberOf(value, field, 'confidence'))));
              break;
            case 'color': {
              const color = this.stringOf(value);
              if (color) edge.color = color;
              break;
            }
            case 'path': {
              const path = this.stringOf(value);
              if (path && PATHS.has(path as EdgePath)) edge.path = path as EdgePath;
              else this.report('error', `path 只能是 ${[...PATHS].join(' / ')}，收到「${path}」`, value.node ?? field);
              break;
            }
            case 'notes': {
              const notes = this.stringOf(value);
              if (notes) edge.notes = notes;
              break;
            }
            case 'scenario':
              edge.scenario = this.scenarioOf(value, field);
              break;
            default:
              this.report('warning', `未知字段「${key}」，已忽略`, field.firstChild ?? field, '关系支持的字段：rel / style / directed / weight / thickness / time / evidence / confidence / color / path / notes / scenario');
              break;
          }
        }
      }
      if (explicitStyle && explicitStyle !== raw.style) {
        this.report(
          'warning',
          `线型与箭头不一致（箭头是 ${raw.style}，块里写的是 ${explicitStyle}）`,
          raw.arrowNode,
          '以箭头为准：--实线-->、-.虚线.->、..点线..>',
        );
      }
      edge.id = explicitId ?? `e_${source}__${target}`;
      if (!explicitId) this.report('warning', `关系缺少 id，已自动生成「${edge.id}」`, raw.node, '在关系块里补一行 id: "e-transfer" 可保持身份稳定');
      if (this.ids.has(edge.id)) {
        this.report('error', `关系 id「${edge.id}」重复`, raw.node, '关系 id 必须全文件唯一');
        continue;
      }
      this.ids.add(edge.id);
      this.edges.push(edge);
    }
  }

  private scenarioOf(value: ParsedValue, field: SyntaxNode): Record<string, 'support' | 'refute'> {
    const out: Record<string, 'support' | 'refute'> = {};
    for (const entry of value.entries ?? []) {
      const raw = entry.value.value;
      if (raw === 'support' || raw === 'refute') out[entry.key] = raw;
      else this.report('error', `scenario 的取值只能是 support 或 refute，收到「${String(raw ?? entry.value.text ?? '')}」`, entry.node ?? field);
    }
    return out;
  }

  private fieldsOf(value: ParsedValue, field: SyntaxNode): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const entry of value.entries ?? []) {
      const raw = entry.value.value;
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        if (typeof raw === 'string' && raw.trim().length === 0) continue;
        out[entry.key] = raw;
      } else {
        this.report('warning', `字段「${entry.key}」的值只能是字符串 / 数字 / 布尔，已忽略`, entry.node ?? field, '嵌套结构请写在视图的 filters 或关系的 scenario 里');
      }
    }
    return out;
  }

  private recordOf(value: ParsedValue, field: SyntaxNode): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const entry of value.entries ?? []) {
      out[entry.key] = toPlain(entry.value, this, entry.node ?? field);
    }
    return out;
  }

  private fieldStatementsOf(block: SyntaxNode): SyntaxNode[] {
    return this.statementsOf(block).filter((node) => node.name === 'FieldStatement' || node.name === 'CallStatement');
  }

  private resolveRef(raw: string, node: SyntaxNode): string | null {
    if (this.names.has(raw)) return this.names.get(raw) as string;
    // 也可以直接引用原 id（quoted 形式在 refOfNode 里已去引号）
    if (this.ids.has(raw)) return raw;
    this.report('error', `引用「${raw}」没有对应声明`, node, '先声明实体，或在关系两端写 quoted id');
    return null;
  }

  private refOfNode(node: SyntaxNode): string {
    const raw = this.textOf(node).trim();
    return raw.startsWith('"') ? unquote(raw) : raw;
  }

  private refOf(value: ParsedValue): string | null {
    const text = value.text ?? (typeof value.value === 'string' ? value.value : '');
    if (!text) return null;
    if (this.names.has(text)) return this.names.get(text) as string;
    return text;
  }

  private stringOf(value: ParsedValue | undefined): string | null {
    if (!value) return null;
    if (typeof value.value === 'string') return value.value;
    if (typeof value.value === 'number' || typeof value.value === 'boolean') return String(value.value);
    return null;
  }

  private numberOf(value: ParsedValue | undefined, node: SyntaxNode, label: string): number {
    if (!value) {
      this.report('error', `缺少 ${label} 的数值`, node, HINTS.CallStatement);
      return 0;
    }
    if (typeof value.value === 'number') return value.value;
    this.report('error', `${label} 必须是数字，收到「${value.text ?? ''}」`, value.node ?? node, HINTS.CallStatement);
    return 0;
  }

  private booleanOf(value: ParsedValue | undefined, node: SyntaxNode, fallback: boolean): boolean {
    if (!value) return fallback;
    if (typeof value.value === 'boolean') return value.value;
    const text = value.text ?? '';
    if (text === 'true') return true;
    if (text === 'false') return false;
    this.report('error', `这里只能写 true 或 false，收到「${text}」`, value.node ?? node);
    return fallback;
  }

  private stringListOf(value: ParsedValue | undefined, node: SyntaxNode): string[] {
    if (!value) return [];
    if (value.kind === 'array') {
      return (value.items ?? [])
        .map((item) => item.text ?? (typeof item.value === 'string' ? item.value : ''))
        .filter((text) => text.length > 0);
    }
    this.report('error', '这里需要数组，形如 ["a", "b"]', value.node ?? node);
    return [];
  }

  private timeOf(value: ParsedValue | undefined): TimeRange | null {
    if (!value) return null;
    const text = value.text ?? (typeof value.value === 'string' ? value.value : '');
    if (!text) return null;
    const slash = text.indexOf('/');
    if (slash > 0 && slash < text.length - 1) {
      return { start: text.slice(0, slash).trim(), end: text.slice(slash + 1).trim() };
    }
    if (slash === 0 || slash === text.length - 1) return null;
    return { start: text.trim() };
  }

  private readValue(node: SyntaxNode): ParsedValue {
    const inner = node.firstChild ?? node;
    const raw = this.textOf(inner);
    switch (inner.name) {
      case 'QuotedString':
        return { kind: 'string', text: unquote(raw), value: unquote(raw), node: inner };
      case 'Scalar': {
        if (NUMBER_RE.test(raw)) {
          const num = Number(raw);
          return { kind: 'number', text: raw, value: num, node: inner };
        }
        return { kind: 'ident', text: raw, value: raw, node: inner };
      }
      case 'Ident': {
        if (raw === 'true' || raw === 'false') {
          return { kind: 'boolean', text: raw, value: raw === 'true', node: inner };
        }
        return { kind: 'ident', text: raw, value: raw, node: inner };
      }
      case 'Array': {
        const items = childrenOf(inner)
          .filter((child) => child.name === 'FieldValue')
          .map((child) => this.readValue(child));
        return { kind: 'array', items, node: inner };
      }
      case 'ObjectLit': {
        const entries: Array<{ key: string; value: ParsedValue; node: SyntaxNode }> = [];
        for (const pair of childrenOf(inner).filter((child) => child.name === 'Pair')) {
          const keyNode = pair.firstChild;
          const valueNode = childNamed(pair, 'FieldValue');
          if (!keyNode || !valueNode) continue;
          const keyRaw = this.textOf(keyNode);
          const key = keyRaw.startsWith('"') ? unquote(keyRaw) : keyRaw;
          entries.push({ key, value: this.readValue(valueNode), node: pair });
        }
        return { kind: 'object', entries, node: inner };
      }
      default:
        return { kind: 'empty', text: raw, node: inner };
    }
  }
}

/** 箭头文本 → 线型 + 标签（标签在 parse.ts 里解析，语法层只看成整段 token）。 */
export function parseArrow(raw: string): { style: LineStyle; label?: string } | null {
  const text = raw.trim();
  // 手写习惯的空标签写法：--> / -.-> / ..>（前缀与后缀连写会变成 ----> 这种，下面按前缀/后缀切）
  const empties: Array<{ literal: string; style: LineStyle }> = [
    { literal: '-->', style: 'solid' },
    { literal: '-.->', style: 'dashed' },
    { literal: '..>', style: 'dotted' },
  ];
  for (const empty of empties) {
    if (text === empty.literal) return { style: empty.style };
  }
  const forms: Array<{ style: LineStyle; prefix: string; suffix: string }> = [
    { style: 'solid', prefix: '--', suffix: '-->' },
    { style: 'dashed', prefix: '-.', suffix: '.->' },
    { style: 'dotted', prefix: '..', suffix: '..>' },
  ];
  for (const form of forms) {
    if (text.startsWith(form.prefix) && text.endsWith(form.suffix) && text.length >= form.prefix.length + form.suffix.length) {
      const inner = text.slice(form.prefix.length, text.length - form.suffix.length).trim();
      if (inner.length === 0) return { style: form.style };
      return { style: form.style, label: inner.startsWith('"') ? unquote(inner) : inner };
    }
  }
  return null;
}

function toPlain(value: ParsedValue, builder: Builder, node: SyntaxNode): unknown {
  if (value.value !== undefined) return value.value;
  if (value.kind === 'array') return (value.items ?? []).map((item) => toPlain(item, builder, item.node ?? node));
  if (value.kind === 'object') {
    const out: Record<string, unknown> = {};
    for (const entry of value.entries ?? []) out[entry.key] = toPlain(entry.value, builder, entry.node ?? node);
    return out;
  }
  void builder;
  return null;
}

function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * 解析入口：永不抛异常。
 * - 语法错误 → diagnostics 里带行列与修复建议，已解析出的块照常返回
 * - 没有 case 文件头（用户正在输入）→ 按块内语句尽量解析，并给一条 warning
 */
export function parseDsl(text: string): ParseResult {
  const builder = new Builder(text);
  const tree = parser.parse(text);
  try {
    return builder.build(tree);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback: CaseDoc = {
      meta: { id: 'case_empty', title: '未命名案件', createdAt: '', updatedAt: '' },
      nodes: [],
      edges: [],
      groups: [],
      assets: [],
      imageNodes: [],
      views: [],
      hypotheses: [],
      settings: DEFAULT_SETTINGS,
    };
    return {
      doc: fallback,
      diagnostics: [
        {
          severity: 'error',
          message: '解析中断：' + message,
          hint: '请检查文本里的花括号、引号与逗号是否成对',
          from: 0,
          to: Math.min(1, text.length),
          line: 1,
          column: 1,
        },
      ],
    };
  }
}
