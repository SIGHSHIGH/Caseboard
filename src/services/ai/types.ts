import type { LineStyle, NodeType, TimeRange } from '../../types';

/** AI 任务通道：抽取建图 / 矛盾审查 / 自然语言编辑 / 报告生成（对应规格 P4–P7） */
export type AiTask = 'extract' | 'conflicts' | 'edit' | 'report';

export type AiProviderId = 'builtin' | 'ollama' | 'openai';

export interface AiSettings {
  provider: AiProviderId;
  /** Ollama 模型名或 OpenAI 兼容服务的模型名 */
  model: string;
  /** Ollama / OpenAI 兼容服务的 base URL */
  baseUrl: string;
  /** 仅 openai 通道使用；只存本机 localStorage，不进案件文件 */
  apiKey: string;
  /** 是否允许把案情文本发给远程模型（默认 false，纯本地） */
  allowRemote: boolean;
}

/** 抽取出的实体草稿：采纳前只存在于待确认队列，不写 Model（Gate 0-4）。 */
export interface AiNodeDraft {
  kind: 'node';
  key: string;
  type: NodeType;
  title: string;
  aliases: string[];
  fields: Record<string, string>;
  time?: TimeRange;
  status?: 'todo' | 'checking' | 'confirmed' | 'ruledout';
  confidence: number;
  evidenceQuote: string;
}

/** 抽取出的关系草稿：端点在采纳时按标题/别名解析成真实节点 id。 */
export interface AiEdgeDraft {
  kind: 'edge';
  key: string;
  sourceTitle: string;
  targetTitle: string;
  relType: string;
  label: string;
  directed: boolean;
  style: LineStyle;
  confidence: number;
  weight?: number;
  time?: TimeRange;
  evidenceQuote: string;
}

export type AiDraft = AiNodeDraft | AiEdgeDraft;

export type DraftStatus = 'pending' | 'accepted' | 'rejected';

export interface DraftEntry {
  id: string;
  draft: AiDraft;
  status: DraftStatus;
  /** 采纳后生成的真实实体 id（实体草稿被合并到既有节点时也记录） */
  appliedId?: string;
  note?: string;
}

export interface AiExtractResult {
  nodes: AiNodeDraft[];
  edges: AiEdgeDraft[];
  unresolved: string[];
}

/** P5 矛盾审查输出（规格 docs/CaseBoard-SPEC.md:676-701）。 */
export type ConflictType = 'time_conflict' | 'duplicate_identity' | 'unsupported_claim' | 'chain_gap' | 'contradiction';
export type ConflictSeverity = 'high' | 'medium' | 'low';

export interface AiConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  description: string;
  involvedIds: string[];
  suggestion: string;
}

export type ChainStatus = 'covered' | 'weak' | 'missing';

export interface ChainReviewItem {
  stage: string;
  status: ChainStatus;
  evidenceIds: string[];
  note: string;
}

export interface ConflictReport {
  conflicts: AiConflict[];
  chainReview: ChainReviewItem[];
  nextSteps: string[];
}

/** P6 自然语言编辑命令（与规格命令表一一对应）。 */
export type NlCommand =
  | { kind: 'addNode'; type: NodeType; title: string; confidence?: number }
  | { kind: 'updateNode'; id: string; title?: string; patch: Record<string, unknown> }
  | { kind: 'deleteNode'; id: string }
  | { kind: 'addEdge'; source: string; target: string; relType: string; label?: string; style: LineStyle; confidence: number }
  | { kind: 'updateEdge'; id: string; patch: Record<string, unknown> }
  | { kind: 'deleteEdge'; id: string }
  | { kind: 'addGroup'; title: string; nodeIds: string[] }
  | { kind: 'moveNode'; id: string; targetGroupId: string | null }
  | { kind: 'query'; question: string };

export interface NlPreviewLine {
  command: NlCommand;
  /** 中文一句说明，例如「新增节点：王五（人物）」 */
  text: string;
  /** 是否能落到画布上（指代不明 / 目标不存在时为 false） */
  ready: boolean;
  problem?: string;
}

export interface NlPlan {
  commands: NlCommand[];
  preview: NlPreviewLine[];
  needsConfirmation: true;
  summary: string;
  questions: string[];
  hasDelete: boolean;
}

export interface AliasCandidate {
  aId: string;
  aTitle: string;
  bId: string;
  bTitle: string;
  reason: string;
}

export interface AdoptionScore {
  matched: number;
  total: number;
  rate: number;
  missing: string[];
}
