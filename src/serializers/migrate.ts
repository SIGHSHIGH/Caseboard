import type {
  Annotation,
  AnnotationGeom,
  Asset,
  AssetFolder,
  CanvasConfig,
  CaseDoc,
  ChainDef,
  CaseEdge,
  CaseNode,
  DockCorner,
  EdgePath,
  Group,
  Hypothesis,
  HypothesisStance,
  ImageNode,
  LineStyle,
  MapBackground,
  NodeComment,
  NodeType,
  PinLink,
  Settings,
  Status,
  TimeRange,
  TimelineConfig,
  TimelinePrefs,
  TimelineTrack,
  TimelineTrackKind,
  View,
} from '../types';
import { ANNOTATION_SHAPES, DEFAULT_ANNOTATION_COLOR, normalizeGeom } from '../lib/annotation';
import { isChainStageId } from '../lib/chains';
import { CANVAS_OPACITY_DEFAULT, clampCanvasOpacity, normalizeCanvasSkin } from '../lib/canvasSkin';
import { normalizeControlPoints } from '../lib/edgeCurve';
import { NODE_TYPE_ORDER } from '../lib/nodeTemplates';
import { normalizePinLinkWidth, pinLinkId } from '../lib/clusterPin';

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
const DOCK_CORNERS = new Set<DockCorner>(['nw', 'ne', 'sw', 'se']);

/** 时间线缺省口径：按实体类型分组（与 M9 之前的行为一致，迁移零变化） */
export const DEFAULT_TIMELINE_PREFS: TimelinePrefs = { mode: 'type', trackIds: [], spanRatio: 1 };

/** 比例调控的允许区间：0.1 = 只看总区间的 1/10（放大），1 = 看全部 */
export const TIMELINE_SPAN_MIN = 0.1;
export const TIMELINE_SPAN_MAX = 1;

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
export const DEFAULT_IMAGE_W = 320;
export const DEFAULT_IMAGE_H = 240;

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
  // 卡片层级（M10）：与自由图片共用层级空间，0 表示缺省（不写字段，保持老文档字节稳定）
  const zIndex = num(raw.zIndex, 0);
  if (Number.isFinite(zIndex) && zIndex !== 0) node.zIndex = Math.round(zIndex);
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
  // 曲率偏移（M4 人工验收 A3）：旧存档里可能没有，非法值直接丢弃
  const controlPoints = normalizeControlPoints(raw.controlPoints);
  if (controlPoints) edge.controlPoints = controlPoints;
  const label = str(raw.label);
  if (label.length > 0) edge.label = label;
  const color = str(raw.color);
  if (color.length > 0) edge.color = color;
  const weight = num(raw.weight, Number.NaN);
  if (Number.isFinite(weight)) edge.weight = weight;
  // M17：线宽独立于 weight（weight 是金额/频次这类视觉重量，线宽是纯排版参数）
  const thickness = num(raw.thickness, Number.NaN);
  if (Number.isFinite(thickness)) edge.thickness = Math.min(8, Math.max(1, Math.round(thickness * 10) / 10));
  // M18：连接是否受自动梳理影响（只存 false，缺省即「可被影响」）+ 自动挑出的曲率
  if (raw.autoAnchor === false) edge.autoAnchor = false;
  const curvature = num(raw.curvature, Number.NaN);
  if (Number.isFinite(curvature)) edge.curvature = Math.max(-0.9, Math.min(0.9, Math.round(curvature * 100) / 100));
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
  if (!ANNOTATION_SHAPES.includes(shape as Annotation['shape'])) return null;
  const geom = normalizeGeom(isRecord(raw.geom) ? (raw.geom as Partial<AnnotationGeom>) : null);
  /** 空几何（宽高都为 0）的标注没有意义，直接丢弃，避免画布上出现不可见幽灵对象 */
  if (geom.w <= 0 && geom.h <= 0 && (geom.points?.length ?? 0) === 0) return null;
  const annotation: Annotation = {
    id: str(raw.id, 'an-' + index),
    shape: shape as Annotation['shape'],
    geom,
    color: str(raw.color) || DEFAULT_ANNOTATION_COLOR,
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
  const sourceLabel = str(raw.sourceLabel);
  if (sourceLabel) asset.sourceLabel = sourceLabel;
  const name = str(raw.name);
  if (name) asset.name = name;
  const no = str(raw.no);
  if (no) asset.no = no;
  if (typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0) asset.size = raw.size;
  const mimeType = str(raw.mimeType);
  if (mimeType) asset.mimeType = mimeType;
  const capturedAt = str(raw.capturedAt);
  if (capturedAt) asset.capturedAt = capturedAt;
  const camera = str(raw.camera);
  if (camera) asset.camera = camera;
  if (isRecord(raw.gps)) {
    const lat = raw.gps.lat;
    const lng = raw.gps.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      asset.gps = { lat, lng };
    }
  }
  const addedAt = str(raw.addedAt);
  if (addedAt) asset.addedAt = addedAt;
  // 所属素材文件夹（M10）：引用不存在的文件夹时由 normalizeDoc 统一清空
  const folderId = str(raw.folderId);
  if (folderId) asset.folderId = folderId;
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
  // 底色不透明度：只接受有限数，夹在 0.02–0.6，非法值一律回落到默认
  if (typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)) {
    group.opacity = Math.min(0.6, Math.max(0.02, raw.opacity));
  }
  return group;
}

