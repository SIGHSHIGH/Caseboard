/**
 * 竖屏 / 小窗拦截层（H1 决策：不支持竖屏，只做横屏）。
 *
 * 案情板是横向信息密度工具：画布要宽、时间线要长、左右栏各占一列。竖屏下再折叠
 * 也只剩一条窄缝，与其给半残界面，不如明说。平台侧已用
 * `module.json5 → abilities[].orientation: "landscape"` 强制横屏，这一层是兜底：
 * 2in1 拖成小窗、分屏、折叠屏半折时仍可能拿到竖屏或过窄的视口。
 *
 * 遮挡层是**不透明**的：底下的画布继续挂着（不卸载，避免 React Flow 丢视口状态），
 * 但用户看不见也点不到，松手回到横屏立刻恢复。
 */
export function OrientationGate({ width, height }: { width: number; height: number }) {
  const portrait = height > width;
  const tooNarrow = !portrait;
  const detail = portrait
    ? `当前 ${width}×${height}，是竖屏`
    : `当前 ${width}×${height}，窗口太窄`;

  return (
    <div className="cb-gate" role="alertdialog" aria-label="请横屏使用">
      <div className="cb-gate__card">
        <div className="cb-gate__face" aria-hidden="true">
          _(:з」∠)_
        </div>
        <div className="cb-gate__title">请横屏使用</div>
        <p className="cb-gate__text">
          案情板要横向铺开才看得清：画布要宽、时间线要长、左右栏各占一列。
          {portrait ? '把平板横过来' : '把窗口拖宽'}就好，案件数据不会丢。
        </p>
        <div className="cb-gate__meta">{detail}</div>
        {tooNarrow ? (
          <div className="cb-gate__hint">建议宽度 ≥ 900px</div>
        ) : null}
      </div>
    </div>
  );
}
