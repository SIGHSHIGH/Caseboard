import type {
  Annotation,
  Asset,
  CaseDoc,
  CaseEdge,
  CaseNode,
  EdgePath,
  Group,
  LineStyle,
  NodeComment,
  NodeType,
  Settings,
  Status,
  TimeRange,
  View,
} from '../types';
import { NODE_TYPE_ORDER } from '../lib/nodeTemplates';

/**
 * 文档迁移与兜底（M2-1）。
 * 任何进入 store 的文档（localStorage 自动存档 / 导入 JSON / 未来 SQLite 读出）都必须先过这里：
 * 老版本缺字段 → 补默认值；类型非法 → 落到安全值。原则是「不因一个坏字段丢整份案件」，
 * 但 meta 与 nodes/edges 数组缺失会抛错，避免把空壳当案件打开（Gate 0-2）。
 */
export class DocMigrateError extends Error {}

const NODE_TYPES = new Set<string>(NODE_TYPE_ORDER);
const STATUSES = new Set<Status>(['todo', 'checking', 'confirmed', 'ruledout']);
const STYLES = new Set<LineStyle>(['solid', 'dashed', 'dotted']);
const PATHS = new Set<EdgePath>(['bezier', 'straight', 'step']);
const ASSET_KINDS = new Set<Asset['kind']>(['image', 'pdf', 'video', 'audio', 'file']);

export const DEFAULT_SETTINGS: Settings = {
  theme: 'whiteboard',
  lineLegend: {
    solid: { label: '已证实', style: 'solid', color: '#6E6862' },
    dashed: { label: '推测', style: 'dashed', color: '#6E6862' },
    dotted: { label: '待核实', style: 'dotted', color: '#6E6862' },
  },
};

export const DEFAULT_NODE_W = 208;
export const DEFAULT_NODE_H = 96;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp01to100(value: unknown, fallback: number): number {
  const parsed = num(value, fallback);
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function timeOf(value: unknown): TimeRange | undefined {
  if (!isRecord(value)) return undefined;
  const start = str(value.start);
  if (start.length === 0) return undefined;
  const end = str(value.end);
  return end.length > 0 ? { start, end } : { start };
}

function fieldsOf(value: unknown): Record<string, string | number | boolean> {
  if (!isRecord(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

function commentsOf(value: unknown): NodeComment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .filter(isRecord)
    .map((raw, index) => ({
      id: str(raw.id, 'c-' + index),
      text: str(raw.text),
      author: str(raw.author) || undefined,
      createdAt: str(raw.createdAt, new Date().toISOString()),
    }))
    .filter((comment) => comment.text.trim().length > 0);
  return list.length > 0 ? list : undefined;
}

function normalizeNode(raw: unknown, index: number): CaseNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id.length === 0) return null;
  const type = (NODE_TYPES.has(str(raw.type)) ? raw.type : 'note') as NodeType;
  const node: CaseNode = {
    id,
    type,
    title: str(raw.title, '未命名节点 ' + (index + 1)),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: num(raw.w, DEFAULT_NODE_W) || DEFAULT_NODE_W,
    h: num(raw.h, DEFAULT_NODE_H) || DEFAULT_NODE_H,
    fields: fieldsOf(raw.fields),
    tags: strArray(raw.tags),
    status: STATUSES.has(raw.status as Status) ? (raw.status as Status) : 'todo',
    confidence: clamp01to100(raw.confidence, 50),
    attachments: strArray(raw.attachments),
  };
  const groupId = str(raw.groupId);
  if (groupId.length > 0) node.groupId = groupId;
  const photo = str(raw.photo);
  if (photo.length > 0) node.photo = photo;
  const aliases = strArray(raw.aliases);
  if (aliases.length > 0) node.aliases = aliases;
  const notes = str(raw.notes);
  if (notes.length > 0) node.notes = notes;
  const time = timeOf(raw.time);
  if (time) node.time = time;
  if (raw.collapsed === true) node.collapsed = true;
  const comments = commentsOf(raw.comments);
  if (comments) node.comments = comments;
  return node;
}

function normalizeEdge(raw: unknown, index: number): CaseEdge | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const source = str(raw.source);
  const target = str(raw.target);
  if (id.length === 0 || source.length === 0 || target.length === 0) return null;
  const edge: CaseEdge = {
    id,
    source,
    target,
    path: PATHS.has(raw.path as EdgePath) ? (raw.path as EdgePath) : 'bezier',
    relType: str(raw.relType, 'other'),
    directed: raw.directed !== false,
    style: STYLES.has(raw.style as LineStyle) ? (raw.style as LineStyle) : 'dotted',
    confidence: clamp01to100(raw.confidence, 40),
    evidenceIds: strArray(raw.evidenceIds),
  };
  const sourceHandle = str(raw.sourceHandle);
  if (sourceHandle.length > 0) edge.sourceHandle = sourceHandle;
  const targetHandle = str(raw.targetHandle);
  if (targetHandle.length > 0) edge.targetHandle = targetHandle;
  const label = str(raw.label);
  if (label.length > 0) edge.label = label;
  const color = str(raw.color);
  if (color.length > 0) edge.color = color;
  const weight = num(raw.weight, Number.NaN);
  if (Number.isFinite(weight)) edge.weight = weight;
  const time = timeOf(raw.time);
  if (time) edge.time = time;
  const notes = str(raw.notes);
  if (notes.length > 0) edge.notes = notes;
  void index;
  return edge;
}

