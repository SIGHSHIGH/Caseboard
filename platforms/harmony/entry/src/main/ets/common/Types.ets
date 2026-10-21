/**
 * bridge 与其他 ArkTS 模块共享的 JSON 载荷类型。
 * 前端只认字符串，所有结构在此定稿后再 stringify。
 */

/** getAppInfo 返回体 */
export interface AppInfoJson {
  version: string;
  platform: string;
  dataDir: string;
  dbPath: string;
  assetsDir: string;
  apiVersion: number;
}

/** select 返回体：列名 + 行数据，保留原始类型 */
export interface SelectResultJson {
  columns: string[];
  rows: string[][];
}

/** 文件选择结果 */
export interface PickedFileJson {
  name: string;
  uri: string;
  size: number;
}

/** OCR 结果 */
export interface OcrResultJson {
  ok: boolean;
  text: string;
  lang: string;
  message: string;
}

/** 图片信息 */
export interface ImageInfoJson {
  width: number;
  height: number;
  mime: string;
  bytes: number;
}

/** 自检结果 */
export interface SelfTestJson {
  phase: string;
  ok: boolean;
  dbOk: boolean;
  fsOk: boolean;
  rawfileOk: boolean;
  fts5Ok: boolean;
  message: string;
}
