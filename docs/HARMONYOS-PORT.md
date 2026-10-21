# 案情板 CaseBoard · 鸿蒙移植：结构分析 / 可行性 / 需求流程 / 提示词

> ⚠️ **已作废（2026-10-21）· 正确结论见 [platforms/harmony/README.md](../platforms/harmony/README.md)**
>
> 本文是移植**立项阶段的侦察稿**，保留它是因为路线判断（ArkWeb 混合先行）、三处平台缝的定位、
> 里程碑切分这些主干结论经实践检验是对的，值得留存。
>
> 但**附录 §6 的「SDK 能力自查」有硬错误**：当时只搜了 `sdk/default/openharmony/ets/kits`（47 个 kit），
> 没搜 `sdk/default/hms/ets/kits`（56 个 kit），因此得出「本机 SDK 无 OCR、无 PDF」的结论，
> 并据此建议「OCR 用手工录入替代」。**实测相反**：hms 层有 `@kit.CoreVisionKit`（`@hms.ai.ocr.textRecognition`）
> 与 `@kit.PDFKit`（`@hms.officeservice.pdfservice`），phone/tablet/2in1 三类设备的 syscap 都同时含这两项。
> 实际实现已改用系统 Core Vision Kit 做 OCR、放弃打包 Tesseract（省 16MB）。
>
> 另一处偏差：文中把 `vite base` 未设列为头号硬伤——这条成立；但没预见到真正的拦路虎是
> **`resource://` 协议下 ESM 脚本被 CORS 拦死**，最终改用自定义 scheme `caseboard://` 才跑通。
> 上机踩过的 7 个坑见 `platforms/harmony/docs/H0-ACCEPTANCE.md` 与 `H1-TABLET.md`。

> 目标：把 Windows 桌面版案情板（Tauri 2 + React 18）移植到 **HarmonyOS NEXT（ArkTS/ArkUI）**。
> 本文是**移植立项文档**：先给实测结结构，再给可行性判断，再给里程碑，最后给可直接粘贴执行的提示词。
> 编写时点：`1.0.0-beta.1`（M1–M18 全部验收通过）。所有数字都在本机实测，不引用 CHANGELOG 的旧值。

---

## 0. 结论摘要（先看这 8 条）

1. **推荐路线：ArkWeb 混合先行（2–4 周出可侧载 Beta），再把画布逐步换成 ArkTS 原生自绘。** 不做「一次性全原生重写」。
2. 依据：本项目 **31,200 行 TS/TSX**，其中**纯逻辑层 15,012 行 = 48%**（types 388 + serializers 2,023 + commands 1,883 + store 1,321 + lib 7,565 + dsl 1,832）、**服务层 4,012 行 = 13%**、**界面层 10,809 行 = 35%**（另有 `index.css` 5,379 行）、演示数据 1,193 行 = 4%。纯逻辑里已经有 **三处干净的平台缝**：`SqlDriver`（`src/services/db/repo.ts:12`）、`platform.ts`（`src/services/platform.ts`）、`fileService`——这是混合路线工期短的根本原因。
3. **最大技术风险不在画布，在 DSL**：`src/dsl/parse.ts:18` 用的是 `@lezer/lr` 序列化解析器（`src/dsl/generated/caseboard.parser.ts` 里 `LRParser.deserialize(...)`），而 Gate 0-1 要求代码视图与画布共用同一份语法。ArkTS 侧必须重写 LR 驱动或改为手写递降解析器，并保证 DSL 往返一致。
4. **OCR 在鸿蒙上有两条路**：ArkWeb 里 `tesseract.js`（WASM）原样能跑（Chromium 内核）；纯 ArkTS 侧本机 SDK **没有** OCR 模块（见 §3.2 核验记录），要么引入 HMS Core「Core Vision Kit」，要么用 NDK 编译 tesseract 走 NAPI。这是路线选择的第一决定因素。
5. **数据层几乎零改造**：`relationalStore` 的 `getRdbStore / executeSql / querySql` 与 `tauri-plugin-sql` 的 `execute / select` 一一对应，`src-tauri/src/migrations.rs` 的 `V1_SQL` 可整段复用（含 FTS5 需真机验证，见 R5）。
6. **必须立刻做的一件小事**：`vite.config.ts` 现在没写 `base`，产物用绝对路径 `/assets/...`；ArkWeb 用 `$rawfile` 加载时必须是相对路径 → 移植分支里改 `base: './'`。
7. 交付物形态：**HAP（开发期真机侧载）→ APP 包（上架/分发）**；签名需要 `.p7b` 证书 + `.cer` + `.p7b profile`，与桌面版 NSIS 的签名是两套体系。
8. 工期基线（单人）：H0–H5 = **6–7 周**出可侧载 Beta；H6 原生画布 = 追加 **2–3 周**（可选）。

