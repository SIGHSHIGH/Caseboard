# CHANGELOG

本项目的变更记录。每个里程碑收尾追加一条，并打 git tag `ms/M<n>`。

## [未发布] v0.6.0 · M6 AI 文本能力

### M6 整体验收通过（2026-10-19，tag ms/M6）

- **模型通道与提示词**（`src/services/ai/`）：三通道——内置规则（离线、确定性）、Ollama（只允许回环地址）、OpenAI 兼容接口（必须显式允许远程并二次确认）；P4–P7 提示词逐字内置；设置只存 localStorage，不进案件文件。
- **抽取建图**（`src/lib/extract.ts` + `src/data/sampleTranscript.ts`）：识别人物/机构/地点/事件/证据/手机号，抽转账（仅完成态）、通话、认识关系；书证走实线 88、陈述走点线 45；同对实体去重保留高置信；无法确定的进「待核实」。虚构样本笔录对 8 项参考答案 **8/8 = 100%**。
- **待确认队列**（`src/commands/aiCommands.ts` + `src/store/aiStore.ts` + `AiPanel.tsx`）：AI 只产草稿，逐条采纳/驳回；采纳才 `dispatch(acceptAiDrafts)`，按标题/别名合并既有实体、新实体固定 `todo`，整批一条撤销（Gate 0-4）。
- **矛盾与证据链审查**（`src/lib/contradictions.ts`）：时间冲突、一物多主、无证据断言、关系矛盾四类；fraud/theft/general 三套链条模板输出 covered/weak/missing 与 ≤5 条建议问句。
- **自然语言编辑**（`src/lib/nlEdit.ts`）：新增/改名/连边/删除/移组/查询，逐条给出可执行或阻断原因；未提供证据不吃「已证实」（点线 40 / 虚线 55）；删除需勾选确认且 `applyNl` 二次校验。
- **七节报告与导出**（`src/lib/report.ts` + `src/serializers/reportDocx.ts` + `reportPdf.ts`）：事实句尾带 `[节点:id]` / `[证据:id]`，推测标「（待核实）」；Word 由 fflate 手写 OOXML（不新增依赖），PDF 用 canvas + pdf-lib（与整板 PDF 同路线）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **513 条全绿**（M6 新增 53：[36] 13 / [37] 9 / [38] 8 / [39] 10 / [40] 9 / [41] 4）、`pnpm ui-smoke` **193 条全绿**（新增 51）、`pnpm build` 825 modules、`tauri build --no-bundle` 3m39s、`run-selftest.cjs` 两轮 **PASS 15 / 16**、`pnpm bench` 1000 节点 75.6 ms。
- **文档**：`docs/MILESTONES.md` §1 M6 置 ✅、§3 拆步表 + 验收记录 + 偏离表、§6 新增 D41–D44、§7 一行；版本三处升 0.6.0。


## [未发布] v0.5.0 · M5 分析视图

### M5 整体验收通过（2026-10-19，tag ms/M5）

- **图内核**（`src/lib/graph.ts`）：`buildGraph` 邻接表、`shortestPath` 确定性 BFS、`allPaths` 带上限截断与稳定排序、度/中介中心度（Brandes）、`neighborsWithin`、连通分量与图统计。全部纯函数，同输入同输出。
- **自动布局**（`src/lib/layout.ts`）：`computeLayout` 统一五种布局——力导向（d3-force，含碰撞与向心力）、层级（dagre LR）、径向（BFS 分环）、环形、网格；锁定节点坐标逐位不变，整理后用 `separatePass` 消重叠并重新夹进组边界；`src/commands/layoutCommands.ts` 把整板坐标压成**一条**命令，Ctrl+Z 一次全回。
- **时间线内核**（`src/lib/timeline.ts`）：宽松解析 `2026` / `2026-09` / `2026-09-03` / `2026-09-03 20:10` / 带时区 ISO；刻度归一化与比例换算、游标切片（已发生/进行中/未发生）、`advanceCursor`（1× = 60 秒放完，D39）、泳道分组、区间条带几何 `timelineBands`。
- **过滤与聚焦**（`src/lib/filter.ts` + `src/components/panels/FilterPanel.tsx`）：类型/状态/标签/关系类别/最低置信度/时间窗/文本检索七类条件，淡化·只显示命中·隐藏命中三种模式；聚焦按 N 度取邻域，其余淡化；端点被隐藏的关系一并隐藏，命中计数实时显示。
- **路径与中心度**（`src/lib/analysis.ts` + `PathPanel.tsx`）：选源/汇算最短与全部路径（每跳带原始关系 id），路径 chip 切换高亮；度/中介中心度 Top6 排行可点击定位，画布节点显示热力徽标（≥33%），路径节点描红、动线加粗。
- **时间线视图与演示**（`TimelineView.tsx` / `PresentationView.tsx`）：泳道 + 区间条带 + 游标滑杆 + 播放/暂停/倍速/回起点/到末尾，未排期实体单独提示；演示按实体类型分组的逐步讲解（关联方向 →/←/↔、键盘翻页、「在画布中查看」），全程只读文档（D38）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **460 条全绿**（M5 新增 101：[31] 41 / [32] 25 / [33] 15 / [34] 7 / [35] 13）、`pnpm ui-smoke` **142 条全绿**（M5 新增 52）、`pnpm build` 811 modules（CSS 55.58 kB / 主包 764.62 kB gzip 257.54）。
- **文档**：`docs/MILESTONES.md` §1 M5 置 ✅、§3 拆步与验收记录（含五项偏离）、§6 新增 D38–D40、§7 一行；`AGENTS.md` 验收命令不变（四件套 + 桌面自检）。


