# 案情板 CaseBoard

> 数字时代的刑侦白板：把人物、照片、证据、事件钉在无限画布上，用贝塞尔曲线织出关系网，并可随时切换为代码（DSL）视图精确编辑。

Windows 优先、本地优先、离线可用；图形视图与代码视图是**同一份数据的两个对等视图**；AI 只产出「待确认」的线索，永不落定结论。

当前版本 **v0.8.0**（M1–M8 全部里程碑验收通过，tag `ms/M1`–`ms/M8`）。

## 能做什么

- **画布与数据**：8 类实体节点、贝塞尔关系（实线=已证实 / 虚线=推测 / 点线=待核实，图例常驻）、分组嵌套与折叠、无限画布与框选多选。
- **图片工作台**：四路导入（选择/拖入/粘贴/文件夹）、SHA-256 去重、EXIF、双级缩略图、自由图片节点（移动/缩放/旋转/层级/吸附/三种边框）、标注层（矩形/椭圆/箭头/文字/马赛克/区域锚点）、PDF 抽页与视频抽帧。
- **DSL 双向同步**：图形 ↔ CodeMirror 6 代码视图，序列化幂等、容错解析、字段级三方合并、整批一次撤销。
- **桌面与文件**：Tauri 2 外壳、SQLite + FTS5、`.caseboard` 单文件（zip 内含库、素材、DSL、缩略图）、自动保存、版本快照、回收站。
- **导出**：整板 PNG / SVG / 多页 PDF、案件图片包（`images/` + `manifest.csv`，OCR 文本已脱敏）、脱敏导出（像素马赛克 + 证件/手机/银行卡掩码）。
- **分析视图**：过滤与聚焦、最短路径与全部路径、度/中介中心度、五种自动布局（锁定节点不动）、时间线回放、演示模式、离线示意地图。
- **AI 文本能力**：P4 抽取建图 → 待确认队列逐条采纳；P5 矛盾与证据链审查；P6 自然语言编辑 diff 预览；P7 七节报告（事实句带 `[证据:id]` / `[节点:id]`）可导出 Word / PDF。内置规则通道离线可跑，Ollama / OpenAI 兼容通道需显式授权。
- **AI 生图与合规**：四预设（模拟画像/场景复原/物品示意/图像增强）、内置程序化绘制默认通道、ComfyUI 与 OpenAI 兼容图像接口可选；换脸类提示词拦截；角标写入像素且界面无移除开关；素材库 AI 分区 + 画布虚线边框；命令层拦截「AI 图改已证实」。
- **安全**：脱敏全链路复核、AI 生成图合规审计导出、打印样式与 A4 页眉页脚、全局搜索 + Ctrl+K 命令面板、NSIS 安装包（**M9 起移除应用解锁与整库加密**，数据就是本机的普通 SQLite 文件）。

## 文档地图

| 文档 | 作用 |
|---|---|
| [docs/CaseBoard-SPEC.md](docs/CaseBoard-SPEC.md) | 产品构思与 AI 提示词库（规格原文） |
| [docs/MILESTONES.md](docs/MILESTONES.md) | **里程碑契约**：M1–M9 范围、验收记录、环境实测、决策记录 D1–D60 |
| [docs/MANUAL-ACCEPTANCE.md](docs/MANUAL-ACCEPTANCE.md) | 必须人工复验的清单（真机手感、安装、打印） |
| [AGENTS.md](AGENTS.md) | 工程约定：技术栈锁定、硬约束 Gate 0、命令、目录与代码风格 |
| [CHANGELOG.md](CHANGELOG.md) | 版本与里程碑变更 |

## 里程碑状态

| # | 主题 | 状态 |
|---|---|---|
| M1 | 画布 MVP | ✅ 2026-10-18 |
| M2 | 领域模型 + 组 + 图片工作台 | ✅ 2026-10-19 |
| M3 | DSL + 双向同步 | ✅ 2026-10-19 |
| M4 | Tauri + SQLite + 项目文件 + 导出 | ✅ 2026-10-19 |
| M5 | 分析视图 | ✅ 2026-10-19 |
| M6 | AI 文本能力 | ✅ 2026-10-19 |
| M7 | 高级功能 + AI 生图 | ✅ 2026-10-19 |
| M8 | 安全与打磨 | ✅ 2026-10-19 |

## 技术栈

Tauri 2 + Rust · React 18 + TypeScript + Vite · React Flow(@xyflow/react) · CodeMirror 6 + Lezer · Zustand + Immer · SQLite · graphology/dagre/d3-force

## 开发与验收

本机 **没有 npm**，包管理走 pnpm 直连（沙箱内 `pnpm` 命令会 spawn EPERM）：

```powershell
node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" install
$env:TMP = "$PWD\.tmp-esbuild"; $env:TEMP = $env:TMP   # 构建必须把临时目录指到工作区
node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" dev
node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" build

node node_modules/typescript/bin/tsc --noEmit      # 类型检查
node scripts/smoke.cjs                            # 逻辑验收 598 条
node scripts/ui-smoke.cjs                         # 打包产物 + jsdom 伪布局 256 条
node scripts/bench-dsl.cjs                        # 1000 节点 DSL 链 < 300ms
node scripts/run-selftest.cjs                     # 桌面三轮自检（需先构建 exe）
```

`build` / `dev` / `preview` 与 Tauri 构建在沙箱内需要 `sandbox_permissions: danger-full-access`（esbuild / rustc 子进程）。Rust 工具链装在仓库内 `.rust\`，构建前设 `CARGO_HOME` / `RUSTUP_HOME` 并先杀掉残留 `caseboard` 进程。

## 安装包与签名

```powershell
node scripts/tauri-cli.cjs build --bundles nsis    # → src-tauri\target\release\bundle\nsis\CaseBoard_<version>_x64-setup.exe
powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1
```

本机没有代码签名证书：安装包产出正常，但当前**未签名**（Windows 可能提示未知发布者）。导入受信任证书后重跑签名脚本即可；`-SelfSignedTest` 仅用于演练签名流程。

详细环境实测（沙箱、TMP、argv[0]、PDF 回读等坑）见 [docs/MILESTONES.md](docs/MILESTONES.md) §5 与 §6。