---

## 1. 项目数据结构分析

### 1.1 规模实测（本机 `wc -l`）

| 层 | 目录 | 文件数 | 行数 | 职责 | 是否含 DOM/React |
| --- | --- | --- | --- | --- | --- |
| 模型 | `src/types/` | 1 | 388 | `CaseDoc` 及其全部实体 | 否 |
| 持久化映射 | `src/serializers/` | 9 | 2,023 | JSON 导入导出、`migrate.ts` 版本归一 | 否 |
| 写入口 | `src/commands/` | 19 | 1,883 | Command 工厂 + `composeCommands` | 否 |
| 状态 | `src/store/` | 15 | 1,321 | Zustand 14 个 store + `persist.ts`（400 ms 防抖落库） | 否（zustand） |
| 纯逻辑 | `src/lib/` | 41 | 7,565 | 布局/边几何/证据链/时间线/OCR 解析/自检… | 极少（10 处 `document.`、6 处 `window.`） |
| DSL | `src/dsl/` | 7 | 1,832 | Lezer 语法 + 序列化 + diff + 定位 | 否（lezer） |
| 副作用 | `src/services/` | 22 | 4,012 | 文件/图片/PDF/视频/OCR/AI/DB/导平台 | **是** |
| 界面 | `src/components/` | 40 | 10,809 | 26 面板 + 7 画布 + 3 视图 + 3 代码视图 + 2 hook | **是** |
| 演示数据 | `src/data/` | 4 | 1,193 | 两个示范案卷 | 否 |
| 样式 | `src/index.css` | 1 | 5,379 | 设计令牌 + 全部组件样式 | CSS |
| **合计** | `src/` | **163**（123 `.ts` + 40 `.tsx`） | **31,200** | | |

原生侧：`src-tauri/` 仅 **545 行 Rust**（`lib.rs` 422 / `migrations.rs` 117 / `main.rs` 6），共 **16 个 `#[tauri::command]`**：

```
ensure_db_file · app_info · open_data_dir · read_file_base64 · write_file_base64
save_asset_base64 · read_asset_base64 · asset_file_path · save_thumb_base64
read_thumb_base64 · remove_asset · hash_file · debug_log · ocr_available
ocr_image · selftest_report
```

运行时依赖 24 个（`package.json`），按移植难度分成三组：

| 组 | 包 | 移植判断 |
| --- | --- | --- |
| 纯逻辑，可移植/可替代 | `immer` `zustand` `dagre` `d3-force` `graphology` `fflate` `pdf-lib` | 需按 ArkTS 语法重写或改写实现（immer/zustand 各约 150 行适配） |
| 渲染框架，不可移植 | `react` `react-dom` `@xyflow/react` + 7 个 `@codemirror/*` + 4 个 `@lezer/*` | 必须换 ArkUI / 自绘 |
| 平台能力，换实现 | `@tauri-apps/*`（api/dialog/fs/sql）`tesseract.js` `pdfjs-dist` | 阿里 `relationalStore` / `picker` / `fs` / Core Vision Kit 或 WASM |

### 1.2 依赖方向（单向，无环）

```
types ──► lib ──► serializers ──► commands ──► store ──► components
  │                    │             │           │           │
  └────────── dsl ◄────┘             │           │           │
                                     └──► services (副作用) ◄┘（只经 platform/fileService 缝）
```

**关键收益**：`components` 只通过 `store` 的 `dispatch(command)` 写数据，因此**重写界面不需要重写任何业务规则**。这条约束（Gate 0-2）在移植里直接省掉一半工作量。

### 1.3 数据模型：一份 `CaseDoc`（`src/types/index.ts:364`）

