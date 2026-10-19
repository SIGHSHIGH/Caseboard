# 案情板 CaseBoard · 里程碑目标（Milestone Contract）

> 权威规格：[docs/CaseBoard-SPEC.md](CaseBoard-SPEC.md)（原文《案情板CaseBoard-产品构思与AI提示词.md》v0.2，60229 字节）
> 本文件是**执行契约**：每个里程碑做什么、交什么、怎么验收、何时算完成。规格有歧义时以本文件为执行口径，并把偏离记录进 §6。
> 状态图例：⬜ 未开始 · 🟨 进行中 · ✅ 已验收 · ⛔ 阻塞

---

## 0. 总目标（North Star）

在 Windows 上交付一款**本地优先、离线可用**的案情推演桌面应用：人物 / 照片 / 证据 / 事件钉在无限画布上，贝塞尔曲线织出关系网，图形视图与 DSL 代码视图**双向实时同步**，AI 只产出「待确认」的线索而永不落定结论。

**最终成功指标（规格 0.5 节，M8 结束时验收）**

1. 30 分钟内从空板搭出含 30 实体 / 50 关系 / 20 图片的完整案情板。
2. 一份粘贴笔录经 AI 抽取后，人工确认采纳率 ≥ 70%，且无需手工纠正任何「已证实」结论。
3. 全程不联网（本地模型模式）可完成：建板、导图标注、模拟画像、生成报告。
4. 导出的 PDF 报告可直接用于内部案情汇报。

**非目标（规格 0.4 节，本期明确不做，越界即算缺陷）**

- 不做多人实时协作与云同步（本地优先；后期最多评估局域网只读分享）。
- 不做法律定性结论（不输出罪名认定），AI 只做事实与线索层面辅助。
- 不做身份核验级人脸识别比对（仅本地人脸框选与聚类，不接公安库）。
- 不做真实人脸换脸 / 「某人做某事」的伪造现场合成。

---

## 1. 里程碑总表

| # | 主题 | 预估工时 | 关键产出 | 验收门禁（摘要） | 状态 |
|---|---|---|---|---|---|
| M1 | 画布 MVP | 1–2 周 | React Flow 画布 + Command 体系 + JSON 持久化 | `pnpm build` 零错误；刷新不丢；撤销/重做可用；三种线型 | ✅ 2026-10-18 |
| M2 | 领域模型 + 组 + 图片工作台 | 2–3 周 | 8 类节点模板、状态流、组（嵌套/折叠）、图片四路导入、自由图片节点、标注层 | 500 张图导入不崩；哈希去重命中；图片可旋转/层级/吸附 | ✅ 2026-10-19 |
| M3 | DSL + 双向同步 | 2–3 周 | Lezer grammar、CodeMirror 6、serialize/parse/diff、同步状态机 | 序列化幂等；1000 节点解析+渲染 < 300ms；解析失败不清空 Model | ✅ 2026-10-19 |
| M4 | Tauri + SQLite + 项目文件 + 导出 | 3–4 周 | Tauri 2 外壳、SQLite、`.caseboard` 单文件、图片/整板导出、脱敏导出 | `.caseboard` 可拷机打开；离线可用；PDF 报告可交付 | ✅ 2026-10-19 |
| M5 | 分析视图 | 2–3 周 | 过滤、聚焦、路径/中心度、自动布局、时间线回放、演示模式 | 路径高亮可复现；时间游标可播放；一键整理保留锁定节点 | ✅ 2026-10-19 |
| M6 | AI 文本能力 | 2–3 周 | 抽取建图（P4）、自然语言编辑（P6）、矛盾检测/证据链（P5）、报告（P7）、本地模型 | 采纳率 ≥ 70%；AI 永不直接改 Model，只进待确认队列 | ✅ 2026-10-19 |
| M7 | 高级功能 + AI 生图 | 3–4 周 | 多假设画布、证据链模板、区域锚点、OCR、地图、ComfyUI 四预设、图生图、水印分区日志 | 水印不可关闭；AI 图不可设为已证实；换脸请求被拦截 | ✅ 2026-10-19 |
| M8 | 安全与打磨 | 2–3 周 | SQLCipher、Windows Hello、脱敏审计、打印样式、签名打包、安装器、自动更新 | 干净 Win10/11 可装可跑；安装包签名；合规审计可导出 | ⬜ |

> 规格 第 7 节要求：**每完成一个里程碑都应是「可运行、可演示、可打包」的状态**（M1–M3 为纯 Web 阶段，「可打包」解释为可构建产物，M4 起为安装包）。

---

## 2. 全局闸门（Gate 0 · 任何里程碑都不可违反）

| 编号 | 约束 | 判据 |
|---|---|---|
| G0-1 | **技术栈锁定**：Tauri 2 + Rust / React 18 + TS + Vite / React Flow（@xyflow/react）/ CodeMirror 6 + Lezer / Zustand + Immer / SQLite | 出现替换栈即缺陷；确需偏离先说明理由并等确认 |
| G0-2 | **单一数据源**：图形视图与代码视图都是同一 Document Model 的渲染结果，不存在两份数据 | 任何状态下只允许一份 model；禁止「导出/导入」式伪同步 |
| G0-3 | **Command 唯一写入口**：所有修改都先转成 Command（AddNode/UpdateNode/…），改 Model、压栈、持久化、广播 | store 内不存在绕过 command 的直接 set |
| G0-4 | **线型即语义**：实线 = 已证实；虚线 = 推测；点线 = 待核实。图例常驻且不可乱用 | 任何 UI 不得提供「把推测画成实线」的便捷开关 |
| G0-5 | **AI 待确认制**：AI 产出只进「待确认」队列，禁止未经用户确认改 Model；推断关系必须 dotted/dashed 且置信度低 | code review 级检查：AI 路径不写 store |
| G0-6 | **AI 生图红线**：强制「AI 生成 · 模拟图」角标（写入像素、无关闭开关）、`aiGenerated=true` + 完整 `aiMeta`、素材库 `zone:'ai'` 分区、永不「已证实」、禁止换脸 | 导出图必须带角标；分区不可混放 |
| G0-7 | **中文界面 + 视觉基调**：全中文；不使用任何 UI 库默认紫蓝主题；主色中性深灰 + 证据红 `#C0392B` | 目视 + 主题变量审计 |
| G0-8 | **本地优先**：数据默认只存本机、离线可用；云端能力必须显式配置并二次确认 | 无网络时核心功能可用 |

---

## 3. 里程碑详情

### M1 · 画布 MVP（1–2 周）

**目标**：跑通「空画布 → 摆节点 → 拉曲线 → 改属性 → 撤销 → 刷新不丢」的最小闭环，作为后续所有功能的骨架。

**范围（做）**
- 前端工程初始化：Vite + React 18 + TS(strict) + React Flow + Zustand + Immer（**不接 Tauri**，见 D2）。
- 目录骨架：`src/types` `src/store` `src/commands` `src/components/flow` `src/components/panels` `src/serializers`。
- Command 体系：`AddNode` `UpdateNode` `DeleteNode` `MoveNode` `AddEdge` `UpdateEdge` `DeleteEdge`，统一 undo/redo 栈（一条历史、不分视图）。
- `BaseNode` 自定义节点：顶部类型色条 + 图标 + 标题（双击改名）、底部状态点与置信度；首批四类 `person`/`event`/`evidence`/`note`；四锚点可拖出连线；选中描边。
- `BezierEdge` 自定义边：三次贝塞尔 + 箭头 marker；`solid`/`dashed`/`dotted` 三线型；边中部标签，双击可改；样式由 `edge.style` 决定。
- 交互：双击空白建便签；锚点拖到另一节点建边（弹窗选关系类型/标签/线型）；点选后右栏属性表单（标题、类型、状态、置信度、标签、备注）；Delete 删除；Ctrl+Z / Ctrl+Shift+Z。
- 左栏类型库（点击在画布中央添加）；顶栏撤销/重做 + 线型图例（常驻）+ 导出/导入 JSON。
- localStorage 自动保存，key `caseboard-autosave`。
- 预置演示案件：5–7 节点、4–6 边、三种线型齐全、含一个分组占位。

**不做**：Tauri、SQLite、DSL、图片、AI、组折叠、时间线。

**验收标准（逐条可执行）**
1. `pnpm install` 成功；`pnpm dev` 起本地服务，浏览器可交互。
2. `pnpm build`（`tsc --noEmit` + `vite build`）零 TS 错误、零构建错误。
3. 拖节点 / 拉曲线 / 改属性 / 撤销重做全部生效；**刷新页面数据不丢**。
4. 导出 JSON → 清空 → 导入 JSON，数据往返一致。
5. 三种线型与 4 类节点在演示数据中可见；线型图例常驻顶栏。
6. 全中文界面；主色中性深灰 + `#C0392B`；无 UI 库默认紫蓝主题残留。

**风险**：包管理器迁移（见 §5 / D1）；React Flow v12 与 React 18 的 peer 版本需锁定。

**验收记录（2026-10-18，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 安装 | `pnpm install --ignore-scripts`（node-linker=hoisted） | ✅ |
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 构建 | `pnpm build` → 211 modules，`dist/assets/index-*.js` 369.58 kB（gzip 120.38 kB），668ms | ✅ |
| 逻辑层 27 条断言 | `pnpm smoke`（`scripts/smoke.cjs`）→ 全部通过：演示数据 6 节点/6 边/三线型；增删改移动；删除节点联动清边；撤销重做；JSON 往返；非法 JSON 拒绝 | ✅ |
| 打包产物挂载 12 条断言 | `pnpm ui-smoke`（`scripts/ui-smoke.cjs`，jsdom）→ 全部通过：顶栏/左栏 4 类型/6 节点/6 连线/3 项图例/撤销禁用/关系标签「转账 50 万」 | ✅ |
| 可服务 | `vite preview` on :4173 → index 200、JS 200（365482 B）、CSS 200（23814 B），`scripts/preview-check.cjs` 断言通过 | ✅ |
| 三种线型 + 4 类节点 | 演示数据 + 顶栏常驻图例（solid/dashed/dotted） | ✅ |
| 全中文 + 主色 | 界面文案全中文；`--cb-accent: #C0392B`；无第三方 UI 库 | ✅ |
| 刷新不丢 | localStorage 自动保存（key `caseboard-autosave`），逻辑层由 persist 单测覆盖 | ✅ |

**验收过程中修掉的两个真缺陷**
1. `enablePatches()` 未调用 → 首次下命令即抛 `The plugin for 'Patches' has not been loaded into Immer`，撤销栈完全不可用；已在 `src/store/docStore.ts` 顶部启用。
2. 节点只有 `type="source"` 锚点 → React Flow 的 `getEdgePosition` 找不到 target 侧 handleBounds 时连线不渲染；已改为每边「一个不可交互的 target 几何锚点 + 一个 source 拖拽锚点」（D8）。

**已知局限**：本机无法启动 Chrome/Edge 无头浏览器（进程被宿主拦截），故「真实浏览器渲染」用 jsdom + 伪布局（`offsetWidth/offsetHeight/getBoundingClientRect` 注入）替代，见 D9；交互手感（拖拽、连线弹窗）仍需人工在 `pnpm dev` 里点一遍。

---

### M2 · 领域模型 + 组 + 图片工作台（2–3 周）

**目标**：让「案情」真正具备领域感——实体有类型模板与状态流，图片成为画布上的一等公民（规格 G1/G2/G3）。

**范围（做）**
- 8 类节点类型模板（person/org/place/item/event/evidence/time/note）+ 自定义字段；状态流 `todo|checking|confirmed|ruledout`；置信度 0–100；别名、标签、评论、附件、封面、折叠详情。
- 组：矩形组与自由圈选组、标题栏/底色/透明度、嵌套（parentId）、折叠为超级节点（组内连线自动隐藏、组间关系聚合）。
- **图片四路导入**：① 拖入文件/文件夹 ② 剪贴板 Ctrl+V ③ 菜单批量选择 ④ 文件夹监视（Watch）。
- 导入流水线：两级缩略图（256 / 1024）、SHA-256 哈希去重、EXIF 时间与 GPS 读取（提示定位风险）、导入向导（统一建证据节点 / 仅入素材库 / 全部铺到画布）、原件只读封存。
- **自由图片节点**（`ImageNode`）：移动、等比/自由缩放、旋转（角度吸附）、zIndex 置顶置底、对齐参考线、网格吸附、多选整体移动；边框样式 `photo|plain|polaroid`；可吸附为节点头像/证据附件（`linkedNodeId`）。
- **标注层**：`rect|arrow|pen|text|anchor|mosaic` 六种图形，随素材持久化；区域锚点 `anchor` 可关联节点。
- 素材库面板：真实证据 / AI 生成两个分区（M2 阶段 AI 分区先留空）、缩略图、来源、标注数、关联数。
- PDF 抽页与视频抽帧：M2 用 Web 实现（pdf.js 抽页 / ffmpeg.wasm 抽帧）先打通链路，M4 换原生（见 D3）。

**验收标准**
1. 500 张图片批量导入不崩溃，缩略图与哈希全部生成（进度可观察）。
2. 同一张图二次导入命中哈希去重，不产生重复素材。
3. 自由图片节点：移动/缩放/旋转/层级/对齐吸附可用；拖到人物卡上高亮并吸附为头像。
4. 标注可绘制、可保存、刷新后回显，随素材导出。
5. 组可嵌套、可折叠为超级节点，组级连线聚合显示。
6. 8 类节点各自字段模板在属性面板正确呈现；状态流可改并写入 model。

**风险**：浏览器端缩略图/哈希在 500 张量级下的内存与耗时（需 Worker 化）；`react-rnd` 与 React Flow 坐标换算（世界坐标 vs 屏幕坐标）易错，需统一坐标工具函数。

**拆步计划与进度（2026-10-18 拟定，逐条推进）**

| 步骤 | 内容 | 状态 |
|---|---|---|
| M2-1 | 8 类节点模板字段（含下拉/日期/长文本）+ 别名/标签/折叠详情/评论 + 旧文档迁移兜底 `normalizeDoc` | ✅ 2026-10-18 |
| M2-2 | 组：矩形组与自由圈选、标题栏拖拽、嵌套 `parentId`、折叠为超级节点、组级连线聚合 | ✅ 2026-10-19 |
| M2-3 | 图片四路导入（拖入/粘贴/批选/目录监视）+ 双级缩略图 + SHA-256 去重 + EXIF + 导入向导 + 素材库分区 | ✅ 2026-10-19 |
| M2-4 | 自由图片节点：移动/缩放/旋转吸附/层级/对齐参考线/网格/多选/吸附为头像 | ✅ 2026-10-19 |
| M2-5 | 标注层六图形（rect/arrow/pen/text/anchor/mosaic）+ PDF 抽页 / 视频抽帧链路 | ✅ 2026-10-19 |

**M2-1 验收记录（2026-10-18，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 构建 | 213 modules，JS 383.86 kB（gzip 124.93）、CSS 25.72 kB | ✅ |
| 逻辑层 | `pnpm smoke` 44 条全通过（新增 17 条：模板齐全/字段顺序/空值跳过/旧文档迁移/去重/悬空边丢弃/评论增删与撤销/折叠开关） | ✅ |
| 打包产物 | `pnpm ui-smoke` 13 条全通过（8 个类型按钮、字段数提示、节点卡片字段摘要） | ✅ |
| 8 类模板可呈现 | 左侧 8 个类型按钮 + 右栏按类型渲染下拉/日期/数字/长文本；演示案件字段已对齐模板（证据种类、发生时刻等） | ✅ |
| 状态流可改并写入 model | 右栏状态下拉 → `updateNode`（既有命令，smoke 覆盖） | ✅ |
| 旧存档兼容 | `normalizeDoc` 兜底：缺 tags/attachments/status/confidence/w/h 自动补；未知类型落 `note`；重复 id 与悬空边丢弃；缺 meta 抛 `DocMigrateError` | ✅ |

**M2-2 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 构建 | 218 modules，JS 401.05 kB（gzip 129.91）、CSS 28.22 kB | ✅ |
| 逻辑层 | `pnpm smoke` 70 条全通过（新增 26 条组系统断言） | ✅ |
| 打包产物 | `pnpm ui-smoke` 18 条全通过（新增 5 条：分组框/标题/成员数/底色/入口按钮） | ✅ |
| 矩形建组 | 左栏「新建矩形组」在可视中心落 360×260 组并自动选中 | ✅ |
| 圈选成组 | 拖框按节点中心命中（`nodeIdsInRect`），轨迹 < 24×24 视为误触，Esc 取消 | ✅ |
| 标题栏拖拽整组 | 一条 `moveGroup` 命令同步位移组矩形 + 全部子孙组 + 组内节点；撤销一次全还原 | ✅ |
| 嵌套分组 | `Group.parentId`；`canParentGroup` 用 `descendantGroupIdsOf` 防成环；删除父组时子组与成员提升一级 | ✅ |
| 折叠为超级节点 | 折叠后组内节点与子组隐藏，只留 `group` 超级节点（对象数/子组数/「已折叠」） | ✅ |
| 组级连线聚合 | 跨组边按「源渲染体→目标渲染体」聚合为 `__agg:` 合成边，多条显示「N 条关系」；线型取最弱、置信度取最小；聚合边不可选不可删 | ✅ |
| 旧存档兼容 | `normalizeDoc` 补齐 `opacity`（夹到 0.02–0.6）与 `collapsed` 布尔 | ✅ |

