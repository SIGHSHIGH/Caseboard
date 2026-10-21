import type { GeoPoint } from '../types';

/**
 * 极简 EXIF 读取（M2 Web 阶段）：只取导入向导真正需要的三项——
 * 拍摄时间、机身描述、GPS 坐标（读取后仅提示定位风险，不清洗、不上图）。
 * 不引第三方库，纯 DataView 实现，便于在 smoke 里用合成字节直接测。
 */
export interface ExifInfo {
  capturedAt?: string;
  camera?: string;
  gps?: GeoPoint;
}

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

interface TiffReader {
  view: DataView;
  base: number;
  little: boolean;
}

function u16(reader: TiffReader, offset: number): number {
  return reader.view.getUint16(reader.base + offset, reader.little);
}

function u32(reader: TiffReader, offset: number): number {
  return reader.view.getUint32(reader.base + offset, reader.little);
}

function asciiAt(reader: TiffReader, offset: number, count: number): string {
  let text = '';
  for (let i = 0; i < count; i += 1) {
    const code = reader.view.getUint8(reader.base + offset + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text.trim();
}

/** 返回 tag → 值所在区间（相对 TIFF 起点），供各 IFD 读取 */
function entriesOf(reader: TiffReader, ifdOffset: number): Array<{ tag: number; type: number; count: number; valueOffset: number; inline: boolean }> {
  const tiffBytes = reader.view.byteLength - reader.base;
  // 损坏文件兜底：IFD 起点或表项越界时按「没有条目」处理，不抛 RangeError 打断整批导入
  if (ifdOffset <= 0 || ifdOffset + 2 > tiffBytes) return [];
  const count = u16(reader, ifdOffset);
  if (count > 512 || ifdOffset + 2 + count * 12 > tiffBytes) return [];
  const entries: Array<{ tag: number; type: number; count: number; valueOffset: number; inline: boolean }> = [];
  for (let i = 0; i < count; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    const type = u16(reader, entry + 2);
    const valueCount = u32(reader, entry + 4);
    const width = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : type === 9 ? 4 : 1;
    const inline = width * valueCount <= 4;
    // 内联数值（LONG/SHORT 且不超过 4 字节）本身就存在 value 字段里；
    // ASCII 内联时字段里直接是字符。二者语义不同，必须分开取值。
    const numericInline = inline && (type === 3 || type === 4);
    const valueOffset = inline ? (numericInline ? u32(reader, entry + 8) : entry + 8) : u32(reader, entry + 8);
    entries.push({ tag: u16(reader, entry), type, count: valueCount, valueOffset, inline });
  }
  return entries;
}

function readTextValue(reader: TiffReader, entry: { count: number; valueOffset: number }): string {
  if (entry.count <= 0 || entry.count > 512) return '';
  return asciiAt(reader, entry.valueOffset, entry.count);
}

function readRational(reader: TiffReader, offset: number): number | null {
  const lit = reader.little;
  const numerator = reader.view.getUint32(reader.base + offset, lit);
  const denominator = reader.view.getUint32(reader.base + offset + 4, lit);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function readRationals(reader: TiffReader, entry: { count: number; valueOffset: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(entry.count, 4); i += 1) {
    const value = readRational(reader, entry.valueOffset + i * 8);
    if (value === null) return [];
    out.push(value);
  }
  return out;
}

function dmsToDecimal(values: number[]): number | null {
  if (values.length < 3) return null;
  const [deg, min, sec] = values;
  return deg + min / 60 + sec / 3600;
}

/** 'YYYY:MM:DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM:SS'；无法识别返回 undefined */
export function normalizeExifDate(raw: string): string | undefined {
  const matched = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!matched) return undefined;
  return `${matched[1]}-${matched[2]}-${matched[3]}T${matched[4]}:${matched[5]}:${matched[6]}`;
}

/** 解析 JPEG 里的 EXIF；非 JPEG / 无 EXIF 返回 null */
export function parseExif(buffer: ArrayBuffer): ExifInfo | null {
  const view = new DataView(buffer);
  if (view.byteLength < 18) return null;
  if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > view.byteLength) return null;
    if (marker === 0xe1 && length >= 8) {
      const signature = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
      );
      if (signature === 'Exif' && view.getUint8(offset + 8) === 0) {
        return parseTiff(view, offset + 10);
      }
    }
    offset += 2 + length;
  }
  return null;
}

function parseTiff(view: DataView, base: number): ExifInfo | null {
  if (base + 8 > view.byteLength) return null;
  const order = view.getUint16(base, false);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const reader: TiffReader = { view, base, little };
  if (u16(reader, 2) !== 42) return null;
  const ifd0 = u32(reader, 4);
  if (!ifd0) return null;

  const info: ExifInfo = {};
  let make = '';
  let model = '';
  let dateTime = '';
  let exifIfd = 0;
  let gpsIfd = 0;

  for (const entry of entriesOf(reader, ifd0)) {
    if (entry.tag === TAG_MAKE) make = readTextValue(reader, entry);
    else if (entry.tag === TAG_MODEL) model = readTextValue(reader, entry);
    else if (entry.tag === TAG_DATETIME) dateTime = readTextValue(reader, entry);
    else if (entry.tag === TAG_EXIF_IFD) exifIfd = entry.valueOffset;
    else if (entry.tag === TAG_GPS_IFD && entry.type === 4) gpsIfd = entry.valueOffset;
  }

  if (exifIfd > 0 && exifIfd < view.byteLength) {
    for (const entry of entriesOf(reader, exifIfd)) {
      if (entry.tag === TAG_DATETIME_ORIGINAL) {
        const original = readTextValue(reader, entry);
        if (original) dateTime = original;
      }
    }
  }

  const camera = [make, model].filter(Boolean).join(' ').trim();
  if (camera) info.camera = camera;
  const normalized = dateTime ? normalizeExifDate(dateTime) : undefined;
  if (normalized) info.capturedAt = normalized;

  if (gpsIfd > 0 && gpsIfd < view.byteLength) {
    let latRef = 'N';
    let lngRef = 'E';
    let lat: number | null = null;
    let lng: number | null = null;
    for (const entry of entriesOf(reader, gpsIfd)) {
      if (entry.tag === TAG_GPS_LAT_REF) latRef = readTextValue(reader, entry).toUpperCase() || 'N';
      else if (entry.tag === TAG_GPS_LAT) lat = dmsToDecimal(readRationals(reader, entry));
      else if (entry.tag === TAG_GPS_LNG_REF) lngRef = readTextValue(reader, entry).toUpperCase() || 'E';
      else if (entry.tag === TAG_GPS_LNG) lng = dmsToDecimal(readRationals(reader, entry));
    }
    if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
      info.gps = { lat: latRef === 'S' ? -lat : lat, lng: lngRef === 'W' ? -lng : lng };
    }
  }

  return info.camera || info.capturedAt || info.gps ? info : null;
}
