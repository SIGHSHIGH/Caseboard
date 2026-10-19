import { useMemo } from 'react';
import { updateNode } from '../../commands';
import { NODE_TYPE_META } from '../../lib/theme';
import {
  DEFAULT_GEO_BOUNDS,
  MAP_H,
  MAP_W,
  applyGeoFields,
  geoBounds,
  geoPoints,
  parseGeo,
  projectGeo,
  unprojectGeo,
} from '../../lib/map';
import { useDocStore } from '../../store/docStore';
import { useMapStore } from '../../store/mapStore';
import { useUiStore } from '../../store/uiStore';

/**
 * 地图视图（M7）：离线示意板，不请求任何瓦片服务；没有坐标的实体不上图。
 * T7 增补：可直接在地图上点选给实体设坐标，左侧列出「还没坐标」的实体作为入口。
 */
export function MapView() {
  const nodes = useDocStore((s) => s.doc.nodes);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectNode = useUiStore((s) => s.selectNode);
  const pickNodeId = useMapStore((s) => s.pickNodeId);
  const requestPick = useMapStore((s) => s.requestPick);
  const cancelPick = useMapStore((s) => s.cancelPick);

  const points = useMemo(() => geoPoints(nodes), [nodes]);
  const bounds = useMemo(() => (points.length > 0 ? geoBounds(points) : DEFAULT_GEO_BOUNDS), [points]);
  const positions = useMemo(() => projectGeo(points, bounds), [points, bounds]);
  const waiting = useMemo(() => nodes.filter((node) => parseGeo(node.fields) === null), [nodes]);
  const picking = pickNodeId ? (nodes.find((node) => node.id === pickNodeId) ?? null) : null;

  const onMapClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!picking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // 屏幕像素 → viewBox 坐标（preserveAspectRatio=xMidYMid meet 时按等比缩放取较大者）
    const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H);
    const offsetX = (rect.width - MAP_W * scale) / 2;
    const offsetY = (rect.height - MAP_H * scale) / 2;
    const x = (event.clientX - rect.left - offsetX) / scale;
    const y = (event.clientY - rect.top - offsetY) / scale;
    const geo = unprojectGeo(x, y, bounds);
    dispatch(updateNode(picking.id, { fields: applyGeoFields(picking.fields, geo.lat, geo.lng) }));
    selectNode(picking.id);
    cancelPick();
  };

  return (
    <div className={`cb-map${picking ? ' is-picking' : ''}`}>
      <div className="cb-map__head">
        <div>
          <h2>离线示意地图</h2>
          <p>按右栏「经纬度」字段摆放实体（格式 31.2304,121.4737）；不请求任何在线瓦片。</p>
        </div>
        <div className="cb-map__meta">
          <span>{points.length} 个带坐标的实体</span>
          <button type="button" className="cb-btn cb-btn--tiny" disabled title="离线瓦片在 M8 之后接入">加载离线瓦片</button>
        </div>
      </div>

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
          <p className="cb-form__subtle">也可以先在右栏「地图坐标」里直接填纬度 / 经度。</p>
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
              <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#cbmap-grid)" />
              {points.map((point) => {
                const pos = positions.get(point.node.id);
                if (!pos) return null;
                const color = NODE_TYPE_META[point.node.type].color;
                return (
                  <g
                    key={point.node.id}
                    className={`cb-map__pin${point.node.id === pickNodeId ? ' is-picking' : ''}`}
                    transform={'translate(' + pos.x + ',' + pos.y + ')'}
                    onClick={(event) => {
                      event.stopPropagation();
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
                    <circle r="9" fill={color} style={{ stroke: 'var(--cb-panel)' }} strokeWidth="3" />
                    <circle r="16" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                    <text x="0" y="30" textAnchor="middle" className="cb-map__label">{point.node.title}</text>
                    <text x="0" y="46" textAnchor="middle" className="cb-map__coord">{point.lat.toFixed(4)},{point.lng.toFixed(4)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      <div className="cb-map__legend">
        <span>离线示意地图 · 未加载瓦片（坐标只用于相对位置）</span>
        <span>没有坐标的实体不上图</span>
      </div>
    </div>
  );
}
