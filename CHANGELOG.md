# 变更记录 · 鸿蒙移植

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
