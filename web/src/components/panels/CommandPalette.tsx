import { useEffect, useMemo, useRef, useState } from 'react';
import { searchDoc, searchKindLabel, type SearchHit } from '../../lib/search';
import { useDocStore } from '../../store/docStore';
import { usePaletteStore } from '../../store/paletteStore';
import { useUiStore } from '../../store/uiStore';
import { useViewModeStore, type ViewMode } from '../../store/viewModeStore';
import { createSnapshot } from '../../services/storage';
import { openCodeView, closeCodeView, useCodeStore } from '../../store/codeStore';

interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

const VIEW_LABEL: Record<ViewMode, string> = {
  board: '画布',
  timeline: '时间线',
  present: '演示',
  map: '地图',
};

export function CommandPalette() {
  const doc = useDocStore((s) => s.doc);
  const setMode = useViewModeStore((s) => s.setMode);
  const codeOpen = useCodeStore((s) => s.open);
  const closePalette = usePaletteStore((s) => s.closePalette);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => searchDoc(doc, query, 24), [doc, query]);
  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    const views: ViewMode[] = ['board', 'timeline', 'present', 'map'];
    for (const mode of views) {
      list.push({
        id: 'view-' + mode,
        label: '切换到' + VIEW_LABEL[mode],
        hint: '视图',
        run: () => setMode(mode),
      });
    }
    list.push({
      id: 'code-open',
      label: codeOpen ? '关闭代码视图' : '打开代码视图',
      hint: 'DSL',
      run: () => {
        if (codeOpen) closeCodeView();
        else openCodeView();
      },
    });
    list.push({
      id: 'snapshot',
      label: '立即创建版本快照',
      hint: '本地历史',
      run: () => {
        void createSnapshot(useDocStore.getState().doc, '手动快照');
      },
    });
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) return list;
    return list.filter((command) => tokens.every((token) => (command.label + command.hint).toLowerCase().includes(token)));
  }, [query, codeOpen, setMode]);

  const total = hits.length + commands.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const jump = (hit: SearchHit) => {
    const ui = useUiStore.getState();
    setMode('board');
    if (hit.kind === 'node') {
      ui.selectNode(hit.id);
      ui.focusEntity(hit.id, 'node');
    } else if (hit.kind === 'edge') {
      ui.selectEdge(hit.id);
      if (hit.focusId) ui.focusEntity(hit.focusId, 'node');
    } else if (hit.kind === 'group') {
      ui.selectGroup(hit.id);
      ui.focusEntity(hit.id, 'group');
    } else {
      ui.setLeftTab('assets');
      ui.selectAsset(hit.id);
      if (hit.focusId) ui.selectImage(hit.focusId);
    }
    closePalette();
  };

  const run = (command: PaletteCommand) => {
    command.run();
    closePalette();
  };

  const activate = (index: number) => {
    if (index < hits.length) {
      jump(hits[index]);
      return;
    }
    const command = commands[index - hits.length];
    if (command) run(command);
  };

  return (
    <div
      className="cb-palette__mask"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div className="cb-palette" role="dialog" aria-label="命令面板">
        <input
          ref={inputRef}
          className="cb-palette__input"
          placeholder="搜索实体标题 / 别名 / 备注 / OCR 文本，或输入命令…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closePalette();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (total > 0) setCursor((cursor + 1) % total);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (total > 0) setCursor((cursor - 1 + total) % total);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              activate(cursor);
            }
          }}
        />
        <div className="cb-palette__list">
          {hits.length > 0 ? <p className="cb-palette__group">命中实体与素材（{hits.length}）</p> : null}
          {hits.map((hit, index) => (
            <button
              key={hit.kind + ':' + hit.id}
              type="button"
              className={'cb-palette__hit' + (cursor === index ? ' is-active' : '')}
              onClick={() => jump(hit)}
              onMouseEnter={() => setCursor(index)}
            >
              <span className={'cb-palette__kind is-' + hit.kind}>{searchKindLabel(hit.kind)}</span>
              <span className="cb-palette__title">{hit.title}</span>
              <span className="cb-palette__snippet">
                {hit.field}：{hit.snippet}
              </span>
            </button>
          ))}
          {commands.length > 0 ? <p className="cb-palette__group">命令（{commands.length}）</p> : null}
          {commands.map((command, index) => {
            const position = hits.length + index;
            return (
              <button
                key={command.id}
                type="button"
                className={'cb-palette__hit' + (cursor === position ? ' is-active' : '')}
                onClick={() => run(command)}
                onMouseEnter={() => setCursor(position)}
              >
                <span className="cb-palette__kind is-cmd">{command.hint}</span>
                <span className="cb-palette__title">{command.label}</span>
              </button>
            );
          })}
          {total === 0 ? (
            <p className="cb-palette__empty">
              {query.trim() ? '没有命中：换个关键词，或先创建实体。' : '输入关键词开始搜索。'}
            </p>
          ) : null}
        </div>
        <p className="cb-palette__foot">↑ ↓ 选择 · Enter 打开 · Esc 关闭 · Ctrl+K 随时唤起</p>
      </div>
    </div>
  );
}
