/**
 * 自动布局内核（M5-1）：一张图的坐标怎么排，全部在这里决定。
 *
 * 设计约束：
 * - 纯函数：输入 CaseDoc，输出坐标表；不改文档、不碰 DOM、不读随机源。
 * - 移动端与锁定端分离：lockedIds 里的节点坐标**逐位不变**（M5 验收 3a），
 *   其余节点排完后按「原重心 → 新重心」平移到原地画布位置，避免整板跳到别处。
 * - 组不穿透：有 groupId 的节点排完会被夹回组矩形内（M5 验收 3a「不穿组」）。
 * - 矩形分离：力导向的圆形碰撞挡不住矩形边角，最后统一做矩形去重叠。
 */
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { graphlib, layout as dagreLayout } from 'dagre';
import type { CaseDoc, CaseNode, Group, XY } from '../types';
import { buildGraph } from './graph';

export type LayoutKind = 'force' | 'hierarchical' | 'radial' | 'circle' | 'grid';

export interface LayoutOptions {
  kind: LayoutKind;
  /** 不移动的节点（手动钉住 / 多选锁定） */
  lockedIds?: Iterable<string>;
  /** 节点之间的最小间隙，默认 36 */
  gap?: number;
  /** 力导向迭代次数，默认 320 */
  iterations?: number;
  /** 把组内节点夹回组矩形，默认 true */
  clampToGroups?: boolean;
  /** 去矩形重叠，默认 true */
  separate?: boolean;
  /** 层级/径向布局的根节点；缺省取度最大的节点（同度按 id 升序） */
  rootId?: string;
}

export interface LayoutPlacement {
  id: string;
  x: number;
  y: number;
  /** 因锁定而未移动 */
  locked: boolean;
}

export interface LayoutResult {
  kind: LayoutKind;
  /** 全部节点（含锁定节点）的最终坐标 */
  placements: LayoutPlacement[];
  moved: number;
  /** 去重叠实际执行了几轮（0 表示本来就无重叠） */
  separatePasses: number;
  /** 被夹回组内的节点数 */
  groupClamped: number;
}

const DEFAULT_GAP = 36;
const FORCE_ITERATIONS = 320;
const SEPARATE_PASSES = 24;
const GROUP_INSET = 14;

interface ForceDatum extends SimulationNodeDatum {
  id: string;
  w: number;
  h: number;
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function centroid(points: XY[]): XY {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function maxSize(nodes: CaseNode[]): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const node of nodes) {
    if (node.w > w) w = node.w;
    if (node.h > h) h = node.h;
  }
  return { w: w || 208, h: h || 108 };
}

/** 力导向：以原坐标起跑，固定迭代次数，输出节点**左上角**坐标 */
function forcePositions(doc: CaseDoc, nodes: CaseNode[], gap: number, iterations: number, base: Map<string, XY>): Map<string, XY> {
  const result = new Map<string, XY>();
  if (nodes.length === 0) return result;
  // 起跑位置若两节点完全重合，d3 的 link 力会掺入随机抖动；先用确定性的微偏移隔开。
  const used = new Set<string>();
  const data: ForceDatum[] = nodes.map((node, index) => {
    const origin = base.get(node.id) ?? { x: 0, y: 0 };
    let centerX = origin.x + node.w / 2;
    let centerY = origin.y + node.h / 2;
    while (used.has(Math.round(centerX) + ':' + Math.round(centerY))) {
      centerX += 0.75;
      centerY += 0.5;
    }
    used.add(Math.round(centerX) + ':' + Math.round(centerY));
    return { id: node.id, w: node.w, h: node.h, x: centerX, y: centerY, index };
  });
  const graph = buildGraph(doc);
  const links = graph.edges
    .filter((edge) => data.some((d) => d.id === edge.source) && data.some((d) => d.id === edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }));
  const anchor = centroid(nodes.map((node) => base.get(node.id) ?? { x: 0, y: 0 }));
  const simulation = forceSimulation<ForceDatum>(data)
    .force(
      'link',
      forceLink<ForceDatum, { source: string; target: string }>(links)
        .id((datum) => datum.id)
        .distance(gap + 180)
        .strength(0.55),
    )
    .force('charge', forceManyBody<ForceDatum>().strength(-520))
    .force(
      'collide',
      forceCollide<ForceDatum>()
        .radius((datum) => Math.hypot(datum.w, datum.h) / 2 + gap / 2)
        .iterations(2),
    )
    .force('center', forceCenter(anchor.x, anchor.y))
    .force('x', forceX<ForceDatum>(anchor.x).strength(0.045))
    .force('y', forceY<ForceDatum>(anchor.y).strength(0.045))
    .stop();
  simulation.tick(Math.max(1, iterations));
  for (const datum of data) {
    result.set(datum.id, {
      x: Math.round((datum.x ?? 0) - datum.w / 2),
      y: Math.round((datum.y ?? 0) - datum.h / 2),
    });
  }
  return result;
}

