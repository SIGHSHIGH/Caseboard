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

export interface Asset {
  id: string;
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
