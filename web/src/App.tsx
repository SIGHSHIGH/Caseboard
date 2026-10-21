import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useCodeSyncBridge } from './components/code/useCodeSyncBridge';
import { Board } from './components/flow/Board';
import { ImportWizard } from './components/panels/ImportWizard';
import { CanvasLegend } from './components/panels/CanvasLegend';
import { LeftPanel } from './components/panels/LeftPanel';
import { RightPanel } from './components/panels/RightPanel';
import { TopBar } from './components/panels/TopBar';
import { useCodeStore } from './store/codeStore';
import { useDocStore, useReady } from './store/docStore';
import { useImportStore } from './store/importStore';
import { useUiStore } from './store/uiStore';
import { useViewModeStore } from './store/viewModeStore';
import { PresentationView } from './components/views/PresentationView';
import { TimelineView } from './components/views/TimelineView';
import { MapView } from './components/views/MapView';
import { CommandPalette } from './components/panels/CommandPalette';
import { NewNodeDialog } from './components/panels/NewNodeDialog';
import { TagLinkDialog } from './components/panels/TagLinkDialog';
import { usePaletteStore } from './store/paletteStore';
import { ASSET_DND_TYPE } from './lib/dnd';
import {
  classifyViewport,
  defaultPanelState,
  panelIsDrawer,
  shouldResetPanels,
  type ViewportTier,
} from './lib/viewport';

// 代码视图带着 CodeMirror 6，按需加载，避免拖慢画布首屏
const CodePanel = lazy(() => import('./components/code/CodePanel').then((mod) => ({ default: mod.CodePanel })));

