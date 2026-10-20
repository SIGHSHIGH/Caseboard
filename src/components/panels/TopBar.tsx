import { useEffect, useMemo, useRef, useState } from 'react';
import { replaceDocument, setCanvasSkin } from '../../commands';
import { fromJson } from '../../serializers/json';
import { exportCaseboardFile, openCaseboardFile } from '../../services/exporters';
import { fileService } from '../../services/file';
import { closeCodeView, openCodeView, useCodeStore } from '../../store/codeStore';
import { useBackend, useDocStore, useLastSavedAt } from '../../store/docStore';
import { useViewModeStore, type ViewMode } from '../../store/viewModeStore';
import { ExportDialog } from './ExportDialog';
import { HistoryDialog } from './HistoryDialog';
import { AiPanel } from './AiPanel';
import { AiImagePanel } from './AiImagePanel';
import { HypothesisPanel } from './HypothesisPanel';
import { SecurityDialog } from './SecurityDialog';
import { usePaletteStore } from '../../store/paletteStore';
import { useThemeStore } from '../../store/themeStore';
import { THEME_META, nextThemeMode } from '../../lib/themeMode';
import { CANVAS_SKIN_META, canvasLabel, nextCanvasSkin, normalizeCanvasSkin } from '../../lib/canvasSkin';
import { estimateLabelWidth, planTopbarOverflow } from '../../lib/topbarOverflow';

const VIEW_TABS: Array<{ id: ViewMode; label: string; hint: string }> = [
  { id: 'board', label: '画布', hint: '图形视图：拖拽、连线、分组' },
  { id: 'timeline', label: '时间线', hint: '按时间播放案件经过' },
  { id: 'present', label: '演示', hint: '逐项讲解实体与关联' },
  { id: 'map', label: '地图', hint: '按经纬度摆放到离线示意地图' },
];

/** 顶栏动作：priority 越小越优先留在顶栏上，放不下的收进「⋯」（M14 / M8） */
interface TopbarAction {
  key: string;
  label: string;
  title: string;
  priority: number;
  tone?: 'primary';
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

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
  const [hypOpen, setHypOpen] = useState(false);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const openPalette = usePaletteStore((s) => s.openPalette);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const themeLabel = THEME_META[themeMode]?.label ?? '默认';
  const [savingProject, setSavingProject] = useState(false);

