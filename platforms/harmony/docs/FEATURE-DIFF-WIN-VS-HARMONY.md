# 功能差分：Windows 版 ↔ 鸿蒙版

> 生成时间：2026-10-22 · 对比对象：仓库根 `src/`（Windows / Tauri 桌面版）与 `platforms/harmony/web/src/`（鸿蒙 ArkWeb 版）
> 用途：筛选「鸿蒙版独有特性回填到 Windows 版」的候选清单。

## 0. 一句话结论

两套前端**同源**、文件集合几乎完全一致（桌面 164 个源文件 / 鸿蒙 175 个），**没有任何桌面功能在鸿蒙版缺失**；
差异集中在两类：

1. **鸿蒙版独有的 H5 交互改造**（触屏/长按/集中钉子/应用内弹窗/层级控件……）——这是回填候选；
2. **桌面独有的内置 OCR 内核**（`services/ocrBuiltin.ts` + `public/ocr` 16MB Tesseract）——鸿蒙版只能用系统 OCR。

## 1. 文件集合对比

| 项 | 桌面 `src/` | 鸿蒙 `platforms/harmony/web/src/` |
| --- | --- | --- |
| 源文件数（ts/tsx/css） | 164 | 175 |
| 只在桌面存在 | `services/ocrBuiltin.ts` | — |
| 只在鸿蒙存在 | — | `commands/pinLinkCommands.ts`、`components/OrientationGate.tsx`、`components/flow/AssetDragGhost.tsx`、`components/flow/PinLinkLayer.tsx`、`components/panels/GroupPickDialog.tsx`、`components/panels/NodePickerDialog.tsx`、`components/panels/SystemDialogs.tsx`、`lib/clusterPin.ts`、`lib/viewport.ts`、`services/db/harmony.ts`、`services/harmony.ts`、`styles/responsive.css` |

两边的视图（`MapView` / `TimelineView` / `PresentationView`）与绝大多数服务（`exporters` / `pdf` / `selftest` / `ai` / `watch` / `exif` / `video` / `annotate`）**文件与实现基本相同**——导出 PNG/SVG/PDF/Word、导入 JSON、AI 抽取、AI 生图、分析、地图、时间线、演示在鸿蒙版都在。

## 2. 鸿蒙独有功能（回填 Windows 的候选）

| # | 功能 | 关键文件 | 桌面现状 | 回填建议 |
| --- | --- | --- | --- | --- |
| A1 | **集中钉子 + 钉集**（圆点钉、便签、钉集吸附、整集移动、绕钉旋转、相对位置滑块、钉集内层级） | `lib/clusterPin.ts`、`commands/imageNodeCommands.ts`、`components/flow/BaseNode.tsx`、`components/flow/FreeImageNode.tsx`、`components/panels/RightPanel.tsx` | 无 | ★★★ 强烈建议（纯前端逻辑，无平台依赖） |
| A2 | **红线**（长按钉子 → 创建红线 → 点另一颗钉子；直线、4px、不算关系线） | `types/index.ts`(`PinLink`)、`commands/pinLinkCommands.ts`、`components/flow/PinLinkLayer.tsx`、`Board.tsx` | 无 | ★★★ 随 A1 一起回填 |
| A3 | **长按多选卡片 + 「加入组框…」** | `store/uiStore.ts`(`multiSelect`)、`components/flow/BaseNode.tsx`、`components/panels/RightPanel.tsx`、`commands/groupCommands.ts`(`addNodesToGroup`) | 只有 React Flow 自带 `multiSelectionKeyCode`（需按住 Ctrl/⌘） | ★★★ 桌面也能用（Ctrl 之外多一条路径） |
| A4 | **组框挑节点**（组框表单与分组总览里的「＋ 选择实体加入…」多选对话框） | `components/panels/NodePickerDialog.tsx`、`GroupTree.tsx`、`RightPanel.tsx`、`commands/groupCommands.ts` | 无 | ★★★ 桌面同等受益 |
| A5 | **应用内确认框 + Toast**（替掉 `window.confirm/alert`） | `components/panels/SystemDialogs.tsx`、`uiStore`(`askConfirm`/`pushNotice`)、`TopBar/AiPanel/AiImagePanel/HistoryDialog/DemoDialog` | 仍用 12 处 `window.confirm/alert` | ★★★ 桌面 WebView2 同样会吞掉部分原生弹窗，建议回填 |
| A6 | **所有节点右栏统一层级控件**（置顶/上移/下移/置底） | `commands/nodeCommands.ts`(`setNodeLayer`)、`RightPanel.tsx` | 无（图片有层级，卡片没有） | ★★★ 桌面同等受益 |
| A7 | **触摸长按拖素材入画布 + 跟手影** | `components/panels/AssetLibrary.tsx`、`components/flow/AssetDragGhost.tsx`、`uiStore`(`assetDrag`) | 只有 HTML5 拖放（`draggable`） | ★★ 桌面鼠标优先，可只回填跟手影或用不到 |
| A8 | **触控分档 CSS**（`pointer: coarse` 下 44px 命中区、平板/窄档布局） | `styles/responsive.css` | 无 `styles/` 目录 | ★★ 桌面触屏机型也受益，但需回归桌面布局 |
| A9 | **横竖屏闸门**（`OrientationGate`） | `components/OrientationGate.tsx` | 无 | ★ 桌面无意义，不回填 |
| A10 | **viewport 工具与惯性平移参数化** | `lib/viewport.ts`、`Board.tsx` 惯性 | 桌面有惯性但阈值写死 | ★★ 可选 |

