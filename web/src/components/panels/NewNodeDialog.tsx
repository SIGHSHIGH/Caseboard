import { useEffect, useRef, useState } from 'react';
import { addNode } from '../../commands';
import { NODE_TYPE_META } from '../../lib/theme';
import { NODE_TYPE_ORDER, templateOf } from '../../lib/nodeTemplates';
import { newId } from '../../lib/id';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { NodeType } from '../../types';

/**
 * A5：双击画布空白弹出的「新建节点」对话框。
 * 位置由 Board 用 screenToFlowPosition 换算成世界坐标后存进 uiStore.newNodeAt，
 * 这里只负责选类型 + 填标题，id 预先生成以便建完立刻选中新节点。
 */
export function NewNodeDialog() {
  const at = useUiStore((s) => s.newNodeAt);
  const consumeNewNode = useUiStore((s) => s.consumeNewNode);
  const selectNode = useUiStore((s) => s.selectNode);
  const dispatch = useDocStore((s) => s.dispatch);
  const [type, setType] = useState<NodeType>('person');
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (at) {
      setType('person');
      setTitle('');
      // 等遮罩挂上再聚焦，避免 focus 被 mask 的首次渲染打断
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [at]);

  if (!at) return null;

  const template = templateOf(type);
  const finalTitle = title.trim().length > 0 ? title.trim() : `新${template.label}`;

  const confirm = () => {
    const id = newId(type);
    dispatch(
      addNode({
        id,
        type,
        title: finalTitle,
        // 落点对齐成「以双击点为中心」，视觉上不会甩到一边
        x: Math.round(at.x - 104),
        y: Math.round(at.y - 48),
      }),
    );
    selectNode(id);
    consumeNewNode();
  };

  return (
    <div
      className="cb-modal__mask"
      role="dialog"
      aria-modal="true"
      aria-label="新建节点"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) consumeNewNode();
      }}
    >
      <div className="cb-modal cb-newnode">
        <h2 className="cb-modal__title">新建节点</h2>
        <p className="cb-modal__hint">
          落点：世界坐标 {Math.round(at.x)}, {Math.round(at.y)}（双击位置）。选好类型后回车即可创建。
        </p>
        <label className="cb-field">
          <span>类型</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as NodeType)}
            aria-label="节点类型"
          >
            {NODE_TYPE_ORDER.map((item) => (
              <option key={item} value={item}>
                {NODE_TYPE_META[item].label}
              </option>
            ))}
          </select>
        </label>
        <p className="cb-modal__hint">{template.hint}</p>
        <label className="cb-field">
          <span>标题</span>
          <input
            ref={inputRef}
            value={title}
            placeholder={`新${template.label}`}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirm();
              }
              if (event.key === 'Escape') consumeNewNode();
            }}
          />
        </label>
        <div className="cb-modal__actions">
          <button type="button" className="cb-btn" onClick={consumeNewNode}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={confirm}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
