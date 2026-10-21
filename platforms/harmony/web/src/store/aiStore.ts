import { create } from 'zustand';
import { acceptAiDrafts } from '../commands/aiCommands';
import { composeCommands } from '../commands/compose';
import { extractFromText, adoptionScore } from '../lib/extract';
import { SAMPLE_REFERENCE } from '../data/sampleTranscript';
import { analyzeConflicts, CHAIN_TEMPLATES, type ChainTemplateId } from '../lib/contradictions';
import { parseNlEdit, buildNlCommands } from '../lib/nlEdit';
import { buildReport, type ReportResult } from '../lib/report';
import { useDocStore } from './docStore';
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  providerPrivacyText,
  requireRemotePermission,
  saveAiSettings,
} from '../services/ai/settings';
import { requestRemote } from '../services/ai/provider';
import {
  parseConflictReply,
  parseExtractReply,
  P4_EXTRACT_PROMPT,
  P5_CONFLICT_PROMPT,
} from '../services/ai/prompts';
import type {
  AdoptionScore,
  AiExtractResult,
  AiSettings,
  ConflictReport,
  DraftEntry,
  NlPlan,
} from '../services/ai/types';

export type AiTab = 'extract' | 'conflicts' | 'edit' | 'report' | 'settings';

interface AiStore {
  settings: AiSettings;
  sourceText: string;
  drafts: DraftEntry[];
  unresolved: string[];
  score: AdoptionScore | null;
  conflicts: ConflictReport | null;
  template: ChainTemplateId;
  report: ReportResult | null;
  nlText: string;
  nlPlan: NlPlan | null;
  busy: boolean;
  error: string;
  notice: string;
  setSettings: (patch: Partial<AiSettings>) => void;
  persistSettings: () => void;
  setSourceText: (text: string) => void;
  setTemplate: (template: ChainTemplateId) => void;
  extract: () => Promise<void>;
  scoreAgainstReference: () => void;
  accept: (id: string) => void;
  reject: (id: string) => void;
  acceptAll: () => void;
  detectConflicts: (useRemote: boolean) => Promise<void>;
  generateReport: () => void;
  setNlText: (text: string) => void;
  previewNl: () => void;
  applyNl: (allowDelete: boolean) => void;
  clearNotice: () => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

let draftSeq = 0;

function toEntries(result: AiExtractResult): DraftEntry[] {
  const entries: DraftEntry[] = [];
  for (const draft of result.nodes) {
    draftSeq += 1;
    entries.push({ id: 'draft-n' + draftSeq, draft, status: 'pending' });
  }
  for (const draft of result.edges) {
    draftSeq += 1;
    entries.push({ id: 'draft-e' + draftSeq, draft, status: 'pending' });
  }
  return entries;
}

/** 把文档压成给远程模型看的最小案件摘要（只发标题/类型/状态/时间，不发备注全文）。 */
function caseDigest(): string {
  const doc = useDocStore.getState().doc;
  const nodes = doc.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    time: node.time ?? null,
    confidence: node.confidence,
  }));
  const edges = doc.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    relType: edge.relType,
    label: edge.label ?? '',
    style: edge.style,
    confidence: edge.confidence,
  }));
  return JSON.stringify({ title: doc.meta.title, nodes, edges });
}

