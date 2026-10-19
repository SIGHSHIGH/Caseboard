import { useEffect, useMemo, useState } from 'react';
import {
  advanceCursor,
  buildTimeline,
  clampCursor,
  cursorFromRatio,
  formatTimelineRange,
  formatTimelineTime,
  nodesWithoutTime,
  ratioFromCursor,
  sliceTimeline,
  timelineBands,
  timelineScale,
} from '../../lib/timeline';
import {
  buildTrackLanes,
  clampSpanRatio,
  entityTrack,
  entityTrackTitle,
  nextTrackId,
  trackWidthPct,
} from '../../lib/timelineTracks';
import { NODE_TYPE_META, STATUS_META } from '../../lib/theme';
import { addTimelineTrack, removeTimelineTrack, setTimelinePrefs } from '../../commands';
import { useDocStore } from '../../store/docStore';
import { useTimelineStore } from '../../store/timelineStore';
import { useUiStore } from '../../store/uiStore';

const SPEEDS = [0.5, 1, 2, 4];
/** 1× 的含义：整段时间在 60 秒内放完（一天与一年的案件手感一致） */
const PLAY_SECONDS = 60;

/** 时间线视图：刻度 + 游标切片 + 播放（M5-5）；M10 加多轨并行与比例调控 */
export function TimelineView() {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectNode = useUiStore((s) => s.selectNode);
  const focusEntity = useUiStore((s) => s.focusEntity);
  const cursor = useTimelineStore((s) => s.cursor);
  const playing = useTimelineStore((s) => s.playing);
  const speed = useTimelineStore((s) => s.speed);
  const setCursor = useTimelineStore((s) => s.setCursor);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const setSpeed = useTimelineStore((s) => s.setSpeed);

  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackRef, setNewTrackRef] = useState('');

  const config = doc.timeline;
  const spanRatio = clampSpanRatio(config?.prefs.spanRatio ?? 1);
  const mode = config?.prefs.mode ?? 'type';

  const scale = useMemo(() => timelineScale(doc), [doc]);
  const items = useMemo(() => buildTimeline(doc), [doc]);
  const at = cursor === null ? scale.min : clampCursor(scale, cursor);
  const slice = useMemo(() => sliceTimeline(items, at), [items, at]);
  const lanes = useMemo(() => buildTrackLanes(doc.nodes, items, config), [doc.nodes, items, config]);
  const bands = useMemo(() => new Map(timelineBands(items, scale).map((band) => [band.id, band])), [items, scale]);
  const unscheduled = useMemo(() => nodesWithoutTime(doc), [doc]);
  const widthPct = trackWidthPct(spanRatio);

  /** 可以单独成轨的实体：有时间、且还没被做成轨道 */
  const addableEntities = useMemo(() => {
    const tracked = new Set((config?.tracks ?? []).filter((track) => track.kind === 'entity').map((track) => track.ref));
    const withTime = new Set(items.map((item) => item.id));
    return doc.nodes.filter((node) => withTime.has(node.id) && !tracked.has(node.id));
  }, [config?.tracks, doc.nodes, items]);

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

  const addTrack = () => {
    const node = addableEntities.find((item) => item.id === newTrackRef) ?? addableEntities[0];
    if (!node) return;
    dispatch(
      addTimelineTrack({
        ...entityTrack(node, (config?.tracks.length ?? 0) + 1),
        id: nextTrackId(config?.tracks ?? []),
        title: entityTrackTitle(node),
      }),
    );
    setAddingTrack(false);
    setNewTrackRef('');
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
            <select className="cb-input" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label className="cb-timeline__speed" title="比例越小，横向铺得越开，可以滚动看细节">
            比例
            <input
              className="cb-timeline__zoom"
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(spanRatio * 100)}
              aria-label="时间线比例"
              onChange={(event) =>
                dispatch(setTimelinePrefs({ spanRatio: clampSpanRatio(Number(event.target.value) / 100) }))
              }
            />
            <span className="cb-timeline__zoom-val">{Math.round(spanRatio * 100)}%</span>
          </label>
          <div className="cb-timeline__modes" role="group" aria-label="时间线分道方式">
            <button
              type="button"
              className={'cb-tab' + (mode === 'type' ? ' is-active' : '')}
              title="按实体类型分道（时间线默认）"
              onClick={() => dispatch(setTimelinePrefs({ mode: 'type' }))}
            >
              按类型
            </button>
            <button
              type="button"
              className={'cb-tab' + (mode === 'tracks' ? ' is-active' : '')}
              title="多轨并行：每个轨道可以是一个人物、一条资金链"
              onClick={() => dispatch(setTimelinePrefs({ mode: 'tracks' }))}
            >
              多轨并行
            </button>
          </div>
          <button type="button" className="cb-btn" onClick={() => setAddingTrack((value) => !value)} title="把一个实体单独拉成一条时间线">
            新建时间线
          </button>
          <button type="button" className="cb-btn" onClick={() => setCursor(scale.min)} title="回到最早时间">
            回到起点
          </button>
          <button type="button" className="cb-btn" onClick={() => setCursor(scale.max)} title="跳到最晚时间">
            跳到末尾
          </button>
        </div>
      </div>

      {addingTrack ? (
        <div className="cb-timeline__addtrack">
          <span className="cb-timeline__hint">选择要单独成轨的实体：</span>
          <select className="cb-input" value={newTrackRef} onChange={(event) => setNewTrackRef(event.target.value)}>
            <option value="">（第一个可用的）</option>
            {addableEntities.map((node) => (
              <option key={node.id} value={node.id}>
                {NODE_TYPE_META[node.type].label} · {node.title}
              </option>
            ))}
          </select>
          <button type="button" className="cb-btn cb-btn--primary" disabled={addableEntities.length === 0} onClick={addTrack}>
            添加轨道
          </button>
          <button type="button" className="cb-btn cb-btn--ghost" onClick={() => setAddingTrack(false)}>
            取消
          </button>
          {addableEntities.length === 0 ? (
            <span className="cb-timeline__hint">没有可加轨道的实体（需要该实体带可解析的时间）</span>
          ) : null}
        </div>
      ) : null}

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
          <div key={lane.id} className="cb-timeline__lane">
            <div className="cb-timeline__lane-head">
              <span className="cb-timeline__dot" style={{ background: lane.color }} />
              <span className="cb-timeline__lane-title" title={lane.title}>
                {lane.title}
              </span>
              <span className="cb-timeline__lane-count">{lane.items.length}</span>
              {mode === 'tracks' ? (
                <button
                  type="button"
                  className="cb-timeline__lane-del"
                  title="删除这条时间线（不影响实体）"
                  onClick={() => dispatch(removeTimelineTrack(lane.id))}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="cb-timeline__track-view">
              <div className="cb-timeline__track" style={{ width: `${widthPct}%` }}>
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
          </div>
        ))}
        {lanes.length === 0 ? (
          <p className="cb-timeline__hint">还没有轨道：点「新建时间线」把某个实体单独成轨。</p>
        ) : null}
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
