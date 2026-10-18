import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Board } from './components/flow/Board';
import { LeftPanel } from './components/panels/LeftPanel';
import { RightPanel } from './components/panels/RightPanel';
import { TopBar } from './components/panels/TopBar';
import { useDocStore } from './store/docStore';

export default function App() {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);

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

  return (
    <div className="cb-app">
      <TopBar />
      <div className="cb-main">
        <LeftPanel />
        <ReactFlowProvider>
          <Board />
        </ReactFlowProvider>
        <RightPanel />
      </div>
    </div>
  );
}
