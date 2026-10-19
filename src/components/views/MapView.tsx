import { useMemo } from 'react';
import { NODE_TYPE_META } from '../../lib/theme';
import { MAP_H, MAP_W, geoPoints, projectGeo } from '../../lib/map';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

/** 地图视图（M7）：离线示意板，不请求任何瓦片服务；没有坐标的实体不上图 */
export function MapView() {
  const nodes = useDocStore((s) => s.doc.nodes);
  const selectNode = useUiStore((s) => s.selectNode);
  const points = useMemo(() => geoPoints(nodes), [nodes]);
  const positions = useMemo(() => projectGeo(points), [points]);
  return (
    <div className="cb-map">
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
      {points.length === 0 ? (
        <div className="cb-map__empty">还没有带经纬度的实体：在右栏字段里新增「经纬度」并填 31.2304,121.4737 即可上图。</div>
      ) : (
        <div className="cb-map__canvas">
          <svg className="cb-map__svg" viewBox={'0 0 ' + MAP_W + ' ' + MAP_H} preserveAspectRatio="xMidYMid meet" role="img" aria-label="离线示意地图">
            <defs>
              <pattern id="cbmap-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E7E2D8" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#cbmap-grid)" />
            {points.map((point) => {
              const pos = positions.get(point.node.id);
              if (!pos) return null;
              const color = NODE_TYPE_META[point.node.type].color;
              return (
                <g key={point.node.id} className="cb-map__pin" transform={'translate(' + pos.x + ',' + pos.y + ')'} onClick={() => selectNode(point.node.id)}>
                  <circle r="9" fill={color} stroke="#FBFAF7" strokeWidth="3" />
                  <circle r="16" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                  <text x="0" y="30" textAnchor="middle" className="cb-map__label">{point.node.title}</text>
                  <text x="0" y="46" textAnchor="middle" className="cb-map__coord">{point.lat.toFixed(4)},{point.lng.toFixed(4)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="cb-map__legend">
        <span>离线示意地图 · 未加载瓦片（坐标只用于相对位置）</span>
        <span>没有坐标的实体不上图</span>
      </div>
    </div>
  );
}