31 个导出类型/接口，顶层 12 个字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `meta` | `{id,title,caseNo?,createdAt,updatedAt}` | 案件头 |
| `nodes` | `CaseNode[]`（20 字段） | 9 类节点：person/org/place/item/event/evidence/time/note/relation |
| `edges` | `CaseEdge[]`（23 字段） | 线型即语义 + `sourceHandle/targetHandle`（8 锚点）+ `thickness` + `autoAnchor/curvature` |
| `groups` | `Group[]`（7 字段） | 可嵌套（`parentId`）、可折叠 |
| `assets` | `Asset[]`（23 字段） | 素材 + 标注 `Annotation[]` + EXIF + `zone:'evidence'\|'ai'` |
| `imageNodes` | `ImageNode[]`（15 字段） | 自由图片 + 吸附（`dockCorner/dockOffset`）+ 圆点模式 |
| `assetFolders?` | `AssetFolder[]` | 素材文件夹（扁平 + `parentId`） |
| `timeline?` | `TimelineConfig` | 多轨（`TimelineTrack[]`）+ `prefs{spanRatio}` |
| `views` | `View[]` | 6 类视图（board/timeline/map/chain/presentation/scenario） |
| `hypotheses` | `Hypothesis[]` | 平行假设，立场表 `stances[]` |
| `chains?` | `ChainDef[]` | 自定义证据链（六阶段 × 条目） |
| `settings` | `Settings` | 主题、线型图例、`mapBackground`、`canvas`(paper/cork/chalk) |

**移植必须逐字段无损的三条**（都已有 smoke 断言守着）：
- `Annotation.geom` 是**归一化坐标**（0–1），换任何像素尺寸都要对齐（`src/types/index.ts:114`）；
- `CaseEdge.autoAnchor === false` 才表示「用户钉住锚点」，`undefined` 等于「可被自动梳理改写」；
- `migrate.ts` 是**唯一**旧数据入口，鸿蒙端旧数据来自桌面版 `.caseboard` 文件，必须走同一个 `normalizeDoc`。

### 1.4 平台耦合点清单（移植清单的「必须处理」项）

| 耦合点 | 位置 | 鸿蒙替代 |
| --- | --- | --- |
| `invoke()` 16 个原生命令 | 前端 3 处直调（`src/services/platform.ts:23,78,143`），其余经 `services/` 封装 | ArkWeb：`registerJavaScriptProxy` / ArkTS：直接调用 SDK |
| SQLite 连接 | `src/services/db/tauri.ts`（`Database.load('sqlite:'+path)`） | `relationalStore.getRdbStore(context, config: StoreConfig)` |
| 文件读写 | `src/services/file.ts`、`platform.ts` | `@ohos.file.fs`（sandbox `context.filesDir`） |
| 选择器 | `@tauri-apps/plugin-dialog` | `DocumentViewPicker` / `photoAccessHelper.PhotoViewPicker` |
| 图片 URL | `platform.ts:147 assetFileUrl()` → `convertFileSrc` | ArkWeb：自定义 scheme 或 base64 注入；ArkTS：`PixelMap` |
| OCR | `src/services/ocr.ts` 两级（system tesseract → bundled tesseract.js） | 见 §3.2（WASM / Core Vision Kit / NAPI） |
| PDF 抽页 | `src/services/pdf.ts`（`pdfjs-dist` + worker） | 无自带 PDF 渲染；需 PDF Kit 或自绘 |
| 视频抽帧 | `src/services/video.ts`（`<video>` + canvas） | `AVMetadataExtractor.fetchFrameByTime()` → `PixelMap` |
| 导出 PNG/SVG/PDF/Word | `src/services/exporters.ts`（canvas + pdf-lib + fflate） | PNG：ArkUI Canvas → `image.createImagePacker()`；SVG/DOCX：纯字符串，可直接搬 |
| 剪贴板 | `navigator.clipboard` / 插件 | `@ohos.pasteboard` |
| Web Worker | `src/workers/imageWorker.ts`、`pdfjs` worker | `@ohos.worker` 或 `taskpool.execute()` |
| 自定义字体/主题 | `src/index.css` + `src/lib/theme.ts` | ArkUI `$r('app.color.*')` + 主题令牌 |

---

## 2. 可移植性分级（决定「先做什么」）