## 3. 桌面独有功能（鸿蒙缺失）

| # | 功能 | 桌面实现 | 鸿蒙现状 | 差距性质 |
| --- | --- | --- | --- | --- |
| B1 | **内置 OCR 内核**（Tesseract WASM + 中英文语言包，装完即可离线识别） | `services/ocrBuiltin.ts` + `public/ocr`（16MB） | 无 `ocrBuiltin`；`services/ocr.ts` 在鸿蒙只走系统 OCR（`ocrAvailable` / `ocrRecognize` 桥），模拟器上不可用 | **真实能力缺口**（可用 rawfile 装 WASM 补） |
| B2 | 桌面安装包 / 代码签名 / NSIS 打包 | `scripts/tauri-cli.cjs`、`sign-installer.ps1` | 无（HAP 签名由 DevEco 负责） | 平台差异，不需要对齐 |
| B3 | 桌面自检（`caseboard.exe --selftest` 两轮跨进程） | `scripts/run-selftest.cjs`、`services/selftest.ts` | 有 `--ps caseboardSelftest <phase>` 探针（H0–H6 验收用），但**不是同一套自检** | 可选：把 selftest 的 1/2 相移植到鸿蒙桥 |
| B4 | 键盘快捷键全量可用 | 同代码 | 同代码，但平板无键盘时用不到 | 平台差异 |

## 4. 同功能、不同实现（不算功能差，但要注意）

| 面 | 桌面 | 鸿蒙 |
| --- | --- | --- |
| 数据库 | `@tauri-apps/plugin-sql`（`services/db/tauri.ts`） | 桥方法 `dbOpen/dbExecute/dbSelect` → 原生 `relationalStore`（`services/db/harmony.ts`） |
| 文件读写 | `@tauri-apps/plugin-fs` / `plugin-dialog` | 桥 `writeAppFile/readAppFile/listAppDir` + `onShowFileSelector` 选择器（`services/file.ts`） |
| 素材/缩略图 | Tauri 文件系统 + `assetFileUrl`（`convertFileSrc`） | 沙箱 `files/assets`、`files/thumbs` + 自定义 scheme `caseboard://rawfile/asset/…` |
| 页面加载 | `http://tauri.localhost` | `caseboard://rawfile/index.html`（自定义 scheme，见 H0 硬结论） |
| 右键菜单 | 真·右键 | 长按 → `contextmenu`（菜单项已对齐，另加「创建红线」「删除此节点」） |
| 存档位置 | `%APPDATA%/app.caseboard.desktop/` | `el2/base/haps/entry/files/`（沙盒） |

## 5. 应用身份对齐（本轮已做）

| 项 | Windows | 鸿蒙（改前 → 改后） |
| --- | --- | --- |
| 产品名（Tauri `productName` / 窗口标题） | `CaseBoard` / `案情板 CaseBoard` | `案情板` → **`案情板 CaseBoard`** |
| 应用图标 | `src-tauri/icons/icon.png`（深色方块 + 两圆环 + 红线） | 默认模板图标 → **同一图案**（`scripts/sync-icon.py` 生成分层图标：纯色底 `#2B2B2B` + 只留圆环/红线的前景） |
| bundle 标识 | `app.caseboard.desktop` | `com.caseboard.harmony`（保持不变，改标识会丢数据） |

## 6. 建议的回填顺序（按「收益 ÷ 风险」）

1. **A5 应用内弹窗**（独立、风险最低，桌面 WebView2 也有原生弹窗限制）；
2. **A6 节点层级控件**（纯命令 + 右栏 UI）；
3. **A1+A2 集中钉 / 钉集 / 红线**（最大特性，但涉及 Board 渲染、右栏、DSL 序列化三处，建议先补 `dsl/serialize.ts` 对 `clusterPin` / `pinLinks` 的支持）；
4. **A3+A4 多选与组框挑节点**（与 A1 有交集，一起做省事）；
5. 最后再评估 **B1 把内置 OCR 搬到鸿蒙**（要 `public/ocr` 进 rawfile，16MB → HAP 体积翻三倍）。