## [未发布] v0.4.0 · M4 Tauri + SQLite + 项目文件 + 导出

### M4 人工验收热修（2026-10-19，第二轮回执 A1 旋转 / A3 曲率手柄）

第二轮复验「其余通过」，只剩两项：

- **A1 图片节点仍不能旋转**：旋转手柄是 frame 的子元素（`z-index:5`，`top:-36px`），而图层工具条 `.cb-free-image__bar` 是 frame 的**兄弟节点**（`z-index:4`，`top:-30px`）——frame 的 `transform` 形成独立层叠上下文，手柄的 z-index 只在 frame 内生效，工具条整体压住手柄下半部，按下实际点到工具条。改法：工具条 `top` 抬到 `-60px`；旋转手柄 16→18px；缩放/旋转不再依赖指针捕获冒泡，改为 `useEffect` 往 window 挂 `pointermove/pointerup/pointercancel`，松手只 dispatch 一条命令。
- **A3 缺少贝塞尔曲率控件**（第一轮延期的 D37 项）：新增 `CaseEdge.controlPoints`（存曲线中点相对两端锚点中点的偏移，非绝对坐标）与 `src/lib/edgeCurve.ts`（`CURVE_GAIN=4/3` 让曲线中点正落手柄、`CURVE_MAX=1600`、`CURVE_MIN=2`）；选中关系显示 `.cb-curve-handle`，拖动实时预览、松手写回，双击复位；`BezierEdge`、`svg.ts`、`png.ts` 共用同一套几何，导出与画布一致；`migrate.ts` 迁移时规范化该字段，JSON 往返保留。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **359 条全绿**（新增 `[30]` 曲率几何/命令/JSON/SVG 一致性 13 条）、`pnpm ui-smoke` **90 条全绿**（新增 6 条：工具栏层级、八向手柄、旋转手柄、曲率手柄样式与出现/复位）、`pnpm build` 成功、`tauri build --no-bundle` 成功、`node scripts/run-selftest.cjs` **phase1 PASS 14 / phase2 PASS 15**（顺带修掉快照写库 `snapshots.nodes/edges NOT NULL`：`insertSnapshot` 补齐两列，快照从 2 份 → 3 份）。
- **待确认**：复验回执末尾「视觉对齐」「折叠操作提示」没有对应验收项，不猜需求；当前对齐参考线只有自由图片节点，卡片拖动没有；折叠入口在右栏属性面板与组框按钮，`BaseNode` 有「已折叠」徽标但无说明文案。

### M4 人工验收热修（2026-10-19，第一轮回执 A1–A8）

用户真机回执有六项不通过，逐条修完（A3 的曲率手柄延期至 M5）：

