/**
 * Document Model ↔ SQLite 行 的纯映射层。
 *
 * 为什么单独一层：SQL 语句难以在 node 里跑（没有 sqlite 驱动），但「模型 ←→ 行」的
 * 字段完整性、排序稳定性、全文检索条目生成都是纯函数，可以在 smoke 里逐条断言。
 * 数据库读写（repo.ts）只负责把这里算好的行写进去/读出来。
 */
import type { Asset, CaseDoc, CaseEdge, CaseNode, Group, View } from '../../types';

export interface CaseRow {
  id: string;
  title: string;
  case_no: string | null;
  created_at: string;
  updated_at: string;
  doc_json: string;
}

export interface NodeRow {
  case_id: string;
  id: string;
  type: string;
  title: string;
  status: string;
  confidence: number;
  group_id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  payload: string;
}

export interface EdgeRow {
  case_id: string;
  id: string;
  source: string;
  target: string;
  rel_type: string;
  style: string;
  confidence: number;
  payload: string;
}

export interface GroupRow {
  case_id: string;
  id: string;
  title: string;
  payload: string;
}

export interface AssetRow {
  case_id: string;
  id: string;
  name: string;
  kind: string;
  sha256: string | null;
  zone: string;
  ai_generated: number;
  payload: string;
}

export interface ViewRow {
  case_id: string;
  id: string;
  kind: string;
  name: string;
  payload: string;
}

export interface SearchRow {
  case_id: string;
  kind: string;
  entity_id: string;
  title: string;
  body: string;
}

export interface EntityRows {
  caseRow: CaseRow;
  nodeRows: NodeRow[];
  edgeRows: EdgeRow[];
  groupRows: GroupRow[];
  assetRows: AssetRow[];
  viewRows: ViewRow[];
  searchRows: SearchRow[];
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/** 节点 → 行（payload 保留完整对象，列只用于查询与排序）。 */
export function nodeToRow(caseId: string, node: CaseNode): NodeRow {
  return {
    case_id: caseId,
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    confidence: node.confidence,
    group_id: node.groupId ?? null,
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    payload: stableJson(node),
  };
}

export function rowToNode(row: NodeRow): CaseNode {
  return JSON.parse(row.payload) as CaseNode;
}

export function edgeToRow(caseId: string, edge: CaseEdge): EdgeRow {
  return {
    case_id: caseId,
    id: edge.id,
    source: edge.source,
    target: edge.target,
    rel_type: edge.relType,
    style: edge.style,
    confidence: edge.confidence,
    payload: stableJson(edge),
  };
}

export function rowToEdge(row: EdgeRow): CaseEdge {
  return JSON.parse(row.payload) as CaseEdge;
}

export function groupToRow(caseId: string, group: Group): GroupRow {
  return { case_id: caseId, id: group.id, title: group.title, payload: stableJson(group) };
}

export function rowToGroup(row: GroupRow): Group {
  return JSON.parse(row.payload) as Group;
}

export function assetToRow(caseId: string, asset: Asset): AssetRow {
  return {
    case_id: caseId,
    id: asset.id,
    name: asset.name ?? asset.path,
    kind: asset.kind,
    sha256: asset.hash ?? null,
    zone: asset.zone ?? 'evidence',
    ai_generated: asset.aiGenerated ? 1 : 0,
    payload: stableJson(asset),
  };
}

export function rowToAsset(row: AssetRow): Asset {
  return JSON.parse(row.payload) as Asset;
}

export function viewToRow(caseId: string, view: View): ViewRow {
  return { case_id: caseId, id: view.id, kind: view.kind, name: view.name, payload: stableJson(view) };
}

export function rowToView(row: ViewRow): View {
  return JSON.parse(row.payload) as View;
}

/** 节点正文：别名、标签、字段、备注、附件名都进全文索引。 */
export function nodeBody(node: CaseNode): string {
  const fields = Object.entries(node.fields ?? {}).map(([key, value]) => key + ' ' + String(value));
  const parts = [
    ...(node.aliases ?? []),
    ...(node.tags ?? []),
    ...fields,
    node.notes ?? '',
    ...(node.attachments ?? []),
  ];
  return parts.filter((part) => part && String(part).trim().length > 0).join(' ');
}

export function searchRowsFor(caseId: string, doc: CaseDoc): SearchRow[] {
  const rows: SearchRow[] = [];
  for (const node of doc.nodes) {
    rows.push({ case_id: caseId, kind: 'node', entity_id: node.id, title: node.title, body: nodeBody(node) });
  }
  for (const edge of doc.edges) {
    const body = [edge.label ?? '', edge.notes ?? ''].filter(Boolean).join(' ');
    rows.push({ case_id: caseId, kind: 'edge', entity_id: edge.id, title: edge.relType, body });
  }
  for (const group of doc.groups) {
    rows.push({ case_id: caseId, kind: 'group', entity_id: group.id, title: group.title, body: '' });
  }
  for (const asset of doc.assets) {
    const body = [asset.name ?? '', asset.sourceLabel ?? '', asset.ocrText ?? '', asset.capturedAt ?? ''].filter(Boolean).join(' ');
    rows.push({ case_id: caseId, kind: 'asset', entity_id: asset.id, title: asset.name ?? asset.path, body });
  }
  for (const view of doc.views) {
    rows.push({ case_id: caseId, kind: 'view', entity_id: view.id, title: view.name, body: '' });
  }
  return rows;
}

/** 把一份文档摊平成行集合（保存时整表替换，简单且不会留孤儿行）。 */
export function docToRows(doc: CaseDoc): EntityRows {
  const caseId = doc.meta.id;
  return {
    caseRow: {
      id: caseId,
      title: doc.meta.title,
      case_no: doc.meta.caseNo ?? null,
      created_at: doc.meta.createdAt,
      updated_at: doc.meta.updatedAt,
      doc_json: stableJson(doc),
    },
    nodeRows: doc.nodes.map((node) => nodeToRow(caseId, node)),
    edgeRows: doc.edges.map((edge) => edgeToRow(caseId, edge)),
    groupRows: doc.groups.map((group) => groupToRow(caseId, group)),
    assetRows: doc.assets.map((asset) => assetToRow(caseId, asset)),
    viewRows: doc.views.map((view) => viewToRow(caseId, view)),
    searchRows: searchRowsFor(caseId, doc),
  };
}

/** 从行集合还原文档：优先用 cases.doc_json（无损），缺失时由各实体行拼装。 */
export function rowsToDoc(rows: {
  caseRow: CaseRow;
  nodeRows?: NodeRow[];
  edgeRows?: EdgeRow[];
  groupRows?: GroupRow[];
  assetRows?: AssetRow[];
  viewRows?: ViewRow[];
}): CaseDoc {
  if (rows.caseRow.doc_json && rows.caseRow.doc_json.trim().length > 2) {
    return JSON.parse(rows.caseRow.doc_json) as CaseDoc;
  }
  return {
    meta: {
      id: rows.caseRow.id,
      title: rows.caseRow.title,
      caseNo: rows.caseRow.case_no ?? undefined,
      createdAt: rows.caseRow.created_at,
      updatedAt: rows.caseRow.updated_at,
    },
    nodes: (rows.nodeRows ?? []).map(rowToNode),
    edges: (rows.edgeRows ?? []).map(rowToEdge),
    groups: (rows.groupRows ?? []).map(rowToGroup),
    assets: (rows.assetRows ?? []).map(rowToAsset),
    imageNodes: [],
    views: (rows.viewRows ?? []).map(rowToView),
    settings: { theme: 'board', lineLegend: {} },
  };
}