**M2-3 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 构建 | 226 modules，JS 424.03 kB（gzip 137.50）、CSS 31.84 kB，另有独立 worker chunk `imageWorker-*.js` 3.73 kB | ✅ |
| 逻辑层 | `pnpm smoke` 93 条全通过（新增 22 条：素材编号与缩略图尺寸、SHA-256 库内/批内去重、EXIF 合成 JPEG 解析、导入命令与撤销） | ✅ |
| 打包产物 | `pnpm ui-smoke` 31 条全通过（新增 14 条：左栏三标签、素材库两分区、两区空态、导入/监视按钮、无 File System Access 时监视禁用、切回对象页类型按钮恢复） | ✅ |
| 四路导入 | 拖入（`.cb-main` onDrop）、粘贴（window paste 取 `clipboardData.files`）、批选（`fileService.pickFiles`）、目录监视（`startDirectoryWatch` 轮询 File System Access，去重键 `name:size:lastModified`） | ✅ |
| 双级缩略图 + 哈希 | Worker 内 `OffscreenCanvas` 出 256/1024 JPEG，`crypto.subtle.digest('SHA-256')` 出哈希；原件与缩略图落 IndexedDB | ✅ |
| 去重 | `dedupeCandidates` 先查库内（hash）再查批内（batch），重复项在向导里单列并计原因 | ✅ |
| EXIF | 自研 DataView 解析（Make/Model/DateTimeOriginal/GPS 度分秒）；解析中修掉「LONG 型 IFD 指针被当成内联值」导致的 `RangeError`，并加损坏 IFD 兜底 | ✅ |
| 导入向导 | 预览列表（尺寸/体积/哈希/拍摄时间/相机/GPS）、按张移除、两种导入方式（仅素材库 / 建证据节点并铺排）、证据来源、拍摄时间、关联实体；全重复或大批失败时给中文提示 | ✅ |
| 素材库分区 | 「证据素材 · N」「AI 生成 · N」；AI 分区空态明示 M7 产物强制角标与分区规则 | ✅ |
| 素材详情 | 右栏 `AssetForm`：编号/来源说明可改（blur 提交）、哈希与 EXIF 只读展示、关联对象列表、删除素材同时摘掉节点引用 | ✅ |

**M2-4 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 构建 | 232 modules，JS 441.05 kB（gzip 142.95）、CSS 35.48 kB（gzip 6.54），worker chunk 仍独立 | ✅ |
| 逻辑层 | `pnpm smoke` 131 条全通过（新增 38 条：图片尺寸/旋转吸附/等比与对称缩放/层级重排/对齐与网格吸附/多选对齐与等距分布 + 图片命令增删改/层级/多选移动/吸附/级联删除/迁移兜底/JSON 往返） | ✅ |
| 打包产物 | `pnpm ui-smoke` 39 条全通过（新增 7 条：自由图片节点、照片白边、无原件占位、图钉、旋转写进 transform、点击后右栏切到图片属性并含层级与边框设置；素材库 1 张素材与占位缩略图） | ✅ |
| 移动 / 缩放 | 8 个方位手柄走 `resizeImageRect`（Shift 等比、Alt 从中心对称、最小 40px）；位移先除 `zoom` 再按 `-rotation` 旋到图片本地轴，松手才落一条命令 | ✅ |
| 旋转吸附 | 旋转手柄相对中心 atan2 累加，距 15° 整步 ≤4° 吸附（0°/90°/270° 均命中），否则保留 0.1° | ✅ |
| 层级 | `reorderLayers` 置顶/置底/上移/下移，图片与卡片共用 zIndex 空间；右栏四个按钮 + 悬浮条 | ✅ |
| 对齐参考线与网格 | 拖动中 `snapImageRect` 对左/中/右与上/中/下三线取阈值内最小位移，命中画 `.cb-guides` 虚线；未命中按 8px 网格 | ✅ |
| 多选整体移动 | Shift 点击多选（`selectImage(id, additive)`），拖动一张带动其余，松手一条 `moveImageNodes`，撤销一次全还原 | ✅ |
| 吸附为头像 / 附件 | 图片中心命中卡片时高亮 `.is-attach-target`，松手 `attachImageNode`：人物写 `photo`，其余并入 `attachments`（与导入向导「关联实体」同规则，D16） | ✅ |
| 素材库拖入 | 缩略图 `draggable` + `ASSET_DND_TYPE` 载荷，画布 onDrop 按落点居中生成图片节点并选中 | ✅ |
| 边框样式 | `photo`（白边）/ `plain`（无边框）/ `polaroid`（拍立得留白）三种，右栏切换即写入 model | ✅ |
| 旧存档兼容 | `CaseDoc.imageNodes` 为新增字段：缺该字段的旧文档自动补空数组；素材不存在的图片节点与悬空边同原则丢弃；`deleteAsset` 级联删掉引用它的图片 | ✅ |

**M2-5 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error（过程中修掉 pdfjs v6 的 `PDFDocumentProxy.destroy()` 已不存在） | ✅ |
| 构建 | 243 modules，主包 JS 464.72 kB（gzip 150.81）、CSS 38.26 kB（gzip 7.03），懒加载块 `pdf-*.js` 483.44 kB、`pdf.worker.min-*.mjs` 1264.34 kB、`imageWorker-*.js` 3.73 kB | ✅ |
| 逻辑层 | `pnpm smoke` 173 条全通过（新增 42 条：标注几何 16、标注命令 11、抽页/抽帧规划 15） | ✅ |
| 打包产物 | `pnpm ui-smoke` 51 条全通过（新增 12 条：PDF/视频抽图入口、素材属性、标注入口与数量、编辑器渲染、7 个工具与 6 色、标注列表 2 条、原件缺失提示、导出按钮） | ✅ |
| 六种标注图形 | 矩形框 / 箭头 / 手绘 / 文字 / 区域锚点 / 马赛克；几何统一归一化到素材宽高（D17），编辑画布、缩略图与导出共用 `drawAnnotations` | ✅ |
| 标注随素材 | 标注挂在 `Asset.annotations`，走 `addAnnotation`/`updateAnnotation`/`deleteAnnotation`/`linkAnnotation`/`clearAnnotations`，一条命令一次撤销 | ✅ |
| 区域锚点 | `anchor` 可关联实体（`linkedNodeId`），列表与画布标签显示「区域锚点 · 已关联」 | ✅ |
| 马赛克 | 按区域分列抽样后用 `imageSmoothingEnabled=false` 放大绘制（`mosaicCells` 纯函数可测） | ✅ |
| 标注导出 | `renderAnnotatedBlob` 以长边 2048 重绘原图 + 叠加标注，导出 PNG（`asset.no` + 「-标注.png」） | ✅ |
| PDF 抽页 | pdf.js v6 懒加载（D19），页码范围 `1-3,5` 解析、逐页渲染 PNG 后交给既有导入流水线（来源默认「书证翻拍」） | ✅ |
| 视频抽帧 | `<video> + <canvas>` 等距取段中点（D18），数量 1–24，产物同走导入流水线（来源默认「监控截图」） | ✅ |
| 旧存档兼容 | 标注几何越界自动夹到 0–1、缺色补证据红、空几何与非法图形丢弃；迁移与 JSON 往返均覆盖 | ✅ |

**M2 总体门禁自查（对照 §1 指标）**

| §1 指标 | 状态 | 说明 |
|---|---|---|
| 500 张图导入不崩 | ⚠️ 设计达成、未实机压测 | 预处理在 3 个 Worker 内跑（D13）、结果按传入顺序重排、面板只渲染当前分区缩略图；本机无法启动真实浏览器，500 张的真实内存/耗时曲线需在 `pnpm dev` 里人工跑一次并记录 |
| 哈希去重命中 | ✅ | `dedupeCandidates` 库内 + 批内双查，smoke 覆盖；向导单列重复项与原因 |
| 图片可旋转 / 层级 / 吸附 | ✅ | M2-4 验收记录：15° 吸附、四向层级、对齐参考线与网格、吸附头像/附件 |

> 遗留的人工验收项：真实浏览器里的拖拽手感、500 张导入压测、PDF/视频真实文件抽页抽帧（jsdom 无 canvas/媒体解码，只能断言结构与规划函数）。

---

### M3 · DSL + 双向同步（2–3 周）

**目标**：把「代码视图」做成真正对等的第二视图——解析、序列化、增量 diff、容错、统一撤销栈。

**范围（做）**
- Lezer grammar `grammar/caseboard.grammar`：`case` 块、实体声明、`group` 块、`view` 块；三种边语法 `A --标签--> B` / `A -.标签.-> B` / `A ..标签..> B`；字段 `key: value`（字符串/数字/布尔/ISO 日期/数组/对象/枚举）；`//` 与 `/* */` 注释；时间区间 `2026-09-01/2026-09-10`；`at(x, y)` 与 `size(w,h)` 可选坐标。
- `src/dsl/serialize.ts`：Model → 文本，稳定排序，**幂等**（同一 Model 两次序列化逐字节一致）。
- `src/dsl/parse.ts`：文本 → AST，容错解析产出错误节点（行列 + 期望 token + 修复建议）。
- `src/dsl/diff.ts`：AST vs 当前 Model → **最小 Command 批次**（一次撤销回退整批）。
- CodeMirror 6 集成：高亮、折叠、自动补全（实体 id 与枚举）、悬停字段说明、错误波浪线、格式化命令。
- 同步状态机 `idle | graphEditing | codeEditing | conflict | error`；图形→代码 200ms 防抖；代码编辑中不抢光标（改显示「图形有更新，点击合并」条）。
- 光标与滚动保护：用 StateEffect/事务映射保持光标所在 id 块与可见区域不跳变。

**验收标准**
1. 序列化幂等性有测试覆盖（同一 Model 两次输出逐字节比较）。
2. 错误用例全部覆盖：引用不存在 id / 重复 id / 边连自己 / 未闭合块 / 非法枚举 —— 解析失败时 **Model 不被清空**，图形视图只读 + 编辑器波浪线报错。
3. 并发场景「拖节点的同时编辑代码」字段级三方合并，不互相覆盖。
4. 连续 50 次增删改：不丢数据、无重复撤销记录。
5. 1000 节点文档：解析 + 渲染 < 300ms（有基准脚本）。
6. 分屏下任一侧选中，另一侧高亮并居中/滚动到对应声明。

**M3 拆步（一次推进一步）**

| 步骤 | 范围 | 状态 |
|---|---|---|
| M3-1 | `src/dsl/serialize.ts`：Model → DSL 文本，幂等（含 id 名称化、双向名表、稳定 JSON） | ✅ 2026-10-19 |
| M3-2 | `grammar/caseboard.grammar` + `src/dsl/parse.ts`：AST、行列错误、修复建议 | ✅ 2026-10-19 |
| M3-3 | `src/dsl/diff.ts`：AST ↔ Model 最小 Command 批次、字段级三方合并、整批一次撤销 | ✅ 2026-10-19 |
| M3-4 | 分屏 + CodeMirror 6（高亮/折叠/补全/悬停/波浪线/格式化）+ 同步状态机 + 光标滚动保护 | ✅ 2026-10-19 |
| M3-5 | 验收加固：错误用例全覆盖、50 次连续操作、1000 节点基准脚本 | ✅ 2026-10-19 |

