/**
 * 数据模型 —— 严格对齐规格 docs/CaseBoard-SPEC.md 第 3 节。
 * 允许新增字段，不得删除核心字段。
 */

export type NodeType = 'person' | 'org' | 'place' | 'item' | 'event' | 'evidence' | 'time' | 'note';

export type Status = 'todo' | 'checking' | 'confirmed' | 'ruledout';

/** 线型即语义：实线=已证实 / 虚线=推测 / 点线=待核实 */
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type EdgePath = 'bezier' | 'straight' | 'step';

export interface XY {
  x: number;
  y: number;
}

export interface TimeRange {
  start: string;
  end?: string;
}

/** 节点评论（规格 M2 要求的「评论」；只存文本与时间，不做协作） */
export interface NodeComment {
  id: string;
  text: string;
  author?: string;
  createdAt: string;
}

export interface CaseNode {
  id: string;
  type: NodeType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  groupId?: string;
  /** 封面图 asset id */
  photo?: string;
  fields: Record<string, string | number | boolean>;
  aliases?: string[];
  tags: string[];
  status: Status;
  confidence: number;
  time?: TimeRange;
  attachments: string[];
  notes?: string;
  /** 卡片折叠详情（只显示标题与状态）；M2-1 新增 */
  collapsed?: boolean;
  comments?: NodeComment[];
}

export interface CaseEdge {
  id: string;
  source: string;
  target: string;
  /** 锚点 handle id（top/right/bottom/left），规格外新增字段 */
  sourceHandle?: string;
  targetHandle?: string;
  sourceAnchor?: XY;
  targetAnchor?: XY;
  controlPoints?: XY[];
  path: EdgePath;
  relType: string;
  label?: string;
  directed: boolean;
  style: LineStyle;
  color?: string;
  /** 视觉重量：金额 / 频次 */
  weight?: number;
  time?: TimeRange;
  confidence: number;
  evidenceIds: string[];
  notes?: string;
  scenario?: Record<string, 'support' | 'refute'>;
}

export interface Group {
  id: string;
  title: string;
  bounds: { x: number; y: number; w: number; h: number };
  color: string;
  parentId?: string;
  collapsed: boolean;
  /** 底色不透明度（0.02–0.6），M2-2 新增；未设置时用默认值 */
  opacity?: number;
}

export interface Annotation {
  id: string;
  shape: 'rect' | 'arrow' | 'pen' | 'text' | 'anchor' | 'mosaic';
  geom: Record<string, unknown>;
  text?: string;
  linkedNodeId?: string;
}

export interface AiMeta {
  preset: 'sketch' | 'scene' | 'item' | 'enhance';
  prompt: string;
  negativePrompt?: string;
  model: string;
  seed?: number;
  params?: Record<string, unknown>;
  createdAt: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Asset {
  id: string;
  /** 素材在库内的相对路径（M2 为 IndexedDB key，M4 起为项目内相对路径） */
  path: string;
  kind: 'image' | 'pdf' | 'video' | 'audio' | 'file';
  hash: string;
  ocrText?: string;
  thumbnails: string[];
  source?: 'import' | 'clipboard' | 'watch' | 'ai';
  /** 真实证据 / AI 生成分区 */
  zone?: 'evidence' | 'ai';
  width?: number;
  height?: number;
  /** 原始文件名 */
  name?: string;
  /** 字节数 */
  size?: number;
  mimeType?: string;
  /** 案件内素材编号，如 IMG-0001 */
  no?: string;
  /** 来源文字标签（现场照片 / 书证翻拍 / 监控截图 …），与 source 渠道字段并存 */
  sourceLabel?: string;
  /** EXIF 拍摄时间（ISO 字符串） */
  capturedAt?: string;
  /** EXIF 机身/镜头描述 */
  camera?: string;
  /** EXIF GPS：读取后仅提示定位风险，不清洗也不自动上图 */
  gps?: GeoPoint;
  addedAt?: string;
  annotations: Annotation[];
  aiGenerated?: boolean;
  aiMeta?: AiMeta;
}

export interface ImageNode {
  id: string;
  kind: 'freeImage';
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  borderStyle?: 'photo' | 'plain' | 'polaroid';
  linkedNodeId?: string;
}

export interface View {
  id: string;
  kind: 'board' | 'timeline' | 'map' | 'chain' | 'presentation' | 'scenario';
  name: string;
  filters: Record<string, unknown>;
  camera?: { x: number; y: number; zoom: number };
  steps?: unknown[];
}

export interface Settings {
  theme: string;
  lineLegend: Record<string, { label: string; style: LineStyle; color: string }>;
}

export interface CaseDoc {
  meta: {
    id: string;
    title: string;
    caseNo?: string;
    createdAt: string;
    updatedAt: string;
  };
  nodes: CaseNode[];
  edges: CaseEdge[];
  groups: Group[];
  assets: Asset[];
  views: View[];
  settings: Settings;
}
