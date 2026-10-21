import type { CaseNode } from '../types';

/** 右栏字段里可识别的经纬度键名（M7 地图视图：不做地理编码，只按已填坐标摆点） */
export const GEO_KEYS = ['经纬度', '坐标', 'geo', '位置坐标'];
/** T7：兼容「经度」「纬度」两个独立字段（老数据/手工填写的写法） */
export const GEO_LAT_KEYS = ['纬度', 'lat', 'Latitude'];
export const GEO_LNG_KEYS = ['经度', 'lng', 'lon', 'Longitude'];

export interface GeoPoint {
  node: CaseNode;
  lat: number;
  lng: number;
}

function toCoord(raw: string | number | boolean | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? value : null;
}

function valid(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function firstField(
  fields: Record<string, string | number | boolean>,
  keys: string[],
): string | number | boolean | undefined {
  for (const key of keys) {
    const raw = fields[key];
    if (raw !== undefined && raw !== null && raw !== '') return raw;
  }
  return undefined;
}

/**
 * 解析一个实体的经纬度：先看「经纬度」这类合并字段（`31.2304,121.4737`，支持中文逗号），
 * 再回退到「纬度」「经度」两个独立字段（T7）。超范围一律视为无效，避免把点画到图外。
 */
export function parseGeo(fields: Record<string, string | number | boolean> | undefined): { lat: number; lng: number } | null {
  if (!fields) return null;
  for (const key of GEO_KEYS) {
    const raw = fields[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const parts = String(raw).replace(/，/g, ',').split(',');
    if (parts.length !== 2) continue;
    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());
    if (Number.isFinite(lat) && Number.isFinite(lng) && valid(lat, lng)) {
      return { lat, lng };
    }
  }
  const lat = toCoord(firstField(fields, GEO_LAT_KEYS));
  const lng = toCoord(firstField(fields, GEO_LNG_KEYS));
  if (lat !== null && lng !== null && valid(lat, lng)) return { lat, lng };
  return null;
}

/** 经纬度写回字段时的规范文本（固定 6 位小数，便于比较与去重） */
export function formatGeo(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** 把经纬度写进 fields：统一写「经纬度」并清掉「经度/纬度」旧键，避免两份数据打架 */
export function applyGeoFields(
  fields: Record<string, string | number | boolean>,
  lat: number,
  lng: number,
): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = { ...fields, 经纬度: formatGeo(lat, lng) };
  for (const key of [...GEO_LAT_KEYS, ...GEO_LNG_KEYS]) delete next[key];
  return next;
}

/** 清空所有经纬度相关字段（右栏「清除坐标」用） */
export function clearGeoFields(fields: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = { ...fields };
  for (const key of [...GEO_KEYS, ...GEO_LAT_KEYS, ...GEO_LNG_KEYS]) delete next[key];
  return next;
}

export function geoPoints(nodes: CaseNode[]): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const node of nodes) {
    const geo = parseGeo(node.fields);
    if (geo) points.push({ node, lat: geo.lat, lng: geo.lng });
  }
  return points;
}

export const MAP_W = 1000;
export const MAP_H = 620;
export const MAP_PAD = 80;

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  spanLat: number;
  spanLng: number;
}

/** 计算投影用的包围盒（单点或零跨度时留出 0.002 的最小跨度） */
export function geoBounds(points: GeoPoint[]): GeoBounds {
  if (points.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0, spanLat: 0.002, spanLng: 0.002 };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    spanLat: Math.max(maxLat - minLat, 0.002),
    spanLng: Math.max(maxLng - minLng, 0.002),
  };
}

/** 把经纬度线性映射到 1000×620 的示意图坐标系（北在上） */
export function projectGeo(points: GeoPoint[], bounds?: GeoBounds): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (points.length === 0) return out;
  const box = bounds ?? geoBounds(points);
  for (const point of points) {
    out.set(point.node.id, {
      x: MAP_PAD + ((point.lng - box.minLng) / box.spanLng) * (MAP_W - MAP_PAD * 2),
      y: MAP_H - MAP_PAD - ((point.lat - box.minLat) / box.spanLat) * (MAP_H - MAP_PAD * 2),
    });
  }
  return out;
}

/**
 * T7：地图上点选 → 反算经纬度（projectGeo 的逆运算）。
 * 没有点可参照时用一个「以当前中心为原点、跨 0.01 度」的默认视框，保证第一下点击也落在城市尺度。
 */
export function unprojectGeo(x: number, y: number, bounds: GeoBounds): { lat: number; lng: number } {
  const lng = bounds.minLng + ((x - MAP_PAD) / (MAP_W - MAP_PAD * 2)) * bounds.spanLng;
  const lat = bounds.minLat + ((MAP_H - MAP_PAD - y) / (MAP_H - MAP_PAD * 2)) * bounds.spanLat;
  const clampLat = Math.max(-90, Math.min(90, lat));
  const clampLng = Math.max(-180, Math.min(180, lng));
  return { lat: Number(clampLat.toFixed(6)), lng: Number(clampLng.toFixed(6)) };
}

/** 空地图上用点选时的默认视框（跨约 0.02 度，够覆盖一个城区） */
export const DEFAULT_GEO_BOUNDS: GeoBounds = {
  minLat: 31.76,
  maxLat: 31.8,
  minLng: 119.92,
  maxLng: 119.98,
  spanLat: 0.04,
  spanLng: 0.06,
};
