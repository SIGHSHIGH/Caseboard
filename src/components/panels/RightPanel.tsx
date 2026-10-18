import { useEffect, useState } from 'react';
import { addComment, deleteComment, updateEdge, updateNode } from '../../commands';
import { LINE_STYLE_META, NODE_TYPE_META, REL_PRESETS, STATUS_META, relLabel } from '../../lib/theme';
import { NODE_TYPE_ORDER, NODE_TEMPLATES, templateOf, type NodeFieldDef } from '../../lib/nodeTemplates';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseEdge, CaseNode, LineStyle, NodeType, Status } from '../../types';

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
}: {
  field: NodeFieldDef;
  value: string;
  onCommit: (key: string, next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, field.key]);

  const commit = () => onCommit(field.key, draft);
  const className = field.wide ? 'cb-field cb-field--wide' : 'cb-field';

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
  const [title, setTitle] = useState(node.title);
  const [aliases, setAliases] = useState((node.aliases ?? []).join('、'));
  const [tags, setTags] = useState(node.tags.join('、'));
  const [notes, setNotes] = useState(node.notes ?? '');
  const [confidence, setConfidence] = useState(node.confidence);
  const [commentText, setCommentText] = useState('');

  useEffect(() => setTitle(node.title), [node.id, node.title]);
  useEffect(() => setAliases((node.aliases ?? []).join('、')), [node.id, node.aliases]);
  useEffect(() => setTags(node.tags.join('、')), [node.id, node.tags]);
  useEffect(() => setNotes(node.notes ?? ''), [node.id, node.notes]);
  useEffect(() => setConfidence(node.confidence), [node.id, node.confidence]);

  const template = templateOf(node.type);

  const commitTitle = () => {
    const next = title.trim();
    if (next.length > 0 && next !== node.title) dispatch(updateNode(node.id, { title: next }));
    else setTitle(node.title);
  };

  const commitAliases = () => {
    const next = splitTags(aliases);
    dispatch(updateNode(node.id, { aliases: next.length > 0 ? next : undefined }));
  };

  const commitTags = () => {
    dispatch(updateNode(node.id, { tags: splitTags(tags) }));
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
    if (JSON.stringify(next) !== JSON.stringify(node.fields)) {
      dispatch(updateNode(node.id, { fields: next }));
    }
  };

  const addOneComment = () => {
    const text = commentText.trim();
    if (text.length === 0) return;
    dispatch(addComment(node.id, text));
    setCommentText('');
  };

  const valueOf = (key: string): string => {
    const value = node.fields[key];
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

      <label className="cb-field">
        <span>标签（顿号或逗号分隔）</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} onBlur={commitTags} />
      </label>

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
            />
          ))}
        </div>
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

      <p className="cb-form__meta">ID：{node.id}</p>
    </div>
  );
}

function EdgeForm({ edge, sourceTitle, targetTitle }: { edge: CaseEdge; sourceTitle: string; targetTitle: string }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const [label, setLabel] = useState(edge.label ?? '');
  const [notes, setNotes] = useState(edge.notes ?? '');
  const [confidence, setConfidence] = useState(edge.confidence);

  useEffect(() => setLabel(edge.label ?? ''), [edge.id, edge.label]);
  useEffect(() => setNotes(edge.notes ?? ''), [edge.id, edge.notes]);
  useEffect(() => setConfidence(edge.confidence), [edge.id, edge.confidence]);

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

export function RightPanel() {
  const doc = useDocStore((s) => s.doc);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);

  const node = doc.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const edge = doc.edges.find((item) => item.id === selectedEdgeId) ?? null;

  const titleOf = (id: string) => doc.nodes.find((item) => item.id === id)?.title ?? id;

  return (
    <aside className="cb-panel cb-panel--right">
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
          <p className="cb-panel__hint">
            选中画布上的节点或关系后，在此编辑属性。所有修改都会进入撤销栈并可自动保存。
          </p>
        </>
      )}
    </aside>
  );
}
