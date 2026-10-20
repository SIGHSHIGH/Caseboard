# 案情板 CaseBoard · Beta 1.0（`v1.0.0-beta.1`）

> 本地优先的刑侦案情推演桌面应用：图形与代码双视图、时间线、地图、证据链、离线 AI 辅助——数据只存本机，断网可用。
>
> **M1–M18 全部里程碑验收通过后的第一个 Beta。** 功能面已定型，Beta 期间只修缺陷与手感。

---

## 这个版本能做什么

| 模块 | 能力 |
|---|---|
| **画布** | 8 类实体（人物 / 组织 / 地点 / 物品 / 事件 / 证据 / 时间 / 便签）+ 关系气泡；拖拽、框选、圈选成组、穿透分组（组中组）；双击空白新建；右键建节点 |
| **关系线即语义** | 实线＝已证实 / 虚线＝推测 / 点线＝待核实；8 个锚点（四边中点 + 四角）自由流转；线宽 1–8 px；可写「是否受自动梳理影响」 |
| **关系线自动梳理** | 自动布局后按障碍重算锚点、按代价模型（压卡 1200 / 交叉 320 / 曲率 6）挑贝塞尔弯法；「检测交叉与压卡」只体检不改图；单条线可「立即梳理此线」 |
| **代码视图** | 与画布**同一份数据**的 DSL 源码（CodeMirror + Lezer 语法高亮），改代码即时回写 Model，带 diff 与诊断 |
| **图片节点** | 拖入画布即成节点；吸附到卡片四角并**跟随移动**；层级上下移；旋转 / 裁剪 / 圆点模式；脱敏马赛克（不可逆，逐像素复核） |
| **素材库** | 文件夹分组管理；导入图片自动 OCR；PDF / 视频抽图；监视文件夹；证据区与「AI 生成」分区隔离 |
| **OCR** | **内置 Tesseract（WASM，中英文语言包随包）**，干净机不装任何东西也能离线识字；字段（金额 / 时间 / 账号）可人工修正 |
| **时间线** | 多轨并行（按类型 / 按实体）、缩放比例、贯穿所有泳道的公用指针、播放与倍速、新建时间线、未排期实体清单 |
| **地图** | 导入底图；给无坐标实体「在地图上点选设坐标」；图钉可拖动改坐标；右栏经纬度直接编辑（双击图钉也行） |
| **演示视图** | 逐条翻页讲解，**标题 / 状态 / 备注 / tag 可在演示页直接改**并写回 Model |
| **分析与假设** | 中心度热力、两点之间路径、六阶段证据链（可手工归档实体、可自定义链条）、AI 提议只进「待确认」队列 |
| **自动布局** | 力导向 / 分层 / 径向 / 环形 / 网格；布局会把吸附在卡片上的图片一起带走，并同步梳理关系线 |
| **AI 助手（离线）** | 文本抽取 + 七节结构化报告（Word）、模拟画像（强制「AI 生成 · 模拟图」像素角标、永不「已证实」）、「操作方式」教学、「自动检验」13 项结构体检（问题可跳转画布） |
| **本地数据** | 全量落本机 SQLite；自动版本快照 + 历史面板；`.caseboard` 项目包（含素材、可整包换机打开）；导出 PNG / SVG / 多页 PDF / Word / CSV |
| **界面** | 全中文；纸张 / 软木板 / 黑板三种画布底衬 + 自定义背景图；深色模式；顶栏窄窗自动折叠成「⋯」；左右栏可折叠 |

## 两条 60 秒上手路径

1. **看现成案卷**：启动后顶栏「示例案卷」→ 载入 **《ABC 谋杀案》**（23 个实体 / 21 条关系 / 3 个分组 / 多轨时间线）或 **2026-10 连环诈骗案**；按 `Ctrl+K` 搜实体，切「时间线」看四起案件并行，切「地图」看地点分布。
2. **自己建一板**：左栏拖一个「事件」到画布 → 双击空白再建两个实体 → 拖动节点四边/四角的连接点拉线 → 右栏改状态与置信度 → `Ctrl+K` 里搜「自动布局」跑一次布局，再看关系线是否自动避开卡片。

## 安装

1. 下载 `CaseBoard_1.0.0-beta.1_x64-setup.exe`
2. 双击安装（Windows 10/11 x64；依赖系统自带 WebView2）
3. 数据位置：`%APPDATA%\app.caseboard.desktop`（`caseboard.db` + `assets\`）

**安装包未签名**（本机没有代码签名证书），Windows 可能提示「未知发布者」，属预期行为；校验请比对下方 SHA-256。

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `CaseBoard_1.0.0-beta.1_x64-setup.exe` | 12,210,066 字节 | `892A3146050025170424DF3B0E60208EA4E7D34A3AFC0915FF7BE9C1A859DB41` |

## 可离线复现的验收数据

| 项 | 结果 |
|---|---|
| `pnpm typecheck` | 0 error |
| `pnpm smoke`（逻辑用例，node CJS） | **871 PASS** |
| `pnpm ui-smoke`（打包产物 + jsdom 伪布局） | **430 PASS / 0 FAIL** |
| `pnpm bench`（1000 节点 DSL 解析链，阈值 300 ms） | **74.5 ms** |
| 桌面自检 `caseboard.exe --selftest` | 两轮 **PASS**（含导出、脱敏、OCR、AI 模拟图、**零外呼**证据） |

## 隐私与边界（重要）

- **数据只存本机**，没有任何遥测与云端上传；自检会断言「整轮 0 次非本机请求」。
- 自 0.9.0 起**移除了启动密码与整库加密**（H3 决策）：数据保护依赖 Windows 账户权限 + BitLocker；办案机建议开 BitLocker。
- AI 能力是**离线规则 + 内置模型通道**，产出只进「待确认」队列，永不直接改 Model；推断关系强制虚线/点线且低置信度。
- 生成图像强制「AI 生成 · 模拟图」角标（写入像素、无关闭开关），**禁止真实人脸换脸与伪现场合成**。
- 本软件是推演与整理工具，不替代任何法定程序；真实案件数据的合规责任在使用方。

## 已知限制

- 仅 Windows x64；无 macOS / Linux 构建。
- 安装包未签名 → SmartScreen 提示；无自动更新通道。
- 超大地图底图（> 8 MB）导入会慢，建议先压缩。
- 1000 节点以上画布建议关闭中心度着色，交互更顺。

## 许可

**PolyForm Noncommercial License 1.0.0** —— 可自由使用、修改、分发（保留许可声明），**不得商业使用**。这不是 OSI 认可的开源许可，属「源码可见、非商用」。

---

<details>
<summary>English summary (short)</summary>

**CaseBoard Beta 1.0** — a local-first, offline desktop app for criminal-case reasoning boards. Graph view and a code view render the **same** document model; timeline with multi-track lanes, map with a custom base image, evidence-chain hypotheses, bundled offline OCR (Tesseract WASM), and offline AI assistance (extraction, Word report, flagged simulated portraits). All data lives in a local SQLite file; **zero outbound requests** is asserted by the built-in self-test.

Download `CaseBoard_1.0.0-beta.1_x64-setup.exe`, install on Windows 10/11 x64 (WebView2), data in `%APPDATA%\app.caseboard.desktop`. Unsigned build — verify the SHA-256 above.

License: **PolyForm Noncommercial 1.0.0** — free to use, modify and redistribute; **no commercial use**.

</details>
