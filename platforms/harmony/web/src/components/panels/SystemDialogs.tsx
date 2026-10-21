/**
 * 应用内确认框与结果提示条（H5-4）。
 *
 * 为什么不用 `window.confirm/alert`：ArkWeb（鸿蒙 Web 组件）里 `confirm` 静默返回 false、
 * `alert` 直接丢弃，两个都不报错也不弹窗，于是「清空回收站」「允许发送到云端」「保存失败」
 * 这类关键反馈全部变成「点了没反应」。桌面 Tauri 虽然支持，但两套行为不一致更难维护，
 * 所以统一走这里的应用内实现。
 */
import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';

const NOTICE_TIMEOUT_MS = 4200;

/** 确认框宿主：挂在 App 根部，读 uiStore.confirmRequest */
export function ConfirmHost() {
  const request = useUiStore((state) => state.confirmRequest);
  const resolveConfirm = useUiStore((state) => state.resolveConfirm);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resolveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, resolveConfirm]);

  if (!request) return null;

  return (
    <div
      className="cb-modal__mask cb-modal__mask--confirm"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveConfirm(false);
      }}
    >
      <div className="cb-modal cb-confirm">
        <header className="cb-modal__head">
          <h2>{request.title}</h2>
        </header>
        <p className="cb-modal__hint cb-confirm__message">{request.message}</p>
        <footer className="cb-modal__foot">
          <button type="button" className="cb-btn cb-btn--ghost" onClick={() => resolveConfirm(false)}>
            {request.cancelText}
          </button>
          <button
            type="button"
            className={request.danger ? 'cb-btn cb-btn--danger' : 'cb-btn cb-btn--primary'}
            onClick={() => resolveConfirm(true)}
            autoFocus
          >
            {request.confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** 提示条宿主：保存成功 / 导入失败这类一次性回执，4.2 秒自动消失，点一下也关 */
export function NoticeHost() {
  const notices = useUiStore((state) => state.notices);
  const dismissNotice = useUiStore((state) => state.dismissNotice);

  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((item) =>
      window.setTimeout(() => dismissNotice(item.id), NOTICE_TIMEOUT_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notices, dismissNotice]);

  if (notices.length === 0) return null;

  return (
    <div className="cb-notices" role="status" aria-live="polite">
      {notices.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.kind === 'error' ? 'cb-notice cb-notice--error' : 'cb-notice'}
          onClick={() => dismissNotice(item.id)}
          title="点击关闭"
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}
