import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Board } from './components/flow/Board';
import { ImportWizard } from './components/panels/ImportWizard';
import { LeftPanel } from './components/panels/LeftPanel';
import { RightPanel } from './components/panels/RightPanel';
import { TopBar } from './components/panels/TopBar';
import { useDocStore } from './store/docStore';
import { useImportStore } from './store/importStore';
import { useUiStore } from './store/uiStore';

function imagesOf(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

export default function App() {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const startImport = useImportStore((s) => s.startImport);

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
      <TopBar />
      <div
        className="cb-main"
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        <LeftPanel />
        <ReactFlowProvider>
          <Board />
        </ReactFlowProvider>
        <RightPanel />
      </div>
      <ImportWizard />
    </div>
  );
}
