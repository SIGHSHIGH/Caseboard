# 变更记录 · 鸿蒙移植

## H2.1 · 侧栏开关改圆形按钮 + 桌面版回填（2026-10-21）

### 鸿蒙侧

- **`web/src/styles/responsive.css`**：`.cb-collapse` 从「两栏之间 16px 竖向折叠条（触控 36px）」
  改成浮在窗口左右下角的 **44×44 圆形按钮**（`position: fixed; bottom: 12px`，左 `left: 12px` / 右 `right: 12px`，
  `z-index: 40` 压在抽屉与遮罩之上）。脱流之后画布宽度 **888 → 920**（1440 − 208 左栏 − 312 右栏），
  按钮本身也达到 44×44 的触控最小命中尺寸。
- **`web/src/index.css`**：`.cb-btn` 补 `flex-shrink: 0`（与桌面版同步，见下）。
- **`entry/src/main/ets/pages/Index.ets`**：探针新增 `[toggle]` 打点（`left`/`right` 坐标、`size`、`fixed`、`inner`、`canvas`）。
- **`scripts/accept-h1.ps1`**：新增 H1-18「侧栏开关为左右下角圆形按钮（44px、脱流、还回画布宽度）」，
  总检查数 17 → **18 条**。上机实测：`fixed=True size=44x44 leftX=12 rightGap=12 canvas=920`，**18/18 全 PASS**。
- `docs/H1-TABLET.md` 新增 §九记录这次改动与「为什么不是 16px 长条」的理由。

### 桌面侧（回填到 `main`，再 cherry-pick 回 `harmony`）

同一轮对抗审查在桌面版发现两处同源缺陷，已在 `main` 上修复并推送（提交 `774fa62`）：

1. `src/components/panels/TopBar.tsx`：预算扣除常驻元素（「⋯」按钮 + 保存状态文字）实测宽度；
   溢出判定补「首个子元素左边界是否越界」——`.cb-topbar__io` 是 `justify-content: flex-end`，
   溢出时内容往左跑，`scrollWidth` 只统计右侧，旧判定对它永远返回「没超」。
2. `src/index.css`：`.cb-btn` 补 `flex-shrink: 0`，顶栏挤不下时把按钮收进「⋯」菜单而不是压扁裁字。

桌面验收：`typecheck` 0 error、`smoke` 871 PASS、`ui-smoke` 430 PASS / 0 FAIL、`build` 成功。

## 仓库迁移 · 并入桌面仓库 `harmony` 分支（2026-10-21）

鸿蒙工程从独立仓库 `masaike board hamonyos/` 迁到主仓库 `platforms/harmony/`，
分支 `harmony`，H0–H2 的 4 个提交历史完整保留（`git read-tree --prefix` 嫁接，未改写任何提交）。

迁移后做「干净 clone 复原验证」，暴露并修掉 4 个只在换路径/换机器时才会出现的问题：

1. **脚本写死本机路径**（`D:\DevEco Studio`、某个 `pnpm.cjs` 绝对路径）→ 抽出 `scripts/_env.ps1`，
   优先级：显式参数 > 环境变量（`DEVECO_HOME` / `NODE_HOME` / `HDC` / `PNPM_CLI` / `PNPM_STORE_DIR`）
   > 常见安装位置 > `PATH`。换机器只需设一个 `DEVECO_HOME`。
2. **`$home` 是 Windows PowerShell 只读自动变量**。`_env.ps1` 第一版 `$home = ...` 会抛
   `Cannot overwrite variable HOME`，而 dot-source 的错误**不中断脚本**，只让后续路径全变 `$null`，
   症状是一连串 `BadExpression: The expression after '&' ... was not valid`（看着像语法错，其实是变量没赋上）。
   改名 `$devEcoRoot`。教训：改完 .ps1 必须真跑一遍验收，语法通过不算数。
3. **全新 clone 时 `web/.tmp` 不存在**，pnpm 内部的 tempy 要求 TMP 目录已存在，否则
   `ENOENT lstat '...\web\.tmp'` 直接打断构建 → `build-web.ps1` 先建目录再设 `TMP`。
4. **`postbuild-rawfile.mjs` 写报告前没建目录**，`.tmp-esbuild/` 被 `.gitignore` 忽略，
   全新 clone 里不存在 → `mkdirSync(recursive)` 后再写。

验证结果：把 `harmony` 分支 clone 到工作区外，`build-web.ps1` 从零装依赖 → 产物 14 文件 3.49MB、
`problems` 为空；`accept-h1.ps1 -SkipWeb` → **15/15 全 PASS**（H1-1/2/3 因跳过前端构建而不计）。
主工作区 `platforms/harmony` 下另跑完整 `accept-h1.ps1` → **17/17 全 PASS**。

新增 `platforms/harmony/README.md`（架构、三个必须知道的硬结论、构建验收、已知限制、与桌面版关系）。

## H2 · 顶栏收容（2026-10-21）

**目标**：修掉 H1 遗留的「主题·默认」在 1440 被左边缘裁切，让顶栏收容对**所有**动作统一生效。
验收脚本扩到 17 条，全 PASS。

### 修改

- **`web/src/components/panels/TopBar.tsx`**：
  - 新增 `staticWidth` 状态：用 `saveRef`（保存状态文字）与 `moreRef`（「⋯」按钮）实测常驻元素宽度，
    溢出预算从 `ioWidth` 改成 `ioWidth − staticWidth`。原来这两个元素吃宽度却不在
    `planTopbarOverflow` 的账本里，预算虚高约 190px。
  - 溢出判定增加「首个子元素左边界 < 容器左边界」：`.cb-topbar__io` 是 `justify-content: flex-end`，
    溢出往左跑，`scrollWidth` 只统计右侧溢出，旧判定对这种情况永远返回「没超」。
- **`web/src/styles/responsive.css`**：`≤1560px` 隐藏 `.cb-topbar__save`（「SQLite · 已保存 hh:mm」）。
  它是状态提示不是操作，右栏「案件概览 · 最后保存」有完整时间，保存成功也弹确认框；
  省下的 ~150px 让「AI 助手」回到顶栏。
- **`entry/src/main/ets/pages/Index.ets`**：探针新增 `[clip]`（onPageEnd 首帧）、`[clip2]`（2000ms 稳态）、
  `[more]`（点开「⋯」数条目）、`[moreclick]`/`[moreclick2]`（菜单里点「生图」验证真生效）。
- **`scripts/accept-h1.ps1`**：探针采集改为「等够 26s 一次抓齐」（旧版抓到了就返回，会漏掉后面的延时打点）；
  新增 H1-14…H1-17。

### 关键结论（对抗审查推翻了自己的假设）

1. **根因不是「五个手工控件绕开算法」**。`.cb-topbar__tools` 里只有撤销/重做两个图标按钮；
   主题/背景/搜索本来就在 `actions` 列表里。真正原因见上面两条：`flex-end` 造成的左侧溢出不可检测
   ＋常驻元素吃掉的宽度没进预算。
2. **收容是渐进收敛的**（每轮收一个），onPageEnd 首帧必然还能量到 5 个被裁的按钮。
   验收必须断言 `[clip2]`（2s）而不是 `[clip]`——否则会把正常收敛误判成回归。
3. 稳态实测：1440 `inline=9 / clipped=0`、「⋯」6 项；1000 `inline=5 / clipped=0`、「⋯」10 项。

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