export const useAiStore = create<AiStore>((set, get) => ({
  settings: loadAiSettings(),
  sourceText: '',
  drafts: [],
  unresolved: [],
  score: null,
  conflicts: null,
  template: 'fraud',
  report: null,
  nlText: '',
  nlPlan: null,
  busy: false,
  error: '',
  notice: '',

  setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

  persistSettings: () => {
    saveAiSettings(get().settings);
    set({ notice: '设置已保存到本机' });
  },

  setSourceText: (sourceText) => set({ sourceText }),
  setTemplate: (template) => set({ template }),
  clearNotice: () => set({ notice: '' }),

  extract: async () => {
    const { sourceText, settings } = get();
    if (!sourceText.trim()) {
      set({ error: '请先粘贴笔录 / 说明文字，再点抽取。' });
      return;
    }
    set({ busy: true, error: '', notice: '' });
    try {
      requireRemotePermission(settings);
      let result: AiExtractResult;
      if (settings.provider === 'builtin') {
        result = extractFromText(sourceText);
      } else {
        const reply = await requestRemote(settings, 'extract', P4_EXTRACT_PROMPT + '\n\n【笔录原文】\n' + sourceText);
        result = parseExtractReply(reply.text);
      }
      set({
        drafts: toEntries(result),
        unresolved: result.unresolved,
        score: null,
        busy: false,
        notice: '识别出 ' + result.nodes.length + ' 个实体、' + result.edges.length + ' 条关系，全部待确认。',
      });
    } catch (error) {
      set({ busy: false, error: errorText(error) });
    }
  },

  scoreAgainstReference: () => {
    const { drafts, unresolved } = get();
    const nodes = drafts
      .filter((entry) => entry.status !== 'rejected' && entry.draft.kind === 'node')
      .map((entry) => entry.draft)
      .filter((draft): draft is Extract<typeof draft, { kind: 'node' }> => draft.kind === 'node');
    const edges = drafts
      .filter((entry) => entry.status !== 'rejected' && entry.draft.kind === 'edge')
      .map((entry) => entry.draft)
      .filter((draft): draft is Extract<typeof draft, { kind: 'edge' }> => draft.kind === 'edge');
    set({ score: adoptionScore({ nodes, edges, unresolved }, SAMPLE_REFERENCE) });
  },

  accept: (id) => {
    const entry = get().drafts.find((item) => item.id === id);
    if (!entry || entry.status !== 'pending') return;
    const dispatch = useDocStore.getState().dispatch;
    const draft = entry.draft;
    if (draft.kind === 'node') {
      dispatch(acceptAiDrafts({ nodes: [draft], edges: [] }));
      const nodeTitle = draft.title;
      const found = useDocStore.getState().doc.nodes.find((node) => node.title === nodeTitle);
      set((state) => ({
        drafts: state.drafts.map((item) =>
          item.id === id ? { ...item, status: 'accepted', appliedId: found?.id, note: '已加入画布（可 Ctrl+Z 撤销）' } : item,
        ),
      }));
    } else {
      dispatch(acceptAiDrafts({ nodes: [], edges: [draft] }));
      const doc = useDocStore.getState().doc;
      const sourceTitle = draft.sourceTitle;
      const targetTitle = draft.targetTitle;
      const relType = draft.relType;
      const source =
        doc.nodes.find((node) => node.title === sourceTitle)?.id ??
        doc.nodes.find((node) => (node.aliases ?? []).includes(sourceTitle))?.id;
      const target =
        doc.nodes.find((node) => node.title === targetTitle)?.id ??
        doc.nodes.find((node) => (node.aliases ?? []).includes(targetTitle))?.id;
      const found = doc.edges.find(
        (edge) => edge.source === source && edge.target === target && edge.relType === relType,
      );
      set((state) => ({
        drafts: state.drafts.map((item) =>
          item.id === id ? { ...item, status: 'accepted', appliedId: found?.id, note: '已加入关系（可 Ctrl+Z 撤销）' } : item,
        ),
      }));
    }
  },

  reject: (id) => {
    set((state) => ({
      drafts: state.drafts.map((item) =>
        item.id === id ? { ...item, status: 'rejected', note: '已驳回，不会进入画布' } : item,
      ),
    }));
  },

  acceptAll: () => {
    const { drafts } = get();
    const pending = drafts.filter((entry) => entry.status === 'pending');
    if (pending.length === 0) return;
    const nodes = pending.filter((entry) => entry.draft.kind === 'node').map((entry) => entry.draft);
    const edges = pending.filter((entry) => entry.draft.kind === 'edge').map((entry) => entry.draft);
    const nodeDrafts = nodes.filter((draft) => draft.kind === 'node');
    const edgeDrafts = edges.filter((draft) => draft.kind === 'edge');
    useDocStore.getState().dispatch(acceptAiDrafts({ nodes: nodeDrafts, edges: edgeDrafts }));
    set((state) => ({
      drafts: state.drafts.map((item) =>
        item.status === 'pending' ? { ...item, status: 'accepted', note: '已批量加入（一次撤销可全部撤回）' } : item,
      ),
      notice: '已采纳 ' + pending.length + ' 条，Model 只在确认后变更。',
    }));
  },

  detectConflicts: async (useRemote) => {
    const { settings, template } = get();
    set({ busy: true, error: '', notice: '' });
    try {
      const doc = useDocStore.getState().doc;
      let report: ConflictReport;
      if (useRemote && settings.provider !== 'builtin') {
        requireRemotePermission(settings);
        const reply = await requestRemote(settings, 'conflicts', P5_CONFLICT_PROMPT + '\n\n【案件数据】\n' + caseDigest());
        report = parseConflictReply(reply.text);
      } else {
        report = analyzeConflicts(doc, { template });
      }
      set({ conflicts: report, busy: false, notice: '审查完成：' + report.conflicts.length + ' 条冲突 / 疑问。' });
    } catch (error) {
      set({ busy: false, error: errorText(error) });
    }
  },

  generateReport: () => {
    const doc = useDocStore.getState().doc;
    const { template, unresolved, conflicts } = get();
    const report = buildReport(doc, {
      template,
      unresolved,
      conflicts: conflicts ?? analyzeConflicts(doc, { template }),
    });
    set({ report, notice: '报告已生成：' + report.citations + ' 处引用，七个小节。' });
  },

  setNlText: (nlText) => set({ nlText, nlPlan: null }),

  previewNl: () => {
    const { nlText } = get();
    if (!nlText.trim()) {
      set({ error: '请输入要执行的中文指令。' });
      return;
    }
    const plan = parseNlEdit(useDocStore.getState().doc, nlText);
    set({ nlPlan: plan, error: '', notice: plan.summary });
  },

  applyNl: (allowDelete) => {
    const { nlPlan } = get();
    if (!nlPlan) return;
    if (nlPlan.hasDelete && !allowDelete) {
      set({ error: '这批指令包含删除操作：请先勾选「我确认删除」，再执行。' });
      return;
    }
    const commands = buildNlCommands(useDocStore.getState().doc, nlPlan);
    if (commands.length === 0) {
      set({ error: '没有可执行的指令，请检查预览里的问题提示。' });
      return;
    }
    useDocStore.getState().dispatch(composeCommands('AI 指令：' + nlPlan.summary, commands));
    set({ nlPlan: null, nlText: '', notice: '已执行 ' + commands.length + ' 条指令，可 Ctrl+Z 整体撤销。' });
  },
}));

export const providersPrivacy = providerPrivacyText;
export const chainTemplates = CHAIN_TEMPLATES;
export const defaultAiSettings = DEFAULT_AI_SETTINGS;
