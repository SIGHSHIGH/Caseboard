import { useEffect, useMemo, useState } from 'react';
import {
  GROUP_COLORS,
  DEFAULT_GROUP_OPACITY,
  addComment,
  addEdge,
  addNode,
  assignNodesToGroup,
  canParentGroup,
  composeCommands,
  deleteAsset,
  deleteComment,
  deleteEdge,
  deleteGroup,
  deleteImageNode,
  detachImageFromCluster,
  attachImageToCluster,
  rotateClusterMember,
  setImageLayer,
  setNodeLayer,
  updateImageNode,
  toggleGroupCollapsed,
  moveAssetsToFolder,
  updateAsset,
  updateEdge,
  updateGroup,
  updateNode,
  optimizeEdgeGeometry,
} from '../../commands';
import { LINE_STYLE_META, NODE_TYPE_META, REL_PRESETS, STATUS_META, relLabel } from '../../lib/theme';
import { memberNodeIds } from '../../lib/groups';
import { CARD_LAYER_Z } from '../../lib/imageNode';
import { offsetForCluster } from '../../lib/clusterPin';
import { PLACE_LINK_EDGE, planPlaceRelink } from '../../lib/placeLink';
import { NODE_TYPE_ORDER, NODE_TEMPLATES, templateOf, type NodeFieldDef } from '../../lib/nodeTemplates';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { useTagLinkStore } from '../../store/tagLinkStore';
import { useMapStore } from '../../store/mapStore';
import { useViewModeStore } from '../../store/viewModeStore';
import { applyGeoFields, clearGeoFields, parseGeo } from '../../lib/map';
import { fromDateTimeInput, timeRangeFromInput, toDateTimeInput } from '../../lib/datetime';
import { formatBytes } from '../../lib/assetMeta';
import { folderPath } from '../../lib/assetGroups';
import { imageStore, thumbUrl } from '../../services/imageStore';
import { AnnotationEditor } from './AnnotationEditor';
import { TagEditor } from './TagEditor';
import { maskAccount, parseOcrText } from '../../lib/ocr';
import { ocrEngineStatus, recognizeAssetText, warmOcrEngine, type OcrEngineStatus } from '../../services/ocr';
import type { Asset, CaseEdge, CaseNode, Group, ImageNode, LineStyle, NodeType, Status } from '../../types';
import { CanvasBackdropForm } from './CanvasBackdropForm';

const BORDER_LABELS: Array<{ value: NonNullable<ImageNode['borderStyle']>; label: string }> = [
  { value: 'photo', label: '照片白边' },
  { value: 'plain', label: '无边框' },
  { value: 'polaroid', label: '拍立得' },
];

/** 图钉可选颜色（H5.3）：默认深红与证据红同源，其余是中性与常见标记色 */
const PIN_COLORS: Array<{ value: string; label: string }> = [
  { value: '#C0392B', label: '证据红' },
  { value: '#1C1B1A', label: '碳黑' },
  { value: '#2F6F4E', label: '墨绿' },
  { value: '#B07C2A', label: '琥珀' },
  { value: '#2C5F8A', label: '靛蓝' },
  { value: '#7A7A74', label: '石灰' },
];

const STATUSES: Status[] = ['todo', 'checking', 'confirmed', 'ruledout'];
const STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