| 级别 | 含义 | 范围 | 行数 | 占比 | 处置 |
| --- | --- | --- | --- | --- | --- |
| **A** | 逻辑可原样搬（仅语法/类型适配） | `types` `serializers` `commands` `lib`（除 16 处 DOM） `store` | ≈ 13,180 | 42% | 逐文件改 ArkTS 语法：禁 `any`、禁动态属性、`Record` 改显式接口、`structuredClone`→手写深拷贝；`zustand`/`immer` 换成约 150 行的自写实现 |
| **B** | 需换实现但接口不变 | `services`（DB/文件/OCR/导出） + `dsl`（Lezer） | ≈ 5,844 | 19% | 保接口、换内核；`SqlDriver`/`fileService`/`platform` 三缝先落 |
| **C** | 必须重写 | `components` 40 个 + `index.css` 5,379 行 + `workers` + `data` 演示件 | ≈ 12,000 | 38% | ArkUI 组件树 + 自绘画布（或 ArkWeb 全量承载，见 §3.1 B 路线） |

> 结论：**A+B 先行（逻辑内核移植）在两条路线上都要做，且只占 61%**；C 是路线分歧点。

---

## 3. 可行性分析

### 3.1 三条路线对比

| 维度 | **A. ArkTS 原生重写** | **B. ArkWeb 混合（推荐首期）** | **C. 渐进式（B → A）** |
| --- | --- | --- | --- |
| 前端复用率 | 0%（界面全重写） | **≈ 100%**（现有 `dist/` 直接装进 `$rawfile`） | 从 100% 起，逐视图替换 |
| 逻辑复用率 | 需 A+B 层适配（≈ 61%），其中 `zustand`/`immer` 运行时需替换 | 同左，但可先跑起来再还债 | 同左 |
| 画布性能 | 原生自绘，千节点可控 | WebView 内 Chromium，千节点可跑，手势延迟略高 | 先 B，后把画布换原生 |
| OCR | 需 Core Vision Kit 或 NAPI tesseract | **`tesseract.js` 原样可用**（WASM） | 首期靠 B |
| PDF 抽页 / 导出 PDF | 需换实现（无 pdf 模块） | `pdfjs-dist` + `pdf-lib` **原样可用** | 首期靠 B |
| 拆包与主题 | 原生设计令牌，体验最好 | WebView 内 CSS，与桌面 1:1 | 逐步统一 |
| 工期（单人） | 8–12 周 | **2–4 周** | 4–8 周 |
| 主要风险 | DSL/导出/画布全要重写 | WebView 文件桥、手势、内嵌资源路径 | 两套并存期的一致性 |
| 适用形态 | 长期主力（平板/大屏） | 快速验证 + 侧载分发 | 现实最优 |

**推荐**：先 B（验证产品在鸿蒙上成立）→ 数据/素材/导出稳住后，按真实性能数据决定是否把画布迁到 A（H6）。

### 3.2 能力映射表（**已按本机 SDK 核验**，API 26）

| 桌面版能力 | 鸿蒙 API（本机 SDK 实测签名） | 结论 |
| --- | --- | --- |
| SQLite | `relationalStore.getRdbStore(context, config): Promise<RdbStore>`（`@ohos.data.relationalStore.d.ts:7497`）；`RdbStore.executeSql(sql, bindArgs?): Promise<void>`（`:5218`）；`querySql(sql, bindArgs?): Promise<ResultSet>`（`:4820`） | ✅ 一一对应，`V1_SQL` 可整段复用 |
| 嵌入网页 | `WebviewController.loadUrl(url, headers?)`（`@ohos.web.webview.d.ts:3021`）；`registerJavaScriptProxy(jsObject, name, methodList, asyncMethodList?, permission?)`（`:3280`）；`runJavaScript(script): Promise<string>`（`:3384`） | ✅ 混合路线地基 |
| 文件选择 | `filePicker.DocumentViewPicker.select(option?): Promise<Array<string>>`（`@ohos.file.picker.d.ts:679`） | ✅ |
| 相册选择 | `PhotoViewPicker` 已被标注 **deprecated**，`@useinstead @ohos.file.photoAccessHelper:photoAccessHelper.PhotoViewPicker#select`（`@ohos.file.picker.d.ts:176,216`） | ⚠️ 用新接口 |
| PNG/JPEG 编码 | `image.createImagePacker()`（`@ohos.multimedia.image.d.ts:4374`）+ `packToData(source, options): Promise<ArrayBuffer>`（`:12854`） | ✅ 替代 canvas `toBlob` |
| 视频抽帧 | `AVMetadataExtractor.fetchFrameByTime(timeUs, options, param): Promise<image.PixelMap>`（`@ohos.multimedia.media.d.ts:1219`） | ✅ 替代 `<video>`+canvas |
| 剪贴板 | `pasteboard.createData(mimeType, value)`（`:163`）+ `setDataSync/getDataSync`（`:1434/:1307`） | ✅ |
| 并发任务 | `taskpool.execute(func, ...args): Promise<R>`（`@ohos.taskpool.d.ts:841`） | ✅ 替代 Web Worker |
| **文字识别（OCR）** | 本机 OpenHarmony SDK `modules` 检索 `ocr` → **0 条**；`@hms` → **0 条**；`pdf` → **0 条** | ❌ 需决策，见 R3 |
| 端侧推理（可选） | `@ohos.ai.mindSporeLite` 存在 | 🟡 自训 OCR 模型时的兜底 |
| PDF 生成/渲染 | 本机 SDK 无 `pdf` 模块 | ❌ 需 PDF Kit 或改导出策略，见 R4 |

