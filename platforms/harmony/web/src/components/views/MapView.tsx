import { useMemo, useRef, useState } from 'react';
import { importAssets, setMapBackground, updateNode } from '../../commands';
import { NODE_TYPE_META } from '../../lib/theme';
import {
  DEFAULT_GEO_BOUNDS,
  MAP_H,
  MAP_W,
  applyGeoFields,
  formatGeo,
  geoBounds,
  geoPoints,
  parseGeo,
  projectGeo,
  unprojectGeo,
} from '../../lib/map';
import { assetFileUrl } from '../../services/platform';
import { fileService } from '../../services/file';
import { imageService } from '../../services/image';
import { useDocStore } from '../../store/docStore';
import { useMapStore } from '../../store/mapStore';
import { useUiStore } from '../../store/uiStore';
import type { GeoPoint } from '../../lib/map';
import type { Asset } from '../../types';

interface PinDrag {
  id: string;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * 地图视图（M7）：离线示意板，不请求任何在线瓦片；没有坐标的实体不上图。
 * T7：点选设坐标 + 左栏「还没有坐标」入口。
 * M10：可导入底图（照片/平面图/现场示意图）当背景，并把图钉拖动改坐标。
 */
export function MapView() {
  const doc = useDocStore((s) => s.doc);
  const nodes = doc.nodes;
  const dispatch = useDocStore((s) => s.dispatch);
  const selectNode = useUiStore((s) => s.selectNode);
  const pickNodeId = useMapStore((s) => s.pickNodeId);
  const requestPick = useMapStore((s) => s.requestPick);
  const cancelPick = useMapStore((s) => s.cancelPick);
  const [drag, setDrag] = useState<PinDrag | null>(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  /** M11（J9）：双击图钉后手填经纬度 */
  const [editing, setEditing] = useState<{ id: string; lat: string; lng: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const points = useMemo(() => geoPoints(nodes), [nodes]);
  const bounds = useMemo(() => (points.length > 0 ? geoBounds(points) : DEFAULT_GEO_BOUNDS), [points]);
  const positions = useMemo(() => projectGeo(points, bounds), [points, bounds]);
  const waiting = useMemo(() => nodes.filter((node) => parseGeo(node.fields) === null), [nodes]);
  const picking = pickNodeId ? (nodes.find((node) => node.id === pickNodeId) ?? null) : null;
  const background = doc.settings.mapBackground;
  const bgAsset: Asset | null = background
    ? (doc.assets.find((asset) => asset.id === background.assetId) ?? null)
    : null;

  /** 屏幕像素 → viewBox 坐标（preserveAspectRatio=xMidYMid meet 时按等比缩放取较大者） */
  const toLocal = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H);
    const offsetX = (rect.width - MAP_W * scale) / 2;
    const offsetY = (rect.height - MAP_H * scale) / 2;
    return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale };
  };

  /** J9：双击图钉 -> 打开手填面板 */
  const beginEdit = (id: string) => {
    const target = nodes.find((node) => node.id === id);
    const geo = target ? parseGeo(target.fields) : null;
    setEditError(null);
    setEditing({ id, lat: geo ? String(geo.lat) : '', lng: geo ? String(geo.lng) : '' });
  };

  const commitEdit = () => {
    if (!editing) return;
    const target = nodes.find((node) => node.id === editing.id);
    if (!target) {
      setEditing(null);
      return;
    }
    const lat = Number(editing.lat.trim());
    const lng = Number(editing.lng.trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setEditError('纬度和经度都要填数字，例如 31.7833 与 119.9500');
      return;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setEditError('纬度必须在 -90~90，经度必须在 -180~180');
      return;
    }
    dispatch(updateNode(target.id, { fields: applyGeoFields(target.fields, lat, lng) }));
    setEditing(null);
    setEditError(null);
  };

