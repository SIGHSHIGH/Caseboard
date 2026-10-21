import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { DemoDialog } from './DemoDialog';
import { usePaletteStore } from '../../store/paletteStore';
import { useThemeStore } from '../../store/themeStore';
import { THEME_META, nextThemeMode } from '../../lib/themeMode';
import { CANVAS_SKIN_META, canvasLabel, nextCanvasSkin, normalizeCanvasSkin } from '../../lib/canvasSkin';
import { estimateLabelWidth, planTopbarOverflow } from '../../lib/topbarOverflow';
import { useCanvasImagePicker } from '../hooks/useCanvasImage';

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
  const [demoOpen, setDemoOpen] = useState(false);
  const openPalette = usePaletteStore((s) => s.openPalette);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const themeLabel = THEME_META[themeMode]?.label ?? '默认';
  const [savingProject, setSavingProject] = useState(false);
  // M15（N5）：顶栏也提供「背景图…」入口，不必先点空白处再去右栏找
  const pickCanvasImage = useCanvasImagePicker();

  // M14（M8）：窗口变窄时按钮不再互相挤压/重叠，放不下的收进「⋯」菜单
  // M15（N3/N4）：菜单改成 portal 到 body + fixed 定位——顶栏和 .cb-topbar__io 都有
  // overflow 裁剪，绝对定位的下拉面板以前整个被裁掉，所以点「⋯」看起来毫无反应。
  const ioRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLSpanElement>(null);
  const [ioWidth, setIoWidth] = useState(0);
  // 常驻元素实测占位：`.cb-topbar__io` 里除了动作按钮，还塞着「⋯」按钮和
  // 「SQLite · 已保存 hh:mm」这段常驻文字。它们**也吃宽度**，但不在 planTopbarOverflow 的
  // 账本里，于是规划器以为放得下、实际却溢出；溢出的方向又恰好是左侧（`justify-content: flex-end`），
  // 表现为最左边那个按钮被裁掉半边，而 scrollWidth 只统计右侧溢出、看起来「没超」。
  // 所以预算必须扣掉这些常驻元素的实测宽度。
  const [staticWidth, setStaticWidth] = useState(0);
  const [winWidth, setWinWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  // 实测宽度（估算只用于首帧）与「因为真的挤在一起而强制收进菜单」的集合
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [forced, setForced] = useState<string[]>([]);

  useEffect(() => {
    const element = ioRef.current;
    const onResize = () => {
      setWinWidth(window.innerWidth);
      // 窗口一变就按新宽度重新量一遍，避免越缩越紧之后再放大也放不回来
      setForced([]);
      // 菜单是 fixed 定位的，窗口一动位置就不对了，直接收起
      setMoreOpen(false);
    };
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
      const target = event.target as Node;
      if (moreRef.current?.contains(target)) return;
      if (morePanelRef.current?.contains(target)) return;
      setMoreOpen(false);
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
      title: `画布底衬：${CANVAS_SKIN_META[canvasSkin].hint}（点击在 纸张 / 软木板 / 黑板 之间切换；导入背景图用旁边的「背景图…」）`,
      priority: 6,
      onClick: () => dispatch(setCanvasSkin(nextCanvasSkin(canvasSkin))),
    },
    {
      key: 'bgimage',
      label: '背景图…',
      title: '导入一张图片作为画布背景（右栏「画布底衬与背景图」里还能调不透明度或清除）',
      priority: 13,
      onClick: () => void pickCanvasImage(),
    },
    {
      key: 'demo',
      label: '示例案卷',
      title: '载入内置示例：连环诈骗案 / ABC 谋杀案（会替换当前案卷并清空撤销历史，先确认）',
      priority: 14,
      active: demoOpen,
      onClick: () => setDemoOpen(true),
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
    const base = planTopbarOverflow(
      actions.map((action) => ({
        key: action.key,
        // M15：优先用实测宽度，估算值只在首帧生效
        width: widths[action.key] ?? estimateLabelWidth(action.label),
        priority: action.priority,
      })),
      // 可用宽度 = 容器宽度 − 常驻元素（「⋯」按钮 + 保存状态文字）实测宽度
      Math.max(0, ioWidth - staticWidth),
    );
    if (forced.length === 0) return base;
    const forcedSet = new Set(forced);
    const inline = base.inline.filter((key) => !forcedSet.has(key));
    return {
      inline,
      overflow: actions.filter((action) => !inline.includes(action.key)).map((action) => action.key),
      used: base.used,
    };
    // 只依赖标签与宽度：actions 每次渲染都是新数组，不能进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ioWidth, staticWidth, winWidth, widths, forced, actions.map((action) => action.key + action.label).join('|')]);

  const inlineKeys = new Set(plan.inline);
  const overflowActions = actions.filter((action) => !inlineKeys.has(action.key));

  // M15：真实渲染之后再量一次——采集按钮实际宽度，并检测容器是否真的挤爆了
  // （scrollWidth > clientWidth 就是被压/被裁），挤了就再把最低优先级的一项收进菜单。
  // 这样「估算与真实字体不一致」导致的残留遮挡也会被自动收拾掉。
  useLayoutEffect(() => {
    const container = ioRef.current;
    if (!container) return;
    const measured: Record<string, number> = {};
    container.querySelectorAll<HTMLElement>('[data-topbar-action]').forEach((element) => {
      const key = element.dataset.topbarAction;
      if (!key) return;
      const width = Math.ceil(element.getBoundingClientRect().width);
      if (width > 0) measured[key] = width;
    });
    if (Object.keys(measured).length > 0) {
      const changed = Object.entries(measured).some(([key, value]) => Math.abs((widths[key] ?? 0) - value) > 1);
      if (changed) setWidths((current) => ({ ...current, ...measured }));
    }
    if (ioWidth <= 0) return;
    // 常驻元素（「⋯」按钮 + 保存状态文字）的实测占位，用来把预算算准
    const gapStyle = typeof getComputedStyle === 'function' ? getComputedStyle(container).columnGap : '';
    const gap = Number.parseFloat(gapStyle) || 0;
    const morePart = moreRef.current ? moreRef.current.getBoundingClientRect().width + gap : 0;
    const savePart = saveRef.current ? saveRef.current.getBoundingClientRect().width + gap : 0;
    const statics = Math.ceil(morePart + savePart);
    if (Math.abs(staticWidth - statics) > 1) setStaticWidth(statics);
    // `justify-content: flex-end` 的容器溢出时内容往左跑，而 scrollWidth 只统计右侧溢出，
    // 于是「scrollWidth == clientWidth」但最左边的按钮已被裁掉。以「首个子元素的左边界」为准。
    const box = container.getBoundingClientRect();
    const firstChild = container.firstElementChild as HTMLElement | null;
    const leftClipped = firstChild ? firstChild.getBoundingClientRect().left < box.left - 1 : false;
    if (!leftClipped && container.scrollWidth - container.clientWidth <= 1) return;
    const victim = actions
      .filter((action) => inlineKeys.has(action.key))
      .sort((left, right) => right.priority - left.priority)[0];
    if (victim && !forced.includes(victim.key)) setForced((current) => [...current, victim.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const openMenu = () => {
    const button = moreBtnRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setMenuPos({
        top: Math.round(rect.bottom + 6),
        right: Math.round(Math.max(8, window.innerWidth - rect.right)),
      });
    }
    setMoreOpen(true);
  };

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

  // M15：溢出的一律进菜单（以前把 theme / canvas 过滤掉了，万一被挤出去就彻底点不到）
  const menuActions = overflowActions;
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
        {/* M15：只要图标，不要汉字（title / aria-label 里仍有完整说明） */}
        <button
          type="button"
          className="cb-btn cb-btn--icon"
          disabled={!canUndo}
          aria-label="撤销"
          title={canUndo ? `撤销：${lastLabel}（Ctrl+Z）` : '没有可撤销的操作'}
          onClick={undo}
        >
          ↶
        </button>
        <button
          type="button"
          className="cb-btn cb-btn--icon"
          disabled={!canRedo}
          aria-label="重做"
          title={canRedo ? `重做：${nextLabel}（Ctrl+Shift+Z）` : '没有可重做的操作'}
          onClick={redo}
        >
          ↷
        </button>
      </div>

      <div className="cb-topbar__io" ref={ioRef}>
        {actions.filter((action) => inlineKeys.has(action.key)).map((action) => renderAction(action, false))}
        {collapsibleMenu || menuActions.length > 0 ? (
          <div className="cb-topbar__more" ref={moreRef}>
            <button
              ref={moreBtnRef}
              type="button"
              className={'cb-btn cb-topbar__morebtn' + (moreOpen ? ' is-active' : '')}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title={
                menuActions.length > 0
                  ? '窗口较窄：放不下的按钮收在这里（' + menuActions.map((action) => action.label).join(' / ') + '）'
                  : '更多操作'
              }
              onClick={() => {
                if (moreOpen) setMoreOpen(false);
                else openMenu();
              }}
            >
              ⋯
            </button>
          </div>
        ) : null}
        <span
          ref={saveRef}
          className="cb-topbar__save"
          title={backend === 'sqlite' ? '数据写入本机 SQLite' : '数据写入浏览器本机存储'}
        >
          {backend === 'sqlite' ? 'SQLite' : '本机存储'}
          {lastSavedAt ? ' · 已保存 ' + new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      {/* M15（N3/N4）：菜单 portal 到 body，避开顶栏与 .cb-topbar__io 的 overflow 裁剪 */}
      {moreOpen && menuPos && menuActions.length > 0
        ? createPortal(
            <div
              ref={morePanelRef}
              className="cb-topbar__morepanel"
              role="menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 2200 }}
            >
              {menuActions.map((action) => renderAction(action, true))}
            </div>,
            document.body,
          )
        : null}
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
      {historyOpen ? <HistoryDialog onClose={() => setHistoryOpen(false)} /> : null}
      {aiOpen ? <AiPanel onClose={() => setAiOpen(false)} /> : null}
      {hypOpen ? <HypothesisPanel onClose={() => setHypOpen(false)} /> : null}
      {aiImageOpen ? <AiImagePanel onClose={() => setAiImageOpen(false)} /> : null}
      {securityOpen ? <SecurityDialog onClose={() => setSecurityOpen(false)} /> : null}
      {demoOpen ? <DemoDialog onClose={() => setDemoOpen(false)} /> : null}
    </header>
  );
}