- **A1 素材库拖不进画布**：根因是 `src-tauri/tauri.conf.json` 的 `dragDropEnabled: true` —— Tauri 在 Windows 上开启它会**拦截整个 webview 的 HTML5 拖放**；改 `false`，系统文件拖入仍由 `App.tsx` 的 `onDrop` 接住（D34）。
- **A2 图片节点只能拖、不能缩放/旋转**：`FreeImageNode.tsx` 的手柄与旋转手柄缺 React Flow 的 `nodrag` 类，d3-drag 的原生监听比合成事件更早触发；给八个缩放手柄、旋转手柄、标题栏补 `nodrag`（标题栏另加 `nopan`）。
- **A4 无法框选与 Ctrl 多选**：`Board.tsx` 的 `onNodesChange` 忽略 select 变更、选中态由单选 `selectedNodeId` 派生、React Flow 未设 `multiSelectionKeyCode`（v12 默认 Meta 键，Windows 上没有）。改法：`uiStore` 增 `selectedNodeIds` / `setNodeSelection` / `applyImageSelection`，`onNodesChange` 消费 select，ReactFlow 开 `selectionOnDrag` + `SelectionMode.Full` + `panOnDrag={[1,2]}` + `panActivationKeyCode="Space"` + `multiSelectionKeyCode={['Meta','Control']}`，组节点 `selectable:false`；多选一起拖动走新命令 `moveNodes`（一次撤销，D35）。
- **A6 版本快照永远显示 0**：`docStore` 从未实现「每 5 分钟自动快照」。新增 `maybeSnapshot`（落库成功后节流 5 分钟）+ 启动时库里无快照则补「启动快照」（D36）。
- **A7 回收站恢复实体后关系丢失、Ctrl+Z 也补不回**：恢复只 `dispatch(restoreNode)`，同伴关系仍在回收站。新增 `src/commands/restoreCommands.ts` 的 `restoreEntities({nodes,edges})` 整批命令；`HistoryDialog` 恢复实体时按 `payload.source/target` 捞出同伴关系一并恢复，一次 Ctrl+Z 全撤；`repo.ts` / `storage.ts` 增 `listTrashItems` 读 payload。
- **A8 导出面板错位到视口外**：根节点误用 `.cb-modal`（360px 白卡片）而不是遮罩 `.cb-modal__mask`，面板被塞进顶栏流式布局。改为 mask + `.cb-modal cb-export`，`.cb-export` 加 `max-height:86vh; overflow-y:auto`，并补 `.cb-modal__head` / `__icon` 样式。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **346 条全绿**（新增 `[29]` 批量恢复与多选移动 9 条）、`pnpm ui-smoke` 84 条全绿、`pnpm build` 470 modules、`tauri build --no-bundle` 成功、`node scripts/run-selftest.cjs` **phase1 PASS 14 / phase2 PASS 15**（快照项由红转绿：2 份 → 3 份）。
- **文档**：`docs/MILESTONES.md` §3 增「M4 人工验收第一轮回执与热修」根因-修法-证据表、§6 增 D34–D37、§7 增一行；`docs/MANUAL-ACCEPTANCE.md` 增第二轮复验清单。

### M4 整体验收通过（2026-10-19，tag ms/M4）

