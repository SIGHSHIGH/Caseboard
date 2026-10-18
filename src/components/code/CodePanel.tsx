import { closeCodeView, formatCode, mergeGraphChanges, useCodeStore, type CodeSyncState } from '../../store/codeStore';
import { CodeEditor } from './CodeEditor';

const STATE_META: Record<CodeSyncState, { label: string; tone: string }> = {
  idle: { label: '已同步', tone: 'ok' },
  graphEditing: { label: '图形有更新', tone: 'warn' },
  codeEditing: { label: '代码编辑中', tone: 'edit' },
  conflict: { label: '有冲突', tone: 'warn' },
  error: { label: '语法错误', tone: 'error' },
};

export function CodePanel() {
  const state = useCodeStore((store) => store.state);
  const diagnostics = useCodeStore((store) => store.diagnostics);
  const conflicts = useCodeStore((store) => store.conflicts);
  const pendingGraph = useCodeStore((store) => store.pendingGraph);
  const firstError = diagnostics.find((item) => item.severity === 'error') ?? null;
  const meta = STATE_META[state];

  return (
    <section className={`cb-code cb-code--${meta.tone}`} data-state={state}>
      <header className="cb-code__head">
        <span className="cb-code__title">代码视图</span>
        <span className={`cb-code__badge cb-code__badge--${meta.tone}`}>{meta.label}</span>
        {state === 'error' && firstError ? (
          <span className="cb-code__note" title={firstError.message}>
            第 {firstError.line} 行：{firstError.message}
          </span>
        ) : null}
        {state === 'conflict' ? (
          <span className="cb-code__note">已保留画布上的值，放弃代码中冲突的 {conflicts.length} 处改动</span>
        ) : null}
        <span className="cb-code__spacer" />
        <button
          type="button"
          className="cb-btn cb-btn--sm"
          title="按当前模型重新排版（Ctrl+Shift+F）"
          onClick={() => {
            formatCode();
          }}
        >
          格式化
        </button>
        <button type="button" className="cb-btn cb-btn--sm" onClick={closeCodeView}>
          关闭
        </button>
      </header>

      {pendingGraph ? (
        <div className="cb-code__banner">
          图形有更新，当前光标未被打断。
          <button type="button" className="cb-btn cb-btn--sm cb-btn--primary" onClick={mergeGraphChanges}>
            点击合并
          </button>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="cb-code__error">语法错误：模型保持不变，图形暂时只读；修好后自动恢复。</div>
      ) : null}

      <CodeEditor />
    </section>
  );
}
