import { useEffect, useMemo } from 'react';
import {
  advanceCursor,
  buildTimeline,
  clampCursor,
  cursorFromRatio,
  formatTimelineRange,
  formatTimelineTime,
  laneGroups,
  nodesWithoutTime,
  ratioFromCursor,
  sliceTimeline,
  timelineBands,
  timelineScale,
} from '../../lib/timeline';
import { NODE_TYPE_META, STATUS_META } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useTimelineStore } from '../../store/timelineStore';
import { useUiStore } from '../../store/uiStore';

const SPEEDS = [0.5, 1, 2, 4];
/** 1× 的含义：整段时间在 60 秒内放完（一天与一年的案件手感一致） */
const PLAY_SECONDS = 60;

/** 时间线视图：刻度 + 游标切片 + 播放（M5-5，内核见 src/lib/timeline.ts） */
export function TimelineView() {
  const doc = useDocStore((s) => s.doc);
  const selectNode = useUiStore((s) => s.selectNode);
  const focusEntity = useUiStore((s) => s.focusEntity);
  const cursor = useTimelineStore((s) => s.cursor);
  const playing = useTimelineStore((s) => s.playing);
  const speed = useTimelineStore((s) => s.speed);
  const setCursor = useTimelineStore((s) => s.setCursor);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const setSpeed = useTimelineStore((s) => s.setSpeed);

  const scale = useMemo(() => timelineScale(doc), [doc]);
  const items = useMemo(() => buildTimeline(doc), [doc]);
  const at = cursor === null ? scale.min : clampCursor(scale, cursor);
  const slice = useMemo(() => sliceTimeline(items, at), [items, at]);
  const lanes = useMemo(() => laneGroups(items), [items]);
  const bands = useMemo(() => new Map(timelineBands(items, scale).map((band) => [band.id, band])), [items, scale]);
  const unscheduled = useMemo(() => nodesWithoutTime(doc), [doc]);

  const stateOf = (id: string): 'past' | 'running' | 'future' => {
    if (slice.running.some((item) => item.id === id)) return 'running';
    if (slice.past.some((item) => item.id === id)) return 'past';
    return 'future';
  };

  // 播放循环：每帧推进，到末点自动停住（不自动循环，避免汇报时忽然重播）
  useEffect(() => {
    if (!playing || scale.empty) return;
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      if (last === 0) last = now;
      const delta = Math.min(now - last, 200);
      last = now;
      const current = useTimelineStore.getState().cursor;
      const from = current === null ? scale.min : clampCursor(scale, current);
      const next = advanceCursor(scale, from, (scale.span / (PLAY_SECONDS * 1000)) * speed, delta);
      setCursor(next);
      if (next >= scale.max) {
        pause();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, scale, speed, setCursor, pause]);

  const onPlay = () => {
    if (playing) {
      pause();
      return;
    }
    if (!scale.empty && at >= scale.max) setCursor(scale.min);
    play();
  };

  if (scale.empty) {
    return (
      <div className="cb-timeline cb-timeline--empty">
        <div className="cb-timeline__head">
          <strong>时间线</strong>
          <span className="cb-timeline__hint">当前案件还没有可解析的时间，先把「时间」填进实体属性或事件节点。</span>
        </div>
        <div className="cb-timeline__empty">
          <p>支持 2026 / 2026-09 / 2026-09-03 / 2026-09-03 20:10 四种写法（按本机 UTC 口径归一）。</p>
          {unscheduled.length > 0 ? (
            <>
              <p className="cb-timeline__hint">未排期实体 {unscheduled.length} 个：</p>
              <div className="cb-timeline__unscheduled">
                {unscheduled.map((node) => (
                  <span key={node.id} className="cb-timeline__chip is-future">
                    {NODE_TYPE_META[node.type].icon} {node.title}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="cb-timeline">
      <div className="cb-timeline__head">
        <div>
          <strong>时间线</strong>
          <span className="cb-timeline__hint">
            {scale.startText} → {scale.endText}
          </span>
        </div>
        <div className="cb-timeline__controls">
          <button type="button" className="cb-btn cb-btn--primary" onClick={onPlay}>
            {playing ? '暂停' : '播放'}
          </button>
          <label className="cb-timeline__speed">
            倍速
            <select
              className="cb-input"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="cb-btn" onClick={() => setCursor(scale.min)} title="回到最早时间">
            回到起点
          </button>
          <button type="button" className="cb-btn" onClick={() => setCursor(scale.max)} title="跳到最晚时间">
            跳到末尾
          </button>
        </div>
      </div>

      <div className="cb-timeline__now">
        <span className="cb-timeline__now-label">当前时刻</span>
        <strong>{formatTimelineTime(at)}</strong>
        <span className="cb-timeline__counts">
          已发生 {slice.past.length} · 进行中 {slice.running.length} · 未发生 {slice.future.length}
        </span>
      </div>

      <input
        className="cb-timeline__scrub"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(ratioFromCursor(scale, at) * 1000)}
        aria-label="时间游标"
        onChange={(event) => setCursor(cursorFromRatio(scale, Number(event.target.value) / 1000))}
      />

      <div className="cb-timeline__lanes">
        {lanes.map((lane) => (
          <div key={lane.lane} className="cb-timeline__lane">
            <div className="cb-timeline__lane-head">
              <span className="cb-timeline__dot" style={{ background: NODE_TYPE_META[lane.lane].color }} />
              {NODE_TYPE_META[lane.lane].label}
              <span className="cb-timeline__lane-count">{lane.items.length}</span>
            </div>
            <div className="cb-timeline__track">
              {lane.items.map((item) => {
                const band = bands.get(item.id);
                if (!band) return null;
                return (
                  <span
                    key={item.id + '-band'}
                    className="cb-timeline__band"
                    style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }}
                    title="区间事件：起点到终点"
                  />
                );
              })}
              {lane.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`cb-timeline__chip is-${stateOf(item.id)}`}
                  style={{ left: `${ratioFromCursor(scale, item.start) * 100}%` }}
                  title={`${formatTimelineRange(item)} · ${STATUS_META[item.status].label} · 置信度 ${item.confidence}`}
                  onClick={() => {
                    selectNode(item.id);
                    focusEntity(item.id, 'node');
                  }}
                >
                  <span className="cb-timeline__chip-title">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {unscheduled.length > 0 ? (
        <div className="cb-timeline__footer">
          <span className="cb-timeline__hint">未排期实体 {unscheduled.length} 个（没有时间字段，不参与播放）：</span>
          <div className="cb-timeline__unscheduled">
            {unscheduled.map((node) => (
              <button
                key={node.id}
                type="button"
                className="cb-timeline__chip is-future"
                onClick={() => {
                  selectNode(node.id);
                  focusEntity(node.id, 'node');
                }}
              >
                {NODE_TYPE_META[node.type].icon} {node.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
