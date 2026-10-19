/**
 * AI 生成图合规审计（M8 验收 3）：把库里每张 AI 图连同提示词、模型、种子、时间、角标与分区逐条列出。
 * 纯函数：Markdown 给界面与 Word 导出共用，自检直接断言字段齐全与合规结论。
 */
import type { CaseDoc } from '../types';
import { AI_WATERMARK_TEXT } from './aiImage';

export const PRESET_LABEL: Record<string, string> = { sketch: '模拟画像', scene: '现场示意', item: '物品示意', enhance: '图像增强' };

export interface AiAuditRow {
  assetId: string;
  no: string;
  name: string;
  preset: string;
  model: string;
  seed: string;
  createdAt: string;
  zone: string;
  watermark: string;
  prompt: string;
  problems: string[];
}

export interface AiAuditReport {
  generatedAt: string;
  rows: AiAuditRow[];
  count: number;
  compliant: number;
  problems: string[];
  markdown: string;
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function presetLabel(preset: string): string {
  return PRESET_LABEL[preset] ?? preset;
}

/** 逐张检查：AI 分区、aiGenerated、aiMeta、角标参数。任何一项缺失都记进 problems。 */
export function auditAiAssets(doc: CaseDoc, options: { generatedAt?: string } = {}): AiAuditReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rows: AiAuditRow[] = [];
  const problems: string[] = [];
  for (const asset of doc.assets) {
    const isAi = asset.zone === 'ai' || asset.aiGenerated === true;
    if (!isAi) continue;
    const meta = asset.aiMeta;
    const rowProblems: string[] = [];
    if (asset.zone !== 'ai') rowProblems.push('未放进素材库「AI 生成」分区');
    if (asset.aiGenerated !== true) rowProblems.push('缺少 aiGenerated 标记');
    if (!meta) rowProblems.push('缺少 aiMeta 元数据');
    const watermark = textOf(meta?.params?.watermark);
    if (watermark !== AI_WATERMARK_TEXT) rowProblems.push('缺少强制角标参数「' + AI_WATERMARK_TEXT + '」');
    if (!meta?.prompt) rowProblems.push('缺少提示词审计记录');
    if (!meta?.model) rowProblems.push('缺少生成模型');
    if (!meta?.createdAt) rowProblems.push('缺少生成时间');
    const row: AiAuditRow = {
      assetId: asset.id,
      no: asset.no ?? asset.id,
      name: asset.name ?? asset.no ?? asset.id,
      preset: presetLabel(meta?.preset ?? 'sketch'),
      model: meta?.model ?? '',
      seed: meta?.seed === undefined ? '' : String(meta.seed),
      createdAt: meta?.createdAt ?? '',
      zone: asset.zone ?? '',
      watermark,
      prompt: (meta?.prompt ?? '').replace(/\s+/g, ' ').slice(0, 160),
      problems: rowProblems,
    };
    rows.push(row);
    for (const problem of rowProblems) problems.push(row.no + '：' + problem);
  }
  const lines: string[] = [];
  lines.push('# AI 生成图合规审计');
  lines.push('');
  lines.push('- 审计时间：' + generatedAt);
  lines.push('- 案件：' + doc.meta.title + (doc.meta.caseNo ? '（' + doc.meta.caseNo + '）' : ''));
  lines.push('- AI 生成图数量：' + rows.length + ' 张；合规 ' + (rows.length - rows.filter((row) => row.problems.length > 0).length) + ' 张');
  lines.push('- 合规口径：每张图必须带写入像素的「' + AI_WATERMARK_TEXT + '」角标、完整 aiMeta、素材库 AI 分区，且永不作为已证实证据。');
  lines.push('');
  lines.push('## 一、逐张明细');
  lines.push('');
  if (rows.length === 0) {
    lines.push('- 本案件尚未插入 AI 生成图。');
  } else {
    lines.push('| 编号 | 名称 | 预设 | 模型 | 种子 | 生成时间 | 角标 | 问题 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of rows) {
      lines.push(
        '| ' + row.no + ' | ' + row.name + ' | ' + row.preset + ' | ' + row.model + ' | ' + (row.seed || '—') +
        ' | ' + (row.createdAt || '—') + ' | ' + (row.watermark || '缺失') + ' | ' + (row.problems.length ? row.problems.join('；') : '无') + ' |'
      );
    }
  }
  lines.push('');
  lines.push('## 二、提示词审计');
  lines.push('');
  for (const row of rows) {
    lines.push('- ' + row.no + '「' + row.name + '」：' + (row.prompt || '（无提示词记录）'));
  }
  if (rows.length === 0) lines.push('- 无。');
  lines.push('');
  lines.push('## 三、合规结论');
  lines.push('');
  if (problems.length === 0) {
    lines.push('- 未发现违规：所有 AI 图都带角标、aiMeta、AI 分区标记。');
  } else {
    for (const problem of problems) lines.push('- 违规：' + problem);
  }
  lines.push('- 声明：AI 生成图仅用于示意推演，非真实照片，不得作为证据使用，也不能把挂着 AI 图的实体标为「已证实」。');
  lines.push('');
  return {
    generatedAt,
    rows,
    count: rows.length,
    compliant: rows.filter((row) => row.problems.length === 0).length,
    problems,
    markdown: lines.join('\n'),
  };
}
