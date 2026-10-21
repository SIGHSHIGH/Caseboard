# 案情板 CaseBoard · 鸿蒙移植（HarmonyOS）

桌面版「案情板 CaseBoard」（Tauri 2 + React 18 + React Flow + SQLite）的 HarmonyOS 移植。
**路线：ArkWeb 混合**——现有 React 前端整体装进 `$rawfile`，ArkTS 侧用 `registerJavaScriptProxy`
提供 SQLite / 文件 / 选择器 / 剪贴板 / OCR / 图像能力，前端只替换 `src/services` 下的三处平台缝。
原生画布（H6）留到性能数据出来再决定。

> 当前状态：**H0 / H1 / H1.1 / H2 全部验收通过**（17 条机器断言，见 `scripts/accept-h1.ps1`）。
> 已上机验证设备：HarmonyOS 26.0.0 平板模拟器（MatePad Pro 13，1440×893 CSS px @ dpr 2）。

## 目录

```
platforms/harmony/
  AppScope/            应用级配置（bundleName com.caseboard.harmony、版本号）
  entry/               ArkTS 工程
    src/main/ets/
      bridge/          CaseBoardBridge.ets（25 个方法）、RawfileScheme.ets（caseboard:// 协议）
      service/         DbService / FileService / ClipboardService / OcrService / ImageService / PlatformService
      pages/Index.ets  Web 组件宿主 + 诊断探针
    src/main/resources/rawfile/   前端产物（构建生成，不入库）
  web/                 前端工程（桌面 src/ 的镜像，只改三处平台缝 + 平板适配）
  scripts/             一键验收与构建脚本
  docs/                H0 验收记录、H1 平板适配说明、仓库策略
```

## 构建与验收

需要 DevEco Studio（含 SDK API 26）与一台已连接的鸿蒙设备/模拟器。
脚本会自动定位工具链：优先 `DEVECO_HOME` 环境变量，其次常见安装位置，再退 `PATH`。

```powershell
# 只构建前端产物到 entry/src/main/resources/rawfile
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-web.ps1

# 全量验收：前端产物 → HAP 构建 → 安装 → 上机断言（17 条，全通过 exit 0）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h1.ps1

# H0 八条验收（A1–A4 / B1–B4，含 SQLite 与文件通路自检）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h0.ps1
```

验收报告落在 `.tmp-esbuild/accept-h1.json`、`.tmp-esbuild/accept-h0.json`。

## 三个必须知道的硬结论

1. **不能用 `resource://rawfile/` 直接加载**。`resource:` 是 opaque origin，ArkWeb 对 `<script type="module">`
   做 CORS 校验会直接拒（`Access to script at 'resource://rawfile/assets/index-*.js' from origin 'null'
   has been blocked by CORS policy`），Vite 产物必然是 ESM → 白屏。改用自定义 scheme
   `caseboard://rawfile/`（`customizeSchemes(isSupportCORS:true)` + `WebSchemeHandler` 从 rawfile 供货，
   响应头带 `Access-Control-Allow-Origin: *`）。
2. **`asyncMethodList` 不回传返回值**。页面调用桥方法拿到的是受理码 `0`，ArkTS 侧的 Promise 结果被丢弃。
   唯一回传通道是「页面在参数表末尾多传一个回调函数，ArkTS 完成后调用它」。所以 25 个方法全部是
   `(args…, cb: (result: string) => void): void`，返回值统一包成 `{"ok":true,"value":…}` 信封。
3. **`setMimeType` 只能给裸 MIME**（`text/html`、`text/javascript`…）。写成 `text/html; charset=utf-8`
   会让 ArkWeb 把整页当纯文本源码显示。字符集走 `setEncoding('utf-8')`。

## 已知限制

- **只做横屏**。进入竖屏或小窗时由前端提示层拦住（`platforms/harmony/web/src/components/OrientationGate.tsx`），
  文案是 `_(:3」∠)_`，不做竖屏布局。
- **OCR 用系统 Core Vision Kit**（`canIUse('SystemCapability.AI.OCR.TextRecognition')` 守卫），
  不打包 Tesseract（省 16MB）；设备不支持时退「手工录入」。
- **`ohos.permission.READ_PASTEBOARD` 是 system_basic 级**，普通应用声明不了，读剪贴板失败只记警告并返回空。
- **PDF 导出**走 `@kit.PDFKit`（HMS 专有），非 HMS 设备不可用。
- 超宽屏（≥1561 CSS px）下顶栏「已保存」状态会重新出现，未在真机上实测。

## 与桌面版的关系

`web/` 是桌面 `src/` 的镜像副本，改动只允许落在三处平台缝与平板适配样式上（见 `docs/REPO-STRATEGY.md`）。
桌面版仍是唯一主干，本目录的所有改动都应能反向甄别出「该不该回填桌面版」。
