import type { SyntaxNode } from '@lezer/common';
import type { CaseDoc } from '../types';
import { parser } from './generated/caseboard.parser';
import { dslNameTable } from './serialize';

/**
 * M3-4：文本视图 ↔ 画布的双向定位。
 *
 * 只用语法树与名字表，不依赖 DOM / CodeMirror —— 逻辑层可以单测（scripts/smoke.cjs [23]）。
 *
 * 语法树里有两类「噪声」需要在遍历时跳过：
 * 1. @skip 的 WS / 注释 token 仍会作为节点出现（Lezer 只跳过语法匹配，不删树节点）；
 * 2. Block 的直接子节点是 Statement 包装节点，Declaration / EdgeStatement 在它下面一层。
 */
export type DeclKind = 'node' | 'edge' | 'group' | 'view';

export interface DeclRange {
  kind: DeclKind;
  /** 语法里的名字（实体的 DSL 标识符；关系是「源 → 目标」） */
  name: string;
  /** 模型 id（块内 `id:` 行优先；实体也可由名字反查） */
  id: string | null;
  /** 整条声明 / 关系语句的范围 */
  from: number;
  to: number;
  /** 名字本身的范围，用于选中定位 */
  nameFrom: number;
  nameTo: number;
}

const ENTITY_TYPES = new Set(['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note']);
const SKIP_NAMES = new Set(['WS', 'LineComment', 'BlockComment']);

function stripQuoted(raw: string): string {
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.replace(/^"|"$/g, '');
    }
  }
  return raw;
}

/** 跳过空白/注释后的下一个兄弟节点。 */
function nextMeaningful(node: SyntaxNode | null): SyntaxNode | null {
  let current = node;
  while (current && SKIP_NAMES.has(current.name)) current = current.nextSibling;
  return current;
}

/** 有意义（非空白、非注释）的直接子节点。 */
function kids(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  let child = nextMeaningful(node.firstChild);
  while (child) {
    out.push(child);
    child = nextMeaningful(child.nextSibling);
  }
  return out;
}

/** 块内的 `id: "原 id"` 行 —— 序列化器只在名字被改写时才写它。 */
function blockId(block: SyntaxNode | null, text: string): string | null {
  if (!block) return null;
  for (const child of kids(block)) {
    // 字段语句同样被 Statement 包装一层
    const statement =
      child.name === 'Statement' ? kids(child).find((node) => node.name === 'FieldStatement') : child;
    if (!statement || statement.name !== 'FieldStatement') continue;
    const parts = kids(statement);
    const key = parts.find((part) => part.name === 'Ident');
    if (!key || text.slice(key.from, key.to) !== 'id') continue;
    const value = parts.find((part) => part.name === 'FieldValue');
    const quoted = value ? kids(value).find((part) => part.name === 'QuotedString') : null;
    if (quoted) return stripQuoted(text.slice(quoted.from, quoted.to));
  }
  return null;
}

function firstNamed(parent: SyntaxNode, name: string): SyntaxNode | null {
  return kids(parent).find((child) => child.name === name) ?? null;
}

function allNamed(parent: SyntaxNode, name: string): SyntaxNode[] {
  return kids(parent).filter((child) => child.name === name);
}

function statementsOf(root: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const collect = (block: SyntaxNode) => {
    for (const child of kids(block)) {
      if (child.name === 'Declaration' || child.name === 'EdgeStatement') {
        out.push(child);
      } else if (child.name === 'Statement') {
        // Statement 只是语法包装层，真正的声明在它下面
        const inner = kids(child).find((node) => node.name === 'Declaration' || node.name === 'EdgeStatement');
        if (inner) out.push(inner);
      }
    }
  };
  for (const child of kids(root)) {
    if (child.name === 'Block') collect(child);
    else if (child.name === 'CaseStatement') {
      const block = firstNamed(child, 'Block');
      if (block) collect(block);
    }
  }
  return out;
}

/** 解析文本得到所有声明 / 关系语句的位置（容错文本也能定位能解析的部分）。 */
export function locateDeclarations(text: string): DeclRange[] {
  const root = parser.parse(text).topNode;
  const out: DeclRange[] = [];
  for (const node of statementsOf(root)) {
    const block = firstNamed(node, 'Block');
    if (node.name === 'Declaration') {
      const idents = allNamed(node, 'Ident');
      const typeWord = idents[0] ? text.slice(idents[0].from, idents[0].to) : '';
      const nameNode = idents[1] ?? idents[0] ?? null;
      if (!nameNode) continue;
      const kind: DeclKind = typeWord === 'group' ? 'group' : typeWord === 'view' ? 'view' : 'node';
      if (kind === 'node' && !ENTITY_TYPES.has(typeWord)) continue;
      out.push({
        kind,
        name: text.slice(nameNode.from, nameNode.to),
        id: blockId(block, text),
        from: node.from,
        to: node.to,
        nameFrom: nameNode.from,
        nameTo: nameNode.to,
      });
      continue;
    }
    if (node.name === 'EdgeStatement') {
      const refs = allNamed(node, 'Ref');
      const source = refs[0] ? stripQuoted(text.slice(refs[0].from, refs[0].to)) : '?';
      const target = refs[1] ? stripQuoted(text.slice(refs[1].from, refs[1].to)) : '?';
      const sourceNode = refs[0]?.firstChild ?? null;
      out.push({
        kind: 'edge',
        name: `${source} → ${target}`,
        id: blockId(block, text) ?? `e_${source}__${target}`,
        from: node.from,
        to: node.to,
        nameFrom: sourceNode?.from ?? node.from,
        nameTo: sourceNode?.to ?? node.from,
      });
    }
  }
  return out;
}

/** 模型 id → 文本里的声明位置；找不到返回 null（对象只在画布上，没被文本表达）。 */
export function findDeclRange(text: string, doc: CaseDoc, id: string): DeclRange | null {
  const decls = locateDeclarations(text);
  if (doc.edges.some((edge) => edge.id === id)) {
    return decls.find((decl) => decl.kind === 'edge' && decl.id === id) ?? null;
  }
  if (doc.groups.some((group) => group.id === id)) {
    const name = dslNameTable(doc).names.get(id);
    return decls.find((decl) => decl.kind === 'group' && decl.name === name) ?? null;
  }
  if (doc.views.some((view) => view.id === id)) {
    return decls.find((decl) => decl.kind === 'view' && decl.id === id) ?? null;
  }
  const name = dslNameTable(doc).names.get(id);
  return decls.find((decl) => decl.kind === 'node' && decl.name === name) ?? null;
}

/** 光标位置 → 所在声明对应的模型 id（用于代码侧选中带动画布选中）。 */
export function declIdAtPosition(text: string, doc: CaseDoc, pos: number): { id: string; kind: DeclKind } | null {
  const decls = locateDeclarations(text);
  let found: DeclRange | null = null;
  for (const decl of decls) {
    if (pos >= decl.from && pos <= decl.to) {
      if (!found || decl.to - decl.from < found.to - found.from) found = decl;
    }
  }
  if (!found) return null;
  if (found.kind === 'edge') return found.id ? { id: found.id, kind: 'edge' } : null;
  const reverse = dslNameTable(doc).reverse;
  const id = reverse.get(found.name);
  return id ? { id, kind: found.kind } : null;
}