function imagesOf(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

export default function App() {
  const doc = useDocStore((s) => s.doc);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const startImport = useImportStore((s) => s.startImport);
  const codeOpen = useCodeStore((s) => s.open);
  const ready = useReady();
  const viewMode = useViewModeStore((s) => s.mode);
  const paletteOpen = usePaletteStore((s) => s.open);
  const openPalette = usePaletteStore((s) => s.openPalette);
  const closePalette = usePaletteStore((s) => s.closePalette);
  const [splitPct, setSplitPct] = useState(44);
  // M11（J2）：左右栏都能点小箭头收起/展开，收起后画布立刻变宽
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const workRef = useRef<HTMLDivElement>(null);
  // H1：视口分档。桌面窗口够宽时永远落在 wide 档，行为与改造前完全一致；
  // 平板或窄窗才进 medium/compact，右栏/左栏改浮层抽屉。
  const [tier, setTier] = useState<ViewportTier>('wide');
  const tierRef = useRef<ViewportTier>('wide');
  useCodeSyncBridge();

  useEffect(() => {
    // 用 <html> 的 clientWidth（等于窗口宽度）：.cb-app 在首帧可能还没被内容撑开，
    // 拿它会读到 300 这类中间值，被误判成窄档后把右栏收起来——实测踩过这个坑。
    const readWidth = () => document.documentElement.clientWidth || window.innerWidth || 0;
    let pending: ViewportTier | null = null;
    const measure = () => {
      const next = classifyViewport(readWidth());
      if (next === tierRef.current) {
        pending = null;
        return;
      }
      // 连续两次读到同一档才生效，避免布局过渡期的中间值把面板收起来
      if (pending !== next) {
        pending = next;
        return;
      }
      pending = null;
      const previous = tierRef.current;
      tierRef.current = next;
      setTier(next);
      // 只在「变窄」时收起，变宽不自动弹开——免得用户刚收起又被窗口变化顶开
      if (shouldResetPanels(previous, next)) {
        const state = defaultPanelState(next);
        setLeftOpen(state.left);
        setRightOpen(state.right);
      }
    };
    measure();
    // 首帧、布局稳定后各补测一次；此后只靠窗口尺寸变化驱动
    const t1 = window.setTimeout(measure, 150);
    const t2 = window.setTimeout(measure, 600);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const key = event.key.toLowerCase();
      if (key === 'k') {
        // Ctrl+K：输入框里也要能唤起（先 preventDefault，避免浏览器把它当搜索）
        event.preventDefault();
        openPalette();
        return;
      }
      if (key === 'z') {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        if (typing) return;
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, openPalette]);

  // Esc 关命令面板（面板自己的输入框也会处理，这里兜住焦点在别处的情况）
  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, closePalette]);

  // Ctrl+V 粘贴截图 / 复制的图片文件；输入框内不拦截，避免影响正常编辑
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = imagesOf(event.clipboardData?.files);
      if (files.length === 0) return;
      event.preventDefault();
      void startImport(files, 'clipboard');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [startImport]);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    // M11（I13）：素材库内部拖拽走 Board 自己的落点逻辑；这里只处理「从系统拖进来的图片文件」，
    // 否则从素材缩略图拖到画布会误唤起导入向导。
    if (Array.from(event.dataTransfer?.types ?? []).includes(ASSET_DND_TYPE)) return;
    const files = imagesOf(event.dataTransfer?.files);
    if (files.length === 0) return;
    event.preventDefault();
    // 拖入图片后自动切到素材库，让用户看到导入结果
    useUiStore.getState().setLeftTab('assets');
    void startImport(files, 'import');
  };

  // M9（H3）：启动密码已彻底移除，应用一起来就是普通界面，数据落在普通 SQLite

  // H1：窄档下侧栏是浮层抽屉，需要一层遮罩——点遮罩即关，和手机上拉抽屉的手感一致
  const leftDrawer = panelIsDrawer(tier, 'left') && leftOpen;
  const rightDrawer = panelIsDrawer(tier, 'right') && rightOpen;

  return (
    <div className="cb-app" data-tier={tier}>
      <div className="cb-print-head">
        <strong>{doc.meta.title}</strong>
        <span>{doc.meta.caseNo ? '案件编号 ' + doc.meta.caseNo : '未编号'}</span>
        <span>{doc.nodes.length} 实体 · {doc.edges.length} 关系</span>
        <span>打印时间 {new Date().toLocaleString('zh-CN')}</span>
      </div>
      {ready ? null : (
        <div className="cb-boot">
          <div className="cb-boot__card">
            <strong>案情板 CaseBoard</strong>
            <span>正在载入本机案件…</span>
          </div>
        </div>
      )}
      <TopBar />
      <div
        className="cb-main"
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        {leftDrawer || rightDrawer ? (
          <button
            type="button"
            className="cb-scrim"
            aria-label="关闭侧栏"
            onClick={() => {
              if (rightDrawer) setRightOpen(false);
              if (leftDrawer) setLeftOpen(false);
            }}
          />
        ) : null}
        {viewMode === 'board' && leftOpen ? <LeftPanel /> : null}
        {viewMode === 'board' ? (
          <button
            type="button"
            className="cb-collapse cb-collapse--left"
            title={leftOpen ? '收起左栏' : '展开左栏'}
            aria-label={leftOpen ? '收起左栏' : '展开左栏'}
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen((value) => !value)}
          >
            {leftOpen ? '‹' : '›'}
          </button>
        ) : null}
        <div className={viewMode === 'board' ? 'cb-work' : 'cb-work cb-work--stage'} ref={workRef}>
          {viewMode === 'timeline' ? <TimelineView /> : null}
          {viewMode === 'present' ? <PresentationView /> : null}
          {viewMode === 'map' ? <MapView /> : null}
          {viewMode === 'board' ? (
            <div className="cb-work__canvas">
              <ReactFlowProvider>
                <Board />
              </ReactFlowProvider>
            </div>
          ) : null}
          {codeOpen && viewMode === 'board' ? (
            <>
              <div
                className="cb-splitter"
                title="拖动调整代码视图宽度"
                onPointerDown={(event) => {
                  event.preventDefault();
                  const rect = workRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const startX = event.clientX;
                  const startPct = splitPct;
                  const onMove = (moveEvent: PointerEvent) => {
                    const next = startPct - ((moveEvent.clientX - startX) / rect.width) * 100;
                    setSplitPct(Math.min(72, Math.max(28, next)));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              />
              <div className="cb-work__code" style={{ width: `${splitPct}%` }}>
                <Suspense fallback={<div className="cb-code__loading">代码视图加载中…</div>}>
                  <CodePanel />
                </Suspense>
              </div>
            </>
          ) : null}
        </div>
        {/* M11（I7）：地图视图也要右栏，才能改经纬度、点选设坐标；时间线/演示保留大舞台 */}
        {viewMode === 'board' || viewMode === 'map' ? (
          <button
            type="button"
            className="cb-collapse cb-collapse--right"
            title={rightOpen ? '收起右栏' : '展开右栏'}
            aria-label={rightOpen ? '收起右栏' : '展开右栏'}
            aria-expanded={rightOpen}
            onClick={() => setRightOpen((value) => !value)}
          >
            {rightOpen ? '›' : '‹'}
          </button>
        ) : null}
        {(viewMode === 'board' || viewMode === 'map') && rightOpen ? <RightPanel /> : null}
      </div>
      <ImportWizard />
      <NewNodeDialog />
      <TagLinkDialog />
      {viewMode === 'board' ? <CanvasLegend /> : null}
      {paletteOpen ? <CommandPalette /> : null}
    </div>
  );
}
