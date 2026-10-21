import type { XY } from '../types';

/**
 * 坐标换算唯一入口（决策 D6）：世界坐标 ↔ 屏幕坐标。
 * 任何组件、导出、吸附计算都必须走这里，禁止自算。
 */

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export function screenToWorld(point: XY, viewport: Viewport): XY {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(point: XY, viewport: Viewport): XY {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function snap(value: number, grid = 8): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(point: XY, grid = 8): XY {
  return { x: snap(point.x, grid), y: snap(point.y, grid) };
}