const BORDER_STYLES = new Set<NonNullable<ImageNode['borderStyle']>>(['photo', 'plain', 'polaroid']);

function normalizeImageNode(
  raw: unknown,
  index: number,
  assetIds: ReadonlySet<string>,
  nodeIds: ReadonlySet<string>,
): ImageNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const assetId = str(raw.assetId);
  if (id.length === 0 || assetId.length === 0) return null;
  // 素材不在库里的图片节点画不出来，直接丢弃（与悬空边同一原则）
  if (!assetIds.has(assetId)) return null;
  const rotation = num(raw.rotation, 0);
  const wrapped = ((rotation % 360) + 360) % 360;
  const zIndex = num(raw.zIndex, index + 1);
  const node: ImageNode = {
    id,
    kind: 'freeImage',
    assetId,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(40, num(raw.w, DEFAULT_IMAGE_W)),
    h: Math.max(40, num(raw.h, DEFAULT_IMAGE_H)),
    rotation: Math.round(wrapped * 10) / 10,
    zIndex: Math.round(Number.isFinite(zIndex) ? zIndex : index + 1),
  };
  if (BORDER_STYLES.has(raw.borderStyle as NonNullable<ImageNode['borderStyle']>)) {
    node.borderStyle = raw.borderStyle as NonNullable<ImageNode['borderStyle']>;
  }
  const linkedNodeId = str(raw.linkedNodeId);
  if (linkedNodeId.length > 0 && nodeIds.has(linkedNodeId)) node.linkedNodeId = linkedNodeId;
  // 吸附角与偏移（M10）：只有真的吸附在某张卡片上时才有意义
  if (node.linkedNodeId && DOCK_CORNERS.has(str(raw.dockCorner) as DockCorner)) {
    node.dockCorner = raw.dockCorner as DockCorner;
    if (isRecord(raw.dockOffset)) {
      const dx = num(raw.dockOffset.x, NaN);
      const dy = num(raw.dockOffset.y, NaN);
      if (Number.isFinite(dx) && Number.isFinite(dy)) node.dockOffset = { x: dx, y: dy };
    }
  }
  if (raw.pinned === true) node.pinned = true;
  // M11（I6）：压缩成小圆点的图片节点
  if (raw.dotMode === true) node.dotMode = true;
  return node;
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
function normalizeStances(raw: unknown): HypothesisStance[] {
  const stances: HypothesisStance[] = [];
  const seen = new Set<string>();
  (Array.isArray(raw) ? raw : []).forEach((item) => {
    if (!isRecord(item)) return;
    const targetId = str(item.targetId);
    const targetKind: HypothesisStance['targetKind'] =
      item.targetKind === 'edge' ? 'edge' : item.targetKind === 'asset' ? 'asset' : 'node';
    const stance: HypothesisStance['stance'] | null =
      item.stance === 'refute' ? 'refute' : item.stance === 'support' ? 'support' : null;
    if (!targetId || !stance) return;
    const key = targetKind + ':' + targetId;
    if (seen.has(key)) return;
    seen.add(key);
    const entry: HypothesisStance = { targetId, targetKind, stance };
    const note = str(item.note);
    if (note) entry.note = note;
    stances.push(entry);
  });
  return stances;
}