- **桌面外壳**：Tauri 2（`src-tauri/`）取代浏览器沙箱，`tauri.conf.json` 版本 0.4.0、开启 `assetProtocol`（scope 限 `$APPDATA/$APPLOCALDATA/$APPCONFIG`）、`dragDropEnabled`；`scripts/tauri-cli.cjs` 兜住本机 Electron `argv[0]` 问题（否则报 `unrecognized subcommand`）。Rust 工具链装进仓库内 `.rust\`（用户目录被系统拒写，D25）。
- **持久化**（`src/services/db/{mapping,repo,tauri}.ts` + `src-tauri/src/migrations.rs`）：9 张表 + FTS5 检索；`saveCase` 重写实体行并重建检索索引；数据目录可用 `CASEBOARD_DATA_DIR` 覆盖（便携与自动化），连接串走绝对路径，建表由 Rust `ensure_db_file` 执行（D31）。`docStore` 启动异步水合 + 400ms 防抖保存，保存失败不阻断编辑；50 份滚动版本快照。
- **桌面素材库**（`src/services/platform.ts` + `imageStore.ts` 双实现）：原件落 `<dataDir>/assets/<id>.<ext>`、缩略图落 `assets/thumbs/<id>-<size>`，`<img>` 走 `convertFileSrc`；二进制跨 IPC 一律 base64（`invoke` 走 JSON，`Uint8Array` 会被序列化成按数字下标的对象，D26）。网页端仍用 IndexedDB，同一套接口。
- **`.caseboard` 单文件**（`src/serializers/caseboard.ts`）：zip 容器 = `manifest.json` + `case.json`（无损） + `case.cbd`（DSL 文本） + `assets/<id>.<ext>` + `thumbnail.png`；`readCaseboard` 对损坏包、缺 manifest、format 不符、缺 case.json 给中文错误；跨目录拷机打开已有自检证据。
- **整板导出**（`src/serializers/{png,svg,pdfExport}.ts`）：与 SVG 共用一套模型驱动排版（不截屏，只有一份排版真相，D28）——PNG 2× 高清、SVG 矢量（贝塞尔线、组、三线型图例、dasharray）、多页 PDF（A4 横向切片 + 末页检索索引页，`useObjectStreams:false` 保证外部工具可读，D32）。
- **案件图片包**：`images/` + `manifest.csv`（编号 / 类型 / 来源 / 拍摄时间 / 关联实体 / OCR 文本 + 表头），可直接作为移交清单。
- **脱敏导出**（`src/lib/redact.ts`）：把标注里的矩形按归一化坐标换算成像素区域，分列抽样填平 + 噪声扰动，`applyRedactions` 返回 `{regions, pixels}`；自检在解码后复核区域已抹平（1024 像素中 1021 点与原始不同）。
- **历史面板**（`HistoryDialog.tsx`）：版本快照 tab（恢复走 `replaceDocument`，可 Ctrl+Z）+ 回收站 tab（恢复按原 id，端点缺失拒绝悬空关系；清空需确认）；删除统一走 `docStore.removeWithTrash`（D33）。
- **桌面自检通道**（`--selftest`，D29）：隐藏窗口跑 14 / 15 项检查（应用信息、素材落盘、DB 保存重开、FTS、快照、回收站、项目包打包与跨目录打开、PNG/SVG/PDF、图片包、脱敏、零外呼），报告写 `<dataDir>/selftest.json` 后自退出；`scripts/run-selftest.cjs` 连跑两轮验证跨进程持久化（7.7s / 8.7s 出报告）。
- **工具链结论**（§5 + AGENTS.md）：Rust 必须装进工作区并每次显式设 `CARGO_HOME`/`RUSTUP_HOME`；`link.exe` 与 esbuild 同源需把 `TMP/TEMP` 指到工作区；`Start-Process`+`Wait-Process` 在本机会挂死，改用 `node` 的 `spawn` + 文件描述符 stdio；自检需 `WEBVIEW2_USER_DATA_FOLDER`（目录不可复用时换新目录）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **337 条全绿**（新增 31 条：脱敏 8 / .caseboard 8 / 整板 SVG 8 / 回收站 7）、`pnpm ui-smoke` **84 条全绿**（新增 10 条历史与回收站面板）、`pnpm bench` 1000 节点 75.7ms、`pnpm build` 469 modules、`caseboard.exe --selftest` 两轮 PASS、NSIS 安装包 3.35 MiB。

## [未发布] v0.3.0 · M3 DSL + 双向同步

### M3-4 分屏代码视图（2026-10-19）

- **分屏**：`App.tsx` 把画布与 `CodePanel` 并列放进 `.cb-work`，中间 `.cb-splitter` 指针拖拽调宽（clamp 28–72%）；顶栏「`</>` 代码视图」切换显示，`CodePanel` 用 `React.lazy` 单独分包（主包 892 → 546 kB，代码视图 chunk 345.79 kB）。
- **CodeMirror 6**（`src/dsl/{language,highlight}.ts`）：用生成的 Lezer 解析器 `LRLanguage.define` 建语言，`styleTags` + `HighlightStyle` 高亮（关键字、字符串、数字、箭头、注释）、`foldNodeProp` 折叠块、括号匹配、自动补全（8 类实体词 + 组/视图关键字 + 名字表 id + `status`/`style`/`path`/`rel`/`kind` 枚举）、悬停卡片、`Mod-Shift-f` 格式化。
- **五态同步状态机**（`src/store/codeStore.ts`）：`idle | graphEditing | codeEditing | conflict | error`；图形→代码 200ms 防抖；用户正在编辑时**不抢光标**，改为横幅「图形有更新，点击合并」；`isApplyingCode()` 单向闸门防止代码写入被回灌成新改动。
- **光标与滚动保护**（`CodeEditor.replacePreservingView`）：外部写入只 dispatch 最小差异 `changes`，前后保存/还原 `scrollTop`/`scrollLeft`，不重建 `EditorState` → 光标、选区、折叠区间由事务映射自动搬移。
- **错误容错**：解析失败时模型保持不变、画布切换为只读（拖拽/连线/删除/选中全部关闭 + 覆盖层「代码有语法错误，图形暂为只读」），CodeMirror 波浪线 + 行号 + 中文修复建议；修好后自动恢复。
- **双侧选中联动**（`src/dsl/locate.ts`）：按真实语法树定位声明（跳过 `WS`/注释、解包 `Statement`、读 `id:` 覆盖行）；画布选中 → 代码滚动居中 + 红色标记，代码光标落在声明内 → 反查模型 id → 画布 `setCenter` 居中。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **296 条全绿**（新增 34 条 `[23] DSL 代码视图同步（M3-4）`）、`pnpm ui-smoke` **62 条全绿**（新增 11 条 `[UI] M3-4 分屏代码视图`）、`pnpm build` 269 modules。


### M3-5 验收加固 · M3 完成（2026-10-19，tag ms/M3）

- **错误用例全覆盖**（`scripts/smoke.cjs` `[24]`）：十类错误逐条断言中文诊断——悬空引用、重复 id、边连自己、未闭合块、非法枚举、非数字坐标、非法 `path`、非法视图类型、未知字段、关系 id 重复；每类同时校验「解析失败不清空模型（好块保留）」与「诊断带 1 起行列」。
- **50 次连续操作**：增 / 移 / 改 / 代码改标题 / 删 各 10 次混合执行，撤销栈恰好 +50（无重复记录）、6 节点 6 关系守恒、文本往返无诊断、50 次撤销后重做逐字节等于操作后快照。
- **1000 节点基准**（`scripts/bench-dsl.cjs`，`pnpm bench`）：263.7 KB 文本，序列化 5.7ms + 解析 49.6ms + 声明定位 33.3ms + diff 3.6ms = **88.5ms < 300ms**；`scripts/fixtures.cjs` 提供可复用的大文档生成器。
- **画布渲染回归**（`scripts/bench-board.cjs`）：300 节点挂载 25ms、渲染 300 节点与 299 条连线；jsdom 无布局，连线稳定耗时只作参考，门禁口径见 D24。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **306 条全绿**、`pnpm ui-smoke` **62 条全绿**、`pnpm build` 269 modules（主包 546.30 kB / 代码视图 chunk 345.79 kB）。M3 六条验收标准全部有可复现证据，打 tag `ms/M3`。

### M3-1 DSL 序列化器（2026-10-19）

- **Model → 文本**（`src/dsl/serialize.ts`）：`serializeDoc(doc)` 输出规格 §4 形状的文本视图——`case "标题" caseNo "编号" {` 头、`// ===== 实体 / 组 / 关系 / 视图 =====` 分节、`person zhang "张建国" { … }` 实体块、`group … color="#C0392B" { nodes: [...] }` 组块、`zhang --转账 50 万--> li { … }` 三种线型边、`view timeline "案发经过" { … }` 视图块。
- **幂等**：同一 `CaseDoc` 两次序列化逐字节一致（smoke `[20]` 断言），节点数组顺序、JSON 往返都不改变输出；固定（类型顺序, id）排序 + 去尾部空行 + 固定结尾换行是幂等的前提。
- **id 名称化与双向表**：`createNameTable` / `dslNameTable` 把 `g-suspect`、`人物-甲` 这类 id 转成合法标识符（保留 ASCII 与中文，其它字符 → `_`，数字开头补 `n_`，重名加 `_2`），名字与原 id 不同时补一行 `id: "原 id"`，连线引用同步改名，保证往返不丢身份、M3-3 的 diff 能按 id 对齐。
- **字面量规则**：数字/布尔不加引号；字符串走 JSON 转义（含引号与换行也不会撑出额外物理行）；时间写成 `2026-09-01/2026-09-10`；`fields` 先模板顺序再按码位排序；`scenario` 等嵌套对象用 `stableJson`（递归排序键）。
- **坐标显式化**：每个实体与组都写出 `at(x, y)` 与 `size(w, h)`，避免「省略即自动布局」在文本编辑时漂移（D20）。
- **DSL 边界**（D20）：只表达实体/关系/组/视图；素材元数据、自由图片节点、评论、`settings` 不进文本，M3-3 合并时未表达字段原样保留。
- **验收**：`pnpm typecheck` 0 error，`pnpm smoke` **204 条全绿**（新增 31 条 `[20] DSL 序列化（M3-1）`：幂等、排序、三种箭头、id 名称化与重名、字段顺序与转义、时间区间、空文档骨架、纯函数不改模型、stableJson 等）。
### M3-3 字段级三方合并（2026-10-19）

- **字段级 diff**（`src/dsl/diff.ts`）：`diffDocs(before, after)` 按 id 对齐实体，只比较 DSL 能表达的字段（`DSL_NODE_KEYS` 等白名单，D20），产出 `add` / `update(字段, 前值, 后值)` / `remove`；`sourceHandle` 这类文本表达不了的字段**不参与 diff**，所以往返解析不会被误判成删除。
- **三方合并**：`mergeDslEdit(base, codeNext, current)` 把文本侧改动叠加到当前画布上，图形侧已改的字段一律礼让——拖节点 + 在代码里改标题两侧都生效；同字段冲突保留画布值并进 `conflicts`；文本删除画布侧改过的对象不执行（D22）。
- **整批一次撤销**：`src/commands/dslCommands.ts` 的 `applyDslChanges(changes)` 把一批改动落成一条 label「代码编辑」的 Command，一次 undo 全回滚、redo 全恢复；无改动时 `changes` 为空，不污染撤销栈。
- **失效保护**：实体已被画布删除时残留改动被忽略，不复活对象、不抛异常。
- **验收**：`pnpm typecheck` 0 error，`pnpm smoke` **262 条全绿**（新增 21 条 `[22] DSL 三方合并（M3-3）`）。

### M3-2 Lezer grammar + 容错解析（2026-10-19）

- **语法文件**（`grammar/caseboard.grammar`，Lezer）：`case "标题" caseNo "编号" { … }`、`类型 id "显示名" { … }`、`group g "…" color="#C0392B" { nodes: [...] }`、`view timeline|scenario|presentation "…" { … }`、三种线型箭头、`at(x, y)` / `size(w, h)`、`key: value` 字段（字符串/数字/布尔/日期/区间/数组/对象/枚举）、`//` 与 `/* */` 注释；代码生成脚本 `scripts/build-grammar.mjs` 产出 `src/dsl/generated/caseboard.parser.ts`（提交进库，构建不依赖 codegen）。
- **不设关键字**（D21）：统一 `Declaration` 形状、`Scalar` 统一数字/日期、整段箭头做成单个 `Arrow` token——绕开 Lezer 的 token 重叠判定，同时让 id 叫 `place` / `transfer` 不会被当成语法错误。
- **解析器**（`src/dsl/parse.ts`）：`parseDsl(text) → { doc, diagnostics }`，两遍扫描（先登记名字与 `id:` 覆盖 → 再实例化实体/组，最后绑组成员与解析边引用）；`parseArrow` 切分线型与标签（`-->` / `-.->` / `..>` / 带标签 / 带引号标签）；`hasErrors` 供 M3-4 的图形只读态使用。
- **容错**：`parseDsl` **永不抛异常**；六类错误全部给出中文诊断 + 一基行列 + 可照抄的修复建议（悬空引用、重复 id、自环、未闭合块、非法枚举、非数字坐标），**出错时已解析的好块保留**，图形不被清空；缺 `case` 文件头、关系缺 `id`（自动生成 `e_<source>__<target>`）、未知字段（warning + `fields` 提示）都只降级不中断。
- **身份对齐**：`id: "原 id"` 覆盖行生效，`"quoted id"` 可作关系端点与组成员；同一文本两次解析得到同一 `meta.id`（纯函数，`createdAt` 交给存储层）。
- **往返一致**：`parseDsl(serializeDoc(demo))` 无诊断，再序列化**逐字节相同**（M3 验收 1 的闭环）。
- **验收**：`pnpm typecheck` 0 error，`pnpm smoke` **241 条全绿**（新增 37 条 `[21] DSL 解析（M3-2）`）。

## [未发布] v0.2.0 · M2 领域模型 + 组 + 图片工作台

### M2-1 领域模型与节点模板（2026-10-18）

- **8 类节点模板**（`src/lib/nodeTemplates.ts`）：人物/组织/地点/物品/事件/证据/时间/便签共 40 个字段定义，含下拉（性别、性质、证据种类、保管状态…）、日期、数字与长文本；左栏开放全部 8 类并显示字段数，右栏按类型渲染专属字段，模板外自定义字段照样展示（D11）。
- **卡片摘要**：节点卡片显示前 2 条关键字段值与评论数，折叠详情（`collapsed`）时只留标题与状态。
- **别名 / 标签 / 折叠 / 评论**：右栏可编辑别名与标签；新增 `addComment` / `deleteComment` 命令（进撤销栈），评论带时间戳。
- **旧文档迁移兜底**：新增 `src/serializers/migrate.ts` 的 `normalizeDoc`——缺 tags/attachments/status/confidence/w/h 自动补默认值，未知节点类型落 `note`，重复 id 与端点缺失的悬空边丢弃，缺 meta 抛 `DocMigrateError`；自动存档与 JSON 导入统一走这里。
- **编辑器修复**：`RightPanel` 的字段提交在数字字段上优先存 number，空值视为删除字段，保持导出 JSON 干净。
- **验收**：`pnpm smoke` 44 条（新增 17 条）、`pnpm ui-smoke` 13 条全绿；演示案件字段已对齐模板。

### M2-2 组系统（2026-10-19）

- **矩形组与圈选成组**：左栏「新建矩形组」在可视中心落 360×260 组；「圈选成组」拖框按节点中心命中（`nodeIdsInRect`），轨迹小于 24×24 视为误触，Esc 取消。
- **组进节点层**（D12）：展开态是自定义节点 `groupRect`（`zIndex:-1`，虚线框 + 同色标题栏，右下角把手可缩放），折叠态是自定义节点 `group` 超级节点；不用覆盖层，避免 React Flow 吞点击与重复实现视口换算。
- **嵌套与整组移动**：`Group.parentId` 支持嵌套，`canParentGroup` 防成环；拖标题栏走一条 `moveGroup` 命令同步位移组矩形 + 全部子孙组 + 组内节点，撤销一次全还原；删除组时子组与成员提升一级、不删节点。
- **折叠与连线聚合**：折叠后组内节点与子组隐藏，只留显示对象数/子组数的超级节点；跨组边聚合成 `__agg:` 合成边（多条显示「N 条关系」，线型取最弱、置信度取最小），聚合边不可选、不可删，避免误改真实数据。
- **属性面板**：分组名称、6 色标识色、底色不透明度（0.02–0.6）、上级分组、折叠开关、组内对象列表（可移出）、删除分组；节点属性新增「所属分组」选择。
- **验收**：`pnpm smoke` 70 条（新增 26 条组系统断言）、`pnpm ui-smoke` 18 条全绿；演示案件「诈骗团伙」分组已绑定张建国与恒信财务。

### M2-3 图片导入流水线（2026-10-19）

- **四路导入**：拖入（`.cb-main` onDrop）、Ctrl+V 粘贴截图、批选文件（`fileService.pickFiles`）、目录监视（File System Access 轮询，D14；不支持时按钮禁用并写明原因）。
- **Worker 预处理**（D13）：`src/workers/imageWorker.ts` 在 Worker 内算 SHA-256（`crypto.subtle.digest`）、解码尺寸、出 256/1024 双级缩略图（`OffscreenCanvas` + 白底 JPEG 0.85）、解析 EXIF；`ImageWorkerPool` 固定 3 个 worker 并按传入顺序重排结果。
- **存储分层**：原件与缩略图落 IndexedDB（`caseboard-assets`，库 `originals`/`thumbs`），`CaseDoc` 只存素材元数据（编号 `IMG-0001`、大小、MIME、拍摄时间、相机、GPS、来源说明、导入渠道），组件层不碰 IndexedDB。
- **去重**：`dedupeCandidates` 先查库内哈希、再查批内重复；向导里单列「已跳过的重复文件」并标注原因，全重复时给中文提示。
- **EXIF 解析器**：自研 DataView 实现（JPEG APP1 → TIFF IFD0/ExifIFD/GPSIFD，Make/Model/DateTimeOriginal/GPS 度分秒）；修掉「LONG 型 IFD 指针被当作内联值」导致的越界崩溃，并加损坏 IFD 的长度兜底。
- **导入向导**：预览瓷砖（尺寸/体积/哈希/拍摄时间/相机/GPS）、按张移除、两种导入方式（仅入素材库 / 建证据节点并自动铺排）、证据来源、拍摄时间、关联实体；确认后落一条 `importAssets` 命令（素材入库 + 建节点 + 挂附件，一次撤销回退）。
- **素材库与详情**：左栏改三标签（对象 / 素材 / 分组），素材库分「证据素材 · N」「AI 生成 · N」并在 AI 分区空态里写明 M7 强制角标规则；右栏 `AssetForm` 可改编号与来源说明、只读展示哈希/EXIF/关联对象，删除素材同时摘掉节点引用。
- **验收**：`pnpm smoke` 93 条（新增 22 条）、`pnpm ui-smoke` 31 条全绿。

### M2-5 标注层 + PDF 抽页 / 视频抽帧（2026-10-19，tag `ms/M2`）

- **标注模型**：`Annotation` 改为类型化 —— `shape` 六选一（矩形框/箭头/手绘/文字/区域锚点/马赛克）+ `geom` 归一化几何 + 可选 `color`/`text`/`linkedNodeId`；坐标统一为 **0–1 相对素材宽高**（D17），迁移时越界自动夹紧、空几何与非法图形丢弃。
- **纯函数层**（`src/lib/annotation.ts`）：`normalizeGeom / rectFromPoints / createAnnotation / annotationBBox / hitAnnotation / mosaicCells / arrowHeadPoints / toPixelRect / toPixelPoints / describeAnnotation`，全部无 DOM、smoke 直接测。
- **命令层**：`addAnnotation / updateAnnotation / deleteAnnotation / linkAnnotation / clearAnnotations`，标注挂在 `Asset.annotations` 上，一次操作一条命令一次撤销。
- **绘制唯一入口**（`src/services/annotate.ts`）：编辑画布、缩略图与导出全部走 `drawAnnotations`；马赛克按区域分列抽样后 `imageSmoothingEnabled=false` 放大，箭头两翼在像素空间算，文字带深底块避免压不住亮背景。
- **标注编辑器**（`AnnotationEditor`）：选择 + 六种图形 + 6 色；矩形/箭头/马赛克拖拽成型，手绘按点累积，文字就地输入；侧栏可改区域锚点关联实体、改文字、删除；「导出标注图」以长边 2048 重绘原图并叠标注出 PNG。
- **PDF 抽页**：pdf.js v6（`pdfjs-dist ^6.4.299`）**动态 import 懒加载**（D19），页码范围支持 `1-3,5`（含全角分隔符、倒序纠正、越界裁剪），逐页渲染 PNG 后交给既有导入流水线（来源默认「书证翻拍」）。
- **视频抽帧**：`<video> + <canvas>` 原生解码（D18），`planFrameTimes` 取每段中点（数量 1–24），产物同走导入流水线（来源默认「监控截图」）；编码不受支持时给中文原因。
- **入口与样式**：素材库新增「PDF / 视频抽图」按钮与 `ExtractDialog`（双模式标签）；素材属性新增「标注（N）」按钮与标注说明；新增 `.cb-annot*` / `.cb-extract*` / `.cb-color-dot` 约 190 行样式。
- **验收**：`pnpm smoke` 173 条（新增 42 条：标注几何 16、标注命令 11、抽页/抽帧规划 15）、`pnpm ui-smoke` 51 条（新增 12 条）全绿；构建 243 modules，主包 464.72 kB（gzip 150.81），pdf 解析器拆成独立懒加载块。
- **工具链结论**：esbuild 处理大输出时会在系统临时目录留不下文件（`remove ...: Access is denied`），构建前把 `TMP/TEMP` 指到工作区 `.tmp-esbuild` 即可（MILESTONES §5）。

### M2-4 自由图片节点（2026-10-19）

- **自由图片节点**：`CaseDoc` 新增 `imageNodes`（`ImageNode`：`assetId/x/y/w/h/rotation/zIndex/borderStyle/linkedNodeId/pinned`），画布自定义节点 `freeImage` 与卡片共用 zIndex 空间；迁移层丢弃素材不存在的图片节点、旧文档自动补空数组。
- **移动与缩放**：8 个方位手柄（四角 + 四边），Shift 等比、Alt 从中心对称、最小 40px；屏幕位移先除 `zoom` 再按 `-rotation` 旋到图片本地轴，缩放手感与旋转后的方向一致。
- **旋转吸附**：旋转手柄按相对中心的角度累加，距 15° 整步 ≤4° 吸附（0°/90°/180°/270° 自动命中），否则保留 0.1° 微角度。
- **层级与边框**：`reorderLayers` 支持置顶/置底/上移/下移（悬浮条 + 右栏按钮）；边框样式 `photo` 白边 / `plain` 无边框 / `polaroid` 拍立得，另可开图钉装饰。
- **对齐参考线与网格**：拖动中与其它图片/卡片求左中右、上中下的三线吸附（阈值 6px），命中画证据红虚线（`.cb-guides`），未命中按 8px 网格；画布另加 80px 大网格底纹。
- **多选与吸附**：Shift 点击多选，拖动一张带动其余，松手一条 `moveImageNodes`；图片中心落到卡片上时卡片高亮，松手 `attachImageNode` 吸附为人物头像或其它节点的证据附件（D16）。
- **交互不污染撤销栈**（D15）：拖动/缩放/旋转过程只改组件本地预览与 `uiStore` 的 guides/attachTarget，松手才派发一条命令。
- **素材库拖入**：缩略图可拖拽（`ASSET_DND_TYPE` 载荷），画布 onDrop 按落点居中生成并选中；右栏新增 `ImageForm`（位置/宽高、旋转滑杆、边框、层级、图钉、吸附对象与取消吸附、删除）。
- **验收**：`pnpm smoke` 131 条（新增 38 条）、`pnpm ui-smoke` 39 条全绿；构建 232 modules。

## v0.1.0 · M1 画布 MVP（2026-10-18，tag `ms/M1`）

### 2026-10-18

- **画布骨架**：Vite 6 + React 18 + TS(strict) + React Flow 12 + Zustand + Immer，纯 Web 交付（D2）。
- **Command 体系**：`AddNode / UpdateNode / MoveNode / DeleteNode / AddEdge / UpdateEdge / DeleteEdge / ReplaceDocument` 为唯一写入口；unified undo/redo 栈（immer patches，上限 200 步），store 不暴露裸 set。
- **自定义节点 `BaseNode`**：类型色条 + 图标 + 标题（双击就地改名）+ 状态点 + 置信度；四边锚点（target 几何锚点 + source 拖拽锚点，见 D8）。
- **自定义边 `BezierEdge`**：三次贝塞尔 + 箭头 marker，线型即语义（实线已证实 / 虚线推测 / 点线待核实，`strokeDasharray` 由 `LINE_STYLE_META` 统一），权重影响线宽，双击标签改名。
- **交互闭环**：双击空白建便签、拖锚点连线并弹窗选关系类型/线型、右栏属性表单、Delete 删除节点（联动清边）、Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y、左栏类型库在画布中心新增、顶栏常驻线型图例。
- **持久化**：localStorage 自动保存（`caseboard-autosave`），刷新不丢；导出/导入 JSON（`src/serializers/json.ts`，含中文错误提示），导入可撤销。
- **既有缺陷修复**：`enablePatches()` 未启用导致首条命令崩溃（撤销栈不可用）；仅 source 锚点导致连线可能不渲染。
- **验收工具**：`pnpm smoke`（27 条逻辑断言）、`pnpm ui-smoke`（12 条打包产物 DOM 断言，jsdom 伪布局）、`scripts/preview-check.cjs`（HTTP 可服务性）。
- **工具链结论**：安装走 `pnpm install --ignore-scripts`；`.npmrc` 固定 `node-linker=hoisted`；vite CLI 在沙箱内需提权（见 MILESTONES §5）。

## v0.0.0 · 立项

### 2026-10-18

- 归档产品规格至 `docs/CaseBoard-SPEC.md`（《案情板CaseBoard-产品构思与AI提示词》v0.2）。
- 建立里程碑契约 `docs/MILESTONES.md`：M1–M8 范围、交付物、可执行验收标准、推进规则。
- 完成工具链实测：Node v24.17.0 可用；**无 npm**；pnpm 10.34.5 需经 node 直连（`scripts/pnpm.cmd` 已封装并通过 `add esbuild` 实测）；npm registry 可达；**无 Rust 工具链（M4 前置阻塞）**；pnpm 10 需白名单放行构建脚本（D7）。
- 记录首批决策 D1–D6：pnpm 替代 npm、M1–M3 纯 Web、图片能力 service 双实现、`.cbd`/`.caseboard` 命名、持久化路线、坐标换算单点化。