  const onMapClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    if (!picking) return;
    const local = toLocal(event.currentTarget, event.clientX, event.clientY);
    if (!local) return;
    const geo = unprojectGeo(local.x, local.y, bounds);
    dispatch(updateNode(picking.id, { fields: applyGeoFields(picking.fields, geo.lat, geo.lng) }));
    selectNode(picking.id);
    cancelPick();
  };

  /** 拖动图钉：松手时把新位置写回经纬度（「联动更改已有节点经纬度」） */
  const beginPinDrag = (event: React.PointerEvent, point: GeoPoint) => {
    if (picking) return;
    event.stopPropagation();
    const svg = (event.currentTarget as unknown as { ownerSVGElement: SVGSVGElement | null }).ownerSVGElement;
    const pos = positions.get(point.node.id);
    if (!svg || !pos) return;
    dragMoved.current = false;
    setDrag({ id: point.node.id, x: pos.x, y: pos.y, moved: false });
    const onMove = (moveEvent: PointerEvent) => {
      const local = toLocal(svg, moveEvent.clientX, moveEvent.clientY);
      if (!local) return;
      dragMoved.current = true;
      setDrag((current) => (current ? { ...current, x: local.x, y: local.y, moved: true } : current));
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const local = toLocal(svg, upEvent.clientX, upEvent.clientY);
      setDrag(null);
      if (!local || !dragMoved.current) return;
      const geo = unprojectGeo(local.x, local.y, bounds);
      dispatch(updateNode(point.node.id, { fields: applyGeoFields(point.node.fields, geo.lat, geo.lng) }));
      selectNode(point.node.id);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const importBackground = async () => {
    if (bgBusy) return;
    setBgBusy(true);
    setBgError(null);
    try {
      const files = await fileService.pickFiles('image/*', false);
      if (files.length === 0) return;
      const prepared = await imageService.prepare(files.slice(0, 1));
      const first = prepared.prepared[0];
      if (!first) {
        setBgError(prepared.failed[0]?.error ?? '这张图片无法读取');
        return;
      }
      const assets = await imageService.save([first], {
        source: 'import',
        zone: 'evidence',
        sourceLabel: '地图底图',
      });
      const asset = assets[0];
      if (!asset) {
        setBgError('底图没有保存成功');
        return;
      }
      dispatch(importAssets({ assets }));
      dispatch(setMapBackground({ assetId: asset.id, opacity: 0.55 }));
    } catch (error) {
      setBgError(error instanceof Error ? error.message : String(error));
    } finally {
      setBgBusy(false);
    }
  };

  const pid = drag?.id ?? null;
  void pid;

  return (
    <div className={`cb-map${picking ? ' is-picking' : ''}`}>
      <div className="cb-map__head">
        <div>
          <h2>离线示意地图</h2>
          <p>按右栏「地图坐标」摆放；拖动图钉改坐标，不联网。</p>
        </div>
        <div className="cb-map__meta">
          <span>{points.length} 个带坐标的实体</span>
          <button type="button" className="cb-btn cb-btn--tiny" onClick={() => void importBackground()} disabled={bgBusy}>
            {bgAsset ? '更换底图…' : '导入底图…'}
          </button>
          {background ? (
            <>
              <label className="cb-map__opacity" title="底图不透明度">
                底图
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={5}
                  value={Math.round((background.opacity ?? 0.55) * 100)}
                  onChange={(event) =>
                    dispatch(
                      setMapBackground({ ...background, opacity: Number(event.target.value) / 100 }),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="cb-btn cb-btn--tiny cb-btn--ghost"
                onClick={() => dispatch(setMapBackground(null))}
              >
                移除底图
              </button>
            </>
          ) : null}
        </div>
      </div>

      {bgError ? <p className="cb-map__error">底图导入失败：{bgError}</p> : null}

      {picking ? (
        <div className="cb-map__pickbar">
          <strong>在图上点选位置</strong>
          <span>给「{picking.title}」设置经纬度：单击地图任意位置即可写回右栏字段。</span>
          <button type="button" className="cb-btn cb-btn--tiny" onClick={cancelPick}>
            取消
          </button>
        </div>
      ) : null}

      <div className="cb-map__body">
        <aside className="cb-map__side">
          <h3 className="cb-form__subtitle">还没有坐标（{waiting.length}）</h3>
          {waiting.length === 0 ? (
            <p className="cb-form__subtle">所有实体都有坐标了。</p>
          ) : (
            <ul className="cb-map__nolist">
              {waiting.map((node) => (
                <li key={node.id} className="cb-map__noitem">
                  <span className="cb-map__nodot" style={{ background: NODE_TYPE_META[node.type].color }} />
                  <span className="cb-map__noname" title={node.title}>
                    {node.title}
                  </span>
                  <button
                    type="button"
                    className="cb-link-btn"
                    onClick={() => {
                      selectNode(node.id);
                      requestPick(node.id);
                    }}
                  >
                    点选设坐标
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="cb-form__subtle">也可以在右栏「地图坐标」里直接填纬度 / 经度。</p>
        </aside>

        {points.length === 0 && !picking ? (
          <div className="cb-map__empty">
            还没有带经纬度的实体：在右栏「地图坐标」里填，或在左侧列表点「点选设坐标」后直接在地图上点一下。
          </div>
        ) : (
          <div className="cb-map__canvas">
            <svg
              className={`cb-map__svg${picking ? ' is-picking' : ''}`}
              viewBox={'0 0 ' + MAP_W + ' ' + MAP_H}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="离线示意地图"
              onClick={onMapClick}
            >
              <defs>
                <pattern id="cbmap-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" style={{ stroke: 'var(--cb-border)' }} strokeWidth="1" />
                </pattern>
              </defs>
              {bgAsset ? (
                <image
                  className="cb-map__bgimage"
                  href={assetFileUrl(bgAsset.path)}
                  x={0}
                  y={0}
                  width={MAP_W}
                  height={MAP_H}
                  opacity={background?.opacity ?? 0.55}
                  preserveAspectRatio="none"
                />
              ) : null}
              <rect
                x="0"
                y="0"
                width={MAP_W}
                height={MAP_H}
                fill={bgAsset ? 'none' : 'url(#cbmap-grid)'}
                opacity={bgAsset ? 0.25 : 1}
              />
              {points.map((point) => {
                const dragging = drag && drag.id === point.node.id;
                const pos = dragging ? { x: drag.x, y: drag.y } : positions.get(point.node.id);
                if (!pos) return null;
                const color = NODE_TYPE_META[point.node.type].color;
                const geo = dragging ? unprojectGeo(pos.x, pos.y, bounds) : null;
                return (
                  <g
                    key={point.node.id}
                    className={`cb-map__pin${point.node.id === pickNodeId ? ' is-picking' : ''}${dragging ? ' is-dragging' : ''}`}
                    transform={'translate(' + pos.x + ',' + pos.y + ')'}
                    onPointerDown={(event) => beginPinDrag(event, point)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      beginEdit(point.node.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (dragMoved.current) {
                        dragMoved.current = false;
                        return;
                      }
                      if (picking) {
                        // 点已有坐标的实体：把它的坐标复制给正在取点的实体，方便「就在旁边」
                        dispatch(
                          updateNode(picking.id, {
                            fields: applyGeoFields(picking.fields, point.lat, point.lng),
                          }),
                        );
                        selectNode(picking.id);
                        cancelPick();
                        return;
                      }
                      selectNode(point.node.id);
                    }}
                  >
                    <circle r="11" fill={color} style={{ stroke: 'var(--cb-panel)' }} strokeWidth="3" />
                    <circle r="18" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                    <text x="0" y="32" textAnchor="middle" className="cb-map__label">{point.node.title}</text>
                    <text x="0" y="48" textAnchor="middle" className="cb-map__coord">
                      {geo ? formatGeo(geo.lat, geo.lng) : formatGeo(point.lat, point.lng)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <span className="cb-map__hintline">
              拖动图钉改坐标 · 双击图钉手填经纬度 · 单击实体选中{picking ? ' · 正在取点' : ''}
            </span>
            {editing ? (
              <div className="cb-map__edit" role="dialog" aria-label="手动编辑经纬度">
                <div className="cb-map__edit-head">手动编辑经纬度</div>
                <label className="cb-field">
                  <span>纬度（-90~90）</span>
                  <input
                    className="cb-map__edit-input"
                    value={editing.lat}
                    autoFocus
                    onChange={(event) => setEditing({ ...editing, lat: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitEdit();
                      if (event.key === 'Escape') setEditing(null);
                    }}
                  />
                </label>
                <label className="cb-field">
                  <span>经度（-180~180）</span>
                  <input
                    className="cb-map__edit-input"
                    value={editing.lng}
                    onChange={(event) => setEditing({ ...editing, lng: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitEdit();
                      if (event.key === 'Escape') setEditing(null);
                    }}
                  />
                </label>
                {editError ? <p className="cb-map__error">{editError}</p> : null}
                <div className="cb-map__edit-ops">
                  <button className="cb-btn cb-btn--primary" onClick={commitEdit}>写回坐标</button>
                  <button className="cb-btn cb-btn--ghost" onClick={() => setEditing(null)}>取消</button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="cb-map__legend">
        <span>{bgAsset ? '底图：' + (bgAsset.name ?? bgAsset.path) : '离线示意地图 · 未加载瓦片（坐标只用于相对位置）'}</span>
        <span>没有坐标的实体不上图</span>
      </div>
    </div>
  );
}
