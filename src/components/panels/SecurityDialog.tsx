import { useState } from 'react';
import { useVaultStore } from '../../store/vaultStore';
import { useDocStore } from '../../store/docStore';
import { auditAiAssets } from '../../lib/aiAudit';
import { fileService } from '../../services/file';

/** 安全设置（M8）：启用/关闭启动密码、立即锁定、更换密码；Windows Hello 为未接入的接入位说明 */
export function SecurityDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const enabled = useVaultStore((s) => s.enabled);
  const busy = useVaultStore((s) => s.busy);
  const error = useVaultStore((s) => s.error);
  const notice = useVaultStore((s) => s.notice);
  const enable = useVaultStore((s) => s.enable);
  const disable = useVaultStore((s) => s.disable);
  const changePassword = useVaultStore((s) => s.changePassword);
  const lockNow = useVaultStore((s) => s.lockNow);
  const clearMessages = useVaultStore((s) => s.clearMessages);
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
            <h3>启动密码（数据库加密）</h3>
            <p className="cb-security__note">
              启用后，案件数据库在本机磁盘上以 AES-256-GCM 密文保存；启动时必须输入密码才会解出明文库。
              密码只在本机校验，不上传、不可找回。
            </p>
            <p className="cb-security__state">当前状态：{enabled ? '已启用（启动需密码）' : '未启用（数据库为普通 SQLite 文件）'}</p>
            {enabled ? (
              <div className="cb-security__grid">
                <label>
                  <span>当前密码</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="用于锁定 / 关闭 / 更换" />
                </label>
                <label>
                  <span>新密码</span>
                  <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="至少 4 位" />
                </label>
                <div className="cb-security__ops">
                  <button type="button" className="cb-btn cb-btn--primary" disabled={busy || !password} onClick={() => void lockNow(password)}>立即锁定</button>
                  <button type="button" className="cb-btn" disabled={busy || !password || !nextPassword} onClick={() => void changePassword(password, nextPassword)}>更换密码</button>
                  <button type="button" className="cb-btn" disabled={busy || !password} onClick={() => void disable(password)}>关闭启动密码</button>
                </div>
              </div>
            ) : (
              <div className="cb-security__grid">
                <label>
                  <span>设置启动密码</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 4 位" />
                </label>
                <div className="cb-security__ops">
                  <button type="button" className="cb-btn cb-btn--primary" disabled={busy || password.length < 4} onClick={() => void enable(password)}>启用加密</button>
                </div>
              </div>
            )}
            {error ? <p className="cb-security__error">{error}</p> : null}
            {notice ? <p className="cb-security__notice">{notice}</p> : null}
          </section>
          <section className="cb-security__block">
            <h3>Windows Hello（接入位）</h3>
            <p className="cb-security__note">
              已预留接入位（`hello_available` / `hello_verify`），当前版本未接入：解锁统一走启动密码，
              以免在没有指纹/人脸设备的机器上出现「装了却打不开」的情况。
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
            <p className="cb-security__note">导出与打印默认脱敏身份证号、手机号、银行卡号；素材上的马赛克导出不可逆（像素级复核）。</p>
          </section>
        </div>
        <footer className="cb-security__foot">
          <button
            type="button"
            className="cb-btn"
            onClick={() => {
              clearMessages();
              onClose();
            }}
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