function normalizeHypothesis(raw: unknown, index: number): Hypothesis | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title) || '假设 ' + (index + 1);
  const status: Hypothesis['status'] = raw.status === 'archived' ? 'archived' : 'active';
  const hypothesis: Hypothesis = {
    id: str(raw.id) || 'hyp-' + (index + 1),
    title,
    stances: normalizeStances(raw.stances),
    status,
    createdAt: str(raw.createdAt, new Date().toISOString()),
  };
  const summary = str(raw.summary);
  if (summary) hypothesis.summary = summary;
  return hypothesis;
}

/** 素材文件夹（M10）：title 缺失给「新建文件夹」，order 缺省按顺序 */
function normalizeAssetFolder(raw: unknown, index: number): AssetFolder | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id.length === 0) return null;
  const folder: AssetFolder = {
    id,
    title: str(raw.title, '文件夹 ' + (index + 1)),
    order: Math.round(num(raw.order, index)),
  };
  const parentId = str(raw.parentId);
  if (parentId.length > 0 && parentId !== id) folder.parentId = parentId;
  return folder;
}

/** 时间线轨道（M10）：ref 必须在允许集合里，否则这条轨道没意义，直接丢 */
function normalizeTimelineTrack(raw: unknown, index: number): TimelineTrack | null {
  if (!isRecord(raw)) return null;
  const kind: TimelineTrackKind = raw.kind === 'entity' ? 'entity' : 'type';
  const ref = str(raw.ref);
  if (ref.length === 0) return null;
  if (kind === 'type' && !NODE_TYPES.has(ref)) return null;
  const track: TimelineTrack = {
    id: str(raw.id) || 'track-' + (index + 1),
    title: str(raw.title, kind === 'type' ? '按类型：' + ref : '实体轨道'),
    kind,
    ref,
    order: Math.round(num(raw.order, index)),
  };
  const color = str(raw.color);
  if (color.length > 0) track.color = color;
  // M11（I9）：手工挑选的条目（只留字符串、去重；空的当没填，回到自动归集）
  if (Array.isArray(raw.nodeIds)) {
    const picked = Array.from(new Set(raw.nodeIds.map((item) => str(item)).filter((item) => item.length > 0)));
    if (picked.length > 0) track.nodeIds = picked;
  }
  return track;
}

/**
 * 时间线配置（M10）：轨道列表 + 显示比例。
 * 老文档没有这个字段 → 返回缺省值（按类型分组、比例 1），迁移前后观感一致。
 */
export function normalizeTimeline(raw: unknown): TimelineConfig {
  if (!isRecord(raw)) return { tracks: [], prefs: { ...DEFAULT_TIMELINE_PREFS } };
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .map((item, i) => normalizeTimelineTrack(item, i))
    .filter((item): item is TimelineTrack => item !== null);
  const prefsRaw = isRecord(raw.prefs) ? raw.prefs : null;
  const mode: TimelinePrefs['mode'] = prefsRaw?.mode === 'tracks' ? 'tracks' : 'type';
  const trackIds = prefsRaw ? strArray(prefsRaw.trackIds) : [];
  const rawRatio = prefsRaw ? num(prefsRaw.spanRatio, 1) : 1;
  const spanRatio =
    Number.isFinite(rawRatio) && rawRatio >= TIMELINE_SPAN_MIN && rawRatio <= TIMELINE_SPAN_MAX
      ? Math.round(rawRatio * 100) / 100
      : 1;
  const known = new Set(tracks.map((track) => track.id));
  return {
    tracks,
    prefs: { mode, trackIds: trackIds.filter((id) => known.has(id)), spanRatio },
  };
}

