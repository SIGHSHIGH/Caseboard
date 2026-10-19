import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Rect } from '../../lib/groups';

interface Props {
  /** 圈选完成：返回世界坐标矩形；矩形过小视为误触 */
  onFinish: (rect: Rect) => void;
  onCancel: () => void;
}

interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 圈选层：只在 lasso 模式挂载，铺满画布接管指针事件。
 * 所有坐标都用 React Flow 的 screenToFlowPosition 换算，符合决策 D6。
 */
export function LassoOverlay({ onFinish, onCancel }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  // M12（K1）：框选矩形必须以「圈选层自身」为坐标原点。之前直接拿 clientX/clientY 当 left/top，
  // 圈选层是绝对定位在画布容器里的，于是整个框被左栏宽度 + 顶栏高度整体偏移，看起来就是「框和指针不重合」。
  const [origin, setOrigin] = useState<{ left: number; top: number } | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  const toWorld = (clientX: number, clientY: number) => screenToFlowPosition({ x: clientX, y: clientY });

  const box: ScreenBox | null =
    start && current && origin
      ? {
          left: Math.min(start.x, current.x) - origin.left,
          top: Math.min(start.y, current.y) - origin.top,
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        }
      : null;

  const finish = (clientX: number, clientY: number) => {
    if (!start) return;
    const a = toWorld(start.x, start.y);
    const b = toWorld(clientX, clientY);
    const rect: Rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    setStart(null);
    setCurrent(null);
    if (rect.w < 24 || rect.h < 24) onCancel();
    else onFinish(rect);
  };

  return (
    <div
      className="cb-lasso"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        setOrigin({ left: rect.left, top: rect.top });
        setStart({ x: event.clientX, y: event.clientY });
        setCurrent({ x: event.clientX, y: event.clientY });
      }}
      onPointerMove={(event) => {
        if (!start) return;
        setCurrent({ x: event.clientX, y: event.clientY });
      }}
      onPointerUp={(event) => finish(event.clientX, event.clientY)}
      onPointerCancel={() => {
        setStart(null);
        setCurrent(null);
        setOrigin(null);
        onCancel();
      }}
    >
      <span className="cb-lasso__hint">按住左键拖动，框住要归入分组的对象（Esc 取消）</span>
      {box ? <div className="cb-lasso__box" style={box} /> : null}
    </div>
  );
}
