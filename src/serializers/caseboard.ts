/**
 * .caseboard 单文件项目（本质是 zip 容器）。
 *
 * 目录结构（版本 1）：
 *   manifest.json      容器元数据（格式/版本/时间/计数/文件清单）
 *   case.json          完整 Document Model（无损，DSL 未表达的字段也在这里）
 *   case.cbd           文本视图（DSL，便于外部阅读与 git diff）
 *   assets/index.json  素材元数据数组
 *   assets/<id>.<ext>  素材原件二进制（可选，随导入时收集）
 *   thumbnail.png      整板缩略图（可选）
 *
 * 设计理由：单文件即可拷机/移交；case.json 保证任意字段无损往返，
 * case.cbd 让人能用文本工具审计案情板内容，两者都由同一 Model 派生（单一数据源）。
 */
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import type { Asset, CaseDoc } from '../types';
import { serializeDoc } from '../dsl/serialize';
import { fromJson, toJson } from './json';

export const CASEBOARD_EXT = '.caseboard';
export const CASEBOARD_FORMAT = 'caseboard';
export const CASEBOARD_VERSION = 1;

export interface CaseboardManifest {
  format: typeof CASEBOARD_FORMAT;
  version: number;
  app: string;
  title: string;
  caseNo?: string;
  createdAt: string;
  savedAt: string;
  counts: { nodes: number; edges: number; groups: number; assets: number; views: number };
  /** 容器内文件清单，便于人类排查 */
  files: string[];
  /** 是否有素材原件随包 */
  withAssets: boolean;
}

export interface BuildCaseboardOptions {
  /** 构建时间（ISO），默认取 doc.meta.updatedAt，缺省则用当前时间；测试可固定 */
  savedAt?: string;
  /** 应用版本号，写进 manifest */
  app?: string;
  /** 素材原件读取器：返回 null 表示原件不在本机（只写元数据） */
  readAsset?: (asset: Asset) => Promise<Uint8Array | null> | Uint8Array | null;
  /** 整板缩略图 PNG（可选） */
  thumbnail?: Uint8Array;
  /** 是否把 DSL 文本一并写入，默认 true */
  includeDsl?: boolean;
}

export interface CaseboardContents {
  manifest: CaseboardManifest;
  doc: CaseDoc;
  dsl: string;
  assets: Asset[];
  assetFiles: Map<string, Uint8Array>;
  thumbnail?: Uint8Array;
  /** 兼容性告警（例如版本更高、缺 case.cbd），不阻断打开 */
  warnings: string[];
}

export class CaseboardError extends Error {}

function extOf(asset: Asset): string {
  const fromName = asset.name ? /\.([A-Za-z0-9]{1,8})$/.exec(asset.name) : null;
  if (fromName) return fromName[1].toLowerCase();
  if (asset.mimeType === 'image/png') return 'png';
  if (asset.mimeType === 'image/jpeg') return 'jpg';
  if (asset.mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

export function safeFileName(asset: Asset): string {
  return 'assets/' + asset.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.' + extOf(asset);
}

/** 打包成 .caseboard 单文件（Uint8Array）。 */
export async function buildCaseboard(doc: CaseDoc, options: BuildCaseboardOptions = {}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const assetFiles = new Map<string, Uint8Array>();
  if (options.readAsset) {
    for (const asset of doc.assets) {
      const bytes = await options.readAsset(asset);
      if (bytes && bytes.length > 0) assetFiles.set(asset.id, bytes);
    }
  }
  const withAssets = assetFiles.size > 0;
  const savedAt = options.savedAt ?? doc.meta.updatedAt ?? new Date().toISOString();
  const dsl = serializeDoc(doc);
  const manifest: CaseboardManifest = {
    format: CASEBOARD_FORMAT,
    version: CASEBOARD_VERSION,
    app: options.app ?? '0.4.0',
    title: doc.meta.title,
    caseNo: doc.meta.caseNo,
    createdAt: doc.meta.createdAt,
    savedAt,
    counts: {
      nodes: doc.nodes.length,
      edges: doc.edges.length,
      groups: doc.groups.length,
      assets: doc.assets.length,
      views: doc.views.length,
    },
    files: ['manifest.json', 'case.json', ...(options.includeDsl === false ? [] : ['case.cbd']), 'assets/index.json'],
    withAssets,
  };
  for (const [assetId, bytes] of assetFiles) {
    const asset = doc.assets.find((item) => item.id === assetId);
    if (!asset) continue;
    const name = safeFileName(asset);
    files[name] = bytes;
    manifest.files.push(name);
  }
  if (options.thumbnail && options.thumbnail.length > 0) {
    files['thumbnail.png'] = options.thumbnail;
    manifest.files.push('thumbnail.png');
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n');
  files['case.json'] = strToU8(toJson(doc));
  if (options.includeDsl !== false) files['case.cbd'] = strToU8(dsl);
  files['assets/index.json'] = strToU8(JSON.stringify(doc.assets, null, 2) + '\n');
  return zipSync(files, { level: 6 });
}

/** 读取 .caseboard 容器，返回模型与附件。 */
export function readCaseboard(bytes: Uint8Array): CaseboardContents {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch (error) {
    throw new CaseboardError('无法解压文件：这不是有效的 .caseboard 项目包（zip 结构损坏）。' + (error instanceof Error ? ' ' + error.message : ''));
  }
  const manifestBytes = raw['manifest.json'];
  if (!manifestBytes) throw new CaseboardError('项目包缺少 manifest.json，可能不是案情板项目文件。');
  let manifest: CaseboardManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as CaseboardManifest;
  } catch {
    throw new CaseboardError('manifest.json 不是合法 JSON，项目包可能已损坏。');
  }
  if (manifest.format !== CASEBOARD_FORMAT) throw new CaseboardError('manifest.json 的 format 不是 caseboard，拒绝打开。');
  const warnings: string[] = [];
  if (typeof manifest.version !== 'number' || manifest.version > CASEBOARD_VERSION) {
    warnings.push('项目包版本（' + String(manifest.version) + '）高于当前应用支持的版本（' + CASEBOARD_VERSION + '），部分字段可能被忽略。');
  }
  const caseBytes = raw['case.json'];
  if (!caseBytes) throw new CaseboardError('项目包缺少 case.json，无法还原案件数据。');
  let doc: CaseDoc;
  try {
    doc = fromJson(strFromU8(caseBytes));
  } catch (error) {
    throw new CaseboardError(error instanceof Error ? error.message : 'case.json 解析失败。');
  }
  const dsl = raw['case.cbd'] ? strFromU8(raw['case.cbd']) : '';
  if (!dsl) warnings.push('项目包内没有 case.cbd 文本视图，已从模型重新生成；下次保存会补上。');
  const assets: Asset[] = doc.assets;
  // 用打包时同一套命名规则反查素材，避免 id 里的下划线/连字符被归一化后对不上
  const byFileName = new Map<string, Asset>();
  for (const asset of assets) byFileName.set(safeFileName(asset), asset);
  const assetFiles = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    if (!name.startsWith('assets/') || name === 'assets/index.json') continue;
    const asset = byFileName.get(name);
    if (asset) assetFiles.set(asset.id, data);
  }
  if (doc.assets.length > 0 && assetFiles.size === 0) warnings.push('项目包只含素材元数据，图片原件需在素材面板重新导入。');
  return {
    manifest,
    doc,
    dsl,
    assets,
    assetFiles,
    thumbnail: raw['thumbnail.png'],
    warnings,
  };
}
