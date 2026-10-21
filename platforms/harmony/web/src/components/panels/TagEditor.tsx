import { useEffect, useMemo, useState } from 'react';
import { collectTags } from '../../lib/tagLink';
import { useDocStore } from '../../store/docStore';

const SPLIT = /[,，、;；\s]+/;

function split(text: string): string[] {
  return text
    .split(SPLIT)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupe(tags: string[]): string[] {
  return tags.filter((tag, index) => tags.indexOf(tag) === index);
}

export interface TagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 已有标签的建议条数 */
  suggestions?: number;
}

/**
 * M9 新增：统一的 tag 编辑控件（所有节点类型共用一套）。
 * 交互：回车 / 顿号 / 逗号即添加，chip 上的 × 删除，下面列出文档里已有标签供一键复用，
 * 避免同一个概念被写成「团伙」「团伙成员」两个标签，让「按 tag 自动连线」有稳定的键。
 */
export function TagEditor({ value, onChange, suggestions = 10 }: TagEditorProps) {
  const doc = useDocStore((s) => s.doc);
  const [draft, setDraft] = useState('');
  const known = useMemo(() => collectTags(doc).map((item) => item.tag), [doc]);
  const unused = known.filter((tag) => !value.includes(tag)).slice(0, suggestions);

  // 外部（右栏切节点 / 撤销）改了 tags 时清掉未提交的草稿
  useEffect(() => setDraft(''), [value]);

  const commit = (text: string) => {
    const next = dedupe([...value, ...split(text)]);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  return (
    <div className="cb-tagedit">
      <div className="cb-tagedit__chips">
        {value.length === 0 ? <span className="cb-tagedit__empty">暂无标签</span> : null}
        {value.map((tag) => (
          <span key={tag} className="cb-tagedit__chip">
            {tag}
            <button
              type="button"
              className="cb-tagedit__remove"
              title={'删除标签 ' + tag}
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="cb-tagedit__input"
        value={draft}
        placeholder="输入标签后回车（如：团伙成员）"
        aria-label="添加标签"
        onChange={(event) => {
          const text = event.target.value;
          // 顿号/逗号/空格直接当分隔符提交，符合中文输入习惯
          if (SPLIT.test(text)) commit(text);
          else setDraft(text);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          } else if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
      />
      {unused.length > 0 ? (
        <div className="cb-tagedit__suggest">
          <span className="cb-tagedit__suggest-label">已有：</span>
          {unused.map((tag) => (
            <button key={tag} type="button" className="cb-tagedit__suggest-btn" onClick={() => commit(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
