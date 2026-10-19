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
  /**
   * 卡片层级（M10）：自由图片与卡片**共用同一层级空间**，缺省按 0 处理。
   * 之前只有图片带 zIndex，导致图片的「置底 / 下移」相对卡片永远无效。
   */
  zIndex?: number;
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

/** 标注图形（M2-5）：矩形框 / 箭头 / 手绘 / 文字 / 区域锚点 / 马赛克 */
export type AnnotationShape = 'rect' | 'arrow' | 'pen' | 'text' | 'anchor' | 'mosaic';

/**
 * 标注几何：**归一化坐标**（0–1，相对素材宽高）。
 * 这样同一份标注在 256 缩略图、1024 预览与导出原图上都对齐，换尺寸不用重算（D17）。
 */
export interface AnnotationGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  /** pen / arrow 的折线顶点（归一化）；矩形类图形不需要 */
  points?: XY[];
}

export interface Annotation {
  id: string;
  shape: AnnotationShape;
  geom: AnnotationGeom;
  text?: string;
  /** 描边色，缺省取证据红 #C0392B */
  color?: string;
  linkedNodeId?: string;
  /** 勾选后导出脱敏图时对该区域马赛克（人脸 / 证件号 / 手机号 / 银行卡号） */
  redact?: boolean;
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
  /** 所属素材文件夹（M10）：缺省 = 未归类（根目录） */
  folderId?: string;
  annotations: Annotation[];
  aiGenerated?: boolean;
  aiMeta?: AiMeta;
}

/**
 * 素材文件夹（M10）：扁平 + 可选上级，删除文件夹只把素材散回根目录、不删素材。
 * 放在 `CaseDoc.assetFolders`，随案件一起走，不进素材库分区（zone）语义。
 */
export interface AssetFolder {
  id: string;
  title: string;
  parentId?: string;
  order: number;
}

export interface ImageNode {
  id: string;
  kind: 'freeImage';
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 旋转角度（度，0–360，逆时针为正） */
  rotation: number;
  zIndex: number;
  borderStyle?: 'photo' | 'plain' | 'polaroid';
  /** 吸附为头像 / 证据附件时的归属节点 */
  linkedNodeId?: string;
  /** 吸附到归属卡片的哪个角（M10）：松手吸附时记录，跟随卡片移动时按角相对定位 */
  dockCorner?: DockCorner;
  /** 吸附时相对卡片左上角的偏移（M10）：旋转或改尺寸后仍能回到原处 */
  dockOffset?: XY;
  /** 图钉装饰（白板照片质感） */
  pinned?: boolean;
  /** 压缩成小圆点（M11 / I6）：方便把图片拖到卡片角吸附，占地极小 */
  dotMode?: boolean;
}

/**
 * 卡片四角（M10）：图片拖到卡片角附近即「吸附」到该角，
 * 之后卡片移动时图片按角相对定位一起走（见 Board 的 attach 逻辑与 smoke [57]）。
 */
export type DockCorner = 'nw' | 'ne' | 'sw' | 'se';

export interface View {
  id: string;
  kind: 'board' | 'timeline' | 'map' | 'chain' | 'presentation' | 'scenario';
  name: string;
  filters: Record<string, unknown>;
  camera?: { x: number; y: number; zoom: number };
  steps?: unknown[];
}

/** 地图底图（M10）：导入一张素材当示意底图，按 bounds 铺满画布；不写像素、不请求瓦片 */
export interface MapBackground {
  assetId: string;
  /** 底图覆盖的经纬度范围；缺省用当前点位范围 */
  bounds?: GeoBounds;
  /** 0.15–1，默认 0.85 */
  opacity?: number;
}

/** 经纬度范围（M10）：地图投影与底图共用 */
export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  spanLat: number;
  spanLng: number;
}

/** 时间线轨道（M10）：一条轨道 = 一屏并行泳道 */
export type TimelineTrackKind = 'type' | 'entity';

export interface TimelineTrack {
  id: string;
  title: string;
  /** type = 按实体类型（人物/事件…）；entity = 指定某个实体的独立泳道（多人并行） */
  kind: TimelineTrackKind;
  /** kind='type' 时是 NodeType；kind='entity' 时是节点 id */
  ref: string;
  color?: string;
  order: number;
  /** 手工挑选的条目（M11 / I9）：有值时以它为准，否则按 kind + ref 自动归集 */
  nodeIds?: string[];
}

export interface TimelinePrefs {
  /** type = 沿用按类型分组；tracks = 用 tracks 列表 */
  mode: 'type' | 'tracks';
  /** 参与显示的轨道 id（空 = 全部） */
  trackIds: string[];
  /** 显示区间比例 0.1–1：越小越放大（比例调控） */
  spanRatio: number;
}

export interface TimelineConfig {
  tracks: TimelineTrack[];
  prefs: TimelinePrefs;
}

export interface Settings {
  theme: string;
  lineLegend: Record<string, { label: string; style: LineStyle; color: string }>;
  /** 地图底图（M10） */
  mapBackground?: MapBackground;
}

/** 多假设里的证据立场（M7）：同一证据在不同假设中可支持或反驳 */
export type EvidenceStance = 'support' | 'refute';

export interface HypothesisStance {
  targetId: string;
  targetKind: 'node' | 'edge' | 'asset';
  stance: EvidenceStance;
  note?: string;
}

/**
 * 平行假设：节点/关系/素材只有一份（Gate 0-1），每个假设记录自己的立场表。
 * 支持度由 src/lib/hypothesis.ts 按置信度确定性地算出（D45）。
 */
export interface Hypothesis {
  id: string;
  title: string;
  summary?: string;
  stances: HypothesisStance[];
  status: 'active' | 'archived';
  createdAt: string;
}

/** OCR 结构化结果（M7-3）：四项关键字段 + 缺失清单 + 置信度 */
export interface OcrFields {
  amount?: string;
  time?: string;
  account?: string;
  counterparty?: string;
}

export interface OcrParseResult {
  fields: OcrFields;
  missing: string[];
  confidence: number;
  /** 归一化后的全文，供人工修正时回填 */
  text: string;
}

/** 证据链六阶段（M7-2 固定六段；M12 / K14c 允许自定义链复用同一套阶段） */
export type ChainStageId = 'motive' | 'plan' | 'prepare' | 'act' | 'escape' | 'launder';

/** 自定义证据链里的一条材料（哪份材料落在哪个阶段） */
export interface ChainEntry {
  nodeId: string;
  stageId: ChainStageId;
}

/**
 * 自定义证据链（M12 / K14c）：六阶段的划分由人决定，可建多条、各自独立展示。
 * 与「自动证据链」（按字段 + 关键词现算）互不影响。
 */
export interface ChainDef {
  id: string;
  title: string;
  note?: string;
  entries: ChainEntry[];
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
  /** 自由图片节点：不依附卡片、直接钉在画布上的图片（M2-4） */
  imageNodes: ImageNode[];
  /** 素材文件夹（M10）：缺省视为没有文件夹，全部素材在根目录 */
  assetFolders?: AssetFolder[];
  /** 时间线轨道与显示比例（M10）：缺省按实体类型分组 */
  timeline?: TimelineConfig;
  views: View[];
  /** 多假设（M7）：共享同一份节点与素材，立场按假设分别记录 */
  hypotheses: Hypothesis[];
  /** 自定义证据链（M12）：缺省表示只用自动证据链 */
  chains?: ChainDef[];
  settings: Settings;
}
