/**
 * 诊断日志开关（H5.12）
 *
 * 红线连线之类的高频路径原先直接 `console.log('[diag] …')`，产品运行时也一直在打。
 * 现在默认静默；探针（或开发者）在页面里设 `window.__CASEBOARD_DIAG__ = true` 后才输出，
 * 这样验收脚本仍能拿到 [diag] 行，用户侧控制台干净。
 */
type DiagHost = { __CASEBOARD_DIAG__?: boolean };

export function diagEnabled(): boolean {
  return Boolean((window as unknown as DiagHost).__CASEBOARD_DIAG__);
}

export function diagLog(message: string): void {
  if (!diagEnabled()) return;
  try {
    console.log(message);
  } catch {
    // 控制台不可用时静默
  }
}
