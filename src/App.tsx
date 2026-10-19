import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useCodeSyncBridge } from './components/code/useCodeSyncBridge';
import { Board } from './components/flow/Board';
import { ImportWizard } from './components/panels/ImportWizard';
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

// 代码视图带着 CodeMirror 6，按需加载，避免拖慢画布首屏
const CodePanel = lazy(() => import('./components/code/CodePanel').then((mod) => ({ default: mod.CodePanel })));

function imagesOf(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

export default function App() {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const startImport = useImportStore((s) => s.startImport);
  const codeOpen = useCodeStore((s) => s.open);
  const ready = useReady();
  const viewMode = useViewModeStore((s) => s.mode);
  const [splitPct, setSplitPct] = useState(44);
  const workRef = useRef<HTMLDivElement>(null);
  useCodeSyncBridge();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const key = event.key.toLowerCase();
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
  }, [undo, redo]);

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
    const files = imagesOf(event.dataTransfer?.files);
    if (files.length === 0) return;
    event.preventDefault();
    // 拖入图片后自动切到素材库，让用户看到导入结果
    useUiStore.getState().setLeftTab('assets');
    void startImport(files, 'import');
  };

  return (
    <div className="cb-app">
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
        {viewMode === 'board' ? <LeftPanel /> : null}
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
        {viewMode === 'board' ? <RightPanel /> : null}
      </div>
      <ImportWizard />
    </div>
  );
}
