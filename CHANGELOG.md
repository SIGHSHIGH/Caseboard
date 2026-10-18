# CHANGELOG

本项目的变更记录。每个里程碑收尾追加一条，并打 git tag `ms/M<n>`。

## [未发布] v0.2.0 · M2 领域模型 + 组 + 图片工作台

### M2-1 领域模型与节点模板（2026-10-18）

- **8 类节点模板**（`src/lib/nodeTemplates.ts`）：人物/组织/地点/物品/事件/证据/时间/便签共 40 个字段定义，含下拉（性别、性质、证据种类、保管状态…）、日期、数字与长文本；左栏开放全部 8 类并显示字段数，右栏按类型渲染专属字段，模板外自定义字段照样展示（D11）。
- **卡片摘要**：节点卡片显示前 2 条关键字段值与评论数，折叠详情（`collapsed`）时只留标题与状态。
- **别名 / 标签 / 折叠 / 评论**：右栏可编辑别名与标签；新增 `addComment` / `deleteComment` 命令（进撤销栈），评论带时间戳。
- **旧文档迁移兜底**：新增 `src/serializers/migrate.ts` 的 `normalizeDoc`——缺 tags/attachments/status/confidence/w/h 自动补默认值，未知节点类型落 `note`，重复 id 与端点缺失的悬空边丢弃，缺 meta 抛 `DocMigrateError`；自动存档与 JSON 导入统一走这里。
- **编辑器修复**：`RightPanel` 的字段提交在数字字段上优先存 number，空值视为删除字段，保持导出 JSON 干净。
- **验收**：`pnpm smoke` 44 条（新增 17 条）、`pnpm ui-smoke` 13 条全绿；演示案件字段已对齐模板。

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
