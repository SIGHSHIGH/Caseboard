# 变更记录 · 鸿蒙移植

## H1.1 · 只做横屏 + 竖屏/小窗提示层（2026-10-21）

**决策**：本产品**只支持横屏**，取消竖屏适配。案情板是横向信息密度工具，竖屏下画布/时间线/左右栏都摊不开，
做竖屏等于把「勉强能用」伪装成「适配完成」。`scripts/accept-h1.ps1` 13 条检查全 PASS。

### 新增

- **`web/src/lib/viewport.ts`**：`USABLE_MIN_WIDTH = 900` 与 `shouldGateLayout(width, height)`
  —— `height > width`（竖屏）或 `width < 900`（小窗/分屏/半折）时返回 true，纯函数可断言。
- **`web/src/components/OrientationGate.tsx`**：`_(:з」∠)_` + 「请横屏使用」提示层，
  不透明遮挡（`z-index: 9000`），**底下界面不卸载**以保住 React Flow 视口状态，转回横屏立刻恢复。
- **`web/src/styles/responsive.css`**：`.cb-gate` 与 `card/face/title/text/meta/hint` 全套，
  颜文字取证据红 `#C0392B`，不引入新色板。
- **`entry/src/main/module.json5`**：`abilities[0].orientation: "landscape"` 强制横屏。
- **`Index.ets`**：验收探针按 phase 造真实视口（1/2 全宽、3 窄档 1000vp、4 竖屏 700vp），
  新增 `[gate]`（1400ms）与 `[gate2]`（2600ms）延时打点。
- **`scripts/accept-h1.ps1`**：新增 H1-11（横屏不弹层）、H1-12（700×893 弹层）、H1-13（文案已打包）。

### 关键结论

1. **提示层不能在 `onPageEnd` 立刻断言**：首帧测量还是 1440 的过渡值，分档要连续两个同样本才生效，
   实测约 1s 后才稳定——探针必须延时打点。
2. **模拟器会被后台任务连带杀掉**：必须 `Start-Process -ArgumentList '<单个字符串>'` 脱离式启动
   （传数组会按空格拆参）；许可协议还会周期性重置，需先 `Emulator.exe -license accept`。
3. `700×893` 同时命中「竖屏」与「宽度不足」两条规则，该设备上无法单独构造单一规则用例。

## H1 · 平板形态适配验收通过（2026-10-21）

**目标**：同一套前端在 MatePad Pro 13（1440×893 CSS px / dpr=2）上手指可用，桌面功能不减，
八条硬约束不动。`scripts/accept-h1.ps1` 10 条检查全 PASS。

### 新增

- **`web/src/lib/viewport.ts`**：纯逻辑分档（`classifyViewport` / `defaultPanelState` /
  `panelIsDrawer` / `shouldResetPanels`），阈值 `wide ≥ 1180`、`medium ≥ 900`。
- **`web/src/styles/responsive.css`**：在 `index.css` 之后加载的增量覆盖层（不动 5367 行大文件）。
  触控令牌 `--cb-control-h` 28→40px、`--cb-control-h-sm` 22→36px、`--cb-control-pad` 8→12px；
  折叠条 16→36px、视图页签 36px、画布缩放 26→40px；窄档右栏变贴边抽屉 + `.cb-scrim` 遮罩。
- **`web/src/main.tsx`**：按 `matchMedia('(pointer: coarse)') || maxTouchPoints > 0` 打
  `<html data-input="touch">`。
- **`web/src/App.tsx`**：`tier` 状态 + `data-tier` 属性；抽屉模式与遮罩渲染；启动竞态修复
  （两次同档确认 + 150/600ms 补测 + `window.resize`）。
- **`scripts/accept-h1.ps1`**（H1-1…H1-10，输出 `.tmp-esbuild/accept-h1.json`）。
- **`docs/H1-TABLET.md`**（分档模型、令牌表、上机手法、遗留）、**`docs/REPO-STRATEGY.md`**
  （桌面版与鸿蒙版的仓库管理建议）。

### 修改

- **`web/src/components/panels/TopBar.tsx`**：`≤1560px` 收紧 gap 与案件名宽度，`≤1280px` 隐藏案件编号。

### 关键结论

1. **平板 ArkWeb 报 `maxTouchPoints === 0` 但 `(pointer: coarse) === true`** —— 只判断前者会让
   整套触控样式静默失效（首版实测 `small=16`），必须用「或」。
