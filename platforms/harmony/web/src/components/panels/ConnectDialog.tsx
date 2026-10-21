import { useState } from 'react';
import type { Connection } from '@xyflow/react';
import { addEdge } from '../../commands';
import { LINE_STYLE_META, REL_PRESETS } from '../../lib/theme';
import { useDocStore } from '../../store/docStore';
import type { LineStyle } from '../../types';

interface Props {
  connection: Connection;
  onClose: () => void;
}

const STYLE_ORDER: LineStyle[] = ['solid', 'dashed', 'dotted'];

export function ConnectDialog({ connection, onClose }: Props) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const [relType, setRelType] = useState('transfer');
  const [label, setLabel] = useState('');
  const [style, setStyle] = useState<LineStyle>('dotted');
  const [directed, setDirected] = useState(true);

  const sourceTitle = doc.nodes.find((n) => n.id === connection.source)?.title ?? connection.source;
  const targetTitle = doc.nodes.find((n) => n.id === connection.target)?.title ?? connection.target;

  const submit = () => {
    const trimmed = label.trim();
    dispatch(
      addEdge({
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        relType,
        label: trimmed.length > 0 ? trimmed : undefined,
        style,
        directed,
        confidence: style === 'solid' ? 85 : style === 'dashed' ? 50 : 30,
      }),
    );
    onClose();
  };

  return (
    <div className="cb-modal__mask" onClick={onClose}>
      <div className="cb-modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="cb-modal__title">新增关系</h2>
        <p className="cb-modal__sub">
          {sourceTitle} <span className="cb-arrow">→</span> {targetTitle}
        </p>

        <label className="cb-field">
          <span>关系类型</span>
          <select value={relType} onChange={(event) => setRelType(event.target.value)}>
            {REL_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cb-field">
          <span>关系标签</span>
          <input
            value={label}
            placeholder="如：转账 50 万 / 通话 12 次"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') onClose();
            }}
            autoFocus
          />
        </label>

        <label className="cb-field">
          <span>线型（即证据强度）</span>
          <select value={style} onChange={(event) => setStyle(event.target.value as LineStyle)}>
            {STYLE_ORDER.map((value) => (
              <option key={value} value={value}>
                {LINE_STYLE_META[value].label} · {LINE_STYLE_META[value].meaning}
              </option>
            ))}
          </select>
        </label>

        <label className="cb-field cb-field--inline">
          <input
            type="checkbox"
            checked={directed}
            onChange={(event) => setDirected(event.target.checked)}
          />
          <span>有向（箭头指向目标）</span>
        </label>

        <div className="cb-modal__actions">
          <button type="button" className="cb-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={submit}>
            创建关系
          </button>
        </div>
      </div>
    </div>
  );
}