/** 层级布局（dagre，从左到右的案情推演动线） */
function hierarchicalPositions(doc: CaseDoc, gap: number): Map<string, XY> {
  const result = new Map<string, XY>();
  if (doc.nodes.length === 0) return result;
  const graph = new graphlib.Graph({ directed: true, multigraph: true });
  graph.setGraph({ rankdir: 'LR', nodesep: gap, ranksep: gap + 64, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  const ids = new Set<string>();
  for (const node of doc.nodes) {
    graph.setNode(node.id, { width: node.w, height: node.h });
    ids.add(node.id);
    result.set(node.id, { x: node.x, y: node.y });
  }
  for (const edge of doc.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }
  dagreLayout(graph);
  for (const node of doc.nodes) {
    const placed = graph.node(node.id) as { x?: number; y?: number } | undefined;
    if (!placed || typeof placed.x !== 'number' || typeof placed.y !== 'number') continue;
    result.set(node.id, { x: Math.round(placed.x - node.w / 2), y: Math.round(placed.y - node.h / 2) });
  }
  return result;
}

/** 从 root 出发按 BFS 深度分环的径向布局 */
function radialPositions(doc: CaseDoc, gap: number, rootId?: string): Map<string, XY> {
  const result = new Map<string, XY>();
  if (doc.nodes.length === 0) return result;
  const graph = buildGraph(doc);
  const ids = doc.nodes.map((node) => node.id).sort(byId);
  let root = rootId && graph.nodes.has(rootId) ? rootId : ids[0];
  if (!rootId) {
    let best = -1;
    for (const id of ids) {
      const degree = graph.adjacency.get(id)?.length ?? 0;
      if (degree > best) {
        best = degree;
        root = id;
      }
    }
  }
  const depth = new Map<string, number>([[root, 0]]);
  const queue: string[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const nextDepth = (depth.get(current) ?? 0) + 1;
    for (const next of graph.adjacency.get(current) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, nextDepth);
      queue.push(next);
    }
  }
  for (const node of doc.nodes) if (!depth.has(node.id)) depth.set(node.id, 0);
  const rings = new Map<number, string[]>();
  for (const [id, level] of depth) {
    const ring = rings.get(level) ?? [];
    ring.push(id);
    rings.set(level, ring);
  }
  const { w, h } = maxSize(doc.nodes);
  const step = Math.max(gap + 40, Math.round((w + h) / 3));
  for (const [level, members] of Array.from(rings.entries()).sort((a, b) => a[0] - b[0])) {
    members.sort(byId);
    if (level === 0) {
      for (const id of members) result.set(id, { x: 0, y: 0 });
      continue;
    }
    const radius = step * level;
    for (let index = 0; index < members.length; index += 1) {
      const angle = (Math.PI * 2 * index) / members.length - Math.PI / 2;
      result.set(members[index], {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      });
    }
  }
  return result;
}

function circlePositions(doc: CaseDoc, gap: number): Map<string, XY> {
  const result = new Map<string, XY>();
  const nodes = [...doc.nodes].sort((a, b) => byId(a.id, b.id));
  if (nodes.length === 0) return result;
  const { w, h } = maxSize(nodes);
  const radius = Math.max(
    gap + Math.max(w, h),
    Math.round((nodes.length * (w + gap)) / (Math.PI * 2)),
  );
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    result.set(node.id, {
      x: Math.round(Math.cos(angle) * radius) - Math.round(node.w / 2),
      y: Math.round(Math.sin(angle) * radius) - Math.round(node.h / 2),
    });
  });
  return result;
}