function annotationOf(raw: unknown, index: number): Annotation | null {
  if (!isRecord(raw)) return null;
  const shape = str(raw.shape);
  const allowed: Annotation['shape'][] = ['rect', 'arrow', 'pen', 'text', 'anchor', 'mosaic'];
  if (!allowed.includes(shape as Annotation['shape'])) return null;
  const annotation: Annotation = {
    id: str(raw.id, 'a-' + index),
    shape: shape as Annotation['shape'],
    geom: isRecord(raw.geom) ? raw.geom : {},
  };
  const text = str(raw.text);
  if (text.length > 0) annotation.text = text;
  const linkedNodeId = str(raw.linkedNodeId);
  if (linkedNodeId.length > 0) annotation.linkedNodeId = linkedNodeId;
  return annotation;
}

function normalizeAsset(raw: unknown, index: number): Asset | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id.length === 0) return null;
  const annotations = Array.isArray(raw.annotations)
    ? raw.annotations.map((item, i) => annotationOf(item, i)).filter((item): item is Annotation => item !== null)
    : [];
  const asset: Asset = {
    id,
    path: str(raw.path),
    kind: ASSET_KINDS.has(raw.kind as Asset['kind']) ? (raw.kind as Asset['kind']) : 'image',
    hash: str(raw.hash),
    thumbnails: strArray(raw.thumbnails),
    annotations,
  };
  const zone = str(raw.zone);
  asset.zone = zone === 'ai' ? 'ai' : 'evidence';
  const source = str(raw.source);
  if (source === 'import' || source === 'clipboard' || source === 'watch' || source === 'ai') {
    asset.source = source;
  }
  if (raw.width !== undefined) asset.width = num(raw.width, 0);
  if (raw.height !== undefined) asset.height = num(raw.height, 0);
  if (raw.ocrText !== undefined) asset.ocrText = str(raw.ocrText);
  if (raw.aiGenerated === true) asset.aiGenerated = true;
  if (isRecord(raw.aiMeta)) asset.aiMeta = raw.aiMeta as unknown as Asset['aiMeta'];
  void index;
  return asset;
}

function normalizeGroup(raw: unknown, index: number): Group | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id.length === 0) return null;
  const bounds = isRecord(raw.bounds) ? raw.bounds : {};
  const group: Group = {
    id,
    title: str(raw.title, '未命名分组 ' + (index + 1)),
    bounds: {
      x: num(bounds.x, 0),
      y: num(bounds.y, 0),
      w: Math.max(120, num(bounds.w, 320)),
      h: Math.max(80, num(bounds.h, 240)),
    },
    color: str(raw.color, '#6E6862'),
    collapsed: raw.collapsed === true,
  };
  const parentId = str(raw.parentId);
  if (parentId.length > 0 && parentId !== id) group.parentId = parentId;
  return group;
}