  // M14（M8）：窗口变窄时按钮不再互相挤压/重叠，放不下的收进「⋯」菜单
  const ioRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [ioWidth, setIoWidth] = useState(0);
  const [winWidth, setWinWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const element = ioRef.current;
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    if (!element) return () => window.removeEventListener('resize', onResize);
    setIoWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', onResize);
    const observer = new ResizeObserver(() => setIoWidth(element.clientWidth));
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

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

  const canvasConfig = doc.settings.canvas;
  const canvasSkin = normalizeCanvasSkin(canvasConfig?.skin);

  const actions: TopbarAction[] = [
    {
      key: 'theme',
      label: `主题·${themeLabel}`,
      title: `界面主题：${THEME_META[themeMode]?.hint ?? ''}（点击切换，本地记住）`,
      priority: 5,
      onClick: () => setThemeMode(nextThemeMode(themeMode)),
    },
    {
      key: 'canvas',
      label: `背景·${canvasLabel(canvasConfig)}`,
      title: `画布底衬：${CANVAS_SKIN_META[canvasSkin].hint}（点击在 纸张 / 软木板 / 黑板 之间切换；导入背景图在右栏「案件概览」）`,
      priority: 6,
      onClick: () => dispatch(setCanvasSkin(nextCanvasSkin(canvasSkin))),
    },
    {
      key: 'search',
      label: '搜索 Ctrl+K',
      title: '全局搜索与命令面板（Ctrl+K）：实体标题/别名/备注/OCR 文本',
      priority: 0,
      onClick: openPalette,
    },
    { key: 'open', label: '打开', title: '打开 .caseboard 项目文件', priority: 1, onClick: () => void handleOpenProject() },
    {
      key: 'save',
      label: savingProject ? '保存中…' : '保存项目',
      title: '保存为单文件 .caseboard（数据库 + 素材 + DSL）',
      priority: 2,
      disabled: savingProject,
      onClick: () => void handleSaveProject(),
    },
    {
      key: 'export',
      label: '导出…',
      title: '导出 PNG / SVG / PDF / 图片包 / 脱敏',
      priority: 3,
      tone: 'primary',
      onClick: () => setExportOpen(true),
    },
    {
      key: 'import',
      label: '导入 JSON',
      title: '导入 JSON 数据（调试用）',
      priority: 12,
      onClick: () => void handleImport(),
    },
    {
      key: 'hyp',
      label: '假设',
      title: '假设与证据链：多假设并排比较、支持/反驳标注、六阶段断点',
      priority: 7,
      active: hypOpen,
      onClick: () => setHypOpen(true),
    },
    {
      key: 'aiimage',
      label: '生图',
      title: 'AI 生图：四预设示意图，角标写入像素，只进 AI 分区',
      priority: 9,
      active: aiImageOpen,
      onClick: () => setAiImageOpen(true),
    },
    {
      key: 'ai',
      label: 'AI 助手',
      title: 'AI 助手：抽取建图 / 矛盾审查 / 自然语言编辑 / 报告（本地优先）',
      priority: 8,
      active: aiOpen,
      onClick: () => setAiOpen(true),
    },
    {
      key: 'history',
      label: '历史',
      title: '历史与回收站：版本快照、被删除的实体与关系',
      priority: 10,
      active: historyOpen,
      onClick: () => setHistoryOpen(true),
    },
    {
      key: 'security',
      label: '安全',
      title: '安全与合规：本机存储说明（M9 起无启动密码）、AI 生成图审计、脱敏',
      priority: 11,
      active: securityOpen,
      onClick: () => setSecurityOpen(true),
    },
    {
      key: 'code',
      label: '</> 代码视图',
      title: '代码视图：与画布渲染同一份数据（在代码视图内 Ctrl+Shift+F 格式化）',
      priority: 4,
      active: codeOpen,
      onClick: () => {
        if (codeOpen) closeCodeView();
        else openCodeView();
      },
    },
  ];

  const plan = useMemo(() => {
    // 还没量到真实宽度时不折叠：宁可让 flex 容器横向滚动一帧，
    // 也不要因为「宽度未知」把按钮全塞进菜单（jsdom 里 clientWidth 恒为 0）
    if (ioWidth <= 0) {
      return { inline: actions.map((action) => action.key), overflow: [], used: 0 };
    }
    return planTopbarOverflow(
      actions.map((action) => ({
        key: action.key,
        width: estimateLabelWidth(action.label),
        priority: action.priority,
      })),
      ioWidth,
    );
    // 只依赖标签与宽度：actions 每次渲染都是新数组，不能进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ioWidth, winWidth, actions.map((action) => action.key + action.label).join('|')]);

  const inlineKeys = new Set(plan.inline);
  const overflowActions = actions.filter((action) => !inlineKeys.has(action.key));

  useEffect(() => {
    if (!moreOpen) return;
    if (overflowActions.length === 0) setMoreOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen, overflowActions.length]);

  const renderAction = (action: TopbarAction, inMenu: boolean) => (
    <button
      key={action.key}
      type="button"
      className={
        (inMenu ? 'cb-topbar__moreitem' : 'cb-btn') +
        (action.tone === 'primary' ? ' cb-btn--primary' : '') +
        (action.active ? ' is-active' : '') +
        (action.key === 'theme' ? ' cb-btn--theme' : '') +
        (action.key === 'search' ? ' cb-btn--search' : '')
      }
      data-topbar-action={action.key}
      disabled={action.disabled}
      title={action.title}
      onClick={() => {
        action.onClick();
        if (inMenu) setMoreOpen(false);
      }}
    >
      {action.label}
    </button>
  );

  const menuActions = overflowActions.filter((action) => !['theme', 'canvas'].includes(action.key));
  const collapsibleMenu = overflowActions.length > 0;

  return (
    <header className="cb-topbar">
      <div className="cb-topbar__brand">
        <span className="cb-topbar__case" title={doc.meta.title}>
          {doc.meta.title}
        </span>
        {doc.meta.caseNo ? (
          <span className="cb-topbar__no" title={'案件编号 ' + doc.meta.caseNo}>
            {doc.meta.caseNo}
          </span>
        ) : null}
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

      <div className="cb-topbar__io" ref={ioRef}>
        {actions.filter((action) => inlineKeys.has(action.key)).map((action) => renderAction(action, false))}
        {collapsibleMenu || menuActions.length > 0 ? (
          <div className="cb-topbar__more" ref={moreRef}>
            <button
              type="button"
              className={'cb-btn cb-topbar__morebtn' + (moreOpen ? ' is-active' : '')}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title={
                menuActions.length > 0
                  ? '窗口较窄：放不下的按钮收在这里（' + menuActions.map((action) => action.label).join(' / ') + '）'
                  : '更多操作'
              }
              onClick={() => setMoreOpen((open) => !open)}
            >
              ⋯
            </button>
            {moreOpen && menuActions.length > 0 ? (
              <div className="cb-topbar__morepanel" role="menu">
                {menuActions.map((action) => renderAction(action, true))}
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="cb-topbar__save" title={backend === 'sqlite' ? '数据写入本机 SQLite' : '数据写入浏览器本机存储'}>
          {backend === 'sqlite' ? 'SQLite' : '本机存储'}
          {lastSavedAt ? ' · 已保存 ' + new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
      {historyOpen ? <HistoryDialog onClose={() => setHistoryOpen(false)} /> : null}
      {aiOpen ? <AiPanel onClose={() => setAiOpen(false)} /> : null}
      {hypOpen ? <HypothesisPanel onClose={() => setHypOpen(false)} /> : null}
      {aiImageOpen ? <AiImagePanel onClose={() => setAiImageOpen(false)} /> : null}
      {securityOpen ? <SecurityDialog onClose={() => setSecurityOpen(false)} /> : null}
    </header>
  );
}