2. **启动竞态是真实回归**：用 `.cb-app` 的 `clientWidth` 分档会读到首帧中间值把右栏误收起，
   且之后不会自动弹回。改用 `documentElement.clientWidth` + 两次同档确认。
3. **模拟器无法改朝向**，窄档改用 ArkUI 侧 `.width('1000vp')` 得到真实视口变化来测。
4. 命中区收敛 16 → 12 → 5 → 0；画布内被 React Flow 缩放的控件单列 `canvasMarks`，不计入。

### 已知遗留

- 触控放大后「主题·默认」按钮在 1440 被左边缘裁掉：`.cb-topbar__io` 用 `justify-content: flex-end`，
  内容向左溢出而 `scrollWidth` 不统计左侧溢出，既有溢出算法因此不把按钮收进「⋯」。
  修法＝把 撤销/重做/主题/背景/搜索 并入 `actions` 列表，排 H2/H3。
- 见 `docs/H1-TABLET.md` §6 与 `docs/H0-ACCEPTANCE.md` §7。

## H0 · 环境与骨架验收通过（2026-10-21）

**目标**：在这台机器上把桌面「案情板 CaseBoard」的前端跑进鸿蒙 ArkWeb，并证明
SQLite / 文件 / 桥三条通路可用。八条验收标准全部 PASS，一条命令可复现。

### 新增

- **鸿蒙工程骨架**（Stage 模型，API 26）：`AppScope/`、`entry/`、`build-profile.json5`、
  `hvigorfile.ts`、`oh-package.json5`。bundleName `com.caseboard.harmony`，
  deviceTypes `tablet / 2in1 / phone`，**未申请 `ohos.permission.INTERNET`**（本地优先）。
- **自定义 scheme 加载器** `entry/src/main/ets/bridge/RawfileScheme.ets`：
  `caseboard://rawfile/*` → `$rawfile`，响应头自带 `Access-Control-Allow-Origin: *`。
  替代不可用的 `resource://`（opaque origin 会打死 ESM 与 Worker）。
- **原生桥** `entry/src/main/ets/bridge/CaseBoardBridge.ets`：25 个方法，全部注册进
  `asyncMethodList`，**统一「参数末位收 JS 回调 + `{"ok",…}` 信封」契约**。
- **六个原生 service**：`Platform / Db / File / Clipboard / Ocr / Image`。
  - `DbService` 内置桌面版 `V1_SQL`（9 表 + 4 索引）与 `FTS5_SQL`，**FTS5 实测可用**。
  - `OcrService` 走 `@hms.ai.ocr.textRecognition`（Core Vision Kit），`canIUse` 守卫，
    彻底放弃 Tesseract（省 16MB，`public/ocr/` 不进包）。
- **前端镜像工程** `web/`：桌面 `src/` 的副本 + 三缝改造；桌面仓库零改动。
  - `vite.config.ts`：`base:'./'`、`outDir` 直指 `rawfile`。
  - `scripts/postbuild-rawfile.mjs`：断言相对路径、**剥掉 `crossorigin`**、输出 JSON 报告。
  - `src/services/harmony.ts`：唯一的桥客户端，把回调式原生调用包回 Promise。
  - `src/services/db/harmony.ts`、以及 `platform.ts` / `file.ts` / `ocr.ts` 的三路分发改造。
- **验收脚本**：`scripts/build-web.ps1`、`scripts/accept-h0.ps1`（A1–A4 / B1–B4 → JSON）。
- **文档** `docs/H0-ACCEPTANCE.md`：环境矩阵、桥契约、踩坑清单、遗留项。

### 拆除

- `web/src/services/ocrBuiltin.ts`（唯一依赖 `tesseract.js` 的文件）。
- `web/` 的 `tesseract.js` 与 `@tesseract.js-data/*` 依赖。

### 关键结论

1. **ArkWeb `asyncMethodList` 不返回 ArkTS 的返回值**：页面调用得到 `0`（受理码），
   结果只能通过**页面传入的回调**回传。这条推翻了"用 `Promise<string>` 直接回传"的最初设计。
2. **`resource://` 装不下 Vite 产物**：opaque origin 下 ESM/CORS 直接被拒，必须自定义 scheme。
3. **未签名 HAP 可直接安装**到模拟器，签名不再是阻塞项。
4. **`relationalStore` 支持 FTS5**，桌面版全文检索链无需降级。

### 已知遗留

见 `docs/H0-ACCEPTANCE.md` §7：平板形态适配、`2in1` metaViewport、剪贴板读权限、
`targetSdkVersion` 告警、`web/` 与桌面 `src/` 的同步策略。
