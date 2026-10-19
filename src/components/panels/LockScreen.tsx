import { useEffect, useRef, useState } from 'react';
import { useVaultStore } from '../../store/vaultStore';

/** 启动密码锁屏（M8 验收 2）：未解锁前不渲染任何案件数据 */
export function LockScreen() {
  const [password, setPassword] = useState('');
  const busy = useVaultStore((s) => s.busy);
  const error = useVaultStore((s) => s.error);
  const unlock = useVaultStore((s) => s.unlock);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!password || busy) return;
    const ok = await unlock(password);
    if (ok) setPassword('');
  };

  return (
    <div className="cb-lock">
      <div className="cb-lock__card">
        <div className="cb-lock__brand">案情板 CaseBoard</div>
        <h1 className="cb-lock__title">数据库已加密</h1>
        <p className="cb-lock__hint">请输入启动密码解锁本机案件。密码只在本机校验，不上传任何地方。</p>
        <form
          className="cb-lock__form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            className="cb-lock__input"
            type="password"
            autoComplete="current-password"
            placeholder="启动密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" className="cb-btn cb-btn--primary" disabled={busy || password.length === 0}>
            {busy ? '正在解锁…' : '解锁'}
          </button>
        </form>
        {error ? <p className="cb-lock__error">{error}</p> : null}
        <p className="cb-lock__foot">忘记密码无法恢复：明文库在解锁时才会生成，磁盘上只有密文。</p>
      </div>
    </div>
  );
}