/** 自定义证据链（M12 / K14c）：未知阶段、未知实体、重复条目一律丢掉 */
function normalizeChain(raw: unknown, index: number, nodeIds: ReadonlySet<string>): ChainDef | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title).trim() || '证据链 ' + (index + 1);
  const id = str(raw.id) || 'chain-' + index;
  const entries: ChainDef['entries'] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!isRecord(item)) continue;
    const nodeId = str(item.nodeId);
    if (!nodeId || !nodeIds.has(nodeId) || !isChainStageId(item.stageId)) continue;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    entries.push({ nodeId, stageId: item.stageId });
  }
  const chain: ChainDef = { id, title, entries };
  const note = str(raw.note).trim();
  if (note) chain.note = note;
  return chain;
}

/** 画布底衬与背景图（M14）：皮肤取白名单，素材 id 必须存在（由调用方用 assetIds 过滤） */
function normalizeCanvas(raw: unknown, assetIds: ReadonlySet<string>): CanvasConfig | null {
  if (!isRecord(raw)) return null;
  const canvas: CanvasConfig = { skin: normalizeCanvasSkin(raw.skin) };
  const assetId = str(raw.assetId);
  if (assetId.length > 0 && assetIds.has(assetId)) {
    canvas.assetId = assetId;
    canvas.opacity = clampCanvasOpacity(num(raw.opacity, CANVAS_OPACITY_DEFAULT));
  }
  if (canvas.skin === 'paper' && !canvas.assetId) return null;
  return canvas;
}