### 3.3 风险登记册

| # | 风险 | 影响 | 概率 | 处置 |
| --- | --- | --- | --- | --- |
| R1 | `$rawfile` 内资源用绝对路径 `/assets/*` 取不到 | 首屏白屏 | 高 | 移植分支 `vite.base = './'`；`index.html` 的 `script src` 同步改相对 |
| R2 | ArkWeb 里 `convertFileSrc` 无对应物，素材图全裂 | 素材库/画布图片不显示 | 高 | 桥接 `readAssetBase64`，前端 `assetUrl` 改为 `data:` 或自定义 scheme + `onInterceptRequest` |
| R3 | 纯 ArkTS 无 OCR | 桌面版核心链路（素材 OCR→字段抽取）断裂 | 高 | 首期走 B 路线（WASM）；若必须原生，优先申请 HMS Core Vision Kit，回落 NAPI tesseract |
| R4 | 无 PDF 渲染/生成 | 「PDF 抽图」与「导出 PDF」两项失效 | 高 | 导出侧先降级为 PNG/SVG/DOCX；PDF 抽页等 PDF Kit 或改「先拍平再导入」 |
| R5 | FTS5 在 `relationalStore` 上不保证可用 | 全文检索退化为 `LIKE` | 中 | H1 真机跑一次 `CREATE VIRTUAL TABLE ... USING fts5`，失败则 `repo` 切 `LIKE` 分支（保持接口） |
| R6 | Lezer 序列化解析器不可移植 | DSL 代码视图解析失败/两套语法 | 中 | 保 `CaseDoc` 往返断言（smoke 已有），把 `parse.ts` 换成手写递降 + 同语法表 |
| R7 | 手势差异（桌面 hover/右键 → 触控长按/双指） | 交互别扭 | 中 | H4 专项：长按=右键菜单、双指=画布缩放、单指拖=平移（空格键语义改为按钮） |
| R8 | ArkTS 严格语法（禁 `any`、禁动态属性） | A 级代码需大改 | 中 | 先跑 `arkts_check`，按文件批量改；`Record<string, …>` → 显式接口 |
| R9 | 侧载签名与上架审核 | 无法分发 | 低 | 走 debug 证书侧载验证；上架需 `.p7b`+profile，与 NSIS 签名无关 |
| R10 | 两套实现漂移（桌面/鸿蒙） | 同一案件两端显示不一致 | 中 | 以 `.caseboard` 文件为一致性契约，互导用例进 CI（在鸿蒙侧用 hypium 复跑同一批断言） |

### 3.4 可行性结论

- **技术可行（推荐 B 路线先行）**：数据层、文件、导出 PNG/SVG/DOCX、OCR（WASM）都有明确落点。
- **不可直接复用**：React Flow、CodeMirror、`pdfjs-dist` 的 Worker 链路（WebView 内可用，原生侧不可用）。
- **必须做决策的两个点**：① OCR 用 WASM（留在 WebView）还是 HMS Core Vision Kit；② DSL 代码视图是否原生重做。
- **建议的验收锚点**：同一份 `.caseboard` 文件在桌面版与鸿蒙版打开后，**节点/关系/标注数量、坐标、线型、置信度逐字段一致**——这条就是移植期的 Gate 0-1 等价物。

---

## 4. 需求流程（H0–H6）

### 4.1 里程碑表

