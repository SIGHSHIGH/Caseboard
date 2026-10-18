import { useEffect, useState } from 'react';
import { updateEdge, updateNode } from '../../commands';
import { LINE_STYLE_META, NODE_TYPE_META, REL_PRESETS, STATUS_META, relLabel } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseEdge, CaseNode, LineStyle, NodeType, Status } from '../../types';

const NODE_TYPES: NodeType[] = ['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note'];
const STATUSES: Status[] = ['todo', 'checking', 'confirmed', 'ruledout'];
const STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

function splitTags(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function NodeForm({ node }: { node: CaseNode }) {
  const dispatch = useDocStore((s) => s.dispatch);
  const [title, setTitle] = useState(node.title);
  const [tags, setTags] = useState(node.tags.join('、'));
  const [notes, setNotes] = useState(node.notes ?? '');
  const [confidence, setConfidence] = useState(node.confidence);

  useEffect(() => setTitle(node.title), [node.id, node.title]);
  useEffect(() => setTags(node.tags.join('、')), [node.id, node.tags]);
  useEffect(() => setNotes(node.notes ?? ''), [node.id, node.notes]);
  useEffect(() => setConfidence(node.confidence), [node.id, node.confidence]);

  const commitTitle = () => {
    const next = title.trim();
    if (next.length > 0 && next !== node.title) dispatch(updateNode(node.id, { title: next }));
    else setTitle(node.title);
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
          {NODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {NODE_TYPE_META[type].label}
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
        <span>标签（顿号或逗号分隔）</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} onBlur={commitTags} />
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
