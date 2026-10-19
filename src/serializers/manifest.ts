/**
 * 案件图片包清单（M4 验收 5）：纯函数，供导出服务与自动化验收共用。
 * M8 起 OCR 文本对外交付前先做号码脱敏（身份证/手机/银行卡）。
 */
import type { CaseDoc } from '../types';
import { maskText } from '../lib/maskText';

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

/** 素材关联到哪些实体：边的证据标记、附件归属、图片节点归属三处都算。 */
export function relatedEntityTitles(doc: CaseDoc, assetId: string): string[] {
  const titles = new Set<string>();
  for (const node of doc.nodes) {
    if ((node.attachments ?? []).some((id) => id === assetId)) titles.add(node.title);
  }
  for (const edge of doc.edges) {
    if (!(edge.evidenceIds ?? []).includes(assetId)) continue;
    const source = doc.nodes.find((node) => node.id === edge.source);
    const target = doc.nodes.find((node) => node.id === edge.target);
    if (source) titles.add(source.title);
    if (target) titles.add(target.title);
  }
  for (const image of doc.imageNodes) {
    if (image.assetId !== assetId || !image.linkedNodeId) continue;
    const linked = doc.nodes.find((node) => node.id === image.linkedNodeId);
    if (linked) titles.add(linked.title);
  }
  return Array.from(titles);
}

export const MANIFEST_HEADER = ['编号', '类型', '来源', '拍摄时间', '关联实体', 'OCR 文本', '文件名'];

export function buildManifestCsv(doc: CaseDoc, files: Map<string, string>): string {
  const rows = [MANIFEST_HEADER.join(',')];
  for (const asset of doc.assets) {
    rows.push(
      [
        csvCell(asset.no ?? asset.id),
        csvCell(asset.kind === 'image' ? '图片' : asset.kind),
        csvCell(asset.sourceLabel ?? asset.source ?? ''),
        csvCell(asset.capturedAt ?? ''),
        csvCell(relatedEntityTitles(doc, asset.id).join('；')),
        csvCell(maskText(asset.ocrText ?? '')),
        csvCell(files.get(asset.id) ?? ''),
      ].join(','),
    );
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