| # | 里程碑 | 范围 | 交付物 | 验收标准（可机器校验） | 工期 |
| --- | --- | --- | --- | --- | --- |
| **H0** | 地基 | 新建 DevEco 工程（Stage 模型）、确定 `compatibleSdkVersion`、`$rawfile` 承载现有 `dist/` | 能在真机/模拟器打开「只有界面、没有数据」的壳 | 首屏渲染出顶栏与画布，控制台 0 error；`vite.base='./'` 生效 | 3 天 |
| **H1** | 数据层 | `relationalStore` 建库（复用 `V1_SQL`）、实现 `SqlDriver` 的鸿蒙版、`normalizeDoc` 接入 | 打开桌面版导出的 `.caseboard` 后画布完整 | 节点/关系/组/素材/标注数量与坐标逐字段一致（脚本比对）；FTS5 探测有结论 | 5 天 |
| **H2** | 素材与文件 | 沙箱目录、`DocumentViewPicker`/`photoAccessHelper` 导入、两级缩略图、素材图 URL 桥 | 能导入图片并在画布显示 | 导入 50 张不崩、缩略图与桌面版同规（256/1024 两档）、`Asset.hash` 一致 | 5 天 |
| **H3** | 系统能力 | OCR（tesseract.js in WebView 或 Core Vision）、剪贴板、文件分享/打开关联、导出 PNG/SVG | 截图 OCR 出文字并进「待确认」 | OCR 同一张图与桌面版文本相似度 ≥ 90%；导出 PNG 像素尺寸一致 | 5 天 |
| **H4** | 触控与布局适配 | 长按菜单、双指缩放、安全区、折叠屏/平板横竖屏、外接键盘鼠标 | 平板单手可完成「新建节点→连线→改属性」 | 交互清单 20 条逐条通过；无控件被系统栏遮挡（对照桌面版 M15 的顶栏折叠逻辑） | 7 天 |
| **H5** | 验收与打包 | hypium 单测（移植 A 级断言）、真机清单、签名与 HAP/APP 打包 | 可侧载的 HAP + 安装说明 | 单测覆盖 A 级模块 ≥ 60%；真机清单全绿；HAP 安装后冷启动 ≤ 3 s | 5 天 |
| **H6** | 原生画布（可选） | XComponent/Canvas 自绘节点与边（含 8 锚点、曲率、吸附、层级） | 可切换的原生画布 | 与 WebView 画布同屏对比无功能差；1000 节点拖拽 ≥ 30 fps | 10–15 天 |

**总计：H0–H5 ≈ 6–7 周；含 H6 ≈ 9–10 周。**

### 4.2 每步的「不可省」动作

1. **先量后改**：每个里程碑结束跑一次「桌面版导出的用例文件 → 鸿蒙打开 → 字段比对脚本」，这是唯一能防两套实现漂移的手段。
2. **逻辑下沉纪律照搬**：可断言的逻辑必须放在能被单测直接 import 的目录（桌面版的 `src/lib/`，鸿蒙侧对应 `entry/src/main/ets/core/lib/`），不许写在 `.ets` 页面里。
3. **Gate 0 八条在鸿蒙上逐条落地**：线型即语义、AI 只进待确认、AI 图角标写进像素、全中文、证据红 `#C0392B`、本地优先离线可用、坐标只走 `coords.ts`、单一数据源 + Command 写入口。
4. **不做「顺手优化」**：移植期只允许等价实现，行为变更一律另立里程碑。

### 4.3 鸿蒙侧验收方式

- **单测**：`hypium`（`@ohos/hypium`，Apache-2.0，Gitee `testfwk_arkxtest`）+ `hamock` 做依赖替换；把桌面版 smoke 的 A 级断言（几何/布局/迁移/DSL 往返）改写成 `.test.ets`。
- **静态检查**：`arkts_check`（strict）+ `hms_lint check`，门禁 0 error。
- **UI 冒烟**：桌面版靠 jsdom 伪布局；鸿蒙侧用 `@ohos.UiTest`（uitest）在真机上跑关键路径，或人工清单 + 录屏。
- **性能**：1000 节点加载、拖拽、缩放三档记录基线（桌面版 bench 参考值 75 ms 仅作 DSL 解析对比）。

---

## 5. 提示词（可直接粘贴）

> 用法：先把 §5.1 粘给一个**空白会话**的代理，让它只做 H0 的地基与方案确认；确认后再用 §5.2 模板逐里程碑推进；收尾用 §5.3。

### 5.1 开工提示词（P-H0，整段复制）