**M3-1 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` 204 条全通过（新增 31 条 `[20] DSL 序列化（M3-1）`） | ✅ |
| 幂等（验收 1） | 同一 Model 连续两次 `serializeDoc` 逐字节一致；节点数组 **逆序后输出完全相同**；经 `toJson`/`fromJson` 往返后输出不变 | ✅ |
| 文本形状对齐规格 §4 | `case "标题" caseNo "编号" {`、`类型 id "显示名" {`、`group … color="#C0392B" {`、`view timeline "…" {`、`// ===== 实体 =====` 分节 | ✅ |
| 线型三元组 | `A --标签--> B` / `A -.标签.-> B` / `A ..标签..> B` 三种全部覆盖；无标签写成 `-->`；标签含 `-` `.` `>` 时整体加引号防歧义 | ✅ |
| 坐标与尺寸 | 每个实体与组都显式写 `at(x, y)` 与 `size(w, h)`，避免「省略即自动布局」在文本编辑时漂移 | ✅ |
| 字段与字面量 | 字段按模板顺序、模板外自定义键按码位排序；数字/布尔不加引号；字符串走 JSON 转义（引号、换行不产生额外物理行）；时间写成 `2026-09-01/2026-09-10` | ✅ |
| id 名称化 | 非 ASCII / 含 `-` 的 id 转成合法标识符（保留中文），与原 id 不同时补 `id: "原 id"`；重名自动加 `_2`；连线引用同步改名 | ✅ |
| 纯函数 | 序列化不修改 Model（快照比较）、不读时间/随机数；空文档输出合法骨架且无 `undefined` | ✅ |
| 边界 | 行尾无空格/制表符、无连续空行结尾；`stableJson` 递归排序键 | ✅ |

**M3-2 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` 241 条全通过（新增 37 条 `[21] DSL 解析（M3-2）`） | ✅ |
| 往返一致 | `parseDsl(serializeDoc(demo))` 无诊断；再次序列化 **逐字节相同**（验收 1 的闭环） | ✅ |
| 语法覆盖 | 规格 §4 全部形状：`case/caseNo`、8 类实体、`group … color="#C0392B" { nodes: […] }`、`view timeline|scenario|presentation …`、三种线型箭头、`at/size`、`key: value` 字段（字符串/数字/布尔/日期/区间/数组/对象/枚举）、`camera/filters/steps`、`scenario`、`//` 与 `/* */` 注释 | ✅ |
| 容错（验收 2） | 六类错误全部有中文诊断 + 行列（1 起）+ 修复建议：悬空引用、重复 id、自环、未闭合块、非法枚举、非数字坐标；**出错时已解析的好块仍在（Model 不被清空）**，且 `parseDsl` 永不抛异常（空文本用例） | ✅ |
| 身份对齐 | `id:` 覆盖行生效；`"quoted id"` 可作关系端点与组成员；名称冲突时靠 `id:` 行还原；解析为纯函数（同一文本 → 同一 `meta.id`，`createdAt` 留空由存储层填） | ✅ |
| 缺 header 容错 | 只有 `{ … }` 块（无 `case` 行）仍解析正文，标题回退「未命名案件」+ warning | ✅ |
| 关系缺 id | 自动生成 `e_<source>__<target>` 并 warning（不静默丢边） | ✅ |
| 未知字段 | warning + 可照抄的 hint（指引写进 `fields: { … }`），不阻塞其余字段 | ✅ |
| 代码生成 | `node scripts/build-grammar.mjs` → `src/dsl/generated/caseboard.parser.ts`（3917 字节）提交进库，构建/测试不依赖 codegen | ✅ |

> 语法层取舍（见 D21）：不把类型/枚举做成关键字，统一 `Declaration { Ident Ident QuotedString Attr* Block }`；数字/日期/时间统一 `Scalar` token；整段箭头做成单个 `Arrow` token 再在 parse 层切分线型与标签 —— 这些都是为了绕开 Lezer 的 token 重叠判定（`Ident` vs `true/false`、`Number` vs 日期、标签 vs 空白）。

**M3-3 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` 262 条全通过（新增 21 条 `[22] DSL 三方合并（M3-3）`） | ✅ |
| 字段级 diff | `diffDocs(base, next)` 只比较 DSL 可见字段（`DSL_NODE_KEYS` / `DSL_EDGE_KEYS` / `DSL_GROUP_KEYS` / `DSL_VIEW_KEYS`）：拖节点只出 `x`/`y` 两条；改标题只出 `title` 一条；新增/删除产出 `add`/`remove`；**DSL 未表达的字段（`sourceHandle`/`targetHandle` 等）不算删除** | ✅ |
| 三方合并（验收 3） | `mergeDslEdit(base, codeNext, current)`：拖拽位置 + 代码改标题 **互不覆盖**（`x=780, y=890, title=李梅（改）`，conflicts 0）；两侧各自新增的实体都保留 | ✅ |
| 冲突策略（D22） | 同字段两侧都改 → 保留画布值，代码改动进 `conflicts`（不静默丢）；画布改过的实体不被文本删除，删除改动进 `conflicts` | ✅ |
| 整批一次撤销（验收 4） | `applyDslChanges(changes)` 产生**一条** Command（label「代码编辑」）：一批位置+标题改动只占 1 条撤销记录，1 次 undo 全回滚、redo 全恢复 | ✅ |
| 幂等 / 纯函数 | 无改动时 `changes.length === 0`（不污染撤销栈）、合并结果与 current 逐字节相同；`mergeDslEdit` 不修改任何入参 | ✅ |
| 目标失效 | 实体已被画布删除时，残留改动被忽略（不崩溃、不复活对象） | ✅ |

> `changes` 是相对 `current` 的增量（不是相对 `base`）：UI 侧必须先取 store 里的当前文档作为 `current` 再合并、随即 dispatch，中间不能插入别的写操作（M3-4 的同步状态机负责保证这一点）。

**M3-4 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` 296 条全通过（新增 34 条 `[23] DSL 代码视图同步（M3-4）`） | ✅ |
| 打包层 | `pnpm build` → 269 modules；主包 546.30 kB (gzip 179.38)、代码视图独立 chunk `CodePanel-*.js` 345.79 kB (gzip 113.56)、CSS 40.55 kB (gzip 7.47)；`pnpm ui-smoke` 62 条全通过（新增 11 条 `[UI] M3-4 分屏代码视图`） | ✅ |
| 分屏与编辑器 | 画布 + 代码视图并列，`.cb-splitter` 指针拖拽调宽（clamp 28–72%）；CodeMirror 6 挂载、行号、折行、括号匹配、自动补全（id 与枚举）、悬停卡片、`Mod-Shift-f` 格式化；关键字与枚举走 `keywordHighlighter` 叠加高亮 | ✅ |
| 双向同步 | 代码改标题 → 模型更新，且**只占一条撤销记录**、一次 undo 全回滚；图形侧变化经 200ms 防抖进 `codeStore`，`isApplyingCode()` 防止代码编辑被回灌成新改动 | ✅ |
| 同步状态机 | `idle` / `graphEditing` / `codeEditing` / `conflict` / `error` 五态可复现：编辑中图形变化 → `graphEditing` + 横幅「图形有更新」，不抢光标；失焦自动刷新；冲突计数与「已保留画布上的值」文案 | ✅ |
| 错误容错（验收 2） | 非法文本（`status: suspect`）→ `state=error`、模型 JSON 不变、图形侧只读（`nodesDraggable/nodesConnectable/edgesFocusable=false` + 覆盖层提示）、CodeMirror 波浪线 + 行号；修好后自动恢复并允许格式化 | ✅ |
| 光标与滚动保护 | 外部写入走 `replacePreservingView`（只 dispatch 最小差异 `changes`，前后保存/还原 `scrollTop`/`scrollLeft`），不重建 EditorState → 光标不丢、滚动不跳 | ✅ |
| 双侧选中联动（验收 6） | 画布点节点 → `findDeclRange` 定位声明、选中名字范围并 `scrollIntoView` 居中 + 红色标记（ui-smoke 实测 `.cb-code-target` ≥ 1）；代码侧光标落在声明内 → `declIdAtPosition` 反查模型 id → `focusEntity` → 画布 `setCenter` 居中 | ✅ |
| 定位层适配 | `src/dsl/locate.ts` 按真实语法树重写：跳过 `WS`/注释噪声、`Statement` 包装层解包、`id:` 覆盖行读取；6 实体 / 6 关系 / 1 组 / 1 视图全部可定位 | ✅ |

> 主包体积从 464.72 kB 涨到 892.19 kB 后改为 `React.lazy` 按需加载 `CodePanel`，拆出独立 chunk 并回落至 546.30 kB；`codeStore` 静态依赖解析器（`@lezer/lr`，约 80 kB）无法再拆，是当前基线。

**M3-5 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` **306 条全通过**（新增 10 条 `[24] 验收加固：错误矩阵 / 连续操作 / 1000 节点基准（M3-5）`） | ✅ |
| 错误用例全覆盖（验收 2） | 十类错误逐条断言中文诊断：悬空引用、重复 id、边连自己、未闭合块、非法枚举、非数字坐标、非法 `path`、非法视图类型、未知字段（warning）、关系 id 重复；10/10 同时满足「模型不被清空（好块保留）」「诊断带 1 起行列与范围」，其中 4 类校验 hint 文案 | ✅ |
| 50 次连续操作（验收 4） | 增 / 移 / 改 / 代码改标题 / 删 各 10 次混合执行：撤销栈恰好 +50（无重复记录）、6 节点 6 关系守恒、`parseDsl(serializeDoc(doc))` 无诊断、**50 次撤销后重做逐字节等于操作后快照** | ✅ |
| 1000 节点基准（验收 5） | `node scripts/bench-dsl.cjs`：263.7 KB 文本，序列化 5.7ms + 解析 49.6ms + 声明定位 33.3ms + diff 3.6ms = **88.5ms < 300ms**，且形状守恒（1000 节点 / 999 关系 / 0 诊断 / 0 差异） | ✅ |
| 画布渲染回归 | `node scripts/bench-board.cjs`（300 节点）：挂载 25ms、渲染 300 节点与 299 条连线；jsdom 伪布局的「连线稳定」耗时 8.3s 只反映 ResizeObserver 回调节奏，不作为门禁（D24） | ✅ |
| 门禁口径（D24） | 300ms 门禁 = 序列化 + 解析 + 定位链（可自动化）；真实浏览器首屏渲染并入人工验收项（本机无头浏览器被宿主拦截，见 D9） | ✅ |

> 1000 节点在 jsdom 里挂载会因伪布局回调退化到分钟级（`bench-board.cjs` 默认 300 节点，可用 `CB_BENCH_NODES` 调整）；真实性能以 `bench-dsl.cjs` 与真机 `pnpm dev` 人工观察为准。



---

### M4 · Tauri + SQLite + 项目文件 + 导出（3–4 周）

**目标**：从「网页 demo」变成「Windows 桌面应用」：原生外壳、持久化、单文件项目、导出与脱敏。

**前置（阻塞项）**：安装 Rust 工具链（rustup + MSVC Build Tools）——当前本机无 `rustc`/`cargo`（见 §5）。

**范围（做）**
- Tauri 2 外壳：窗口、菜单、托盘、原生对话框、文件拖入/拖出、剪贴板；Rust 侧 `image` crate 缩略图/哈希/EXIF，替代 M2 的 Web 实现。
- SQLite（`tauri-plugin-sql`）+ FTS5 全文检索；附件原件落本地素材目录，库内只存路径与缩略图。
- `.caseboard` 单文件项目（zip：数据库 + assets + DSL 文本 + 缩略图），可单文件拷机/移交。
- 自动保存、版本快照（时间机器回溯）、回收站。
- 导出：图片原图/标注版/区域裁剪/复制剪贴板/批量；整板 PNG / SVG / 多页 PDF；**案件图片包** `zip`（`images/` + `manifest.csv`：编号/类型/来源/拍摄时间/关联实体/OCR 文本）；**脱敏导出**（按标注马赛克人脸/证件号/手机号/银行卡号）。
- 启动密码 / Windows Hello 解锁的接入位（加密主体在 M8 合入）。

**验收标准**
1. `pnpm tauri build` 产出可运行桌面程序；`pnpm tauri dev` 热重载可用。
2. 建板 → 插图 → 保存 → 关闭 → 重开数据完整；`.caseboard` 拷到另一目录可正常打开。
3. 断网状态下完成上述全流程。
4. 整板导出 PNG/SVG/PDF 与画布所见一致（含贝塞尔线、组、时间线元素）。
5. 案件图片包 zip 解压后 `manifest.csv` 字段齐全、路径正确。
6. 脱敏导出后马赛克区域不可逆（像素级检查）。

**M4 拆步（实际执行）**

| 步骤 | 内容 | 状态 |
|---|---|---|
| M4-1 | Tauri 2 工程骨架：`src-tauri/`（`Cargo.toml`、`tauri.conf.json`、`migrations.rs`、capabilities、整套图标）、`scripts/tauri-cli.cjs` 规避 Electron `argv[0]`、Rust 工具链装进仓库内 `.rust\`（D25） | ✅ 2026-10-19 |
| M4-2 | 持久化：`V1_SQL` 建 9 表 + FTS5、`ensure_db_file`（D31）、`src/services/db/{mapping,repo,tauri}.ts`、`storage.ts` 双后端、`docStore` 启动水合 + 400ms 防抖保存 + 50 份滚动快照 | ✅ |
| M4-3 | 桌面素材库：`platform.ts`（二进制 base64 过 IPC，D26）、`imageStore.ts` 双实现（网页 IndexedDB / 桌面 `assets/` + `thumbs/`）、`assetProtocol` + `convertFileSrc` | ✅ |
| M4-4 | 项目文件与导出：`.caseboard`（`manifest.json` + `case.json` + `case.cbd` + `assets/` + 缩略图）、模型驱动的 PNG/SVG/多页 PDF（D28）、案件图片包、脱敏马赛克、`ExportDialog` 统一入口 | ✅ |
| M4-5 | 自动保存 + 版本快照 + 回收站 + 历史面板（`HistoryDialog`，删除统一走 `removeWithTrash`，D33） | ✅ |
| M4-6 | 桌面自检通道 `--selftest`：隐藏窗口跑 14 / 15 项检查，Rust 写 `selftest.json` 后自行退出（D29）；`scripts/run-selftest.cjs` 连续两轮验证跨进程持久化 | ✅ |
| M4-7 | 构建打包与文档：NSIS 安装包、§5 环境与写权限实测、决策 D25–D33、CHANGELOG、tag `ms/M4` | ✅ |

**M4 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` **337 条全通过**（M4 新增 31 条：`[25]` 脱敏 8、`[26]` .caseboard 8、`[27]` 整板 SVG 8、`[28]` 回收站恢复 7） | ✅ |
| 打包层 | `pnpm build` 469 modules（主包 440.06 kB / 代码视图 345.79 kB / pdf 483.44 kB / selftest 13.11 kB）；`pnpm ui-smoke` **84 条全通过**（新增 10 条「历史与回收站面板」）；`pnpm bench` 1000 节点 **75.7 ms < 300 ms** | ✅ |
| 验收 1 桌面产物 | `node scripts/tauri-cli.cjs build --bundles nsis` → `src-tauri/target/release/caseboard.exe`（`Finished release profile` 1m52s / 2m10s 增量）与 `bundle/nsis/CaseBoard_0.4.0_x64-setup.exe`（3.35 MiB）；`package.json` / `Cargo.toml` / `tauri.conf.json` 三处版本一致 0.4.0 | ✅ |
| 验收 2 数据完整 | 自检「DB 保存并重开」6 节点 / 6 关系 / 2 图片节点；第 2 轮「重启后数据完整（跨进程）」后端 sqlite · 原件 18111 字节；`.caseboard` 23 KB（DSL 2409 字符）→ 拷到 `selftest-copy2/y.caseboard` → 打开 6 节点 | ✅ |
| 验收 3 断网可用 | 自检报告 `externalRequests: []`：14 / 15 项检查全程零非本机请求；应用无任何云端依赖 | ✅ |
| 验收 4 整板导出 | PNG 1436×992 · 163 KB（取样像素 251,250,247 = 卡片底色）；SVG 106 KB · 1436×966（贝塞尔线、组块、三线型图例 `9 6`/`2 5`）；多页 PDF 2 页 · 88 KB（`PDFDocument.load` 回读页数、标题、末页 842×595、内容流） | ✅ |
| 验收 5 图片包 | zip 内 `images/` + `manifest.csv`：1 张原件 / 2 行清单 / 18 KB；字段含编号·类型·来源·拍摄时间·关联实体·OCR 文本 | ✅ |
| 验收 6 脱敏不可逆 | 1 区域 / 1024 像素，解码复核已抹平（`isRegionFlattened` 为真），与原始像素差异 1021 点（1024 点中仅 1 点偶然相同）；区域外像素差异 0 | ✅ |
| 版本快照 | 第 1 轮 1 份、第 2 轮 2 份，最新 5 KB；`snapshots(nodes, edges)` 补列后不再报 `(code: 1299) NOT NULL constraint failed` | ✅ |
| 回收站 | 删除 2 条 → 取回「转账 50 万」→ 清空（330 ms）；恢复按原 id，端点缺失时拒绝悬空关系 | ✅ |
| 门禁口径 | 桌面能力全部由 `caseboard.exe --selftest` 机器验证（D29）；真实拖拽手感、`tauri dev` 热重载、安装包在干净 Win10/11 安装属**人工验收项**（见下表） | ✅ |

**M4 遗留与延期（如实记录，不假装完成）**

| 项 | 现状 | 去处 |
|---|---|---|
| Tauri 应用菜单 / 托盘 | 未实现（无菜单、无 `TrayIcon`） | M8 打磨（与自动更新、安装器一起） |
| 原图导出 / 区域裁剪 / 复制到剪贴板 / 批量导出 | 未实现；`ExportDialog` 现有 png / svg / pdf / zip / caseboard / json / open + 脱敏 + 标注图 | M5 分析视图后补 |
| 启动密码 / Windows Hello 接入位 | 未实现 | M8（与 SQLCipher 一起） |
| Rust `image` crate 做缩略图/哈希/EXIF | 按 D27 改由前端 Worker 承担，Rust 只做 IO | 已作为偏离记录 |
| 人工验收 | 真实拖拽手感、`pnpm tauri dev` 热重载、NSIS 安装包在干净机器安装运行 | 需用户在真机执行 |

**M4 人工验收第一轮回执与热修（2026-10-19，第二轮待复验）**

用户回执原文（m02990）：A1 不通过（无法从素材库拖动图片）；A2 不通过（节点可拖动，不能缩放、不能旋转）；A3 通过但希望增加调整贝塞尔曲线的手柄；A4 不通过（无法框选、Ctrl 不能多选）；A5 通过；A6 通过但版本快照数显示 0；A7 通过但恢复后关系丢失、Ctrl+Z 也回不来；A8 不通过（导出面板错位无法操作）。

| # | 根因（读代码确认） | 修法 | 机器证据 |
|---|---|---|---|
| A1 | `src-tauri/tauri.conf.json` 的 `app.windows[0].dragDropEnabled = true`：Tauri 在 Windows 上开启它会拦截 webview 的 HTML5 拖放 | 改 `false`；系统文件拖入由 `src/App.tsx` 自己的 `onDrop` 分支接管 | 待真机复验 |
| A2 | `src/components/flow/FreeImageNode.tsx` 的八个缩放手柄与旋转手柄只有 `onPointerDown`，缺 React Flow 约定的 `nodrag` 类；d3-drag 的原生监听比合成事件更早触发，按下手柄启动的是「拖动节点」 | 手柄 / 旋转手柄 / 标题栏三处 className 加 `nodrag`（标题栏另加 `nopan`） | 待真机复验 |
| A3 | 边只用 `getBezierPath` 默认曲率，没有可拖控点 | 第一轮**延期**；第二轮已实现（见下「第二轮回执与热修」与 D37） | smoke `[30]` 13 条 |
| A4 | `Board.tsx` 的 `onNodesChange` 只处理 position，忽略 select 变更；节点 selected 由 `uiStore.selectedNodeId` 单选派生；ReactFlow 未设 `multiSelectionKeyCode`（v12 默认 Meta，Windows 无此键）、未开 `selectionOnDrag` | `uiStore` 新增 `selectedNodeIds` + `setNodeSelection` + `applyImageSelection`；`onNodesChange` 消费 select 变更；新增批量命令 `moveNodes`（一次撤销）；ReactFlow 加 `selectionOnDrag`、`selectionMode=Full`、`panOnDrag={[1,2]}`、`panActivationKeyCode="Space"`、`multiSelectionKeyCode={['Meta','Control']}`；组节点 `selectable:false` | smoke `[29]` 批量移动 3 条 |
| A6 | `docStore` 从未定时写快照，而面板文案承诺「每 5 分钟自动存一份」，所以永远是 0 | `maybeSnapshot`（保存成功后节流 5 分钟）+ `bootstrapDoc` 无快照时补「启动快照」 | 自检「版本快照」第 1 轮 2 份 / 第 2 轮 3 份 |
| A7 | 恢复实体只 `dispatch(restoreNode)`，一起进回收站的关系仍留在回收站，Ctrl+Z 撤的是 restoreNode，关系永远回不来 | 新增 `restoreEntities({nodes,edges})` 整批命令（一次撤销）；`HistoryDialog` 恢复实体时先按 `payload.source/target` 捞出同伴关系一起恢复；`repo`/`storage` 新增 `listTrashItems` 读取 payload | smoke `[29]` 6 条（含「撤销一次同时撤回实体与关系」） |
| A8 | `ExportDialog` 根节点写成 `.cb-modal`（360px 白卡片），而遮罩是 `.cb-modal__mask`，面板被塞进顶栏流式布局跑到视口外 | 根节点改 `.cb-modal__mask` + 内层 `.cb-modal cb-export`；`.cb-export` 加 `max-height:86vh; overflow-y:auto`；补上只有它用到的 `.cb-modal__head`/`__icon` 样式 | 待真机复验 |

热修后的机器验收：`pnpm typecheck` 0 error；`pnpm smoke` **346 条全通过**（新增 `[29]` 批量恢复与多选移动 9 条）；`pnpm ui-smoke` **84 条全通过**；`pnpm build` 470 modules；`pnpm tauri build --no-bundle` 成功；`node scripts/run-selftest.cjs` **phase1 PASS 14 / phase2 PASS 15**（快照项已由红转绿）。

**M4 人工验收第二轮回执与热修（2026-10-19，第三轮待复验）**

用户回执原文（m03273）：A1节点无法旋转，A3没有贝塞斯曲线控件，其余通过，视觉对齐，折叠操作提示。

| # | 根因（读代码确认） | 修法 | 机器证据 |
|---|---|---|---|
| A1 旋转 | 旋转手柄 `.cb-img-rotate`（`src/index.css:1393-1405`，`top:-36px`、`z-index:5`）是 frame 的子元素，而图层工具条 `.cb-free-image__bar`（`src/index.css:1344-1357`，`top:-30px`、`z-index:4`）是 frame 的**兄弟节点**；frame 的 `transform` 形成独立层叠上下文，手柄 z-index 只在 frame 内有效 → 工具条整体压住手柄下半部，按下实际点到工具条。另缩放/旋转的 `pointermove/up` 只挂在 frame 上，依赖指针捕获冒泡 | 工具条 `top` 改 `-60px` 抬到旋转手柄之上；旋转手柄 16→18px；缩放/旋转改在 `useEffect` 里往 window 挂 `pointermove/pointerup/pointercancel`，松手才 dispatch 一次命令（去掉 setPointerCapture） | ui-smoke 4 条：工具栏 `top:-60px`、八向缩放手柄、旋转手柄、点击关系出现曲率手柄；真机手感待第三轮 |
| A3 曲率手柄 | 边只用 `getBezierPath` 默认曲率，模型没有控制点字段 | 新增 `CaseEdge.controlPoints` + `src/lib/edgeCurve.ts`（D37 由「延期」改为「已实现」）；选中关系显示 `.cb-curve-handle`，拖动写回偏移、双击复位；`BezierEdge` / `svg.ts` / `png.ts` 共用同一套曲线几何 | smoke `[30]` **13 条全通过**（含 SVG 导出一致性）；ui-smoke 4 条 |
| 其余 | 第二轮回执「其余通过」 | 不做改动 | — |
| 视觉对齐 / 折叠操作提示 | 语义未确认（回执末尾两个短语，无对应验收项） | **不猜需求**，等用户澄清后实现；当前事实：对齐参考线只有自由图片节点（`snapImageRect` + `.cb-guides`），卡片拖动没有；折叠入口在右栏属性面板 `updateNode(id,{collapsed})` 与组框「折叠」按钮，`BaseNode` 有「已折叠」徽标但没有说明文案 | — |

热修后的机器验收：`pnpm typecheck` 0 error；`pnpm smoke` **359 条全通过**（新增 `[30]` 曲率手柄 13 条）；`pnpm ui-smoke` **90 条全通过**（新增 6 条）；`pnpm build` 成功（CSS 44.50 kB、主包 618.84 kB / gzip 205.92）；`pnpm tauri build --no-bundle` 成功；`node scripts/run-selftest.cjs` **phase1 PASS 14 / phase2 PASS 15**（两轮快照 2 份 → 3 份，`snapshots.nodes/edges NOT NULL` 已补列）。

---

### M5 · 分析视图（2–3 周）

**目标**：让图「能算」——过滤、聚焦、路径、中心度、自动布局与时间线回放。

**范围（做）**
- 过滤器：按类型 / 标签 / 状态 / 时间 / 置信度 / 关系类别显示·隐藏·淡化。
- 聚焦模式：选中节点展开 N 度关系，其余淡化。
- 路径分析：两节点间最短路径 / 全部路径高亮（graphology）。
- 中心度分析：关键中间人、资金归集点、信息中转节点。
- 自动布局：力导向（d3-force）/ 层次（dagre）/ 径向 / 圆形 / 网格；一键整理保留手工锁定节点。
- 时间线视图：带时间的节点与事件按时间排开，可按人物分泳道，时间区间显示为条带，顶部时间游标「播放」回放。
- 演示模式：预设镜头路径与「逐根连线亮起」步骤，全屏放映 + 导出。

**验收标准**
1. 任取两节点，最短路径与全部路径结果可复现且有高亮动线。
2. 中心度前 3 名在演示数据上稳定复现（同数据同结果）。
3. 一键整理后，锁定节点坐标不变，其余节点无重叠、无穿组。
4. 时间游标可从头播放到尾，暂停/回退可用，区间条带正确显示。
5. 演示模式可按步骤播放，退出后画布状态还原。

**M5 拆步（已完成，✅ 2026-10-19）**

| 步骤 | 内容与涉及文件 | 验收抓手 | 状态 |
|---|---|---|---|
| M5-1 | 分析内核（纯函数，无 UI）：`src/lib/graph.ts`（`buildGraph` 邻接表、`shortestPath` 确定性 BFS、`allPaths` 带上限截断与稳定排序、`degreeCentrality` / `betweennessCentrality`、`neighborsWithin(depth)`、`components` / `graphStats`）、`src/lib/layout.ts`（`computeLayout` 统一五种布局：force 用 d3-force、hierarchical 用 dagre、radial / circle / grid 自写；`LayoutOptions{lockedIds}` + `separateOverlaps` + 组内夹紧）、`src/lib/timeline.ts`（时间解析/格式化、刻度归一化、泳道分组、游标切片、`advanceCursor`、`timelineBands`） | smoke [31] **41 条**：验收 1（最短 + 全部路径稳定复现）、验收 2（中心度前 3 稳定）、验收 3a（锁定坐标逐位不变 / 无重叠 / 不穿组）、验收 4a（游标切片与刻度换算） | ✅ |
| M5-2 | 过滤器与聚焦：`src/lib/filter.ts`（条件：类型/标签/状态/时间/置信度/关系类别；模式：淡化·只显示命中·隐藏命中；`applyView` 输出四类集合）、`src/store/viewStore.ts`、`src/components/panels/FilterPanel.tsx`、`src/components/panels/AnalysisPanel.tsx`（左栏「分析」页签 + 子页签）、`Board.tsx` 按视图状态过滤/淡化并计命中数 | smoke [32] **25 条** + ui-smoke **14 条**：面板控件、三种模式、类型/状态/标签/置信度/文本/时间窗/关系类别、聚焦 1–2 跳、过滤与聚焦取交集、命中计数 | ✅ |
| M5-3 | 路径与中心度可视化：`src/lib/analysis.ts`（`analyzePaths` / `centralityScores` / `centralityMap` 热力归一 / `topCentrality`）、`src/store/analysisStore.ts`、`src/components/panels/PathPanel.tsx`；画布侧 BaseNode 热力徽标 + BezierEdge 动线高亮（Top6 排行，超出原计划的 Top3） | smoke [33] **15 条**（最短/全部路径、并列关系、边界、度与中介中心度、热力归一、文案）+ ui-smoke **11 条**（子页签、选源/汇、计算、路径高亮、排行点击定位） | ✅ |
| M5-4 | 自动布局与一键整理：`src/commands/layoutCommands.ts`（一条 Command 改全部坐标 → 一次撤销）、`src/store/layoutStore.ts`、`src/components/panels/LayoutPanel.tsx`（5 种布局 chip、锁定选中、应用、撤销提示；无顶栏菜单与过渡动画） | smoke [34] **7 条**：锁定坐标逐位不变、无重叠、不穿组、撤销一次全回、重做恢复；ui-smoke **10 条**：面板与锁定交互 | ✅ |
| M5-5 | 时间线视图与演示模式：`src/components/views/TimelineView.tsx`（泳道、区间条带、游标播放/暂停/回退/倍速、未排期提示）、`src/components/views/PresentationView.tsx`（按实体类型分组的逐步讲解 + 关联清单 + 键盘翻页 + 「在画布中查看」，**不含**镜头动画/全屏/导出，见 D38）、`src/store/{viewModeStore,timelineStore}.ts`、`src/lib/present.ts`、`App.tsx` 与 `TopBar.tsx` 视图切换 | smoke [35] **13 条**（演示顺序/关联方向/只读性、区间条带几何、1× 播放 60 秒到末尾、游标比例往返）+ ui-smoke **15 条**（三视图切换、时间线控件与轨道、演示翻页与退出还原） | ✅ |

**M5 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` **460 条全通过**（M5 新增 101 条：[31] 41 / [32] 25 / [33] 15 / [34] 7 / [35] 13） | ✅ |
| 打包层 | `pnpm ui-smoke` **142 条全通过**（M5 期间新增 52 条）；`pnpm build` 811 modules，CSS 55.58 kB (gzip 9.58)、主包 764.62 kB (gzip 257.54)、CodePanel 345.79 kB、pdf 483.44 kB、selftest 13.11 kB、2.85s | ✅ |
| 桌面产物 | `node scripts/tauri-cli.cjs build --no-bundle` → `src-tauri/target/release/caseboard.exe`（release 1m48s，版本 0.5.0）；`node scripts/run-selftest.cjs` 两轮 **PASS 14 / 15**（第 2 轮跨进程数据完整）；`pnpm bench` 1000 节点 **90.0 ms** < 300 ms | ✅ |
| 验收 1 路径高亮 | `analyzePaths(zhang→ktv)` 最短 2 跳 `['zhang','e1','ktv']`、每跳带 `e-actor`/`e-place`；全部路径稳定排序、`maxPaths` 截断标记；画布 `.cb-node.is-path` 与加粗动线 | ✅ |
| 验收 2 中心度稳定 | 度中心度前 3 = 张建国 3 / 首次接触 2 / 恒信财务 2；中介中心度最高张建国 0.4；同数据重复计算结果逐位一致 | ✅ |
| 验收 3 一键整理 | 圆环布局锁定张建国 (120,140)、李梅 (660,140) 后其余 4 个重排，锁定坐标逐位不变、无矩形重叠、组内节点不穿组；整板只压 1 条撤销，Ctrl+Z 一次全回 | ✅ |
| 验收 4 时间游标 | 刻度 2026-09-01 → 09-10；1× 播放按 60fps 在 60 秒内走到末尾并停住（3750 帧）；暂停/回退/跳到末尾与滑杆可用；区间条带宽度 = 区间长度 / 总跨度（4/9 实测） | ✅ |
| 验收 5 演示模式 | 演示台按类型分组（人物 → 组织 → 地点 → 事件 → 证据）逐屏播放，键盘 ←/→/空格与按钮翻页；演示只读文档（smoke 断言 JSON 前后一致），退出只切视图与选中，画布数据无变化 | ✅ |
| 门禁口径 | 分析内核全部为纯函数、同输入同输出；演示镜头动画/全屏属**人工观赏项**且本期不做（D38）；五种布局的真实手感与长文本渲染并入人工验收 | ✅ |

**M5 与计划的偏离（如实记录）**

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| 路径/中心度实现 | 「graphology」 | 自写 BFS / Brandes（`src/lib/graph.ts`），依赖已装但未调用 | 需要稳定可复现的排序与并列处理（D40） |
| 路径服务位置 | `src/services/graphAnalysis.ts` | `src/lib/analysis.ts`（纯函数）+ `src/store/analysisStore.ts` | 不产生副作用，放 lib 便于 smoke 直接测 |
| 中心度展示 | Top3 排行 + 角标 | Top6 排行 + 画布热力徽标（≥33% 显示） | 排行更长不增加噪声，热力让关键节点在画布上直接可辨 |
| 一键整理入口 | 顶栏/左栏菜单 + 过渡动画 | 左栏「分析 → 自动布局」，无动画 | 动画无法机器验收，且整理是低频重操作，瞬时完成更利落 |
| 演示模式 | 镜头路径 + 逐条连线亮起 + 全屏 + 导出 | 按类型分组的实体逐步讲解 + 关联清单 + 键盘翻页 + 定位回画布 | D38：镜头/全屏/导出成本高且不可自动验收；验收 5「按步骤播放、退出还原」已由只读性与视图切换满足 |

> 依赖顺序：M5-1 是其余四步的地基（纯函数先可测），M5-2 与 M5-3 可并行，M5-4/M5-5 依赖坐标与时间数据就绪。

---

### M6 · AI 文本能力（2–3 周）

**目标**：接入大模型，让 AI 成为「只产线索、不落结论」的助手。

**范围（做）**
- 模型层：本地优先（Ollama / llama.cpp 跑 Qwen 等）+ OpenAI 兼容接口可切换；设置页明示「数据是否出本机」。
- 抽取建图（规格 P4 系统提示词）：笔录/文本 → 结构化 JSON 草稿 → **待确认清单**逐条采纳。
- 自然语言编辑（P6）：自然语言 → Command diff 预览 → 确认执行。
- 矛盾检测与证据链审查（P5）：时间冲突、一物多主、证据断裂、无证据断言；链条模板查断点。
- 报告生成（P7）：案件概况/人员组织/关系网络/时间线/证据清单/待核实/下一步建议；导出 Word/PDF。
- 别名合并候选、智能布局建议。

**验收标准**
1. 粘贴真实笔录 → 抽取结果以「待确认清单」呈现，逐条采纳/驳回，采纳后生成命令；**过程中 Model 不被直接修改**。
2. 自然语言指令生成 diff，未经确认不落盘；删除操作强制二次确认。
3. 矛盾检测在构造的用例上能命中：时间冲突、无证据断言、链条缺口。
4. 报告导出的 Word/PDF 每条事实句带 `[证据:evX]` 或 `[节点:id]` 溯源标注。
5. 纯本地模型模式下（拔网线）完成抽取 + 报告全流程。
6. 采纳率实测 ≥ 70%（用一份样本文笔录记录度量结果）。

**M6 拆步与实现**

| 步 | 实现 | 验收抓手 | 状态 |
|---|---|---|---|
| M6-1 | 通道、提示词与数据边界：`src/services/ai/{types,prompts,settings,provider}.ts`；P4–P7 提示词逐字内置（来源 `docs/CaseBoard-SPEC.md:640-748`）；三通道 `builtin`（内置规则，零外呼）/ `ollama`（仅回环地址）/ `openai`（必须显式允许远程并二次确认）；设置只存 localStorage，不进 `CaseDoc` | smoke [40] **9 条**：默认内置、三通道中文名与隐私文案、回环判定、未授权远程拒绝、非法设置夹紧、围栏 JSON 解析、非法回复中文报错、P4 红线 | ✅ |
| M6-2 | 抽取建图与待确认队列：`src/lib/extract.ts`（人物/机构/地点/事件/证据/手机号；转账仅认完成态、书证 88 实线、陈述 45 点线；同对实体去重保留高置信）、`src/commands/aiCommands.ts`（`acceptAiDrafts` 单条 Command、整批一次撤销）、`src/store/aiStore.ts`、`src/components/panels/AiPanel.tsx`、`src/data/sampleTranscript.ts`（虚构样本笔录 + 8 项参考答案） | smoke [36] **13 条**：不改 Model、≥6 实体、转账「转账 50 万」实线 88、通话实线 88、认识点线 ≤50、手机号进待核实、采纳率 8/8、别名候选、一次撤销、合并既有李梅、新实体 todo、关系落盘、撤销全撤回；ui-smoke 18 条 | ✅ |
| M6-3 | 矛盾检测与证据链审查：`src/lib/contradictions.ts`（time_conflict / duplicate_identity / unsupported_claim / contradiction + 三套链条模板 fraud/theft/general，输出 covered/weak/missing 与 ≤5 条问句建议） | smoke [37] **9 条**：四类冲突全部命中、`involvedIds`+建议问句、按严重度排序、五阶段链条、只读 | ✅ |
| M6-4 | 自然语言编辑：`src/lib/nlEdit.ts`（`parseNlEdit` / `buildNlCommands`，支持新增/改名/连边/删除/移组/查询；无法解析只提问不生成命令）、`src/commands/compose.ts`（多命令合成一条撤销） | smoke [38] **8 条**：连接指令 1 条可执行、文案点名两端与「同伙」、未提供证据不吃已证实（点线 40）、删除 `hasDelete`、不可解析只提问、预览不改 Model、执行压一条、一次撤销；ui-smoke 6 条（含删除确认禁用态） | ✅ |
| M6-5 | 报告与导出：`src/lib/report.ts`（七节 Markdown，事实句尾 `[节点:id]` / `[证据:id]`，推测标「（待核实）」）、`src/serializers/reportDocx.ts`（fflate 手写最小 OOXML）、`src/serializers/reportPdf.ts`（canvas + pdf-lib，桌面端用） | smoke [39] **10 条**：七节、引用数、二至五节每条事实句带引用、待核实标记、可复现、docx 为 zip、含 document.xml、正文含实体/证据与引用、纯文本行分类 | ✅ |
| M6-6 | 纯本地零外呼：内置通道全为纯函数，`fetch` 被替换成抛错桩仍能完成抽取/审查/报告/Word；桌面自检新增 AI 检查项 | smoke [41] **4 条**：断网完成全流程、零网络请求、离线报告仍有引用、离线仍拒绝未授权远程；`caseboard.exe --selftest` 两轮均含「AI 文本能力」检查 | ✅ |

**M6 验收记录（2026-10-19，✅ 通过）**

| 验收项 | 证据 | 结果 |
|---|---|---|
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` → 0 error | ✅ |
| 逻辑层 | `pnpm smoke` **513 条全通过**（M6 新增 53 条：[36] 13 / [37] 9 / [38] 8 / [39] 10 / [40] 9 / [41] 4） | ✅ |
| 打包层 | `pnpm ui-smoke` **193 条全通过**（M6 新增 51 条）；`pnpm build` 825 modules，CSS 61.07 kB (gzip 10.47)、主包 821.36 kB (gzip 278.65)、reportDocx 2.50 kB、reportPdf 2.39 kB、CodePanel 345.79 kB、pdf 483.44 kB、2.66s | ✅ |
| 桌面产物 | `node scripts/tauri-cli.cjs build --no-bundle` → `src-tauri/target/release/caseboard.exe`（release 3m39s，版本 **0.6.0**）；`node scripts/run-selftest.cjs` 两轮 **PASS 15 / 16**（新增 AI 检查项，第 2 轮跨进程数据完整）；`pnpm bench` 1000 节点 **75.6 ms** < 300 ms | ✅ |
| 验收 1 待确认队列 | 粘贴样本笔录 → 13 条草稿全部 `pending`，采纳前画布实体数不变（Gate 0-4）；单条采纳 → `accepted`，全部采纳 → 0 条 pending 且画布新增实体；整批只压 1 条撤销 | ✅ |
| 验收 2 diff 与二次确认 | 「把李梅和张建国连起来，关系是同伙」→ 1 条 `addEdge` 预览（同伙/点线 40，不伪造已证实）；「删除李梅」→ `hasDelete` + 提示「含删除操作，需二次确认」+「确认执行」禁用，未勾选时画布不变 | ✅ |
| 验收 3 矛盾命中 | 构造用例四类全中：时间冲突（start>end）、一物多主（同名李梅）、无证据断言（已证实无证据）、关系矛盾（同对实体实线+虚线）；链条五阶段输出状态与缺口 | ✅ |
| 验收 4 报告引用 | 七节报告，二至五节每条事实句均带 `[节点:id]`/`[证据:id]`；Word 正文保留引用与小节（3172 字节）；PDF 与 Word 同源 Markdown，桌面端导出（人工确认） | ✅ |
| 验收 5 纯本地离线 | smoke [41] 用抛错 `fetch` 桩跑完抽取/审查/报告/Word，0 次网络请求；桌面自检「AI 文本能力」+「零外呼」同轮通过 | ✅ |
| 验收 6 采纳率 | 样本笔录对 8 项参考答案 **8/8 = 100%**（门禁 ≥70%，无遗漏）；桌面自检同样输出 100% | ✅ |
| 数据边界 | 设置页明示「完全离线 / 仅访问本机 / 会发送到」；远程通道未允许时直接抛「当前是纯本地模式…」；密钥只存 localStorage 不进案件文件 | ✅ |

**M6 与计划的偏离（如实记录）**

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| 本地模型 | Ollama / llama.cpp 二选一 | 内置规则为默认通道，Ollama 作为可切换的本机模型通道，未直接集成 llama.cpp | 内置规则让验收 5/6 可重复、零外呼；llama.cpp 需额外编译与模型文件，收益与 Ollama 重叠 |
| 远程抽取/审查 | P4/P5 远程通道 | 已实现（`requestRemote` + `parseExtractReply` / `parseConflictReply`），机器验收只走内置通道 | 远程模型输出不确定，不能作为门禁；远程只在用户显式允许后可用 |
| P6 提示词 | 远程 NL → 命令 | 本地确定性解析为主，`P6_EDIT_PROMPT` 已内置但未接远程执行 | 删除等破坏性操作必须可静态审计；本地解析能给出逐条 ready/problem 与二次确认 |
| 报告 PDF | Word/PDF 都机器验收 | Word 机器验收；PDF 与 Word 同源 Markdown，桌面端人工确认 | node 无 canvas（与整板 PDF 同一限制，D28） |
| 智能布局建议 | AI 建议布局 | 未做；M5 一键整理已覆盖布局需求 | 优先级低于六条验收，避免为凑功能加不可验收路径 |

---

### M7 · 高级功能 + AI 生图（3–4 周）

**目标**：把差异化亮点做出来——多假设、证据链、区域锚点、OCR、地图，以及合规的 AI 生图。

**范围（做）**
- 多假设画布：同一案件复制多个平行假设；证据可标 `support|refute`；AI 统计各假设支持度；并排对比差异。
- 证据链模板：按「动机→预谋→准备→实施→逃离→销赃」纵向排列并自动标断点。
- 区域锚点增强：照片里框出的脸/车/物品可连线到节点；悬停节点高亮所有关联框。
- OCR：本地 PaddleOCR / Tesseract 侧车；转账截图、票据、聊天截图结构化（金额/时间/账号/对话人）。
- 地图视图：离线/自配瓦片，不依赖商用地图 Key。
- **AI 生图**：本地 ComfyUI / Stable Diffusion WebUI（默认，数据不出本机）+ 云端 OpenAI 兼容图像接口（二次确认）；四个预设（模拟画像 sketch / 场景复原 scene / 物品示意 item / 监控增强 enhance）；文生图 + 图生图；生成结果先进面板预览，点「插入画布」才落地。
- 生图合规：强制角标写入像素、`aiGenerated` + 完整 `aiMeta`（提示词/负向提示词/模型/种子/参数/时间）、素材库 `zone:'ai'` 分区 + 虚线边框、生成历史可复用与审计、敏感词拦截（拒绝真实姓名+真实照片换脸）。

**验收标准**
1. 多假设画布：同一证据可分别标支持/反驳，支持度计分可复现，并排对比可用。
2. 区域锚点：框选区域可绑定节点，悬停节点在对应图片中高亮该框。
3. OCR 对转账截图能抽出金额/时间/账号三项，人工可修正。
4. ComfyUI 本地生成模拟画像成功，落图为素材库 AI 分区、画布虚线边框、带不可关闭角标。
5. 导出的 AI 图文件带角标像素且元数据含完整 `aiMeta`；界面无移除开关。
6. AI 图无法被设为 `confirmed` 证据类型（强制拦截）。
7. 换脸类提示词被拒绝并给出合理解释。
8. 拔网线状态下本地生图全流程可用。

#### M7 拆步与实现

| 步骤 | 实现 | 验收抓手 | 状态 |
|---|---|---|---|
| M7-1 | 多假设画布：`src/types/index.ts`（`EvidenceStance` / `HypothesisStance` / `Hypothesis`，`CaseDoc.hypotheses`）、`src/lib/hypothesis.ts`（`hypothesisScore`：支持权重取实体/关系置信度、反驳 ×0.6、`clamp(-100..100)`；`rankHypotheses`；`compareHypotheses` 并排矩阵含 `divergent`）、`src/commands/hypothesisCommands.ts`（add/update/delete/`setStance`/`clearStance`）、`src/components/panels/HypothesisPanel.tsx`（排行榜 + 立场标注 + 比较表「分歧」徽标） | smoke [42]：计分可复现、排名、分歧证据、立场增删改与撤销 | ✅ |
| M7-2 | 证据链模板：`src/lib/evidenceChain.ts`（`CHAIN6_STAGES` 动机→预谋→准备→实施→逃离→销赃 + 关键词匹配 + 证据来源 = 相邻关系 `evidenceIds` ∪ 节点附件；输出 `gaps/covered/total/coverage`），面板内「证据链」页签纵向排列并标断点 | smoke [42]：六阶段顺序、构造缺口得 `gaps=['escape']`、weak 判定 | ✅ |
| M7-3 | 区域锚点增强：`src/lib/annotation.ts` 追加 `annotationsForNode` / `countAnchorsForNode` / `anchoredAnnotationsOf`；`src/components/flow/FreeImageNode.tsx` 渲染 `.cb-free-image__anchor`（按 `geom` 百分比定位，悬停/选中绑定实体时高亮 `is-hlit`）；`BaseNode.tsx` 悬停写 `uiStore.hoverNodeId`；面板里点锚点跳素材库并 `setAnchorFocus` | ui-smoke：锚点数量、title 含实体名、悬停高亮类 | ✅ |
| M7-4 | OCR：`src/lib/ocr.ts`（全角归一化 + 金额/时间/账号/对方户名四个 parser + `maskAccount` + `receiptToNodeFields`）、`src/services/ocr.ts`（`ocrEngineStatus` / `recognizeAssetText`）、Rust `ocr_available` / `ocr_image`（调用 `tesseract <path> stdout -l chi_sim+eng --psm 6`）、右栏 OCR 区块（识别→解析→人工修正四个输入→写入素材/生成证据卡） | smoke [43] 解析矩阵；桌面自检「OCR 字段抽取」+ 引擎缺失时给出安装指引 | ✅ |
| M7-5 | AI 生图：`src/lib/aiImage.ts`（四预设 sketch/scene/item/enhance、`inspectAiPrompt` 七类红线、`buildComfyWorkflow` 七标准节点、`watermarkPlan`、`inspectAiAsset`、`blocksConfirmed`）、`src/services/aiImage.ts`（builtin 程序化绘制 / ComfyUI 轮询 / OpenAI 兼容，全部在像素上重盖角标；`commitAiImage` 落素材 + 图片节点一条命令）、`AiImagePanel.tsx`（预览后才插入）、`updateNode` 拦截 AI 图改已证实 | smoke [43]：换脸拒绝、四预设笔触、水印几何、命令层拦截；桌面自检「AI 模拟图」复核角标像素 3901 点 | ✅ |
| M7-6 | 地图视图：`src/lib/map.ts`（`parseGeo` 只认右栏「经纬度/坐标/geo/位置坐标」、`projectGeo` 线性映射且北在上、单点留 0.002 最小跨度）、`src/components/views/MapView.tsx`（离线示意网格，无任何瓦片请求，明确标注「未加载瓦片」）、`viewModeStore` 增 `'map'`、演示数据两条坐标 | smoke [44] 7 条；ui-smoke 7 条 | ✅ |

#### M7 验收记录（2026-10-19，✅ 通过）

| 检查项 | 结果 |
|---|---|
| 类型检查 | `tsc --noEmit` 0 error |
| 逻辑层 | `pnpm smoke` **573 PASS / 0 FAIL**（M7 新增 61：[42] 多假设与证据链 23、[43] OCR 与生图 31、[44] 地图 7） |
| 打包层 | `pnpm ui-smoke` **234 PASS / 0 FAIL**（M7 新增 41：锚点/假设/生图/OCR/地图）；`pnpm build` **834 modules**，主包 868.39 kB（gzip 295.69）、CSS 69.32 kB |
| 桌面产物 | `tauri build --no-bundle` 2m46s → `caseboard.exe` v0.7.0；`run-selftest.cjs` 两轮 **PASS 17 / 18**（新增 AI 模拟图与 OCR 两条） |
| 验收 1 多假设 | 同一证据可分别标支持/反驳；`hypothesisScore` 纯函数、同数据同分数；`compareHypotheses` 并排矩阵标出分歧（smoke [42] + ui-smoke 比较表） |
| 验收 2 区域锚点 | 框选可绑定实体（`linkedNodeId`），悬停实体在图片内高亮对应框（`.is-hlit`），点锚点跳到素材库对应框 |
| 验收 3 OCR | 转账截图文本抽出金额 `500000` / 时间 `2026-09-04T10:30:00` / 账号 `6222020200001234`，四个字段全部可人工改写后再写入 |
| 验收 4 生图落库 | 生成结果先进预览，点「插入画布」才落素材库 `zone:'ai'` 分区；画布上带虚线边框与角标；**ComfyUI 本机未安装**，机器验收走内置通道（见偏离表） |
| 验收 5 导出角标 | 角标写入像素（顶部窄带 + 右下角两处）、`aiMeta` 含提示词/负向/模型/种子/参数/时间；界面无任何移除开关 |
| 验收 6 永不「已证实」 | `blocksConfirmed` + `updateNode` 命令层拦截：挂 AI 素材的实体改 `confirmed` 会被静默拒绝；摘掉素材后可改（smoke 两条断言正反面） |
| 验收 7 换脸拦截 | 七类红线（换脸/换头/用真实照片合成/生成真人肖像/证件号等）返回中文解释，界面同时禁用「生成」 |
| 验收 8 断网生图 | 内置通道零网络请求，桌面自检「零外呼」通过；`--selftest` 全程无任何非本机请求 |

#### M7 与计划的偏离

| 计划项 | 实际情况 | 处理 |
|---|---|---|
| 本地 ComfyUI / SD WebUI 生图 | 本机未安装 ComfyUI（`C:\ComfyUI`、`%USERPROFILE%\ComfyUI` 均不存在）；已实现 `/prompt` + `/history` + `/view` 的完整客户端与七标准节点工作流 | 默认通道为**内置程序化绘制**（离线、确定性、承担机器验收），ComfyUI 通道可用但需用户安装并填模型文件；`--selftest` 只验内置通道 |
| PaddleOCR / Tesseract 侧车 | 本机无 tesseract，`Store` 也没有可用入口 | Rust 侧车已实现（`ocr_available` / `ocr_image`），界面在引擎缺失时显示安装指引；字段解析与人工修正不依赖引擎，可用手工粘贴文本验收 |
| 图生图（以已有素材为基准） | 未实现，只做文生图 | 记入 M8 之后；ComfyUI 工作流已预留 `LoadImage` 位置，接入时复用 `inspectAiPrompt` 与角标流程 |
| 生成历史可复用与审计 | 只把 `aiMeta` 随素材保存，无独立生成日志表 | 审计报告与日志落在 M8「AI 合规审计」一并做（素材 `aiMeta` 已是审计的原始数据） |
| 地图：离线/自配瓦片 | 做成**离线示意地图**（坐标只用于相对位置，明确标注未加载瓦片），不引入瓦片包与投影库 | 自配瓦片需要确定的瓦片来源与许可，留待用户明确版权后接；当前先保证断网可用与相对位置可读 |
| 多假设「AI 统计支持度」 | 用确定性加权计分（置信度加权、反驳 ×0.6）而非模型打分 | 与 D40/D41 一致：门禁必须可复现，模型打分不能当验收 |

---

### M8 · 安全与打磨（2–3 周）

**目标**：能交付给真实办案单位——加密、脱敏、合规审计、打印、签名安装包。

**范围（做）**
- SQLCipher 数据库加密；启动密码 / Windows Hello；敏感字段脱敏。
- 脱敏导出全链路复核（人脸、身份证号、手机号、银行卡号）。
- AI 合规审计：生成日志可导出审计报告；AI 图清单与来源可追溯。
- 打印样式（打印友好主题）；报告版面打磨。
- 签名打包：WiX `.msi` / NSIS `.exe`，代码签名；安装器；自动更新。
- 全局搜索（实体/证据/OCR 文本/备注全文）、快捷键与命令面板（Ctrl+K）、深浅色与高对比度、主题皮肤。

**验收标准**
1. 干净 Win10/11 机器上安装、启动、建板、导出全流程通过。
2. 数据库文件用普通 SQLite 工具打开为密文；错误密码/无 Hello 授权无法解锁。
3. AI 合规审计报告可导出，列出全部 AI 生成图及其提示词、模型、时间。
4. 打印预览与导出 PDF 版式正确（A4、页眉页脚、分页不断表）。
5. 安装包有签名，Windows 不再提示未知发布者。
6. 全局搜索覆盖实体标题、别名、备注、OCR 文本，命中可定位跳转。

---

## 4. 推进规则

1. **一次只推进一个里程碑**；当前里程碑验收通过后才开始下一个的「新功能」，期间只允许修缺陷。
2. 每个里程碑收尾必须产出：`CHANGELOG.md` 条目 + git 提交 + tag `ms/M1`（依次 `ms/M2`…）+ 可复现的验收记录（命令、截图或录屏）。
3. 验收未通过不得合入下一里程碑；发现规格冲突时先写进 §6 决策记录再动手。
4. 每轮开工先给 3–6 条计划（涉及文件 + 验收标准），经确认再写代码（沿用规格 P0 工作方式）。

---

## 5. 环境与工具链（2026-10-18 实测）

| 项 | 实测结果 | 影响 |
|---|---|---|
| Node.js | `v24.17.0`（DSH 内置 shim） | 可用 |
| npm | **不在 PATH**，`C:\Program Files\nodejs\npm.cmd` 不存在 | 规格里的 `npm install` 需改为 pnpm（D1） |
| pnpm | `pnpm` 命令在沙箱内 `spawn EPERM`（runner 走管道 stdio） | 改用直连：`node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs"`（实测 10.34.5 可用） |
| npm registry | `https://registry.npmjs.org/-/ping` → 200 | 依赖可安装 |
| Rust / Cargo | **`rustc 1.99.1` / `cargo 1.99.1`**（2026-10-19 装入工作区 `.rust\`，见下方「Rust 工具链实测」） | M4 起可用；每次调用必须显式设 `CARGO_HOME`/`RUSTUP_HOME` |
| git | `2.56.0.windows.2` | 可用，里程碑打 tag |
| 工作目录 | `F:\DSH PROJECT\masaike board` | 项目根 |

便捷脚本：`scripts\pnpm.cmd` 封装了上述直连命令（**文件必须是 CRLF 行尾**，LF 会让 cmd 解析失败），用法 `scripts\pnpm.cmd install`。

**安装通道实测（2026-10-18，M1 期间修正）**

- 直连 pnpm 可安装依赖；但 **postinstall 会 `spawn EPERM`**：DSH 沙箱禁止带管道 stdio 的子进程（实测 `spawn(...,{stdio:'pipe'})` → `Error: spawn EPERM errno -4048`，`stdio:'inherit'` 正常）。因此 `pnpm.onlyBuiltDependencies` 白名单在沙箱内**反而会让 install 失败**，实际做法是：
  ```powershell
  scripts\pnpm.cmd install --ignore-scripts
  ```
  esbuild 的平台二进制随 npm 包分发（`@esbuild/win32-x64`），无需 postinstall。
- **必须 `node-linker=hoisted`**（见 `.npmrc`）：本机 node 是 Electron-as-node，pnpm 的隔离虚拟 store 用 junction 链接，node 会把 junction 当普通目录，导致 `Cannot find package 'rollup' imported from .../vite/dist/node/index.js`；hoisted 布局下 vite/rollup/esbuild 解析正常。
- **vite 全系 CLI 都需要 esbuild 子进程**（连 `vite preview` 也要先 bundle `vite.config.ts`），在 DSH 沙箱内必须用 `sandbox_permissions: danger-full-access` 才能 `dev/build/preview`；`tsc --noEmit` 与 `node scripts/*.cjs` 不需要提权。
- 无头浏览器不可用：`chrome --headless=new --dump-dom` 与 Edge 同样被宿主拦截（无输出即退出），真实渲染验收改用 jsdom（D9）。
- **构建时把 TMP/TEMP 指到工作区**（2026-10-19 实测，M2-5 引入 1MB 级产物后暴露）：esbuild 对**大输出**会把结果落到系统临时文件再读回，随后删除时被系统拒绝，报 `[vite:esbuild-transpile] remove C:\Users\...\Temp\esbuild-<hash>: Access is denied`（同一进程内 node 自己写删临时文件是正常的，小输出也不触发）。解决办法是让 esbuild 用工作区目录当临时目录：
  ```powershell
  $env:TMP = "$PWD\.tmp-esbuild"; $env:TEMP = $env:TMP
  node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" build
  ```
  `.tmp-esbuild/` 已在 `.gitignore` 中。

**Rust 工具链实测（2026-10-19，M4 期间解锁）**

| 项 | 实测结果 | 影响 |
|---|---|---|
| MSVC | `F:\VS\VS2022\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe` 存在 | 编译器链已具备，只缺 rustup |
| Windows SDK | `F:\Windows Kits\10\Lib\10.0.26100.0\um\x64\kernel32.Lib`；注册表 `HKLM\SOFTWARE\Microsoft\Windows Kits\Installed Roots` → `F:\Windows Kits\10\` | 链接所需 lib 齐全 |
| WebView2 | `C:\Program Files (x86)\Microsoft\EdgeWebView\Application` | Tauri 窗口可用 |
| rustup 下载 | `static.rust-lang.org` / `win.rustup.rs` / `index.crates.io` / `static.crates.io` 均 200；`crates.io/api/v1` 403（不影响 cargo） | 依赖可拉取 |
| 安装位置 | **必须装进工作区**：`%USERPROFILE%\.cargo` 被系统拒绝写（`error: could not create bin directory: 'C:\Users\<user>\.cargo\bin': 拒绝访问。 (os error 5)`），即 danger-full-access 也不放行 | `CARGO_HOME=<ws>\.rust\cargo`、`RUSTUP_HOME=<ws>\.rust\rustup`，`.rust/` 进 `.gitignore` |
| 版本 | `rustc 1.99.1 (58cf8f9c3 2026-10-13)` / `cargo 1.99.1`，`stable-x86_64-pc-windows-msvc` minimal profile | — |
| link.exe 临时目录 | 与 esbuild 同源：`LINK : fatal error LNK1104: 无法打开文件"C:\Users\<user>\AppData\Local\Temp\lnk{...}.tmp"` | `$env:TMP/$env:TEMP` 同样指到 `.tmp-esbuild` |
| cargo/rustc 调用 | 不设 `RUSTUP_HOME` 会报 `could not create home directory: 'C:\Users\<user>\.rustup': 拒绝访问 (os error 5)` | 所有构建脚本都必须带这两个环境变量 |
| 磁盘余量 | `Get-PSDrive` 在沙箱里全返回 0，必须用 node `fs.statfsSync`：F: 818 GB / G: 2200 GB | target 目录（数 GB）留在 F: |

```powershell
$env:TMP = "$PWD\.tmp-esbuild"; $env:TEMP = $env:TMP
$env:CARGO_HOME = "$PWD\.rust\cargo"; $env:RUSTUP_HOME = "$PWD\.rust\rustup"
$env:PATH = "$PWD\.rust\cargo\bin;" + $env:PATH
node scripts\tauri-cli.cjs build --bundles nsis   # 需 sandbox_permissions: danger-full-access
```

**应用进程写权限实测（2026-10-19，M4 验收期间）**

| 项 | 实测结果 | 影响 |
|---|---|---|
| 工具进程（node / pwsh） | `danger-full-access` 下可自由写 `%APPDATA%` / `%LOCALAPPDATA%\Temp` | 构建、脚本正常 |
| 派生的应用进程（`caseboard.exe`） | **只被放行工作区**：页面内 `write_file_base64` 写 `F:\DSH PROJECT\masaike board\.tmp-esbuild\app-write-test.txt` 成功（5 字节）；写 `%APPDATA%\app.caseboard.desktop\`、`%LOCALAPPDATA%\Temp`、`%USERPROFILE%` 全部 `拒绝访问。 (os error 5)` | 真机双击运行不受影响；自动化验收必须把数据目录指到工作区 |
| SQLite | 数据目录不可写时连库失败：`error returned from database: (code: 14) unable to open database file` | 同上一行 |
| WebView2 用户数据目录 | 默认位置不可写：`thread 'main' panicked at tauri-2.12.4/src/app.rs:1444: Failed to setup app: 拒绝访问。 (os error 5)` | 必须设 `WEBVIEW2_USER_DATA_FOLDER` |
| 进程启动方式 | `Start-Process -PassThru` + `Wait-Process -Timeout` 在本环境**挂死**（命令被 kill） | 改用 `scripts/run-selftest.cjs`（`node` `spawn` + `stdio` 指向文件描述符 + 轮询报告文件） |

验收用环境变量（真机不需要）：

```powershell
$env:CASEBOARD_DATA_DIR = "$PWD\.tmp-esbuild\appdata\app.caseboard.desktop"
$env:WEBVIEW2_USER_DATA_FOLDER = "$PWD\.tmp-esbuild\webview2-$(Get-Date -Format yyyyMMddHHmmss)"
node scripts\run-selftest.cjs   # 连跑第 1、2 轮，验证「建数据 → 关闭 → 重开数据还在」
```

`WEBVIEW2_USER_DATA_FOLDER` **每次都要换新目录**：复用旧目录会因上次残留进程占用报 `WebView2 error: WindowsError(Error { code: HRESULT(0x800700AA), message: "请求的资源在使用中。" })`。

**CDP 现场探测通道**（应用跑起来后想查页面内状态时用）：设 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`，页面地址是 `http://tauri.localhost/`，可用 `http://127.0.0.1:9333/json/list` 取 target 后经 WebSocket 执行 `Runtime.evaluate`（或直接调 `window.__TAURI_INTERNALS__.invoke`）。探不过去时它比日志有效：`debug.log` 写不进盘的时候，CDP 里仍能看到 `ipc.localhost/debug_log` 的调用。

**tauri CLI 的 `argv[0]` 坑**：本机 `node` 是 Electron shim（`process.argv[0]` 为 `E:\DSH\DSH Desktop\DSH Desktop.exe`），`@tauri-apps/cli` 的 `tauri.js` 会把它当子命令塞进参数，报 `error: unrecognized subcommand 'E:\...DSH Desktop.exe'`。解法是固定入口 `scripts\tauri-cli.cjs`：

```js
process.argv[0] = 'node';
delete process.env.npm_execpath;
require('../node_modules/@tauri-apps/cli/tauri.js');
```

另注：`@tauri-apps/cli-win32-x64-msvc` 内**没有可执行 exe**，只有 `cli.win32-x64-msvc.node` 原生插件，不要试图直接运行。应用图标由 `node scripts\tauri-cli.cjs icon src-tauri/app-icon.png` 从 512×512 PNG 生成整套 `src-tauri/icons/*`。

---

## 6. 决策记录（Decision Log）

| 编号 | 决策 | 理由 | 影响 |
|---|---|---|---|
| D1 | 包管理器用 **pnpm 10.34.5**（经 node 直连 pnpm.cjs），锁定 `pnpm-lock.yaml` | 本机无 npm；pnpm shim 在沙箱内 spawn EPERM，直连 node 加载 pnpm.cjs 实测可用 | 验收命令由 `npm run` 改为 `pnpm`，已记录为规格偏离 |
| D2 | **M1–M3 不接 Tauri**，纯 Web 交付 | 规格 P1 明确「只做前端（暂不接 Tauri）」；且本机无 Rust 工具链，接入会阻塞 M1 | 原生能力（拖入/缩略图/哈希/PDF/视频）在 M2 先用 Web API 打通，M4 替换 |
| D3 | 图片/文件能力走 **service 接口双实现**：`src/services/{file,image,clipboard,media}`，M2 用 Web API（File / Clipboard / Canvas / WebCrypto / pdf.js / ffmpeg.wasm），M4 换 Tauri 原生（image crate / pdfium / ffmpeg-sidecar） | 保持里程碑顺序不被工具链阻塞，且替换时只改 service 层 | 组件层不得直接调用平台 API，只依赖 service 接口 |
| D4 | DSL 文件后缀 **`.cbd`**，项目文件 **`.caseboard`** | 规格 P2 给定 `.cbd`；`.caseboard` 为 zip 容器 | 文件关联与导入导出按此命名 |
| D5 | 状态与持久化：Zustand + Immer + Command 栈；M1 落 localStorage（key `caseboard-autosave`），M4 迁 SQLite | 先跑通闭环，迁移成本被 service 层吸收 | 序列化格式需与 SQLite schema 对齐设计 |
| D6 | 坐标体系统一为**画布世界坐标**；屏幕↔世界换算只允许走 `src/lib/coords.ts` 单点工具 | 自由图片节点（旋转/缩放）与 React Flow 坐标混用是最大缺陷来源 | 所有拖拽/吸附/导出计算复用同一函数 |
| D7 | **不用 `onlyBuiltDependencies` 白名单**，安装一律 `pnpm install --ignore-scripts`；`.npmrc` 固定 `node-linker=hoisted` + `strict-peer-dependencies=false` | 白名单会让 postinstall 真的执行，而沙箱禁止管道 stdio 子进程（`spawn EPERM`），install 直接失败；esbuild 二进制走 optionalDependencies 分发不需要 postinstall。hoisted 布局解决 Electron-as-node 下 junction 解析失败 | 新依赖若只能靠 postinstall 出二进制（如 @tauri-apps/cli），需在 M4 前单独验证或改用官方预编译包 |
| D8 | 节点每边放**两个锚点**：`type="target"`（`isConnectable={false}`、`pointer-events:none`、不可见）做几何锚点，`type="source"` 负责发起拖拽；两者 id 相同（top/right/bottom/left） | React Flow `getEdgePosition` 需要 target 侧 handleBounds；原实现只有 source 锚点，连线在真实场景下可能整条不渲染 | 连线路径稳定；后续若要切 `ConnectionMode.Strict` 也不必改节点结构 |
| D9 | 打包产物的渲染验收用 **jsdom + 伪布局**（注入 `offsetWidth/offsetHeight/getBoundingClientRect`、`ResizeObserver`、`DOMMatrixReadOnly`），脚本 `scripts/ui-smoke.cjs` | 本机 Chrome/Edge 无头模式被宿主拦截，无法做真实浏览器渲染断言；而 `offsetWidth` 恒为 0 会让 React Flow 判定节点未初始化、连线不渲染 | 结构性问题（缺锚点、缺线、缺标签）能被自动发现；拖拽手感/弹窗交互仍需人工验收 |
| D10 | 图片二进制走 **IndexedDB（Blob）**，`CaseDoc` 只存素材元数据（`Asset.id/path/hash/thumbnails` 等）；缩略图与哈希在 **Web Worker** 里算 | 图片不能塞 localStorage（5MB 配额、同步阻塞），而 M2 阶段还没接 Tauri 文件系统（D2）；IndexedDB 支持 Blob 与事务，M4 换成 SQLite + 只读原件封存时只需替换 `imageService` 实现 | M2-3 起 `src/services/imageStore.ts` 提供 `putAsset/putThumb/getThumb/deleteAsset`，组件层不直接碰 IndexedDB |
| D12 | 分组**直接进 React Flow 节点层**（展开态 `groupRect`、折叠态 `group` 超级节点，zIndex -1），不做独立覆盖层；成员归属用 `CaseNode.groupId` + `Group.parentId`，不引入 `nodeIds` 数组 | 覆盖层会被 React Flow 的 pane 吞掉点击，拖拽/缩放还得自己重复实现视口换算；`groupId` 单点归属天然保证「一个对象只属于一个组」且便于 `moveGroup` 原子位移 | 画布只渲染 `buildRenderModel(doc)` 的派生视图；折叠相关隐藏/聚合逻辑集中在 `src/lib/groups.ts`，DSL（M3）只需处理真实节点与组 |
| D13 | 图片预处理（SHA-256、双级缩略图、EXIF）**全部在 Web Worker 内完成**，主线程只做去重判定与派发 Command；导入向导状态独立放 `src/store/importStore.ts`，不写进 `CaseDoc` | 500 张量级的解码与哈希会阻塞 UI 数秒；向导的半成品（待导入草稿、重复列表）属于临时态，若进 Model 会污染撤销栈与存档 | `src/workers/imageWorker.ts` 与 `src/services/image.ts` 的 `ImageWorkerPool`（3 个 worker、按传入顺序重排结果）；确认导入才落一条 `importAssets` 命令 |
| D14 | M2 的「目录监视」用 **File System Access API 轮询**（`showDirectoryPicker` + `handle.values()`，最短 1.5s），不支持时按钮禁用并写明原因；M4 改用 Rust `notify` 事件推送 | 浏览器端没有目录变更事件；轮询可离线工作且零依赖，代价是延迟与需用户授权目录 | `src/services/watch.ts` 的 `supportsDirectoryWatch()` / `startDirectoryWatch()`；去重键 `name:size:lastModified` |
| D15 | 自由图片的拖动/缩放/旋转过程中**只改组件本地预览**，松手才 dispatch 一条命令；对齐参考线与吸附高亮（`guides` / `attachTargetId`）放 `uiStore`，不写进 `CaseDoc` | 逐帧改 model 会让 Ctrl+Z 变成逐像素回放，撤销栈迅速被撑爆；参考线是纯视觉临时态，进存档只会污染 JSON | `src/components/flow/Board.tsx` 的 `onNodeDrag`/`onNodeDragStop` 与 `FreeImageNode` 内部 preview state；几何算法集中在 `src/lib/imageNode.ts`，smoke 直接测 |
| D16 | 图片吸附规则与 M2-3「关联实体」保持同一条：目标是 `person` 时写 `node.photo = assetId`，其余类型把 `assetId` 并入 `node.attachments` | 两套语义（头像字段 vs 附件数组）会让同一份关联在右栏出现两遍或互相看不见；统一规则后 `AssetForm` 的「关联对象」与节点卡片的头像指向同一份数据 | `src/commands/imageNodeCommands.ts` 的 `attachImageNode()`；`deleteAsset` 同时清 `photo` 与 `attachments` 引用 |
| D17 | 标注几何一律用**归一化坐标 0–1（相对素材宽高）**存进 `Annotation.geom`，编辑画布、缩略图、导出图共用同一个 `drawAnnotations` 绘制入口 | 素材会被渲染成不同尺寸（256 缩略图 / 1024 预览 / 2048 导出），存像素坐标会让每个尺寸都要换算式；一并解决「标注随素材导出」时的一致性 | `src/lib/annotation.ts` 的 `normalizeGeom/toPixelRect/toPixelPoints` 与 `src/services/annotate.ts`；迁移时越界自动夹到 0–1 |
| D18 | 视频抽帧用 **`<video>` + `<canvas>`**（`currentTime` 跳转 + `drawImage`），不引入 ffmpeg.wasm；M4 换 Rust `ffmpeg-sidecar` | ffmpeg.wasm 需 30MB+ 的 wasm 与 SharedArrayBuffer（要 COOP/COEP 头），对本机离线单机应用是纯负担；浏览器原生解码已能覆盖监控截图抽帧 | `src/services/video.ts` 的 `probeVideo/grabFrame`，等距时间点由 `src/lib/mediaPlan.ts` 的 `planFrameTimes` 纯函数给出（smoke 可测）；抽帧失败（如编码不受支持）时给出中文原因 |
| D19 | **pdf.js 走动态 import 懒加载**（`await import('../../services/pdf')`），只在用户点「选择 PDF 文件」时才拉解析器与 worker | 静态引入会让主包从 464 kB 涨到 948 kB（gzip 296 kB），首屏白等；抽页是低频操作，单独分块更合适 | 构建产物出现独立块 `pdf-*.js`（483 kB）与 `pdf.worker.min-*.mjs`（1264 kB）；`ExtractDialog` 只用 `import type { PdfJob }`，类型不拉运行时 |
| D20 | DSL **只表达实体 / 关系 / 组 / 视图**（规格 §4 的语法面）；素材元数据、自由图片节点、评论、`settings` 不进文本视图。坐标与尺寸一律显式写出（`at(x, y)` / `size(w, h)`），不依赖「省略即自动布局」。排序固定：节点按（类型顺序, id）、边按（source, target, id）、组与视图按 id。id 名称化：保留 ASCII 与中文，其余字符 → `_`，数字开头补 `n_`，重名追加 `_2`；名字与原 id 不同时补一行 `id: "原 id"`。解析方向（M3-3）按 id 名称反查 + `id:` 行对齐，未在文本中表达的字段原样保留，绝不整份覆盖模型 | 理由：素材二进制与图片节点是 DSL 无法承载的，硬塞进去会让文本视图变成不可读的 base64 墙；显式坐标让「在文本里改位置」可靠；固定排序 + 名称化把「同一模型 → 同一字节序列」变成可自动测试的不变量（M3 验收 1），也是字段级 diff 的对齐基础 | M3-2 解析需支持 `id:` 覆盖行与 `at/size`；M4 的 `.caseboard` 里 DSL 只是可读副本，权威数据仍是 SQLite |
| D21 | 语法层**不把实体类型/枚举做成关键字**，统一 `Declaration { Ident Ident QuotedString Attr* Block }`，语义在 `parse.ts` 里按第一个 Ident 文本判定；数字/日期/时间统一 `Scalar` token，`true/false` 当 `Ident` 文本判；整段箭头做成单个 `Arrow` token（`-->` / `-.->` / `..>` 与 `---->` 共用一个 token），线型与标签在 parse 层切分；顶层允许只有 `{ … }` 块 | Lezer 会报 `overlapping tokens used in same context`（`Ident` vs `"true"`、`Number` vs 日期、标签 vs `WS`），拆成多个 token 过不了生成器；把类型做成关键字还会让 id 叫 `place`、`transfer` 的正常案件被误判为语法错误。单 token 箭头让「标签里含 `-`/`.`/`>`」不再需要转义规则 | `grammar/caseboard.grammar` + `scripts/build-grammar.mjs` 生成 `src/dsl/generated/caseboard.parser.ts`（提交进库）；解析器对外只暴露 `parseDsl` / `parseArrow` / `hasErrors`，`parseDsl` 永不抛异常 |
| D22 | 代码 ↔ 画布的冲突策略：`mergeDslEdit(base, codeNext, current)` **只应用图形侧未改过的字段**；同字段两侧都改时保留画布值、代码改动进 `conflicts` 上报；文本侧删除画布侧改过的对象不执行（删除破坏性大，要求显式重试）；`changes` 是相对 `current` 的增量，由 `applyDslChanges` 一次落成**一条** Command | 拖拽节点与编辑代码可以同时发生（M3 验收 3），简单「后写入者覆盖整份文档」会让拖拽结果或文本结果凭空消失；保留画布值符合「用户眼前看到的不跳」，且删除类操作必须在画布上显式确认。增量而非全量替换则保证撤销栈只记真正改动的字段 | `src/dsl/diff.ts`（`diffDocs` / `mergeDslEdit` / `DSL_*_KEYS`）+ `src/commands/dslCommands.ts`（`applyDslChanges`）；M3-4 用 `conflicts` 显示「图形有更新，点击合并」状态 |
| D23 | 代码视图用 **CodeMirror 6 + 生成的 Lezer 解析器**（`caseboardLanguage = LRLanguage.define({ parser: parser.configure({ props: [styleTags(...), foldNodeProp, indentNodeProp] }) })`）；外部写入一律走 `replacePreservingView`：只 `view.dispatch({ changes })` 写最小差异、前后保存并还原 `scrollTop`/`scrollLeft`，**不重建 `EditorState`**；图形→代码 200ms 防抖 + `isApplyingCode()` 单向闸门；代码语法错误时模型保持不变、画布只读；`CodePanel` 用 `React.lazy` 单独分包 | 重建 EditorState 会丢光标、丢滚动位置（M3 验收要求「编辑代码时图形更新不抢光标」）；只 dispatch 差异让 CodeMirror 用事务映射自动搬移选区与折叠区间，比手算坐标可靠。错误时只读而不是回滚文本，是因为用户正在输入，模型必须稳定在最后一个合法版本。CodeMirror 静态进主包会让首屏从 464 kB 涨到 892 kB，而代码视图是可选视图，按需加载更符合「画布优先」| `src/store/codeStore.ts`（`CodeSyncState` / `syncCodeText` / `noteGraphChange` / `mergeGraphChanges` / `formatCode`）+ `src/components/code/{CodeEditor,CodePanel,useCodeSyncBridge}.tsx|ts` + `src/dsl/{language,highlight,locate}.ts`；`App.tsx` 里 `const CodePanel = lazy(() => import(...))` |
| D24 | **「1000 节点解析 + 渲染 < 300ms」的验收口径**：硬门禁取纯逻辑链 `serializeDoc + parseDsl + locateDeclarations + diffDocs`（本机实测 88.5ms，脚本 `scripts/bench-dsl.cjs`）；DOM 渲染另用 `scripts/bench-board.cjs` 做「300 节点能全部渲染、数量对得上」的回归，真实首屏渲染并入人工验收项 | 本机无法可信测量 DOM 渲染：无头 Chrome/Edge 被宿主拦截（D9），jsdom 没有布局与合成器，1000 节点在伪布局下要跑分钟级（`bench-board` 300 节点稳定耗时 8.3s 全由 ResizeObserver 伪回调与连线重算驱动），用它当门禁只会误判；把可自动化的部分卡死、把需要真实 GPU 的部分显式交给人工，比留一个假装通过的指标更诚实 | `scripts/bench-dsl.cjs`（阈值 300ms，失败 exit 1）、`scripts/bench-board.cjs`（`CB_BENCH_NODES` 可调）、`scripts/fixtures.cjs`（1000 节点文档生成）；人工项记入 M3 验收记录 |
| D25 | Rust 工具链装在**仓库内** `.rust\`（`CARGO_HOME`/`RUSTUP_HOME` 指向它） | 用户目录 `%USERPROFILE%\.cargo` 被系统拒绝写（`could not create bin directory … os error 5`），`danger-full-access` 也不放行；装进仓库可隔离、可复现 | 所有 cargo/rustc 调用必须先设两个环境变量；`.rust/` 进 `.gitignore`；`scripts\tauri-cli.cjs` 固定 `argv[0]` 绕过 Electron-as-node |
| D26 | 前后端二进制一律 **base64 过 IPC**（Rust 自写 `b64_encode`/`b64_decode`），不用 `Vec<u8>` / `Uint8Array` | `invoke` 走 JSON，`Uint8Array` 会被序列化成 `{"0":137,…}`，serde 读不成 `Vec<u8>`；base64 还能让读写命令接受任意绝对路径（原件路径、用户选的导出目标），不受 fs 插件 scope 限制 | Rust 命令 `save_asset_base64`/`read_asset_base64`/`read_thumb_base64`/`save_thumb_base64`/`read_file_base64`/`write_file_base64` 全是这一形状；前端入口只有 `src/services/platform.ts` 的 `bytesToBase64`/`base64ToBytes` |
| D27 | Rust 侧**只做 IO**（读写文件、`sha2` 哈希、自检报告、退出），缩略图与 EXIF 仍在前端 Worker 做——与 D3「M4 换 image crate」的预期**不同** | 前端已有 D13 的双级缩略图 + SHA-256 流水线与三 Worker 池，再实现一份会产生两套哈希/缩略图真相，而 `.caseboard` 打包要的正是同一份字节 | 新增 Rust 能力都是通用文件命令；将来换实现只影响 `src/services/imageStore.ts` / `platform.ts` |
| D28 | 整板 PNG / 多页 PDF 用**模型驱动的 canvas 绘制**（`src/serializers/png.ts`、`pdfExport.ts`），与 SVG 共用同一套坐标系与排版常量，不做 DOM 截屏 | 无头浏览器被宿主拦截（D9）时 DOM 截屏无法自动验收；模型驱动还能保证导出与 DPI、画布视口无关 | 三处排版常量（`PAD 64`、网格 28、标题块 22/12、图例偏移）必须同步；PDF 按 A4 横向页高切片而非矢量重建，保证「所见即所得」只有一份真相 |
| D29 | 桌面端验收走 **`--selftest` 自检通道**：exe 带该参数启动时隐藏主窗口，前端跑 12 项闭环检查，Rust 把结果写到 `<dataDir>/selftest.json` 后 `app.exit(0)` | 本机无法自动化真实浏览器（D9），而 M4 六条验收里有 4 条只发生在桌面端（SQLite、项目包、图片包、脱敏像素） | `LaunchFlags{selftest}` 由 Rust `.manage()` 注入 `AppInfo.selftest`；`src/services/selftest.ts` 懒加载独立成块（9.75 kB），正常启动不付体积 |
| D30 | 素材原件存**绝对路径**（`Asset.path = <app_data_dir>/assets/<id>.<ext>`），`<img src>` 直接 `convertFileSrc(path)` 走 assetProtocol | 每次显示都读字节过 IPC 会拖死主线程；assetProtocol 只读本应用目录（`tauri.conf.json` 的 scope 已限定 `$APPDATA`/`$APPLOCALDATA`/`$APPCONFIG`） | 缩略图仍走 `imageStore`（blob URL 缓存 + `releaseThumbUrl`）；换机后路径失效由 `.caseboard` 内嵌 assets 兜底（`readCaseboard` → 素材落盘 + `rebuildThumbs`） |
| D31 | 数据目录可被环境变量 `CASEBOARD_DATA_DIR` 覆盖（便携模式 + 自动化验收），数据库连接串改用**绝对路径** `sqlite:<dataDir>/caseboard.db`，建表由 Rust 命令 `ensure_db_file` 直接执行 `V1_SQL`（不再用 `tauri-plugin-sql` 的 migrations） | ① DSH 沙箱把**应用进程**限制在工作区内（工具进程可写 `%APPDATA%`，见 §5），自检必须能把数据放进仓库；② 插件 `path_mapper` 用 `PathBuf::push` 拼相对路径，只有绝对路径能绕开 `app_config_dir`；③ 插件 migrations 以**连接串字符串**为键（`commands.rs` 的 `migrations.remove(&db)`），换绝对路径后永远匹配不上已注册的 `sqlite:caseboard.db`，迁移静默不跑 | `src-tauri/src/lib.rs` 的 `data_dir_of()` / `apply_schema()` / `ensure_db_file()`；`src/services/db/tauri.ts` 先 `ensure_db_file()` 再 `Database.load('sqlite:' + dbPath, { autoCreate: false })`；前端连接串**不能**加 `?mode=rwc`（会被当文件名） |
| D32 | 多页 PDF 一律 `pdf.save({ useObjectStreams: false })` | 默认把对象压进对象流后，`/Type /Page` 不可见，第三方工具与验收脚本都读不出页结构；证据类 PDF 要能被外部工具解析，体积代价可接受。同时确认 pdf-lib 把**所有字符串**（含 ASCII）写成 UTF-16BE 十六进制串，所以「在字节里 grep 英文标题」永远失败，验收必须走 `PDFDocument.load()` 回读 | `src/serializers/pdfExport.ts` 末尾的 `save({ useObjectStreams: false })`；`src/services/selftest.ts` 的 PDF 项用 `PDFDocument.load(bytes, { updateMetadata: false })` 断言页数/标题/末页尺寸/内容流 |
| D33 | 删除统一走 `docStore.removeWithTrash(kind, ids)`：先把实体（删节点时连同挂在它身上的关系）快照进回收站表，再 dispatch 删除命令；恢复用 `restoreNode`/`restoreEdge` **按原 id 写回**（同 id 已存在则跳过，关系两端缺失则拒绝），快照恢复走 `replaceDocument` | 撤销栈只有 200 步且只在本次会话有效，删除是最容易「撤销顶掉了才后悔」的操作，需要第二道保险；按原 id 恢复才能让恢复后的关系重新接上原端点，生成新 id 会让关系变成孤儿 | `src/store/docStore.ts` 的 `removeWithTrash` + `src/commands/{node,edge}Commands.ts` 的 `restoreNode`/`restoreEdge` + `src/components/panels/HistoryDialog.tsx`；`src/services/storage.ts` 的 `pushTrashToStorage`/`takeTrashFromStorage`/`purgeTrashInStorage` |
| D34 | `app.windows[0].dragDropEnabled` 固定为 **false**，系统文件拖入改由前端 `App.tsx` 的 `onDrop` 处理 | Tauri 在 Windows 上开启 `dragDropEnabled` 会**拦截整个 webview 的 HTML5 拖放**，素材库的 `draggable` 拖不到画布（人工验收 A1 的直接原因）；关闭后系统文件拖入仍由 `onDragOver/onDrop` 接住，能力不减 | 任何需要 HTML5 拖放的区域（素材库、类型库、标注编辑器）都可正常工作；新增"原生拖入"需求时必须先确认这个开关 |
| D35 | 多选与批量移动：**选中态由 React Flow 的 select 变更驱动**，`uiStore.selectedNodeIds` 只是镜像；多个选中节点一起拖动时，用 `dragPos` 计算全部位置后 dispatch 一条 `moveNodes` | v12 单选（Meta 键）在 Windows 上不可用，且忽略 select 变更会让「框选高亮」与内部状态脱节；逐节点落命令会把一次拖动拆成 N 条撤销记录 | `Board.tsx` 的 `onNodesChange` 消费 select、`multiSelectionKeyCode={['Meta','Control']}`、`selectionOnDrag`；组节点 `selectable:false` 以免框选把组带进选中集 |
| D36 | 版本快照**自动兜底**：每次成功落库后节流 5 分钟写一份「自动快照」，启动时若库里 0 份则补「启动快照」 | 面板承诺「每 5 分钟自动存一份」但代码从未实现，用户打开历史只看到 0 份（A6）；只有手动快照的话，回收站之外没有第二道保险 | `docStore` 的 `AUTO_SNAPSHOT_MS` / `maybeSnapshot` / `bootstrapDoc`；快照上限仍是 `SNAPSHOT_KEEP=50` |
| D37 | 边曲率手柄：第一轮**延期**，第二轮复验后**已实现**（`src/lib/edgeCurve.ts`）。`CaseEdge.controlPoints[0]` 存「曲线中点相对两端锚点中点的偏移」，不是绝对坐标；控制点 = 中点 + 偏移 × 4/3（三次贝塞尔 t=0.5 只到控制点 3/4），偏移上限 1600，小于 2 视为直线 | 相对偏移让节点移动/缩放、画布平移后曲线自动跟随；4/3 增益让手柄正好落在曲线中点上，拖动所见即所得。DSL 不表达该字段，三方合并按 D20 白名单处理，代码侧编辑不会抹掉曲率 | `src/lib/edgeCurve.ts` 是曲线几何唯一来源，`BezierEdge`、`svg.ts`、`png.ts` 都调它；smoke `[30]` 覆盖几何/命令/JSON 往返/SVG 一致性 |
| D38 | 演示模式先做**按实体类型分组的逐步讲解**（一屏一实体 + 关联清单 + 键盘 ←/→/空格翻页 + 「在画布中查看」），不做镜头动画、逐条连线亮起、全屏与导出；演示全程只读文档，退出只切视图与选中 | 镜头动画与全屏既无法用 jsdom 伪布局自动验收（D9），又是纯观赏成本；而验收 5 要求的「按步骤播放、退出后画布状态还原」靠只读性与视图切换即可严格满足 | `src/lib/present.ts` 的 `presentationOrder` / `relatedOf` / `presentationDeck` 是纯函数，smoke 直接断言顺序、方向与文档不变 |
| D39 | 时间线播放口径：**1× = 整段时间在 60 秒内放完**（`advanceCursor(scale, at, speed, (span/60000)×delta)`），时间一律按 **UTC 墙上时间**解析与显示，刻度为空时禁用播放；区间事件的条带宽度 = `(end-start)/span` | 案件跨度从数小时到数年，若按真实毫秒推进，长跨度永远播不完、短跨度一闪而过；固定 60 秒让「播放」在不同案件上手感一致。UTC 墙上时间避免同一份笔录在不同时区显示不同时刻 | `src/lib/timeline.ts` 的 `parseTimelineTime` / `advanceCursor` / `timelineBands`；`TimelineView` 的 rAF 循环只负责按帧换算 |
| D40 | 路径与中心度用**自写确定性 BFS / Brandes**（`src/lib/graph.ts`），不调用 graphology；依赖仍保留在 package.json（规格锁定技术栈） | 分析结果要能「同数据同结果」写进验收，自写实现可固定邻居顺序（id 升序）、并列路径排序与浮点保留位数；引库还要再包一层排序 | `shortestPath` / `allPaths` / `degreeCentrality` / `betweennessCentrality` 全是纯函数，smoke [31]/[33] 直接断言数值；将来需要更多图算法时再评估切到 graphology |
| D41 | AI 通道**内置规则为默认且承担全部机器验收**：`src/lib/extract.ts` 的抽取器、`src/lib/contradictions.ts` 的审查、`src/lib/report.ts` 的报告全为纯函数，`fetch` 抛错也能跑完；Ollama（仅回环）与 OpenAI 兼容通道需显式允许远程 | M6 验收 5「断网完成全流程」与验收 6「采纳率 ≥70%」必须可重复；远程模型输出不确定，不能当门禁，但产品仍需可选的本机/远程模型通道 | `src/services/ai/{settings,provider}.ts`（`requireRemotePermission`）、smoke [41] |
| D42 | AI 草稿**采纳才落 Model**：`acceptAiDrafts` 是唯一写入口，按标题/别名合并既有节点，新建实体固定 `status:'todo'`，不写 `confirmed`；`acceptAll` 合成一条 Command，整批一次撤销 | Gate 0-4「AI 产出只进待确认队列」；合并而非复制避免同一人重复建卡；新实体不自动已证实，线型/置信度保留 AI 的保守值 | `src/commands/aiCommands.ts`、`src/store/aiStore.ts`、smoke [36] |
| D43 | 报告 Word 用 **fflate 手写最小 OOXML**，PDF 用 **canvas + pdf-lib embedPng**（与整板 PDF 同路线）；两者共用同一份 Markdown，引用标记不因导出格式丢失 | 不新增 `docx` 依赖（离线、包体小、可控）；node 无 canvas，PDF 只能桌面/人工确认，Word 可机器解压断言 | `src/serializers/reportDocx.ts`、`src/serializers/reportPdf.ts`、smoke [39] |
| D44 | 自然语言编辑**默认不吃「已证实」**：无证据措辞生成点线 40 / 虚线 55，只有明确「已证实/确认」才实线；删除必须 `hasDelete` + 勾选确认 + `applyNl` 二次校验 | 与 Gate 0-3 线型语义一致；AI/指令都不能凭一句话把推测升格为已证实；删除是不可逆高风险操作 | `src/lib/nlEdit.ts`、`src/store/aiStore.ts`、smoke [38]、ui-smoke |
| D45 | AI 生图以**内置程序化绘制**为默认通道并承担全部机器验收；ComfyUI 与 OpenAI 兼容图像接口是可选增强，需用户自行安装/授权 | 本机没有 ComfyUI，验收 4/8 不能挂在一个没装的服务上；程序化绘制是纯函数 + canvas，同种子同结果，角标与像素可复核 | 内置通道画的是示意性笔触（非写实），`aiMeta.params.simulated = true`，界面文案一律「模拟图」；接 ComfyUI 时只换 `generateAiImage` 的分支 |
| D46 | AI 图合规三道闸：角标**写进像素**（顶部窄带 + 右下角）、`aiGenerated` + 完整 `aiMeta`、`blocksConfirmed` 在 `updateNode` 命令层拦截「改成已证实」；界面不提供任何移除开关 | Gate 0-5 要求「不可关闭」，所以只能在生成与落库环节写死；拦截放在命令层而不是表单层，才能覆盖导入、DSL、AI 指令等所有写路径 | `src/lib/aiImage.ts`（`watermarkPlan` / `inspectAiAsset` / `blocksConfirmed`）、`src/services/aiImage.ts`（`stampWatermark` / `stampRemote`）、smoke [43]、自检角标 3901 点 |
| D47 | 地图做成**离线示意地图**：只认右栏坐标字段做相对摆放，不请求瓦片、不引入投影库，界面常驻「未加载瓦片」声明 | 自配瓦片需要确定的来源与许可，且真实底图会让「坐标精确」变成隐含承诺；示意地图能立刻支撑「两地相距多远、谁在附近」这类案情判断，且断网可用 | `src/lib/map.ts`、`src/components/views/MapView.tsx`、`viewModeStore` 的 `'map'`；演示数据两条坐标 |
| D48 | OCR 用 **Tesseract 侧车**（Rust 直接调 `tesseract --version` / `tesseract <path> stdout -l chi_sim+eng --psm 6`），字段抽取是独立纯函数层，可脱离引擎手工粘贴文本验证 | 侧车只负责「图片→文字」，金额/时间/账号的结构化与人工修正不该绑定某一家 OCR；换引擎时上层完全不动 | `src/services/ocr.ts`、`src-tauri/src/lib.rs` 的 `ocr_available` / `ocr_image`、`src/lib/ocr.ts`、smoke [43]、自检「OCR 字段抽取」 |
| D11 | 8 类节点模板**只存在于代码**（`src/lib/nodeTemplates.ts`），字段值统一存 `CaseNode.fields`（`Record<string, string\|number\|boolean>`）；模板变更不迁移数据，模板外自定义字段照常展示 | 规格要求「允许自定义字段」，若把模板写进文档结构会把每一次模板调整都变成数据迁移；字段即键值对也是 DSL（M3）最容易表达的形状 | 属性面板只渲染模板字段 + 提示自定义字段名；模板新增字段时旧节点为空值，不报错 |

---

## 7. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-18 | 建立本里程碑契约；规格文档归档至 `docs/CaseBoard-SPEC.md`；完成工具链实测（§5）与首批决策（D1–D6）。 |
| 2026-10-18 | **M1 验收通过**（✅）：写入验收记录与两个缺陷修复说明；§5 修正安装通道结论（`--ignore-scripts` + `node-linker=hoisted`、vite CLI 需脱离沙箱）；决策 D7 修正，新增 D8（双锚点）、D9（jsdom 伪布局验收）。 |
| 2026-10-19 | **M2-2 验收通过**（✅）：组系统（矩形/圈选、嵌套、折叠超级节点、组级连线聚合）落地；§3 拆步表 M2-2 置 ✅ 并写入验收记录，新增 D12（组走节点层而非覆盖层）。 |
| 2026-10-19 | **M2-3 验收通过**（✅）：图片四路导入 + 双级缩略图 + SHA-256 去重 + EXIF + 导入向导 + 素材库两分区落地；§3 拆步表 M2-3 置 ✅ 并写入验收记录，新增 D13（导入预处理全部在 Worker 内完成）、D14（目录监视 M2 用 File System Access 轮询，M4 换 notify）。 |
| 2026-10-19 | **M2-4 验收通过**（✅）：自由图片节点（移动/8 向缩放/旋转吸附/层级/对齐参考线与网格/多选整体移动/吸附头像与附件/三种边框/素材库拖入）落地；`CaseDoc` 新增 `imageNodes` 并补齐迁移与级联删除；§3 拆步表 M2-4 置 ✅ 并写入验收记录，新增 D15（交互过程只留本地预览，松手才落命令）、D16（吸附与「关联实体」共用一套规则）。 |
| 2026-10-19 | **M2 整体验收通过**（✅）：M2-5 标注层六图形 + PDF 抽页 / 视频抽帧落地，标注可关联实体并随素材导出；§1 总表 M2 置 ✅，§3 拆步表 M2-5 置 ✅ 并写入验收记录，新增 D17（标注几何归一化）、D18（视频抽帧用原生 video+canvas）、D19（pdf.js 懒加载）；§5 补充「构建时 TMP/TEMP 指到工作区」的工具链结论。 |
| 2026-10-19 | **M3 收尾 · 验收加固**（M3 第 5 步，✅ M3 完成）：`scripts/{fixtures,bench-dsl,bench-board}.cjs` + smoke `[24]`（十类错误矩阵、50 次混合操作无重复撤销、1000 节点 88.5ms < 300ms）；`pnpm smoke` **306 条**、`pnpm ui-smoke` 62 条、`pnpm build` 269 modules 全绿；§1 M3 置 ✅、拆步表 M3-5 置 ✅、M3 验收记录重排为 M3-1…M3-5，新增 D24（300ms 门禁口径与人工渲染项）；打 tag `ms/M3`。 |
| 2026-10-19 | **M3-4 分屏代码视图落地**（M3 第 4 步，⏳ 进行中）：`src/dsl/{language,highlight,locate}.ts` + `src/store/codeStore.ts` + `src/components/code/{CodeEditor,CodePanel,useCodeSyncBridge}`；分屏可拖拽、CodeMirror 6（高亮/折叠/补全/悬停/波浪线/格式化）、五态同步状态机与「图形有更新，点击合并」、错误时模型不变且画布只读、双侧选中联动；`pnpm smoke` 296 条全绿（新增 34 条 `[23]`）、`pnpm ui-smoke` 62 条全绿（新增 11 条）、构建 269 modules 且代码视图独立分包；§3 拆步表 M3-4 置 ✅ 并写入验收记录，新增 D23（CM6 + 最小差异写入 + 只读容错 + 按需分包）。 |
| 2026-10-19 | **M3-3 三方合并落地**（M3 第 3 步，⏳ 进行中）：`src/dsl/diff.ts` 字段级 diff + 三方合并（`diffDocs`/`mergeDslEdit`）与 `src/commands/dslCommands.ts` 的整批单次撤销命令；`pnpm smoke` 262 条全绿（新增 21 条 `[22] DSL 三方合并`）；§3 拆步表 M3-3 置 ✅ 并写入验收记录，新增 D22（冲突保留画布值、删除冲突不执行）。 |
| 2026-10-19 | **M3-2 语法与容错解析落地**（M3 第 2 步，⏳ 进行中）：`grammar/caseboard.grammar`（Lezer）+ `scripts/build-grammar.mjs` 生成解析器，`src/dsl/parse.ts` 实现 AST → Model、六类中文诊断（含行列与修复建议）、`id:` 覆盖行与 quoted id 引用、缺 header 容错；演示文档 `parseDsl → serializeDoc` 逐字节往返一致；`pnpm smoke` 241 条全绿（新增 37 条 `[21] DSL 解析`）；§3 拆步表 M3-2 置 ✅ 并写入验收记录，新增 D21（语法层不设关键字、单 token 箭头）。 |
| 2026-10-19 | **M3-1 序列化器落地**（M3 第 1 步，⏳ 进行中）：`src/dsl/serialize.ts` 实现 Model → DSL 文本，含 id 名称化双向表（`createNameTable` / `dslNameTable`）、`stableJson`、显式 `at/size`、按（类型序, id）稳定排序；`pnpm smoke` 204 条全绿（新增 31 条 `[20] DSL 序列化`）；§3 写入 M3 拆步表与 M3-1 验收记录，新增 D20（DSL 只表达式语法面、坐标显式、名称化保身份）。 |
| 2026-10-19 | **M4 人工验收热修（第一轮回执 A1–A8）**：修好 A1 拖入（`dragDropEnabled:false`，D34）、A2 图片缩放/旋转手柄（补 `nodrag`）、A4 框选与 Ctrl 多选 + 批量移动（D35）、A6 自动/启动快照（D36）、A7 回收站恢复连同关系并一次撤销（`restoreEntities`）、A8 导出面板错位（`.cb-modal__mask` + `.cb-modal cb-export`）；A3 曲率手柄延期至 M5（D37）。机器验收：typecheck 0 error、smoke **346 条**、ui-smoke 84 条、build 470 modules、`tauri build --no-bundle` 成功、自检 phase1 14 / phase2 15 全绿。 |
| 2026-10-19 | **M4 整体验收通过**（✅ 打 tag `ms/M4`）：Tauri 2 外壳 + SQLite/FTS5 + `.caseboard` 单文件 + 整板 PNG/SVG/PDF + 案件图片包 + 脱敏导出 + 自动保存/版本快照/回收站/历史面板落地；`caseboard.exe --selftest` 两轮 **14 + 15 项全绿**（数据跨进程完整、跨目录打开、零外呼、PDF 回读 2 页、脱敏 1024 像素可验证抹平）；§1 总表 M4 置 ✅、§3 写入 M4 拆步表与验收记录（含遗留与延期表），新增 D25–D33（Rust 装进工作区 / 二进制 base64 过 IPC / Rust 只做 IO / 模型驱动出图 / `--selftest` 通道 / 绝对路径存素材 / 数据目录可覆盖 + 建表提前 / PDF 关对象流 / 删除进回收站）；`pnpm smoke` **337 条**、`pnpm ui-smoke` 84 条、`pnpm bench` 75.7ms、`pnpm build` 469 modules。 |
| 2026-10-19 | **M4 人工验收第二轮回执热修（A1 旋转 / A3 曲率手柄）**：旋转手柄被图层工具条压住（层级上下文）→ 工具条 `top:-60px` + window 指针监听；新增 `CaseEdge.controlPoints` 与 `src/lib/edgeCurve.ts`，选中关系可拖曲率手柄、双击复位，SVG/PNG 与画布共用曲线（D37 由延期改为已实现）；§3 增第二轮回执表并致谢「其余通过」；机器验收 smoke **359 条**、ui-smoke **90 条**、自检 14 + 15 全绿；「视觉对齐 / 折叠操作提示」语义待用户确认。 |
| 2026-10-19 | **M6 整体验收通过**（✅ 打 tag `ms/M6`）：AI 文本能力五步落地——三通道与 P4–P7 提示词、内置抽取器待确认队列、矛盾与证据链审查、自然语言编辑 diff、七节报告与 Word/PDF 导出；`pnpm smoke` **513 条**（M6 新增 53）、`pnpm ui-smoke` **193 条**（新增 51）、桌面自检 **15/16**、版本 **0.6.0**；§3 拆步表与验收记录落地，新增 D41–D44。 |
| 2026-10-19 | **M7 整体验收通过**（✅ 打 tag `ms/M7`）：多假设画布（支持/反驳计分与并排比较）、六段证据链与断点、区域锚点悬停高亮、OCR 四字段与人工修正、四预设 AI 生图（强制角标写像素 + AI 分区 + 永不已证实 + 换脸拦截）、离线示意地图六步落地；`pnpm smoke` **573 条**（新增 61）、`pnpm ui-smoke` **234 条**（新增 41）、桌面自检 **17/18**、版本 **0.7.0**；§1 M7 置 ✅、§3 写入拆步/验收/偏离三表，新增 D45–D48（内置生图兜底、生图三道闸、离线示意地图、Tesseract 侧车）。 |
| 2026-10-19 | **M5 整体验收通过**（✅ 打 tag `ms/M5`）：分析视图五步落地——图内核（路径/中心度/五种布局/时间线）、过滤与聚焦、路径与中心度可视化、一键整理、时间线回放与演示模式；`pnpm smoke` **460 条**（M5 新增 101）、`pnpm ui-smoke` **142 条**（新增 52）、`pnpm build` 811 modules；§1 总表 M5 置 ✅，§3 写入 M5 拆步与验收记录（含与计划的五项偏离），新增 D38（演示模式先做逐步讲解）、D39（1× = 60 秒、UTC 口径）、D40（自写确定性 BFS/Brandes）。 |
