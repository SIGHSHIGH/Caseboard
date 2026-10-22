import { useEffect, useRef, useState } from 'react';
import { addNode } from '../../commands';
import { CLUSTER_PIN_H, CLUSTER_PIN_W } from '../../lib/clusterPin';
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
  const preset = useUiStore((s) => s.newNodePreset);
  const consumeNewNode = useUiStore((s) => s.consumeNewNode);
  const selectNode = useUiStore((s) => s.selectNode);
  const dispatch = useDocStore((s) => s.dispatch);
  const [type, setType] = useState<NodeType>('person');
  const [title, setTitle] = useState('');
  // H5.5：集中钉子默认无便利贴，建的时候问一句要不要
  const [pinPaper, setPinPaper] = useState(false);
  const [pinText, setPinText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (at) {
      setType((preset as NodeType) ?? 'person');
      setTitle('');
      setPinPaper(false);
      setPinText('');
      // 不再自动聚焦标题框：触屏上会直接弹出软键盘挡住对话框，用户点一下就能编辑。
      return undefined;
    }
    return undefined;
  }, [at, preset]);

  if (!at) return null;

  const template = templateOf(type);
  const finalTitle = title.trim().length > 0 ? title.trim() : `新${template.label}`;

  const confirm = () => {
    const id = newId(type);
    const isPin = type === 'clusterPin';
    dispatch(
      addNode({
        id,
        type,
        title: finalTitle,
        // 集中钉子是一个圆点，落点直接对准双击点；其它卡片按 208×96 居中
        x: isPin ? Math.round(at.x - CLUSTER_PIN_W / 2) : Math.round(at.x - 104),
        y: isPin ? Math.round(at.y - CLUSTER_PIN_H / 2) : Math.round(at.y - 48),
        w: isPin ? CLUSTER_PIN_W : undefined,
        h: isPin ? CLUSTER_PIN_H : undefined,
        // 便利贴是可选装饰：勾了才写「显示」，文字随手写进去；不勾就默认隐藏
        fields: isPin ? { 显示便利贴: pinPaper ? '显示' : '隐藏', 便利贴文字: pinText.trim() } : undefined,
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
        {type === 'clusterPin' ? (
          <div className="cb-form__section">
            <label className="cb-check">
              <input
                type="checkbox"
                checked={pinPaper}
                onChange={(event) => setPinPaper(event.target.checked)}
                aria-label="带黄色便利贴"
              />
              <span>带一张黄色便利贴（默认不带）</span>
            </label>
            {pinPaper ? (
              <label className="cb-field">
                <span>便利贴文字</span>
                <textarea
                  value={pinText}
                  rows={3}
                  placeholder="写在这张便利贴上的字"
                  onChange={(event) => setPinText(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="cb-modal__actions">
          <button type="button" className="cb-btn" onClick={consumeNewNode}>
            取消
          </button>
          <button type="button" className="cb-btn cb-btn--primary" onClick={confirm}>
            创建
          </button>
        </div>      </div>
    </div>
  );
}