```text
你是「案情板 CaseBoard」鸿蒙移植项目的共同开发者。请先不要写代码，只做三件事：确认方案、确认环境、给出 H0 的开工计划。

【项目事实（已实测，不要自行推测）】
- 现状：桌面版为 Tauri 2 + React 18 + TypeScript(strict) + React Flow + SQLite(tauri-plugin-sql)，版本 1.0.0-beta.1，M1–M18 全部验收通过。
- 规模：src/ 共 163 个 .ts/.tsx（31,200 行）；其中纯逻辑层 types/serializers/commands/lib/store/dsl ≈ 15,000 行，界面层 components 40 个文件 10,809 行，style src/index.css 5,379 行；Rust 侧仅 545 行、16 个 tauri 命令。
- 三处平台缝（这是移植的最重要资产，改造必须从这里下手，不许绕开）：
  1) src/services/db/repo.ts:12 的 SqlDriver 接口（execute/select）
  2) src/services/platform.ts（文件/资源/日志/self-test 全部经此）
  3) src/services/fileService（保存与选择器）
- 数据唯一来源：src/types/index.ts:364 的 CaseDoc；一切写入必须经 dispatch(Command)，组件不许直接改文档。
- 已知硬伤（移植时必须处理）：
  a) vite.config.ts 未设 base，产物是绝对路径 /assets/*，ArkWeb 用 $rawfile 加载会白屏 → 必须改 base: './'
  b) src/dsl/parse.ts:18 依赖 @lezer/lr 的 LRParser.deserialize（src/dsl/generated/caseboard.parser.ts），ArkTS 侧不可直接使用
  c) 图片 URL 走 platform.ts:147 的 convertFileSrc（Tauri 专有）
  d) 本机 OpenHarmony SDK(API 26) 无 OCR / PDF 模块（已核验），OCR 与 PDF 需要决策

【已定路线（除非你有强反对理由，按此执行）】
ArkWeb 混合先行：现有前端整体装进 $rawfile，由 ArkTS 侧提供 SQLite / 文件 / 选择器 / 剪贴板 / 导出 / OCR 能力，通过 registerJavaScriptProxy 暴露给前端；前端只替换 src/services 下的三个平台缝实现。原生画布（H6）留到性能数据出来后再决定。

【硬约束（Gate 0 的鸿蒙等价物，一条都不许破）】
1 单一数据源：画布、代码视图、导出、分析全部从同一份 CaseDoc 派生，不许出现第二份文档。
2 写入只走 Command：改文档 → 压 undo 栈 → 持久化 → 广播；页面里不许 setState 改 doc。
3 线型即语义：实线=已证实 / 虚线=推测 / 点线=待核实，不提供绕过开关。
4 AI 产出只进「待确认」队列，推断关系必须虚线/点线 + 低置信度。
5 AI 生成图必须有「AI 生成 · 模拟图」角标且写入像素、不可关闭。
6 全中文界面；主色中性深灰 + 证据红 #C0392B；不许用任何 UI 库默认紫蓝主题。
7 本地优先：默认离线可用，云能力需显式配置 + 二次确认。
8 坐标换算只走一个 coords 模块，禁止各组件自算。

【技术栈（锁定，不得擅自更换）】
ArkTS + ArkUI(Stage 模型) · @ohos.data.relationalStore · @ohos.file.fs / picker · @ohos.multimedia.image · @ohos.web.webview · @ohos.pasteboard · @ohos.taskpool · hypium(测试)。

【本轮只做 H0，交付这四项】
1. 环境确认：DevEco Studio 版本、SDK 版本、目标 compatibleSdkVersion（本机 SDK 为 API 26）、是否有真机/模拟器。三处不一致时明确指出并给建议。
2. 方案确认书：给出 ArkWeb 承载方案的最小骨架（Web 组件加载 $rawfile 的相对路径写法、registerJavaScriptProxy 的方法清单、前端三个缝的替换点），以及你对「OCR 用 WASM 还是 Core Vision Kit」「DSL 是否原生重做」的建议与理由。
3. H0 验收标准（可机器校验）：列出 5–8 条，例如「首屏渲染出顶栏与画布」「控制台 0 error」「vite base 已改相对路径」。
4. 风险补充：指出我上面风险清单里你不同意或遗漏的条目。

不要写业务代码，不要改桌面版仓库。等我确认后再进入 H1。
```

### 5.2 里程碑执行提示词模板（P-Hx，按需填方括号）

