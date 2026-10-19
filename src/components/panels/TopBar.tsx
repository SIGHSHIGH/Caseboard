import { useRef, useState } from 'react';
import { replaceDocument } from '../../commands';
import { fromJson } from '../../serializers/json';
import { exportCaseboardFile, openCaseboardFile } from '../../services/exporters';
import { fileService } from '../../services/file';
import { closeCodeView, openCodeView, useCodeStore } from '../../store/codeStore';
import { useBackend, useDocStore, useLastSavedAt } from '../../store/docStore';
import { useViewModeStore, type ViewMode } from '../../store/viewModeStore';
import { LINE_STYLE_META } from '../../lib/theme';
import type { LineStyle } from '../../types';
import { ExportDialog } from './ExportDialog';
import { HistoryDialog } from './HistoryDialog';
import { AiPanel } from './AiPanel';

const LEGEND: LineStyle[] = ['solid', 'dashed', 'dotted'];

const VIEW_TABS: Array<{ id: ViewMode; label: string; hint: string }> = [
  { id: 'board', label: '画布', hint: '图形视图：拖拽、连线、分组' },
  { id: 'timeline', label: '时间线', hint: '按时间播放案件经过' },
  { id: 'present', label: '演示', hint: '逐项讲解实体与关联' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function TopBar() {
  const doc = useDocStore((s) => s.doc);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const dispatch = useDocStore((s) => s.dispatch);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const lastLabel = useDocStore((s) => s.past[s.past.length - 1]?.label ?? '');
  const nextLabel = useDocStore((s) => s.future[0]?.label ?? '');
  const codeOpen = useCodeStore((s) => s.open);
  const viewMode = useViewModeStore((s) => s.mode);
  const setViewMode = useViewModeStore((s) => s.setMode);
  const backend = useBackend();
  const lastSavedAt = useLastSavedAt();
  const importing = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  const handleSaveProject = async () => {
    if (savingProject) return;
    setSavingProject(true);
    try {
      const result = await exportCaseboardFile(doc);
      if (result.path) window.alert('项目已保存：\n' + result.path);
    } catch (error) {
      window.alert(`保存项目失败：${errorText(error)}`);
    } finally {
      setSavingProject(false);
    }
  };

  const handleOpenProject = async () => {
    if (importing.current) return;
    importing.current = true;
    try {
      const opened = await openCaseboardFile();
      if (opened) dispatch(replaceDocument(opened.doc));
    } catch (error) {
      window.alert(`打开项目失败：${errorText(error)}`);
    } finally {
      importing.current = false;
    }
  };

  const handleImport = async () => {
    if (importing.current) return;
    importing.current = true;
    try {
      const picked = await fileService.pickTextFile('.json,application/json');
      if (!picked) return;
      dispatch(replaceDocument(fromJson(picked.text)));
    } catch (error) {
      window.alert(`导入失败：${errorText(error)}`);
    } finally {
      importing.current = false;
    }
  };

  return (
    <header className="cb-topbar">
      <div className="cb-topbar__brand">
        <span className="cb-topbar__logo">案情板</span>
        <span className="cb-topbar__case">{doc.meta.title}</span>
        {doc.meta.caseNo ? <span className="cb-topbar__no">{doc.meta.caseNo}</span> : null}
      </div>

      <div className="cb-viewtabs" role="group" aria-label="视图切换">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            title={tab.hint}
            className={viewMode === tab.id ? 'cb-viewtab is-active' : 'cb-viewtab'}
            onClick={() => setViewMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="cb-topbar__tools">
        <button
          type="button"
          className="cb-btn"
          disabled={!canUndo}
          title={canUndo ? `撤销：${lastLabel}（Ctrl+Z）` : '没有可撤销的操作'}
          onClick={undo}
        >
          ↶ 撤销
        </button>
        <button
          type="button"
          className="cb-btn"
          disabled={!canRedo}
          title={canRedo ? `重做：${nextLabel}（Ctrl+Shift+Z）` : '没有可重做的操作'}
          onClick={redo}
        >
          ↷ 重做
        </button>
      </div>

      <div className="cb-topbar__legend" title="线型即语义，固定不可关闭">
        <span className="cb-legend__caption">线型语义</span>
        {LEGEND.map((style) => (
          <span key={style} className="cb-legend__item">
            <svg width="34" height="10" aria-hidden="true">
              <line
                x1="1"
                y1="5"
                x2="33"
                y2="5"
                stroke="#6E6862"
                strokeWidth="1.8"
                strokeDasharray={LINE_STYLE_META[style].dash}
              />
            </svg>
            <span>
              {LINE_STYLE_META[style].label} = {LINE_STYLE_META[style].meaning}
            </span>
          </span>
        ))}
      </div>

      <div className="cb-topbar__io">
        <button type="button" className="cb-btn" onClick={handleOpenProject} title="打开 .caseboard 项目文件">
          打开
        </button>
        <button type="button" className="cb-btn" onClick={handleSaveProject} disabled={savingProject} title="保存为单文件 .caseboard（数据库 + 素材 + DSL）">
          {savingProject ? '保存中…' : '保存项目'}
        </button>
        <button type="button" className="cb-btn cb-btn--primary" onClick={() => setExportOpen(true)} title="导出 PNG / SVG / PDF / 图片包 / 脱敏">
          导出…
        </button>
        <button type="button" className="cb-btn" onClick={handleImport} title="导入 JSON 数据（调试用）">
          导入 JSON
        </button>
        <button
          type="button"
          className={`cb-btn${aiOpen ? ' is-active' : ''}`}
          title="AI 助手：抽取建图 / 矛盾审查 / 自然语言编辑 / 报告（本地优先）"
          onClick={() => setAiOpen(true)}
        >
          AI 助手
        </button>
        <button
          type="button"
          className={`cb-btn${historyOpen ? ' is-active' : ''}`}
          title="历史与回收站：版本快照、被删除的实体与关系"
          onClick={() => setHistoryOpen(true)}
        >
          历史
        </button>
        <button
          type="button"
          className={`cb-btn${codeOpen ? ' is-active' : ''}`}
          title="代码视图：与画布渲染同一份数据（在代码视图内 Ctrl+Shift+F 格式化）"
          onClick={() => {
            if (codeOpen) closeCodeView();
            else openCodeView();
          }}
        >
          {'</>'} 代码视图
        </button>
        <span className="cb-topbar__save" title={backend === 'sqlite' ? '数据写入本机 SQLite' : '数据写入浏览器本机存储'}>
          {backend === 'sqlite' ? 'SQLite' : '本机存储'}
          {lastSavedAt ? ' · 已保存 ' + new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
      {historyOpen ? <HistoryDialog onClose={() => setHistoryOpen(false)} /> : null}
      {aiOpen ? <AiPanel onClose={() => setAiOpen(false)} /> : null}
    </header>
  );
}