/** 地图底图（M10）：素材 id 必须存在（由调用方用 assetIds 过滤） */
function normalizeMapBackground(raw: unknown, assetIds: ReadonlySet<string>): MapBackground | null {
  if (!isRecord(raw)) return null;
  const assetId = str(raw.assetId);
  if (assetId.length === 0 || !assetIds.has(assetId)) return null;
  const background: MapBackground = { assetId };
  if (isRecord(raw.bounds)) {
    const b = raw.bounds;
    const bounds = {
      minLat: num(b.minLat, 0),
      maxLat: num(b.maxLat, 0),
      minLng: num(b.minLng, 0),
      maxLng: num(b.maxLng, 0),
      spanLat: num(b.spanLat, 0),
      spanLng: num(b.spanLng, 0),
    };
    if (Number.isFinite(bounds.minLat) && Number.isFinite(bounds.maxLat) && bounds.maxLat > bounds.minLat) {
      if (bounds.spanLat <= 0) bounds.spanLat = bounds.maxLat - bounds.minLat;
      if (bounds.spanLng <= 0) bounds.spanLng = Math.max(0.002, bounds.maxLng - bounds.minLng);
      background.bounds = bounds;
    }
  }
  const opacity = num(raw.opacity, NaN);
  if (Number.isFinite(opacity)) background.opacity = Math.min(1, Math.max(0.15, opacity));
  return background;
}

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
  const assetIds = new Set(assets.map((asset) => asset.id));
  const imageNodes: ImageNode[] = [];
  const seenImageIds = new Set<string>();
  (Array.isArray(input.imageNodes) ? input.imageNodes : []).forEach((raw, index) => {
    const image = normalizeImageNode(raw, index, assetIds, seenNodeIds);
    if (!image || seenImageIds.has(image.id)) return;
    seenImageIds.add(image.id);
    imageNodes.push(image);
  });

  const hypotheses = (Array.isArray(input.hypotheses) ? input.hypotheses : [])
    .map((raw, index) => normalizeHypothesis(raw, index))
    .filter((item): item is Hypothesis => item !== null);

  const views = (Array.isArray(input.views) ? input.views : [])
    .map((raw, index) => normalizeView(raw, index))
    .filter((item): item is View => item !== null);

  // 素材文件夹（M10）：先收文件夹，再回头清理素材上指向不存在文件夹的引用
  const assetFolders = (Array.isArray(input.assetFolders) ? input.assetFolders : [])
    .map((raw, index) => normalizeAssetFolder(raw, index))
    .filter((item): item is AssetFolder => item !== null)
    .filter((folder, index, list) => list.findIndex((item) => item.id === folder.id) === index);
  const folderIds = new Set(assetFolders.map((folder) => folder.id));
  assetFolders.forEach((folder) => {
    if (folder.parentId && (!folderIds.has(folder.parentId) || folder.parentId === folder.id)) {
      delete folder.parentId;
    }
  });
  assets.forEach((asset) => {
    if (asset.folderId && !folderIds.has(asset.folderId)) delete asset.folderId;
  });

  const timeline = normalizeTimeline(input.timeline);

  // 红线（回填 H5.6）：normalizeDoc 是白名单重建，之前把 pinLinks 整个丢掉，
  // 导致打开导出的 .caseboard/json 后红线全消失。这里归一化并保留。
  const pinLinks: PinLink[] = [];
  const seenPinLinks = new Set<string>();
  (Array.isArray(input.pinLinks) ? input.pinLinks : []).forEach((raw) => {
    if (!isRecord(raw)) return;
    const source = str(raw.source);
    const target = str(raw.target);
    if (source.length === 0 || target.length === 0 || source === target) return;
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    if (!sourceNode || !targetNode) return;
    if (sourceNode.type !== 'clusterPin' || targetNode.type !== 'clusterPin') return;
    // 与 addPinLink 一致：同一对钉子正反两向算同一条，这里做规范化方向
    const pair = [source, target].sort();
    const head = pair[0];
    const tail = pair[1];
    const id = pinLinkId(head, tail);
    if (seenPinLinks.has(id)) return;
    seenPinLinks.add(id);
    pinLinks.push({ id, source: head, target: tail });
  });

  // 自定义证据链（M12）：丢掉未知阶段、未知实体与重复条目，避免脏链让界面报错
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const chains = (Array.isArray(input.chains) ? input.chains : [])
    .map((raw, index) => normalizeChain(raw, index, nodeIdSet))
    .filter((item): item is ChainDef => item !== null)
    .filter((chain, index, list) => list.findIndex((item) => item.id === chain.id) === index);

  const settings = isRecord(input.settings) ? input.settings : null;
  const lineLegend = settings && isRecord(settings.lineLegend) ? settings.lineLegend : null;
  const mapBackground = settings ? normalizeMapBackground(settings.mapBackground, assetIds) : null;
  const canvas = settings ? normalizeCanvas(settings.canvas, assetIds) : null;

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
    assetFolders,
    imageNodes,
    views,
    hypotheses,
    ...(pinLinks.length > 0 ? { pinLinks } : {}),
    ...(chains.length > 0 ? { chains } : {}),
    timeline,
    settings: {
      theme: settings ? str(settings.theme, DEFAULT_SETTINGS.theme) : DEFAULT_SETTINGS.theme,
      lineLegend: lineLegend
        ? (lineLegend as unknown as Settings['lineLegend'])
        : DEFAULT_SETTINGS.lineLegend,
      ...(mapBackground ? { mapBackground } : {}),
      ...(canvas ? { canvas } : {}),
      ...(settings && settings.pinLinkWidth !== undefined
        ? { pinLinkWidth: normalizePinLinkWidth(settings.pinLinkWidth) }
        : {}),
    },
  };
}
