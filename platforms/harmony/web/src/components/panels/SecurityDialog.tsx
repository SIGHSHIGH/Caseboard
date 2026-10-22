import { useState } from 'react';
import { useDocStore } from '../../store/docStore';
import { auditAiAssets } from '../../lib/aiAudit';
import { fileService } from '../../services/file';

/** 安全与合规（M8 起；M9 按 H3 删除启动密码/加密，只保留 Windows Hello 接入位说明、AI 审计、脱敏说明） */
export function SecurityDialog({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const [auditNotice, setAuditNotice] = useState('');

  const audit = auditAiAssets(doc);

  const exportAudit = async (target: 'docx' | 'md') => {
    try {
      if (target === 'docx') {
        const { buildReportDocx } = await import('../../serializers/reportDocx');
        const bytes = buildReportDocx(audit.markdown, 'AI 生成图合规审计');
        const saved = await fileService.saveBytes('AI生成图合规审计.docx', bytes, [{ name: 'Word 文档', extensions: ['docx'] }]);
        setAuditNotice(saved ? '已导出 Word：' + saved : '已取消导出');
      } else {
        const saved = await fileService.saveText('AI生成图合规审计.md', audit.markdown, [{ name: 'Markdown', extensions: ['md'] }]);
        setAuditNotice(saved ? '已导出 Markdown：' + saved : '已取消导出');
      }
    } catch (err) {
      setAuditNotice('导出失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="cb-modal__mask" onClick={onClose}>
      <div className="cb-modal cb-security" onClick={(event) => event.stopPropagation()}>
        <header className="cb-security__head">
          <h2>安全</h2>
          <button type="button" className="cb-btn cb-btn--tiny" onClick={onClose}>关闭</button>
        </header>
        <div className="cb-security__body">
          <section className="cb-security__block">
            <h3>Windows Hello（接入位）</h3>
            <p className="cb-security__note">
              已预留接入位（<code>hello_available</code> / <code>hello_verify</code>），当前版本未接入。
            </p>
          </section>
          <section className="cb-security__block cb-security__audit">
            <h3>AI 生成图合规审计</h3>
            <p className="cb-security__state">
              本案件 AI 生成图 {audit.count} 张，合规 {audit.compliant} 张{audit.problems.length > 0 ? '，问题 ' + audit.problems.length + ' 项' : '，未发现违规'}
            </p>
            <p className="cb-security__note">
              审计逐张检查：是否进 AI 分区、是否有 aiGenerated 与完整 aiMeta、角标文字是否写入像素、提示词/模型/生成时间是否留档。
              AI 图仅作示意，不得作为证据，挂着 AI 图的实体不能标「已证实」。
            </p>
            <div className="cb-security__ops">
              <button type="button" className="cb-btn" onClick={() => void exportAudit('docx')}>导出审计 Word</button>
              <button type="button" className="cb-btn" onClick={() => void exportAudit('md')}>导出 Markdown</button>
            </div>
            {auditNotice ? <p className="cb-security__notice">{auditNotice}</p> : null}
          </section>
          <section className="cb-security__block">
            <h3>脱敏</h3>
            <p className="cb-security__note">导出/打印默认脱敏证件号、手机号、银行卡号；马赛克不可逆。</p>
          </section>
        </div>
        <footer className="cb-security__foot">
          <button type="button" className="cb-btn" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