```text
继续「案情板 CaseBoard」鸿蒙移植，本轮里程碑 = H[n] [里程碑名]。

【上轮已交付】[一句话：现在能做什么、数字是多少]
【本轮范围】[3–5 条，写清做什么、不做什么]
【验收标准（可机器校验）】
1. [例如：打开桌面版导出的 cases/demo-01.caseboard 后，节点 23 / 关系 21 / 组 3 与桌面版一致]
2. [例如：arkts_check 0 error；hms_lint 0 error]
3. [例如：hypium 单测 N 条全绿，覆盖 [模块列表]]
【纪律】沿用 Gate 0 八条；逻辑必须放在可单测的目录，不许写进 .ets 页面；只做等价实现，不做顺手优化。
【交付】改动清单（文件:行）→ 验收数字 → 风险与未自动验证项 → 下一轮建议。
```

### 5.3 验收提示词（P-H7）

```text
对「案情板 CaseBoard」鸿蒙版做一次完整验收，以桌面版 1.0.0-beta.1 为基准。

【一致性（最重要）】把桌面版导出的 3 份 .caseboard（演示案卷 + ABC 谋杀案 + 一份含 500 张素材的压测件）在鸿蒙版逐个打开，逐字段比对：节点数/关系数/组/素材/标注/坐标/线型/置信度/autoAnchor/curvature。任何一项不一致即判失败，并给出差异清单。
【功能清单】按视图逐条核对：画布（新建/连线/8 锚点/吸附/层级/圈选/双击新建）、代码视图（DSL 解析、往返一致、诊断定位）、时间线（多轨/缩放/播放/公用指针）、演示（联动编辑）、地图（坐标点选/底图/图钉拖动）、假设面板（证据链/阶段）、AI（待确认队列/AI 图角标）、导出（PNG/SVG/PDF/DOCX）、素材（导入/文件夹/OCR）。
【门禁】arkts_check 0 error、hms_lint 0 error、hypium 全绿、真机清单全绿、冷启动 ≤ 3 s、1000 节点拖拽 ≥ 30 fps。
【汇报格式】改了什么 / 涉及文件 / 验收数字（逐项，不许抄旧值）/ 回归风险 / 未自动验证项 / 未做与待办。
```

---

## 6. 附录：本机核验记录

| 项 | 结果 | 来源 |
| --- | --- | --- |
| 本机 OpenHarmony SDK 版本 | API 26 | `hms_api modules`（sdkApiVersion 26） |
| SDK 路径 | `D:\DevEco Studio\sdk\default\openharmony\ets\api` | `hms_api lookup` 返回的 `file` 字段 |
| OCR 相关模块 | 检索 `ocr` = 0 条 | `hms_api modules filter=ocr` |
| HMS 模块 | 检索 `@hms` = 0 条（本机为 OpenHarmony SDK，非 HMS Core SDK） | `hms_api modules filter=@hms` |
| PDF 模块 | 检索 `pdf` = 0 条 | `hms_api modules filter=pdf` |
| `relationalStore` | `getRdbStore`/`executeSql`/`querySql` 均在（含 7497/5218/4820 行） | `@ohos.data.relationalStore.d.ts` |
| `webview` | `loadUrl`/`registerJavaScriptProxy`/`runJavaScript` 均在（3021/3280/3384 行） | `@ohos.web.webview.d.ts` |
| `picker` | `DocumentViewPicker.select`（679 行）；`PhotoViewPicker` 已废弃（176/216 行） | `@ohos.file.picker.d.ts` |
| `image` | `createImagePacker`(4374) + `packToData`(12854) | `@ohos.multimedia.image.d.ts` |
| `media` | `AVMetadataExtractor.fetchFrameByTime`(1219) | `@ohos.multimedia.media.d.ts` |
| `pasteboard` / `taskpool` | `createData`(163)/`setDataSync`(1434)；`taskpool.execute`(841) | 各自 `.d.ts` |
| 目标 API 版本纪律 | 三处（工程 `compatibleSdkVersion` / 设备 `param get const.ohos.apiversion` / SDK apiVersion）不一致时必须显式提示，并用 `hms_api_change diff` 查差异 | `harmonyos-knowledge` 技能纪律 |

> 注：`@hms.*`（Core Vision Kit / PDF Kit 等）属 HMS Core SDK，本机未安装；采用前须先确认目标设备的系统版本与 SDK 可用性，再决定是否作为依赖。