function gridPositions(doc: CaseDoc, gap: number): Map<string, XY> {
  const result = new Map<string, XY>();
  const nodes = [...doc.nodes].sort((a, b) => byId(a.id, b.id));
  if (nodes.length === 0) return result;
  const { w, h } = maxSize(nodes);
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = w + gap;
  const cellH = h + gap;
  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    result.set(node.id, { x: column * cellW, y: row * cellH });
  });
  return result;
}

/** 把矩形节点夹进所属组（组比节点还小时居中，允许负的可用宽度） */
function clampIntoGroup(node: CaseNode, group: Group): XY | null {
  const minX = group.bounds.x + GROUP_INSET;
  const minY = group.bounds.y + GROUP_INSET;
  const maxX = group.bounds.x + group.bounds.w - node.w - GROUP_INSET;
  const maxY = group.bounds.y + group.bounds.h - node.h - GROUP_INSET;
  const x = maxX >= minX ? Math.min(Math.max(node.x, minX), maxX) : group.bounds.x + (group.bounds.w - node.w) / 2;
  const y = maxY >= minY ? Math.min(Math.max(node.y, minY), maxY) : group.bounds.y + (group.bounds.h - node.h) / 2;
  if (x === node.x && y === node.y) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

function applyGroups(doc: CaseDoc, positions: Map<string, XY>): number {
  const groups = new Map(doc.groups.map((group) => [group.id, group]));
  let clamped = 0;
  for (const node of doc.nodes) {
    if (!node.groupId) continue;
    const group = groups.get(node.groupId);
    const current = positions.get(node.id);
    if (!group || !current) continue;
    const next = clampIntoGroup({ ...node, x: current.x, y: current.y }, group);
    if (!next) continue;
    positions.set(node.id, next);
    clamped += 1;
  }
  return clamped;
}

function overlapArea(a: CaseNode, b: CaseNode, pad: number): { x: number; y: number } | null {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w + pad, b.x + b.w + pad);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h + pad, b.y + b.h + pad);
  if (right <= left || bottom <= top) return null;
  return { x: right - left, y: bottom - top };
}

/** 一轮确定性矩形分离：按 id 排序遍历所有节点对，只推可移动的节点 */
function separatePass(doc: CaseDoc, positions: Map<string, XY>, locked: Set<string>, gap: number): number {
  const nodes = doc.nodes
    .map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : null;
    })
    .filter((node): node is CaseNode => node !== null)
    .sort((a, b) => byId(a.id, b.id));
  let moves = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const first = nodes[i];
      const second = nodes[j];
      const overlap = overlapArea(first, second, gap);
      if (!overlap) continue;
      const firstLocked = locked.has(first.id);
      const secondLocked = locked.has(second.id);
      if (firstLocked && secondLocked) continue;
      // 沿重叠较小的轴推开，符合「矩形最小平移」直觉
      const axis: 'x' | 'y' = overlap.x <= overlap.y ? 'x' : 'y';
      const firstCenter = axis === 'x' ? first.x + first.w / 2 : first.y + first.h / 2;
      const secondCenter = axis === 'x' ? second.x + second.w / 2 : second.y + second.h / 2;
      const direction = firstCenter <= secondCenter ? -1 : 1;
      const distance = axis === 'x' ? overlap.x : overlap.y;
      const share = firstLocked || secondLocked ? 1 : 0.5;
      if (!firstLocked) {
        const delta = direction * distance * share;
        if (axis === 'x') first.x += delta;
        else first.y += delta;
      }
      if (!secondLocked) {
        const delta = -direction * distance * share;
        if (axis === 'x') second.x += delta;
        else second.y += delta;
      }
      moves += 1;
    }
  }
  for (const node of nodes) positions.set(node.id, { x: Math.round(node.x), y: Math.round(node.y) });
  return moves;
}

