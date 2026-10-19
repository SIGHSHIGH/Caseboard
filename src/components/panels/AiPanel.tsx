/**
 * AI 助手面板（M6）：抽取建图 / 矛盾审查 / 自然语言编辑 / 报告 / 设置。
 *
 * 红线（Gate 0-4）：抽取结果只进「待确认」队列，采纳才 dispatch 命令；
 * 自然语言编辑先出 diff 预览，删除必须二次确认；报告只读，不改 Model。
 */
import { useState } from 'react';
import { SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { CHAIN_TEMPLATES } from '../../lib/contradictions';
import { useAiStore } from '../../store/aiStore';
import { PROVIDER_LABEL, providerPrivacyText } from '../../services/ai/settings';
import type { AiProviderId } from '../../services/ai/types';
import { fileService } from '../../services/file';

interface AiPanelProps {
  onClose: () => void;
}

type TabId = 'extract' | 'conflicts' | 'edit' | 'report' | 'settings';

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'extract', label: '抽取建图', hint: '粘贴笔录，生成待确认清单，逐条采纳' },
  { id: 'conflicts', label: '矛盾审查', hint: '时间冲突 / 无证据断言 / 链条缺口' },
  { id: 'edit', label: '自然语言编辑', hint: '中文指令 → 命令 diff → 确认后执行' },
  { id: 'report', label: '报告', hint: '七节情况分析报告，每条事实带引用' },
  { id: 'settings', label: '设置', hint: '模型通道与数据边界' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function AiPanel({ onClose }: AiPanelProps) {
  const [tab, setTab] = useState<TabId>('extract');
  const store = useAiStore();
  const [allowDelete, setAllowDelete] = useState(false);
  const [exporting, setExporting] = useState<'word' | 'pdf' | null>(null);

  const pending = store.drafts.filter((entry) => entry.status === 'pending').length;
  const accepted = store.drafts.filter((entry) => entry.status === 'accepted').length;
  const rejected = store.drafts.filter((entry) => entry.status === 'rejected').length;

  const onExportWord = async () => {
    if (!store.report || exporting) return;
    setExporting('word');
    try {
      const { buildReportDocx } = await import('../../serializers/reportDocx');
      const bytes = buildReportDocx(store.report.markdown, store.report.title);
      await fileService.saveBytes(store.report.title + '.docx', bytes, [{ name: 'Word 文档', extensions: ['docx'] }]);
    } catch (error) {
      window.alert('导出 Word 失败：' + errorText(error));
    } finally {
      setExporting(null);
    }
  };

  const onExportPdf = async () => {
    if (!store.report || exporting) return;
    setExporting('pdf');
    try {
      const { reportToPdfBytes } = await import('../../serializers/reportPdf');
      const bytes = await reportToPdfBytes(store.report.markdown, store.report.title);
      await fileService.saveBytes(store.report.title + '.pdf', bytes, [{ name: 'PDF 文档', extensions: ['pdf'] }]);
    } catch (error) {
      window.alert('导出 PDF 失败：' + errorText(error));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div
      className="cb-modal__mask"
      role="dialog"
      aria-modal="true"
      aria-label="AI 助手"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cb-modal cb-ai">
        <header className="cb-modal__head">
          <h2>AI 助手</h2>
          <span className="cb-ai__provider">{PROVIDER_LABEL[store.settings.provider]}</span>
          <button type="button" className="cb-modal__icon" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="cb-ai__tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              title={item.hint}
              aria-selected={tab === item.id}
              className={tab === item.id ? 'cb-ai__tab is-active' : 'cb-ai__tab'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="cb-ai__body">
          {store.error ? <p className="cb-ai__error">{store.error}</p> : null}
          {store.notice ? <p className="cb-ai__notice">{store.notice}</p> : null}

          {tab === 'extract' ? (
            <section className="cb-ai__section">
              <p className="cb-ai__tip">
                粘贴询问笔录或情况说明。抽取结果全部进入待确认清单，未采纳前不会改动画布；推断关系使用虚线/点线。
              </p>
              <textarea
                className="cb-ai__input"
                value={store.sourceText}
                placeholder="粘贴笔录原文……（纯本地模式下不会发出本机）"
                onChange={(event) => store.setSourceText(event.target.value)}
              />
              <div className="cb-ai__actions">
                <button
                  type="button"
                  className="cb-btn"
                  onClick={() => store.setSourceText(SAMPLE_TRANSCRIPT)}
                  title="载入内置的虚构样本笔录（M6 验收样本）"
                >
                  载入示例笔录
                </button>
                <button
                  type="button"
                  className="cb-btn cb-btn--primary"
                  disabled={store.busy}
                  onClick={() => void store.extract()}
                >
                  {store.busy ? '抽取中…' : '抽取建图'}
                </button>
                <span className="cb-ai__count">
                  待确认 {pending} · 已采纳 {accepted} · 已驳回 {rejected}
                </span>
              </div>

              {store.drafts.length > 0 ? (
                <>
                  <div className="cb-ai__actions">
                    <button type="button" className="cb-btn" disabled={pending === 0} onClick={() => store.acceptAll()}>
                      全部采纳（一次撤销）
                    </button>
                    <button type="button" className="cb-btn" onClick={() => store.scoreAgainstReference()} title="与内置参考答案对比，验收要求 ≥70%">
                      计算采纳率
                    </button>
                    {store.score ? (
                      <span className="cb-ai__score">
                        采纳率 {Math.round(store.score.rate * 100)}%（{store.score.matched}/{store.score.total}）
                        {store.score.missing.length > 0 ? ' · 缺：' + store.score.missing.join('、') : ' · 无遗漏'}
                      </span>
                    ) : null}
                  </div>

                  <ul className="cb-ai__drafts">
                    {store.drafts.map((entry) => {
                      const draft = entry.draft;
                      const title = draft.kind === 'node' ? draft.title : draft.sourceTitle + ' —' + draft.relType + '→ ' + draft.targetTitle;
                      const detail =
                        draft.kind === 'node'
                          ? '实体 · ' + draft.type + ' · 置信度 ' + draft.confidence + '%'
                          : '关系 · ' + draft.style + ' · 置信度 ' + draft.confidence + '%';
                      return (
                        <li key={entry.id} className={'cb-ai__draft is-' + entry.status}>
                          <div className="cb-ai__draft-main">
                            <strong>{title}</strong>
                            <span className="cb-ai__draft-detail">{detail}</span>
                            {draft.evidenceQuote ? <span className="cb-ai__quote">依据：{draft.evidenceQuote}</span> : null}
                            {entry.note ? <span className="cb-ai__draft-note">{entry.note}</span> : null}
                          </div>
                          <div className="cb-ai__draft-ops">
                            <span className={'cb-ai__draft-status is-' + entry.status}>
                              {entry.status === 'pending' ? '待确认' : entry.status === 'accepted' ? '已采纳' : '已驳回'}
                            </span>
                            {entry.status === 'pending' ? (
                              <>
                                <button type="button" className="cb-btn cb-btn--primary" onClick={() => store.accept(entry.id)}>
                                  采纳
                                </button>
                                <button type="button" className="cb-btn" onClick={() => store.reject(entry.id)}>
                                  驳回
                                </button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}

              {store.unresolved.length > 0 ? (
                <div className="cb-ai__unresolved">
                  <strong>待核实（{store.unresolved.length}）</strong>
                  <ul>
                    {store.unresolved.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'conflicts' ? (
            <section className="cb-ai__section">
              <p className="cb-ai__tip">
                确定性审查：时间冲突、一物多主、已证实却无证据、同一对实体同时存在已证实与推测关系、证据链缺口。
                结论只是提示，不修改画布。
              </p>
              <div className="cb-ai__actions">
                <label className="cb-ai__field">
                  <span>证据链模板</span>
                  <select value={store.template} onChange={(event) => store.setTemplate(event.target.value as typeof store.template)}>
                    {Object.entries(CHAIN_TEMPLATES).map(([id, item]) => (
                      <option key={id} value={id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="cb-btn cb-btn--primary" disabled={store.busy} onClick={() => void store.detectConflicts(false)}>
                  运行本地审查
                </button>
                <button type="button" className="cb-btn" disabled={store.busy} onClick={() => void store.detectConflicts(true)} title="需要先在设置里允许远程模型">
                  用远程模型审查
                </button>
              </div>

              {store.conflicts ? (
                <>
                  <h3 className="cb-ai__h3">冲突与疑问（{store.conflicts.conflicts.length}）</h3>
                  {store.conflicts.conflicts.length === 0 ? (
                    <p className="cb-ai__tip">当前没有发现可指出的冲突。</p>
                  ) : (
                    <ul className="cb-ai__conflicts">
                      {store.conflicts.conflicts.map((conflict, index) => (
                        <li key={conflict.type + index} className={'cb-ai__conflict is-' + conflict.severity}>
                          <strong>{conflict.title}</strong>
                          <span className="cb-ai__sev">{conflict.severity === 'high' ? '高' : conflict.severity === 'medium' ? '中' : '低'}</span>
                          <p>{conflict.description}</p>
                          <p className="cb-ai__suggest">建议核实：{conflict.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3 className="cb-ai__h3">证据链审查</h3>
                  <table className="cb-ai__chain">
                    <thead>
                      <tr>
                        <th>阶段</th>
                        <th>状态</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.conflicts.chainReview.map((item) => (
                        <tr key={item.stage} className={'is-' + item.status}>
                          <td>{item.stage}</td>
                          <td>{item.status === 'covered' ? '已覆盖' : item.status === 'weak' ? '偏弱' : '缺口'}</td>
                          <td>{item.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3 className="cb-ai__h3">下一步</h3>
                  <ol className="cb-ai__next">
                    {store.conflicts.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="cb-ai__tip">还没有审查结果。</p>
              )}
            </section>
          ) : null}

          {tab === 'edit' ? (
            <section className="cb-ai__section">
              <p className="cb-ai__tip">
                用中文描述要改什么，例如「把李梅和张建国连起来，关系是同伙」「把张建国的置信度改成 80」。
                生成后先看 diff 预览，确认才写入；删除必须单独勾选确认。
              </p>
              <textarea
                className="cb-ai__input cb-ai__input--short"
                value={store.nlText}
                placeholder="每行一条指令……"
                onChange={(event) => store.setNlText(event.target.value)}
              />
              <div className="cb-ai__actions">
                <button type="button" className="cb-btn" disabled={!store.nlText.trim()} onClick={() => store.previewNl()}>
                  生成预览
                </button>
                {store.nlPlan ? (
                  <>
                    <label className="cb-ai__check">
                      <input type="checkbox" checked={allowDelete} onChange={(event) => setAllowDelete(event.target.checked)} />
                      <span>我确认执行删除操作</span>
                    </label>
                    <button
                      type="button"
                      className="cb-btn cb-btn--primary"
                      disabled={store.nlPlan.hasDelete && !allowDelete}
                      onClick={() => store.applyNl(allowDelete)}
                    >
                      确认执行（一次撤销）
                    </button>
                  </>
                ) : null}
              </div>

              {store.nlPlan ? (
                <>
                  <p className="cb-ai__tip">
                    {store.nlPlan.summary}
                    {store.nlPlan.hasDelete ? ' · 含删除操作，需二次确认' : ''}
                  </p>
                  <ul className="cb-ai__preview">
                    {store.nlPlan.preview.map((line, index) => (
                      <li key={index} className={line.ready ? 'is-ready' : 'is-blocked'}>
                        <span className="cb-ai__preview-mark">{line.ready ? '✓' : '!'}</span>
                        <span>{line.text}</span>
                        {line.problem ? <span className="cb-ai__preview-problem">{line.problem}</span> : null}
                      </li>
                    ))}
                  </ul>
                  {store.nlPlan.questions.length > 0 ? (
                    <div className="cb-ai__unresolved">
                      <strong>需要澄清</strong>
                      <ul>
                        {store.nlPlan.questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {tab === 'report' ? (
            <section className="cb-ai__section">
              <p className="cb-ai__tip">
                生成七节情况分析报告：每条事实句都带 [节点:id] 或 [证据:id] 引用；推测关系标注「（待核实）」。报告只读，可直接导出 Word / PDF。
              </p>
              <div className="cb-ai__actions">
                <button type="button" className="cb-btn cb-btn--primary" onClick={() => store.generateReport()}>
                  生成报告
                </button>
                <button type="button" className="cb-btn" disabled={!store.report || exporting !== null} onClick={() => void onExportWord()}>
                  {exporting === 'word' ? '导出中…' : '导出 Word'}
                </button>
                <button type="button" className="cb-btn" disabled={!store.report || exporting !== null} onClick={() => void onExportPdf()}>
                  {exporting === 'pdf' ? '导出中…' : '导出 PDF'}
                </button>
                {store.report ? <span className="cb-ai__count">{store.report.citations} 处引用</span> : null}
              </div>
              {store.report ? <pre className="cb-ai__report">{store.report.markdown}</pre> : <p className="cb-ai__tip">还没有生成报告。</p>}
            </section>
          ) : null}

          {tab === 'settings' ? (
            <section className="cb-ai__section">
              <p className="cb-ai__tip">
                默认「内置规则」完全离线、零外呼。选 Ollama 时只允许回环地址（127.0.0.1 / localhost）；OpenAI 兼容接口必须显式允许远程。
                模型名与密钥只存本机，不写进案件文件。
              </p>
              <div className="cb-ai__providers">
                {(Object.keys(PROVIDER_LABEL) as AiProviderId[]).map((id) => (
                  <label key={id} className={store.settings.provider === id ? 'cb-ai__provider-option is-active' : 'cb-ai__provider-option'}>
                    <input
                      type="radio"
                      name="cb-ai-provider"
                      checked={store.settings.provider === id}
                      onChange={() => store.setSettings({ provider: id })}
                    />
                    <span>{PROVIDER_LABEL[id]}</span>
                  </label>
                ))}
              </div>
              <p className="cb-ai__privacy">{providerPrivacyText(store.settings)}</p>

              {store.settings.provider !== 'builtin' ? (
                <div className="cb-ai__grid">
                  <label className="cb-ai__field">
                    <span>模型名</span>
                    <input value={store.settings.model} onChange={(event) => store.setSettings({ model: event.target.value })} />
                  </label>
                  <label className="cb-ai__field">
                    <span>服务地址</span>
                    <input value={store.settings.baseUrl} onChange={(event) => store.setSettings({ baseUrl: event.target.value })} />
                  </label>
                  {store.settings.provider === 'openai' ? (
                    <label className="cb-ai__field">
                      <span>API Key（只存本机）</span>
                      <input type="password" value={store.settings.apiKey} onChange={(event) => store.setSettings({ apiKey: event.target.value })} />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <label className="cb-ai__check">
                <input
                  type="checkbox"
                  checked={store.settings.allowRemote}
                  onChange={(event) => {
                    if (event.target.checked && !window.confirm('允许把案情文本发送给远程模型？这会离开本机，请确认数据合规。')) return;
                    store.setSettings({ allowRemote: event.target.checked });
                  }}
                />
                <span>允许远程模型（数据会离开本机，默认关闭）</span>
              </label>

              <div className="cb-ai__actions">
                <button type="button" className="cb-btn cb-btn--primary" onClick={() => store.persistSettings()}>
                  保存设置
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
