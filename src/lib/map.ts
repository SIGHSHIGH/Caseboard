import type { CaseNode } from '../types';

/** 右栏字段里可识别的经纬度键名（M7 地图视图：不做地理编码，只按已填坐标摆点） */
export const GEO_KEYS = ['经纬度', '坐标', 'geo', '位置坐标'];

export interface GeoPoint {
  node: CaseNode;
  lat: number;
  lng: number;
}

export function parseGeo(fields: Record<string, string | number | boolean> | undefined): { lat: number; lng: number } | null {
  if (!fields) return null;
  for (const key of GEO_KEYS) {
    const raw = fields[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const parts = String(raw).replace(/，/g, ',').split(',');
    if (parts.length !== 2) continue;
    const lat = Number(parts[0].trim());
    const lng = Number(parts[1].trim());
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
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

/** 把经纬度线性映射到 1000×620 的示意图坐标系（北在上），单点或零跨度时留出 0.002 的最小跨度 */
export function projectGeo(points: GeoPoint[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (points.length === 0) return out;
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
  const spanLat = Math.max(maxLat - minLat, 0.002);
  const spanLng = Math.max(maxLng - minLng, 0.002);
  for (const point of points) {
    const x = MAP_PAD + ((point.lng - minLng) / spanLng) * (MAP_W - MAP_PAD * 2);
    const y = MAP_H - MAP_PAD - ((point.lat - minLat) / spanLat) * (MAP_H - MAP_PAD * 2);
    out.set(point.node.id, { x, y });
  }
  return out;
}