function hasOverlap(doc: CaseDoc, positions: Map<string, XY>, gap: number): boolean {
  const nodes = doc.nodes
    .map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : null;
    })
    .filter((node): node is CaseNode => node !== null);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlapArea(nodes[i], nodes[j], gap * 0.5)) return true;
    }
  }
  return false;
}

export function computeLayout(doc: CaseDoc, options: LayoutOptions): LayoutResult {
  const gap = Math.max(4, Math.round(options.gap ?? DEFAULT_GAP));
  const iterations = Math.max(1, Math.round(options.iterations ?? FORCE_ITERATIONS));
  const locked = new Set<string>();
  for (const id of options.lockedIds ?? []) if (doc.nodes.some((node) => node.id === id)) locked.add(id);
  const base = new Map<string, XY>(doc.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const mobile = doc.nodes.filter((node) => !locked.has(node.id));

  if (mobile.length === 0) {
    return {
      kind: options.kind,
      placements: doc.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, locked: true })),
      moved: 0,
      separatePasses: 0,
      groupClamped: 0,
    };
  }

  let targets: Map<string, XY>;
  switch (options.kind) {
    case 'force':
      targets = forcePositions(doc, mobile, gap, iterations, base);
      break;
    case 'hierarchical':
      targets = hierarchicalPositions(doc, gap);
      break;
    case 'radial':
      targets = radialPositions(doc, gap, options.rootId);
      break;
    case 'circle':
      targets = circlePositions(doc, gap);
      break;
    case 'grid':
      targets = gridPositions(doc, gap);
      break;
    default: {
      const exhaustive: never = options.kind;
      throw new Error('未知的布局类型：' + String(exhaustive));
    }
  }

  // 平移让可移动节点的重心回到原位，避免整板跳走（层级/圆形/网格尤其明显）
  for (const node of doc.nodes) {
    if (locked.has(node.id)) targets.set(node.id, { ...(base.get(node.id) as XY) });
  }
  const before = centroid(mobile.map((node) => base.get(node.id) as XY));
  const after = centroid(mobile.map((node) => targets.get(node.id) as XY));
  const shiftX = before.x - after.x;
  const shiftY = before.y - after.y;
  for (const node of mobile) {
    const point = targets.get(node.id) as XY;
    targets.set(node.id, { x: Math.round(point.x + shiftX), y: Math.round(point.y + shiftY) });
  }

  let groupClamped = options.clampToGroups === false ? 0 : applyGroups(doc, targets);
  let separatePasses = 0;
  if (options.separate !== false) {
    for (let pass = 0; pass < SEPARATE_PASSES; pass += 1) {
      const moves = separatePass(doc, targets, locked, gap);
      if (moves === 0) break;
      separatePasses += 1;
      if (options.clampToGroups !== false) groupClamped += applyGroups(doc, targets);
      if (!hasOverlap(doc, targets, gap)) break;
    }
  }

  const placements = doc.nodes.map((node) => {
    const point = targets.get(node.id) as XY;
    return { id: node.id, x: point.x, y: point.y, locked: locked.has(node.id) };
  });
  let moved = 0;
  for (const placement of placements) {
    const origin = base.get(placement.id) as XY;
    if (placement.x !== origin.x || placement.y !== origin.y) moved += 1;
  }
  return { kind: options.kind, placements, moved, separatePasses, groupClamped };
}