function splitTags(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 单个模板字段的输入控件：按 FieldKind 选控件，空值即删除该字段（保持 JSON 干净）。 */
function TemplateField({
  field,
  value,
  onCommit,
  suggestions,
}: {
  field: NodeFieldDef;
  value: string;
  onCommit: (key: string, next: string) => void;
  /** M11（I11）：可选既有对象（如「地点」可挑已有地点/单位），仍允许自由填写 */
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, field.key]);

  const commit = () => onCommit(field.key, draft);
  // M14（M5）：日期时间控件一律整行，避免与右侧字段挤成半列
  const className = field.wide || field.kind === 'datetime' ? 'cb-field cb-field--wide' : 'cb-field';

  if (field.kind === 'select') {
    const options = field.options ?? [];
    const withCurrent = value.length > 0 && !options.includes(value) ? [...options, value] : options;
    return (
      <label className={className}>
        <span>{field.label}</span>
        <select
          value={value}
          onChange={(event) => onCommit(field.key, event.target.value)}
          onBlur={commit}
        >
          <option value="">未填写</option>
          {withCurrent.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (suggestions && suggestions.length > 0) {
    // 有候选时给出下拉 + 自由输入双通道：选中即写回，也可以手打别名
    const options = value.length > 0 && !suggestions.includes(value) ? [value, ...suggestions] : suggestions;
    return (
      <label className={className}>
        <span>{field.label}</span>
        <input
          list={'cb-suggest-' + field.key}
          value={draft}
          placeholder={field.placeholder ?? '可手填，也可选已有对象'}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <datalist id={'cb-suggest-' + field.key}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <span className="cb-field__hint">共 {suggestions.length} 个可关联对象，双击输入框可从列表挑</span>
      </label>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <label className={className}>
        <span>{field.label}</span>
        <textarea
          rows={3}
          value={draft}
          placeholder={field.placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      </label>
    );
  }

  if (field.kind === 'datetime') {
    // 事件「发生时刻」：原生日期时间控件，值以 `YYYY-MM-DD HH:mm` 存进 fields，
    // 同时由 NodeForm.commitField 同步写 node.time，时间线/播放才有数据可用
    return (
      <label className={className}>
        <span>{field.label}</span>
        <input
          type="datetime-local"
          value={toDateTimeInput(draft)}
          onChange={(event) => setDraft(fromDateTimeInput(event.target.value))}
          onBlur={commit}
        />
      </label>
    );
  }

  return (
    <label className={className}>
      <span>{field.label}</span>
      <input
        type={field.kind === 'date' ? 'date' : 'text'}
        inputMode={field.kind === 'number' ? 'decimal' : undefined}
        value={draft}
        placeholder={field.placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function NodeForm({ node }: { node: CaseNode }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const groups = useDocStore((s) => s.doc.groups);
  const clusterImgs = useDocStore((s) => s.doc.imageNodes).filter((item) => item.clusterId === node.id);
  const [title, setTitle] = useState(node.title);
  const [aliases, setAliases] = useState((node.aliases ?? []).join('、'));
  const [notes, setNotes] = useState(node.notes ?? '');
  const [confidence, setConfidence] = useState(node.confidence);
  const [commentText, setCommentText] = useState('');
  // M12（K15）：地点自动连线后的提示文字
  const [placeLinked, setPlaceLinked] = useState('');
  const openTagLink = useTagLinkStore((s) => s.openDialog);
  const requestPick = useMapStore((s) => s.requestPick);
  const setViewMode = useViewModeStore((s) => s.setMode);
  const geo = parseGeo(node.fields);
  const [latText, setLatText] = useState(geo ? String(geo.lat) : '');
  const [lngText, setLngText] = useState(geo ? String(geo.lng) : '');

  useEffect(() => setTitle(node.title), [node.id, node.title]);
  useEffect(() => setAliases((node.aliases ?? []).join('、')), [node.id, node.aliases]);
  useEffect(() => setNotes(node.notes ?? ''), [node.id, node.notes]);
  useEffect(() => setConfidence(node.confidence), [node.id, node.confidence]);
  useEffect(() => {
    const next = parseGeo(node.fields);
    setLatText(next ? String(next.lat) : '');
    setLngText(next ? String(next.lng) : '');
  }, [node.id, node.fields]);

  const template = templateOf(node.type);
  /** M11（I11）：「地点」字段可从已有地点/单位里挑，省得手打后与卡片对不上 */
  const placeChoices = useMemo(() => {
    const titles = useDocStore
      .getState()
      .doc.nodes.filter((item) => item.type === 'place' || item.type === 'org')
      .map((item) => item.title.trim())
      .filter((title) => title.length > 0);
    return Array.from(new Set(titles));
  }, [node.id, node.type]);

  const commitTitle = () => {
    const next = title.trim();
    if (next.length > 0 && next !== node.title) dispatch(updateNode(node.id, { title: next }));
    else setTitle(node.title);
  };

  const commitAliases = () => {
    const next = splitTags(aliases);
    dispatch(updateNode(node.id, { aliases: next.length > 0 ? next : undefined }));
  };

  const commitNotes = () => {
    const next = notes.trim();
    if (next !== (node.notes ?? '')) {
      dispatch(updateNode(node.id, { notes: next.length > 0 ? next : undefined }));
    }
  };

  const commitConfidence = () => {
    if (confidence !== node.confidence) dispatch(updateNode(node.id, { confidence }));
  };

  /** T7：纬度/经度两个输入框写回「经纬度」字段；两个都空视为清除坐标 */
  const commitGeo = () => {
    const lat = Number(latText);
    const lng = Number(lngText);
    const empty = latText.trim().length === 0 && lngText.trim().length === 0;
    if (empty) {
      if (geo) dispatch(updateNode(node.id, { fields: clearGeoFields(node.fields) }));
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (geo && geo.lat === lat && geo.lng === lng) return;
    dispatch(updateNode(node.id, { fields: applyGeoFields(node.fields, lat, lng) }));
  };

  /** M12（K15）/ M13（L9）：改「地点」时该断开哪条旧线、该连到哪个已有地点（判定在 lib/placeLink.ts） */
  const placeRelinkOf = (text: string) =>
    planPlaceRelink(useDocStore.getState().doc, node.id, text);

  /** 字段提交：数字字段优先存 number，空字符串视为删除该字段。 */
  const commitField = (key: string, raw: string) => {
    const field = template.fields.find((item) => item.key === key);
    const next: Record<string, string | number | boolean> = { ...node.fields };
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      delete next[key];
    } else if (field && field.kind === 'number') {
      const parsed = Number(trimmed);
      next[key] = Number.isFinite(parsed) ? parsed : trimmed;
    } else {
      next[key] = trimmed;
    }
    if (field && field.kind === 'datetime') {
      // 发生时刻：fields 存展示文本，同时把 node.time 更新成 ISO（空值即清掉时间）
      const time = timeRangeFromInput(trimmed);
      const timeChanged = JSON.stringify(time) !== JSON.stringify(node.time ?? null);
      if (JSON.stringify(next) !== JSON.stringify(node.fields) || timeChanged) {
        dispatch(updateNode(node.id, time ? { fields: next, time } : { fields: next, time: undefined }));
      }
      return;
    }
    const fieldChanged = JSON.stringify(next) !== JSON.stringify(node.fields);
    // M13（L9）：改地点时先断开旧地点的自动关系线，再按新值连；清空则只断开
    const relink = key === '地点' ? placeRelinkOf(trimmed) : null;
    const relinkChanged =
      Boolean(relink) && (relink!.removeEdgeIds.length > 0 || relink!.addTarget !== null);
    if (!fieldChanged && !relinkChanged) return;
    const fieldCmd = updateNode(node.id, { fields: next });
    if (!relink || !relinkChanged) {
      dispatch(fieldCmd);
      return;
    }
    const commands = [fieldCmd];
    for (const edgeId of relink.removeEdgeIds) commands.push(deleteEdge(edgeId));
    if (relink.addTarget) {
      commands.push(addEdge({ source: node.id, target: relink.addTarget.id, ...PLACE_LINK_EDGE }));
    }
    const label = relink.addTarget
      ? relink.removeEdgeIds.length > 0
        ? '改地点：断开旧关系并连到「' + relink.addTarget.title + '」'
        : '填写地点并连线到「' + relink.addTarget.title + '」'
      : '清除地点并断开关系线';
    dispatch(composeCommands(label, commands));
    setPlaceLinked(relink.addTarget ? relink.addTarget.title : '');
  };

  const addOneComment = () => {
    const text = commentText.trim();
    if (text.length === 0) return;
    dispatch(addComment(node.id, text));
    setCommentText('');
  };

  const valueOf = (key: string): string => {    const value = node.fields[key];
    return value === undefined || value === null ? '' : String(value);
  };

  return (
    <div className="cb-form">
      <label className="cb-field">
        <span>标题</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>

      <label className="cb-field">
        <span>类型</span>
        <select
          value={node.type}
          onChange={(event) => dispatch(updateNode(node.id, { type: event.target.value as NodeType }))}
        >
          {NODE_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {NODE_TYPE_META[type].label} · {NODE_TEMPLATES[type].hint}
            </option>
          ))}
        </select>
      </label>

      <label className="cb-field">
        <span>状态</span>
        <select
          value={node.status}
          onChange={(event) => dispatch(updateNode(node.id, { status: event.target.value as Status }))}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>
      </label>

      <label className="cb-field">
        <span>所属分组</span>
        <select
          value={node.groupId ?? ''}
          onChange={(event) => dispatch(assignNodesToGroup([node.id], event.target.value || null))}
        >
          <option value="">未分组</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title}
              {group.collapsed ? '（已折叠）' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="cb-field">
        <span>置信度：{confidence}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={confidence}
          onChange={(event) => setConfidence(Number(event.target.value))}
          onPointerUp={commitConfidence}
          onBlur={commitConfidence}
        />
      </label>

      <label className="cb-field">
        <span>别名（顿号或逗号分隔）</span>
        <input
          value={aliases}
          placeholder="如：三哥、张老三"
          onChange={(event) => setAliases(event.target.value)}
          onBlur={commitAliases}
        />
      </label>

      <div className="cb-field cb-field--block">
        <span>标签（统一 tag 编辑）</span>
        <TagEditor value={node.tags} onChange={(next) => dispatch(updateNode(node.id, { tags: next }))} />
        <button
          type="button"
          className="cb-btn cb-btn--ghost"
          title="按标签找候选关系，人工确认后才连线"
          onClick={() => openTagLink(node.tags)}
        >
          按 tag 自动连线…
        </button>
      </div>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">
          地图坐标
          <span className="cb-form__subtle">写回「经纬度」字段，留空即从地图上移除</span>
        </h3>
        <div className="cb-geo">
          <label className="cb-field">
            <span>纬度</span>
            <input
              value={latText}
              inputMode="decimal"
              placeholder="31.7833"
              onChange={(event) => setLatText(event.target.value)}
              onBlur={commitGeo}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          <label className="cb-field">
            <span>经度</span>
            <input
              value={lngText}
              inputMode="decimal"
              placeholder="119.9500"
              onChange={(event) => setLngText(event.target.value)}
              onBlur={commitGeo}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
        </div>
        <div className="cb-geo__ops">
          <button
            type="button"
            className="cb-btn cb-btn--ghost"
            title="切到地图视图，在地图上点一下设坐标"
            onClick={() => {
              requestPick(node.id);
              setViewMode('map');
            }}
          >
            在地图上点选设坐标…
          </button>
          {geo ? (
            <button
              type="button"
              className="cb-link-btn"
              onClick={() => dispatch(updateNode(node.id, { fields: clearGeoFields(node.fields) }))}
              title="清空经纬度字段"
            >
              清除坐标
            </button>
          ) : null}
        </div>
      </div>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">
          {template.label}模板字段
          <span className="cb-form__subtle">{template.hint}</span>
        </h3>
        <div className="cb-fields">
          {template.fields.map((field) => (
            <TemplateField
              key={field.key}
              field={field}
              value={valueOf(field.key)}
              onCommit={commitField}
              suggestions={field.key === '地点' ? placeChoices : undefined}
            />
          ))}
        </div>
        {placeLinked ? (
          <p className="cb-form__subtle">
            已按「地点」自动连到已有对象「{placeLinked}」（虚线 · 推测 · 置信度 50，可在关系里改）；
            改填别的地点或清空「地点」时会自动断开这条线
          </p>
        ) : null}
        {Object.keys(node.fields).some((key) => !template.fields.some((field) => field.key === key)) ? (
          <p className="cb-form__subtle">
            含模板外自定义字段：
            {Object.keys(node.fields)
              .filter((key) => !template.fields.some((field) => field.key === key))
              .join('、')}
          </p>
        ) : null}
      </div>

      <label className="cb-field cb-field--inline">
        <input
          type="checkbox"
          checked={node.collapsed === true}
          onChange={(event) =>
            dispatch(updateNode(node.id, { collapsed: event.target.checked ? true : undefined }))
          }
        />
        <span>折叠详情（画布上只显示标题与状态）</span>
      </label>

      <label className="cb-field">
        <span>备注</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={commitNotes}
        />
      </label>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">评论（{(node.comments ?? []).length}）</h3>
        <ul className="cb-comments">
          {(node.comments ?? []).map((comment) => (
            <li key={comment.id} className="cb-comments__item">
              <p className="cb-comments__text">{comment.text}</p>
              <div className="cb-comments__meta">
                <span>{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
                <button
                  type="button"
                  className="cb-link-btn"
                  onClick={() => dispatch(deleteComment(node.id, comment.id))}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="cb-comments__new">
          <textarea
            rows={2}
            placeholder="记一条工作评论，例如：待调取 9 月 5 日通话详单"
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
          />
          <button type="button" className="cb-btn" onClick={addOneComment}>
            添加评论
          </button>
        </div>
      </div>

      {/* H5.3：集中钉子只写两个字段（便利贴显隐 + 便利贴文字），外加钉集成员清单 */}
      {node.type === 'clusterPin' ? (
        <div className="cb-form__section">
          <h3 className="cb-form__subtitle">钉集成员（{clusterImgs.length}）</h3>
          {clusterImgs.length === 0 ? (
            <p className="cb-form__subtle">把画布上的图片拖到钉子上松手，它就会被钉住，整集一起移动。</p>
          ) : (
            <ul className="cb-members">
              {clusterImgs.map((image) => {
                const asset = useDocStore.getState().doc.assets.find((item) => item.id === image.assetId);
                return (
                  <li key={image.id} className="cb-members__item">
                    <span className="cb-members__dot" style={{ background: '#7A7A74' }} />
                    <span className="cb-members__title">{asset?.name ?? '图片'}</span>
                    <button
                      type="button"
                      className="cb-link-btn"
                      onClick={() => useUiStore.getState().selectImage(image.id)}
                    >
                      查看
                    </button>
                    <button
                      type="button"
                      className="cb-link-btn"
                      onClick={() => dispatch(detachImageFromCluster(image.id))}
                    >
                      移出
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {/* H5.3：所有节点都给与图片一致的上下层控件（集中钉子的层级锁死在钉集之上，不提供） */}
      {node.type === 'clusterPin' ? null : (
        <div className="cb-form__section">
          <h3 className="cb-form__subtitle">层级（zIndex {node.zIndex ?? CARD_LAYER_Z}）</h3>
          <div className="cb-assets__actions">
            <button type="button" className="cb-btn" onClick={() => dispatch(setNodeLayer(node.id, 'front'))}>
              置顶
            </button>
            <button type="button" className="cb-btn" onClick={() => dispatch(setNodeLayer(node.id, 'up'))}>
              上移一层
            </button>
            <button type="button" className="cb-btn" onClick={() => dispatch(setNodeLayer(node.id, 'down'))}>
              下移一层
            </button>
            <button type="button" className="cb-btn" onClick={() => dispatch(setNodeLayer(node.id, 'back'))}>
              置底
            </button>
          </div>
        </div>
      )}

      <p className="cb-form__meta">ID：{node.id}</p>
    </div>
  );
}

function EdgeForm({ edge, sourceTitle, targetTitle }: { edge: CaseEdge; sourceTitle: string; targetTitle: string }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const [label, setLabel] = useState(edge.label ?? '');
  const [notes, setNotes] = useState(edge.notes ?? '');
  const [confidence, setConfidence] = useState(edge.confidence);
  // M17：线宽独立于 weight，缺省 1.6px（与旧 weightToWidth 的基线一致）
  const [thickness, setThickness] = useState(edge.thickness ?? 1.6);

  useEffect(() => setLabel(edge.label ?? ''), [edge.id, edge.label]);
  useEffect(() => setNotes(edge.notes ?? ''), [edge.id, edge.notes]);
  useEffect(() => setConfidence(edge.confidence), [edge.id, edge.confidence]);
  useEffect(() => setThickness(edge.thickness ?? 1.6), [edge.id, edge.thickness]);

  const commitLabel = () => {
    const next = label.trim();
    if (next !== (edge.label ?? '')) {
      dispatch(updateEdge(edge.id, { label: next.length > 0 ? next : undefined }));
    }
  };

  const commitNotes = () => {
    const next = notes.trim();
    if (next !== (edge.notes ?? '')) {
      dispatch(updateEdge(edge.id, { notes: next.length > 0 ? next : undefined }));
    }
  };

  const commitConfidence = () => {
    if (confidence !== edge.confidence) dispatch(updateEdge(edge.id, { confidence }));
  };

  const commitThickness = () => {
    const clamped = Math.min(8, Math.max(1, Math.round(thickness * 2) / 2));
    if (clamped !== (edge.thickness ?? 1.6)) dispatch(updateEdge(edge.id, { thickness: clamped }));
  };

  return (
    <div className="cb-form">
      <p className="cb-form__relation">
        {sourceTitle} <span className="cb-arrow">→</span> {targetTitle}
      </p>

      <label className="cb-field">
        <span>关系类型</span>
        <select
          value={edge.relType}
          onChange={(event) => dispatch(updateEdge(edge.id, { relType: event.target.value }))}
        >
          {REL_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          {REL_PRESETS.some((preset) => preset.value === edge.relType) ? null : (
            <option value={edge.relType}>{relLabel(edge.relType)}</option>
          )}
        </select>
      </label>

      <label className="cb-field">
        <span>关系标签</span>
        <input
          value={label}
          placeholder="如：转账 50 万"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>

      <label className="cb-field">
        <span>线型（即证据强度）</span>
        <select
          value={edge.style}
          onChange={(event) => dispatch(updateEdge(edge.id, { style: event.target.value as LineStyle }))}
        >
          {STYLES.map((style) => (
            <option key={style} value={style}>
              {LINE_STYLE_META[style].label} · {LINE_STYLE_META[style].meaning}
            </option>
          ))}
        </select>
      </label>

      <label className="cb-field cb-field--inline">
        <input
          type="checkbox"
          checked={edge.directed}
          onChange={(event) => dispatch(updateEdge(edge.id, { directed: event.target.checked }))}
        />
        <span>有向（箭头指向目标）</span>
      </label>

      <label className="cb-field">
        <span>线宽：{thickness} px（M17 可自由调整，1–8）</span>
        <input
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={thickness}
          onChange={(event) => setThickness(Number(event.target.value))}
          onPointerUp={commitThickness}
          onBlur={commitThickness}
        />
      </label>

      <label className="cb-field cb-field--inline">
        <input
          type="checkbox"
          checked={edge.autoAnchor !== false}
          onChange={(event) =>
            dispatch(updateEdge(edge.id, { autoAnchor: event.target.checked ? undefined : false }))
          }
        />
        <span>连接点受自动梳理影响（关掉 = 钉住现在的连接点）</span>
      </label>
      <div className="cb-form__row">
        <button
          type="button"
          className="cb-btn cb-btn--ghost"
          title="只重排这一条线的连接点与弧度，不动任何卡片坐标"
          onClick={() => dispatch(optimizeEdgeGeometry([edge.id]))}
        >
          立即梳理此线
        </button>
        <button
          type="button"
          className="cb-btn cb-btn--ghost"
          title="清掉手调弧度，把形状交还给自动梳理"
          onClick={() => dispatch(updateEdge(edge.id, { controlPoints: undefined, curvature: undefined }))}
        >
          清掉手调弧度
        </button>
      </div>

      <label className="cb-field">
        <span>置信度：{confidence}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={confidence}
          onChange={(event) => setConfidence(Number(event.target.value))}
          onPointerUp={commitConfidence}
          onBlur={commitConfidence}
        />
      </label>

      <label className="cb-field">
        <span>备注</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={commitNotes}
        />
      </label>

      <p className="cb-form__meta">ID：{edge.id}</p>
    </div>
  );
}

/** 分组属性：标题 / 配色 / 底色透明度 / 上级组 / 折叠 / 成员与删除 */
function GroupForm({ group }: { group: Group }) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const selectNode = useUiStore((s) => s.selectNode);
  const [title, setTitle] = useState(group.title);
  const [opacity, setOpacity] = useState(group.opacity ?? DEFAULT_GROUP_OPACITY);

  useEffect(() => setTitle(group.title), [group.id, group.title]);
  useEffect(() => setOpacity(group.opacity ?? DEFAULT_GROUP_OPACITY), [group.id, group.opacity]);

  // A4：组成员清单统一走 memberNodeIds(includeDescendants) —— 子组里的实体也算成员，
  // 「移出」只对直接成员显示（子组成员要移出得进对应子组，避免一次误操作掏空嵌套结构）
  const directMembers = doc.nodes.filter((node) => node.groupId === group.id);
  const allMemberIds = memberNodeIds(doc, group.id, true);
  const members = allMemberIds
    .map((id) => doc.nodes.find((node) => node.id === id))
    .filter((node): node is CaseNode => node !== undefined);
  const indirectCount = members.length - directMembers.length;
  const childGroups = doc.groups.filter((item) => item.parentId === group.id);
  const parentOptions = doc.groups.filter((item) => canParentGroup(doc, group.id, item.id));

  const commitTitle = () => {
    const next = title.trim();
    if (next.length > 0 && next !== group.title) dispatch(updateGroup(group.id, { title: next }));
    else setTitle(group.title);
  };

  return (
    <div className="cb-form">
      <label className="cb-field">
        <span>分组名称</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>

      <div className="cb-field">
        <span>标识色</span>
        <div className="cb-colors">
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`cb-color${group.color === color ? ' is-active' : ''}`}
              style={{ background: color }}
              title={color}
              onClick={() => dispatch(updateGroup(group.id, { color }))}
            />
          ))}
        </div>
      </div>

      <label className="cb-field">
        <span>底色不透明度：{opacity.toFixed(2)}</span>
        <input
          type="range"
          min={0.02}
          max={0.6}
          step={0.02}
          value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))}
          onPointerUp={() => dispatch(updateGroup(group.id, { opacity }))}
          onBlur={() => dispatch(updateGroup(group.id, { opacity }))}
        />
      </label>

      <label className="cb-field">
        <span>上级分组（支持嵌套）</span>
        <select
          value={group.parentId ?? ''}
          onChange={(event) => dispatch(updateGroup(group.id, { parentId: event.target.value || null }))}
        >
          <option value="">顶层</option>
          {parentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>

      <label className="cb-field cb-field--inline">
        <input
          type="checkbox"
          checked={group.collapsed}
          onChange={() => dispatch(toggleGroupCollapsed(group.id))}
        />
        <span>折叠为超级节点（组内连线隐藏，组外关系聚合）</span>
      </label>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">
          组成员清单（{members.length}）
          {indirectCount > 0 ? <span className="cb-form__subtle"> · 其中 {indirectCount} 个来自子组</span> : null}
        </h3>
        {/* H5.3：对象总览里直接挑实体加入，不必先多选再拖 */}
        <div className="cb-assets__actions">
          <button
            type="button"
            className="cb-btn cb-btn--ghost"
            onClick={() => useUiStore.getState().requestNodePick(group.id)}
          >
            选择实体加入…
          </button>
        </div>
        {members.length === 0 ? (
          <p className="cb-form__subtle">空分组：可直接拖入节点，或在节点属性里选择「所属分组」。</p>
        ) : (
          <ul className="cb-members">            {members.map((node) => (
              <li key={node.id} className="cb-members__item">
                <span className="cb-members__dot" style={{ background: NODE_TYPE_META[node.type].color }} />
                <button
                  type="button"
                  className="cb-members__title cb-members__title--link"
                  title="在画布中定位"
                  onClick={() => selectNode(node.id)}
                >
                  {node.title}
                </button>
                {node.groupId === group.id ? (
                  <button
                    type="button"
                    className="cb-link-btn"
                    onClick={() => dispatch(assignNodesToGroup([node.id], null))}
                  >
                    移出
                  </button>
                ) : (
                  <span className="cb-members__indirect">子组</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {childGroups.length > 0 ? (
          <p className="cb-form__subtle">含子组：{childGroups.map((item) => item.title).join('、')}</p>
        ) : null}
      </div>

      <div className="cb-form__section">
        <button type="button" className="cb-btn cb-btn--danger" onClick={() => dispatch(deleteGroup(group.id))}>
          删除分组（保留组内对象）
        </button>
      </div>

      <p className="cb-form__meta">ID：{group.id}</p>
    </div>
  );
}

/** 素材详情：只看元数据，二进制在 IndexedDB；编号与来源可改，删除会同步摘掉节点附件引用 */
const OCR_STAGE_LABELS: Record<string, string> = {
  'loading tesseract core': '载入内核',
  'initializing tesseract': '初始化引擎',
  'loading language traineddata': '载入语言包',
  'initializing api': '准备识别',
  'recognizing text': '识别文字',
  done: '完成',
};

function stageLabel(stage: string): string {
  return OCR_STAGE_LABELS[stage] ?? '处理中';
}

function AssetForm({ asset }: { asset: Asset }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const doc = useDocStore((s) => s.doc);
  const [no, setNo] = useState(asset.no ?? '');
  const [label, setLabel] = useState(asset.sourceLabel ?? '');
  const [thumb, setThumb] = useState<string | null>(null);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [ocrText, setOcrText] = useState(asset.ocrText ?? '');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrNotice, setOcrNotice] = useState('');
  const [ocrStage, setOcrStage] = useState('');
  const [engine, setEngine] = useState<OcrEngineStatus | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseOcrText> | null>(null);
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [account, setAccount] = useState('');
  const [counterparty, setCounterparty] = useState('');

  useEffect(() => {
    let alive = true;
    thumbUrl(asset.id)
      .then((url) => {
        if (alive) setThumb(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [asset.id]);

  const related = doc.nodes.filter((node) => node.attachments.includes(asset.id));

  useEffect(() => {
    let alive = true;
    ocrEngineStatus()
      .then((value) => {
        if (!alive) return;
        setEngine(value);
        // 内置引擎是 WASM：提前预热，用户点「识别文字」时不用再等 20 秒载入内核
        if (value.available && value.engine === 'bundled') void warmOcrEngine();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="cb-form">
      {thumb ? (
        <img className="cb-form__preview" src={thumb} alt={asset.name ?? '素材预览'} />
      ) : (
        <p className="cb-form__subtle">原件不在当前环境（IndexedDB 未初始化或素材来自其他设备）。</p>
      )}

      <label className="cb-field">
        <span>素材编号</span>
        <input
          value={no}
          onChange={(event) => setNo(event.target.value)}
          onBlur={() => {
            const next = no.trim();
            if (next !== (asset.no ?? '')) dispatch(updateAsset(asset.id, { no: next || undefined }));
          }}
        />
      </label>

      <label className="cb-field">
        <span>来源说明</span>
        <input
          value={label}
          placeholder="现场照片 / 书证翻拍 …"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            const next = label.trim();
            if (next !== (asset.sourceLabel ?? '')) dispatch(updateAsset(asset.id, { sourceLabel: next || undefined }));
          }}
        />
      </label>

      <label className="cb-field">
        <span>所属文件夹</span>
        <select
          value={asset.folderId ?? ''}
          onChange={(event) => dispatch(moveAssetsToFolder([asset.id], event.target.value || null))}
        >
          <option value="">未分类</option>
          {(doc.assetFolders ?? []).map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folderPath(doc.assetFolders ?? [], folder.id)}
            </option>
          ))}
        </select>
      </label>

      <dl className="cb-summary">
        <div>
          <dt>文件名</dt>
          <dd>{asset.name ?? '未记录'}</dd>
        </div>
        <div>
          <dt>尺寸</dt>
          <dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '未知'}</dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>{formatBytes(asset.size)}</dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd title={asset.hash}>{asset.hash ? `${asset.hash.slice(0, 16)}…` : '未计算'}</dd>
        </div>
        <div>
          <dt>导入渠道</dt>
          <dd>{asset.source === 'clipboard' ? '粘贴' : asset.source === 'watch' ? '目录监视' : asset.source === 'ai' ? 'AI 生成' : '手动导入'}</dd>
        </div>
        <div>
          <dt>拍摄时间</dt>
          <dd>{asset.capturedAt ? asset.capturedAt.slice(0, 19).replace('T', ' ') : '未识别'}</dd>
        </div>
        <div>
          <dt>相机</dt>
          <dd>{asset.camera ?? '未识别'}</dd>
        </div>
        <div>
          <dt>GPS</dt>
          <dd>{asset.gps ? `${asset.gps.lat.toFixed(5)}, ${asset.gps.lng.toFixed(5)}` : '无'}</dd>
        </div>
        <div>
          <dt>标注</dt>
          <dd>{asset.annotations.length} 处</dd>
        </div>
      </dl>

      <div className="cb-form__section">
        <button type="button" className="cb-btn cb-btn--primary" onClick={() => setAnnotateOpen(true)}>
          标注（{asset.annotations.length}）
        </button>
        <p className="cb-form__subtle" style={{ marginTop: 6 }}>
          矩形框 / 箭头 / 手绘 / 文字 / 区域锚点 / 马赛克，标注随素材保存，可导出带标注的图片。
        </p>
      </div>

      <div className="cb-form__section cb-ocr">
        <h3 className="cb-form__subtitle">文字识别与字段抽取</h3>
        <p className="cb-form__subtle">
          {engine === null
            ? '正在探测 OCR 引擎…'
            : engine.available
              ? `引擎就绪：${engine.engine === 'system' ? '系统 Tesseract' : '内置 Tesseract（随安装包分发，离线可用）'}`
              : '没有可用引擎：' + engine.hint}
        </p>
        {ocrStage ? <p className="cb-form__subtle">正在{ocrStage}</p> : null}
        <textarea
          className="cb-ocr__text"
          rows={4}
          value={ocrText}
          placeholder="识别出的文字会显示在这里；也可以手动粘贴或修正"
          onChange={(event) => setOcrText(event.target.value)}
        />
        <div className="cb-ocr__ops">
          <button
            type="button"
            className="cb-btn"
            disabled={ocrBusy}
            title={engine ? engine.hint || `当前引擎：${engine.engine === 'system' ? '系统 Tesseract' : '内置 WASM 内核'}` : '点击时自动选择可用引擎'}
            onClick={() => {
              setOcrBusy(true);
              setOcrError('');
              setOcrNotice('');
              setOcrStage('');
              recognizeAssetText(asset, (value) => setOcrStage(`${stageLabel(value.stage)} ${Math.round(value.progress * 100)}%`))
                .then((text) => {
                  setOcrText(text);
                  setOcrNotice('识别完成：共 ' + text.length + ' 字，核对后写入素材。');
                })
                .catch((error: unknown) => {
                  setOcrError(error instanceof Error ? error.message : '识别失败');
                })
                .finally(() => {
                  setOcrBusy(false);
                  setOcrStage('');
                });
            }}
          >
            {ocrBusy ? '识别中…' : '识别文字'}
          </button>
          <button
            type="button"
            className="cb-btn"
            onClick={() => {
              const result = parseOcrText(ocrText);
              setParsed(result);
              setAmount(result.fields.amount ?? '');
              setTime(result.fields.time ?? '');
              setAccount(result.fields.account ?? '');
              setCounterparty(result.fields.counterparty ?? '');
              setOcrError('');
            }}
          >
            解析金额 / 时间 / 账号
          </button>
          <button
            type="button"
            className="cb-btn cb-btn--primary"
            onClick={() => {
              dispatch(updateAsset(asset.id, { ocrText: ocrText.trim() }));
              setOcrNotice('OCR 文本已写入素材，可随案件检索。');
            }}
          >
            写入素材
          </button>
        </div>
        {ocrError ? <p className="cb-ocr__error">{ocrError}</p> : null}
        {ocrNotice ? <p className="cb-form__subtle">{ocrNotice}</p> : null}
        {parsed ? (
          <div className="cb-ocr__fields">
            <p className="cb-form__subtle">
              置信度 {parsed.confidence}
              {parsed.missing.length > 0 ? ' · 缺失：' + parsed.missing.join('、') : ' · 四项齐全'}
              　（可人工修正后生成证据卡）
            </p>
            <label className="cb-field">
              <span>金额</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500000" />
            </label>
            <label className="cb-field">
              <span>交易时间</span>
              <input value={time} onChange={(event) => setTime(event.target.value)} placeholder="2026-09-04T10:30:00" />
            </label>
            <label className="cb-field">
              <span>账号</span>
              <input
                value={account}
                onChange={(event) => setAccount(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="6222020200001234"
              />
            </label>
            {account ? <p className="cb-form__subtle">脱敏显示：{maskAccount(account)}</p> : null}
            <label className="cb-field">
              <span>对方户名</span>
              <input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} />
            </label>
            <button
              type="button"
              className="cb-btn cb-btn--primary"
              onClick={() => {
                const fields: Record<string, string> = {};
                if (amount) fields['金额'] = amount + ' 元';
                if (time) fields['交易时间'] = time;
                if (account) fields['账号'] = maskAccount(account);
                if (counterparty) fields['对方户名'] = counterparty;
                const right = doc.nodes.reduce((max, node) => Math.max(max, node.x + node.w), 40);
                dispatch(
                  addNode({
                    type: 'evidence',
                    title: (asset.no ?? '截图') + ' 转账凭证',
                    x: right + 64,
                    y: 120,
                    fields,
                    status: 'checking',
                    confidence: parsed.confidence,
                    notes: '由 OCR 字段生成，请与原件核对。',
                  }),
                );
                setOcrNotice('已生成证据卡（待核实）。');
              }}
            >
              生成证据卡
            </button>
          </div>
        ) : null}
      </div>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">关联对象（{related.length}）</h3>
        {related.length === 0 ? (
          <p className="cb-form__subtle">导入向导里选择「关联实体」，或在节点属性中手动挂接。</p>
        ) : (
          <ul className="cb-members">
            {related.map((node) => (
              <li key={node.id} className="cb-members__item">
                <span className="cb-members__dot" style={{ background: NODE_TYPE_META[node.type].color }} />
                <span className="cb-members__title">{node.title}</span>
                <button type="button" className="cb-link-btn" onClick={() => useUiStore.getState().selectNode(node.id)}>
                  查看
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cb-form__section">
        <button
          type="button"
          className="cb-btn cb-btn--danger"
          onClick={() => {
            dispatch(deleteAsset(asset.id));
            useUiStore.getState().selectAsset(null);
            void imageStore.remove(asset.id);
          }}
        >
          删除素材（同时摘掉节点引用）
        </button>
      </div>

      <p className="cb-form__meta">ID：{asset.id}</p>

      {annotateOpen ? <AnnotationEditor assetId={asset.id} onClose={() => setAnnotateOpen(false)} /> : null}
    </div>
  );
}

function ImageForm({ image }: { image: ImageNode }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const doc = useDocStore((s) => s.doc);
  const asset = doc.assets.find((item) => item.id === image.assetId) ?? null;
  const linked = doc.nodes.find((item) => item.id === image.linkedNodeId) ?? null;
  const cluster = image.clusterId ? doc.nodes.find((item) => item.id === image.clusterId) ?? null : null;
  const [rotation, setRotation] = useState(image.rotation);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => setRotation(image.rotation), [image.rotation]);

  useEffect(() => {
    let alive = true;
    thumbUrl(image.assetId, 256)
      .then((url) => {
        if (alive) setThumb(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [image.assetId]);

  const commitNumber = (key: 'x' | 'y' | 'w' | 'h', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = key === 'w' || key === 'h' ? Math.max(40, Math.round(value)) : Math.round(value);
    if (next === image[key]) return;
    dispatch(updateImageNode(image.id, { [key]: next }));
  };

  return (
    <div className="cb-form">
      {thumb ? (
        <img className="cb-form__preview" src={thumb} alt={asset?.name ?? '图片预览'} />
      ) : (
        <p className="cb-form__subtle">预览不可用：原件不在本机 IndexedDB，或缩略图尚未生成。</p>
      )}

      <div className="cb-fields">
        {(['x', 'y', 'w', 'h'] as const).map((key) => (
          <label key={key} className="cb-field">
            <span>{key === 'x' ? 'X' : key === 'y' ? 'Y' : key === 'w' ? '宽度' : '高度'}</span>
            <input
              key={`${key}-${image[key]}`}
              inputMode="numeric"
              defaultValue={image[key]}
              onBlur={(event) => commitNumber(key, event.target.value)}
            />
          </label>
        ))}
      </div>

      <label className="cb-field">
        <span>旋转 {rotation.toFixed(1)}°</span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={rotation}
          onChange={(event) => setRotation(Number(event.target.value))}
          onMouseUp={() => dispatch(updateImageNode(image.id, { rotation: rotation }))}
          onTouchEnd={() => dispatch(updateImageNode(image.id, { rotation: rotation }))}
        />
      </label>

      <label className="cb-field">
        <span>边框样式</span>
        <select
          value={image.borderStyle ?? 'photo'}
          onChange={(event) =>
            dispatch(updateImageNode(image.id, { borderStyle: event.target.value as NonNullable<ImageNode['borderStyle']> }))
          }
        >
          {BORDER_LABELS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {cluster ? (
        <div className="cb-form__section">
          <h3 className="cb-form__subtitle">钉集（{cluster.title}）</h3>
          <p className="cb-form__subtle">
            这张图已被集中钉子钉住：拖动它等于拖动整集，位置与层级由钉子统一管理，只能绕钉子旋转。
          </p>
          <div className="cb-assets__actions">
            <button type="button" className="cb-btn" onClick={() => dispatch(rotateClusterMember(image.id, -15))}>
              绕钉左转 15°
            </button>
            <button type="button" className="cb-btn" onClick={() => dispatch(rotateClusterMember(image.id, 15))}>
              绕钉右转 15°
            </button>
            <button type="button" className="cb-btn" onClick={() => dispatch(detachImageFromCluster(image.id))}>
              移出钉集
            </button>
          </div>
        </div>
      ) : doc.nodes.some((node) => node.type === 'clusterPin') ? (
        <div className="cb-form__section">
          <h3 className="cb-form__subtitle">钉到集中钉子</h3>
          <p className="cb-form__subtle">也可以直接把图片拖到钉子本体上松手；钉住后整集一起移动、只能绕钉子旋转。</p>
          <div className="cb-assets__actions">
            {doc.nodes
              .filter((node) => node.type === 'clusterPin')
              .map((pin, pinIndex) => (
                <button
                  key={pin.id}
                  type="button"
                  className="cb-btn"
                  onClick={() =>
                    dispatch(
                      attachImageToCluster(image.id, pin.id, offsetForCluster(pin, {
                        x: image.x + image.w / 2,
                        y: image.y + image.h / 2,
                      })),
                    )
                  }
                >
                  钉到「{pin.title}」{doc.nodes.filter((n) => n.type === 'clusterPin').length > 1 ? ' #' + (pinIndex + 1) : ''}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="cb-form__section">
        {/* H5.3：钉集成员的层级在集内算，对外固定压在卡片与普通图片之上，不再展示旧的全局 zIndex */}
        <h3 className="cb-form__subtitle">
          {image.clusterId ? '钉集内层级（第 ' + (doc.imageNodes.filter((item) => item.clusterId === image.clusterId).findIndex((item) => item.id === image.id) + 1) + ' 层，对外永远置顶）' : '层级（zIndex ' + image.zIndex + '）'}
        </h3>
        <div className="cb-assets__actions">
          <button type="button" className="cb-btn" onClick={() => dispatch(setImageLayer(image.id, 'front'))}>
            置顶
          </button>
          <button type="button" className="cb-btn" onClick={() => dispatch(setImageLayer(image.id, 'up'))}>
            上移一层
          </button>
          <button type="button" className="cb-btn" onClick={() => dispatch(setImageLayer(image.id, 'down'))}>
            下移一层
          </button>
          <button type="button" className="cb-btn" onClick={() => dispatch(setImageLayer(image.id, 'back'))}>
            置底
          </button>
        </div>
      </div>

      <label className="cb-check">
        <input
          type="checkbox"
          checked={image.pinned === true}
          onChange={(event) => dispatch(updateImageNode(image.id, { pinned: event.target.checked }))}
        />
        <span>显示图钉</span>
      </label>

      {image.pinned ? (
        <div className="cb-form__section">
          <h3 className="cb-form__subtitle">图钉颜色（可直接在图片上拖动图钉改位置）</h3>
          <div className="cb-swatches">
            {PIN_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`cb-swatch${(image.pinColor ?? PIN_COLORS[0].value) === color.value ? ' is-active' : ''}`}
                style={{ background: color.value }}
                title={color.label}
                aria-label={color.label}
                onClick={() => dispatch(updateImageNode(image.id, { pinColor: color.value }))}
              />
            ))}
            <button
              type="button"
              className="cb-link-btn"
              onClick={() => dispatch(updateImageNode(image.id, { pinPos: null }))}
              title="把图钉放回图片左上角"
            >
              图钉归位
            </button>
          </div>
        </div>
      ) : null}

      <label className="cb-check">
        <input
          type="checkbox"
          checked={image.dotMode === true}
          onChange={(event) => dispatch(updateImageNode(image.id, { dotMode: event.target.checked }))}
        />
        <span>压缩成小圆点（方便拖到卡片角吸附，双击圆点可展开）</span>
      </label>

      <div className="cb-form__section">
        <h3 className="cb-form__subtitle">吸附关联</h3>
        {linked ? (
          <ul className="cb-members">
            <li className="cb-members__item">
              <span className="cb-members__dot" style={{ background: NODE_TYPE_META[linked.type].color }} />
              <span className="cb-members__title">{linked.title}</span>
              <button
                type="button"
                className="cb-link-btn"
                onClick={() => useUiStore.getState().selectNode(linked.id)}
              >
                查看
              </button>
              <button type="button" className="cb-link-btn" onClick={() => dispatch(updateImageNode(image.id, { linkedNodeId: null }))}>
                取消吸附
              </button>
            </li>
          </ul>
        ) : (
          <p className="cb-form__subtle">把图片拖到某张卡片上松手，即可吸附为该卡片的头像或附件。</p>
        )}
      </div>

      <div className="cb-form__section">
        <button
          type="button"
          className="cb-btn cb-btn--danger"
          onClick={() => {
            dispatch(deleteImageNode(image.id));
            useUiStore.getState().selectImage(null);
          }}
        >
          删除图片
        </button>
      </div>

      <p className="cb-form__meta">图片 ID：{image.id} · 素材：{image.assetId}</p>
    </div>
  );
}

export function RightPanel() {
  const doc = useDocStore((s) => s.doc);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const selectedGroupId = useUiStore((s) => s.selectedGroupId);
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds);
  const multiSelect = useUiStore((s) => s.multiSelect);
  const requestGroupPick = useUiStore((s) => s.requestGroupPick);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const exitMultiSelect = useUiStore((s) => s.exitMultiSelect);

  const node = doc.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const edge = doc.edges.find((item) => item.id === selectedEdgeId) ?? null;
  const group = doc.groups.find((item) => item.id === selectedGroupId) ?? null;
  const asset = doc.assets.find((item) => item.id === selectedAssetId) ?? null;
  const image = doc.imageNodes.find((item) => item.id === selectedImageId) ?? null;

  const titleOf = (id: string) => doc.nodes.find((item) => item.id === id)?.title ?? id;

  /* 多选态横幅（H5-5 / H5-6）：触屏长按进了多选、且选了不止一张卡时，先把「选了几张、
     能拿这批选中做什么」摆出来，否则右栏永远只显示最后一张卡的属性，用户看不出自己在多选。 */
  const multiBanner =
    multiSelect && selectedNodeIds.length > 1 ? (
      <section className="cb-multisel" aria-label="多选操作">
        <p className="cb-multisel__head">
          已选 {selectedNodeIds.length} 个卡片
          <span className="cb-multisel__hint">继续点卡片加选 / 再长按取消某张</span>
        </p>
        <div className="cb-multisel__actions">
          <button type="button" className="cb-btn" onClick={requestGroupPick}>
            加入组框…
          </button>
          <button
            type="button"
            className="cb-btn cb-btn--ghost"
            onClick={() => {
              exitMultiSelect();
              clearSelection();
            }}
          >
            清空选择
          </button>
        </div>
      </section>
    ) : null;

  return (
    <aside className="cb-panel cb-panel--right">
      {multiBanner}
      {node ? (
        <>
          <h2 className="cb-panel__title">
            节点属性
            <span className="cb-panel__badge" style={{ background: NODE_TYPE_META[node.type].color }}>
              {NODE_TYPE_META[node.type].label}
            </span>
          </h2>
          <NodeForm key={node.id} node={node} />
        </>
      ) : edge ? (
        <>
          <h2 className="cb-panel__title">
            关系属性
            <span className="cb-panel__badge" style={{ background: '#6E6862' }}>
              {LINE_STYLE_META[edge.style].meaning}
            </span>
          </h2>
          <EdgeForm key={edge.id} edge={edge} sourceTitle={titleOf(edge.source)} targetTitle={titleOf(edge.target)} />
        </>
      ) : group ? (
        <>
          <h2 className="cb-panel__title">
            分组属性
            <span className="cb-panel__badge" style={{ background: group.color }}>
              {group.collapsed ? '已折叠' : '展开'}
            </span>
          </h2>
          <GroupForm key={group.id} group={group} />
        </>
      ) : asset ? (
        <>
          <h2 className="cb-panel__title">
            素材属性
            <span className="cb-panel__badge" style={{ background: asset.zone === 'ai' ? '#8C7A2E' : '#4A5568' }}>
              {asset.zone === 'ai' ? 'AI 生成' : '证据素材'}
            </span>
          </h2>
          <AssetForm key={asset.id} asset={asset} />
        </>
      ) : image ? (
        <>
          <h2 className="cb-panel__title">
            图片属性
            <span className="cb-panel__badge" style={{ background: '#8C7A2E' }}>
              自由图片
            </span>
          </h2>
          <ImageForm key={image.id} image={image} />
        </>
      ) : (
        <>
          <h2 className="cb-panel__title">案件概览</h2>
          <dl className="cb-summary">
            <div>
              <dt>案件名称</dt>
              <dd>{doc.meta.title}</dd>
            </div>
            <div>
              <dt>案件编号</dt>
              <dd>{doc.meta.caseNo ?? '未填写'}</dd>
            </div>
            <div>
              <dt>节点</dt>
              <dd>{doc.nodes.length} 个</dd>
            </div>
            <div>
              <dt>关系</dt>
              <dd>{doc.edges.length} 条</dd>
            </div>
            <div>
              <dt>分组</dt>
              <dd>{doc.groups.length} 个</dd>
            </div>
            <div>
              <dt>最后保存</dt>
              <dd>{new Date(doc.meta.updatedAt).toLocaleString('zh-CN')}</dd>
            </div>
          </dl>
          <CanvasBackdropForm />
          <p className="cb-panel__hint">
            选中画布上的节点或关系后，在此编辑属性。所有修改都会进入撤销栈并可自动保存。
          </p>
        </>
      )}
    </aside>
  );
}