function normalizeView(raw: unknown, index: number): View | null {
  if (!isRecord(raw)) return null;
  const kinds: View['kind'][] = ['board', 'timeline', 'map', 'chain', 'presentation', 'scenario'];
  const kind = str(raw.kind);
  const view: View = {
    id: str(raw.id, 'view-' + index),
    kind: kinds.includes(kind as View['kind']) ? (kind as View['kind']) : 'board',
    name: str(raw.name, '视图 ' + (index + 1)),
    filters: isRecord(raw.filters) ? raw.filters : {},
  };
  if (isRecord(raw.camera)) {
    view.camera = {
      x: num(raw.camera.x, 0),
      y: num(raw.camera.y, 0),
      zoom: num(raw.camera.zoom, 1) || 1,
    };
  }
  if (Array.isArray(raw.steps)) view.steps = raw.steps;
  return view;
}

/**
 * 把任意可疑输入整理成合法 CaseDoc。
 * 抛错只在「连案件骨架都没有」时发生（meta/nodes/edges），其余一律兜底。
 */
export function normalizeDoc(input: unknown): CaseDoc {
  if (!isRecord(input)) throw new DocMigrateError('文档根节点不是对象');
  if (!isRecord(input.meta)) throw new DocMigrateError('缺少 meta 字段');
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new DocMigrateError('缺少 nodes / edges 数组');
  }
  const meta = input.meta;
  const title = str(meta.title);
  const id = str(meta.id);
  if (title.length === 0 || id.length === 0) throw new DocMigrateError('meta.title 或 meta.id 缺失');
  const now = new Date().toISOString();

  const nodes: CaseNode[] = [];
  const seenNodeIds = new Set<string>();
  input.nodes.forEach((raw, index) => {
    const node = normalizeNode(raw, index);
    if (!node || seenNodeIds.has(node.id)) return;
    seenNodeIds.add(node.id);
    nodes.push(node);
  });

  const edges: CaseEdge[] = [];
  const seenEdgeIds = new Set<string>();
  input.edges.forEach((raw, index) => {
    const edge = normalizeEdge(raw, index);
    if (!edge || seenEdgeIds.has(edge.id)) return;
    // 端点必须存在，否则画布上会出现永远画不出来的悬空边
    if (!seenNodeIds.has(edge.source) || !seenNodeIds.has(edge.target)) return;
    seenEdgeIds.add(edge.id);
    edges.push(edge);
  });

  const groups = (Array.isArray(input.groups) ? input.groups : [])
    .map((raw, index) => normalizeGroup(raw, index))
    .filter((item): item is Group => item !== null);
  const assets = (Array.isArray(input.assets) ? input.assets : [])
    .map((raw, index) => normalizeAsset(raw, index))
    .filter((item): item is Asset => item !== null);
  const views = (Array.isArray(input.views) ? input.views : [])
    .map((raw, index) => normalizeView(raw, index))
    .filter((item): item is View => item !== null);

  const settings = isRecord(input.settings) ? input.settings : null;
  const lineLegend = settings && isRecord(settings.lineLegend) ? settings.lineLegend : null;

  return {
    meta: {
      id,
      title,
      caseNo: str(meta.caseNo) || undefined,
      createdAt: str(meta.createdAt, now),
      updatedAt: str(meta.updatedAt, now),
    },
    nodes,
    edges,
    groups,
    assets,
    views,
    settings: {
      theme: settings ? str(settings.theme, DEFAULT_SETTINGS.theme) : DEFAULT_SETTINGS.theme,
      lineLegend: lineLegend
        ? (lineLegend as unknown as Settings['lineLegend'])
        : DEFAULT_SETTINGS.lineLegend,
    },
  };
}
