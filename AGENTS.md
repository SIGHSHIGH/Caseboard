# AGENTS.md · 案情板 CaseBoard 项目约定

本仓库是 Windows 桌面应用「案情板 CaseBoard」。
**唯一权威规格**：[docs/CaseBoard-SPEC.md](docs/CaseBoard-SPEC.md)（产品构思 + P0–P7 提示词库）
**执行契约**：[docs/MILESTONES.md](docs/MILESTONES.md)（M1–M8 范围 / 交付物 / 验收标准 / 决策记录）

## 技术栈（锁定，不得擅自更换）

Tauri 2 + Rust · React 18 + TypeScript(strict) + Vite · React Flow(`@xyflow/react`) · CodeMirror 6 + Lezer · Zustand + Immer · SQLite(`tauri-plugin-sql`) · graphology / dagre / d3-force。

确需偏离时：**先说明理由并等用户确认**，再把结论写进 `docs/MILESTONES.md` §6 决策记录。

## 不可违反的硬约束（Gate 0）

1. 单一数据源：图形视图与代码视图渲染同一 Document Model，不存在两份数据。
2. 所有写操作走 Command（Add*/Update*/Delete*/Move*），改 Model → 压 undo 栈 → 持久化 → 广播；store 不得暴露裸 set。
3. 线型即语义：实线=已证实 / 虚线=推测 / 点线=待核实；图例常驻，不提供绕过开关。
4. AI 产出只进「待确认」队列，永不直接改 Model；推断关系必须 dotted/dashed + 低置信度。
5. AI 生成图：强制「AI 生成 · 模拟图」角标（写入像素、无关闭开关）、`aiGenerated=true` + 完整 `aiMeta`、素材库 `zone:'ai'` 分区、永不「已证实」、禁止真实人脸换脸与伪现场合成。
6. 全中文界面；不使用任何 UI 库默认紫蓝主题；主色中性深灰 + 证据红 `#C0392B`。
7. 本地优先：数据只存本机、离线可用；云端能力需显式配置 + 二次确认。
8. 坐标只走 `src/lib/coords.ts` 换算（世界坐标 ↔ 屏幕坐标），禁止各组件自算。

## 命令（本机没有 npm）

```powershell
scripts\pnpm.cmd install
scripts\pnpm.cmd dev
scripts\pnpm.cmd build        # 等价 tsc --noEmit && vite build
```

直连等价形式（沙箱内 `pnpm` 命令会 spawn EPERM，必须这样调）：

```powershell
node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" install
```

**构建必须把临时目录指到工作区**（否则 esbuild 处理大产物时会在系统 Temp 删除失败，报 `[vite:esbuild-transpile] remove ...: Access is denied`）：

```powershell
$env:TMP = "$PWD\.tmp-esbuild"; $env:TEMP = $env:TMP   # 目录已在 .gitignore
node "E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs" build
```

验收三件套：`pnpm typecheck`、`pnpm smoke`（逻辑，node CJS）、`pnpm ui-smoke`（打包产物 + jsdom 伪布局）；`build` 与 `dev/preview` 在沙箱内需 `sandbox_permissions: danger-full-access`（esbuild 子进程）。

Tauri 阶段（M4 起）另需 Rust 工具链，当前本机**未安装**。

## 目录约定（M1 起生效）

```
src/
  types/        数据模型（CaseDoc/Node/Edge/Group/Asset/ImageNode/View）
  store/        Zustand store + undo/redo 栈 + 持久化订阅
  commands/     Command 体系（唯一写入口）
  components/
    flow/       自定义节点 BaseNode / ImageNodeCard、自定义边 BezierEdge
    panels/     顶栏、左栏（类型库 / 素材库 / 大纲）、右栏（属性 / AI）
    views/      分屏、时间线、演示
  dsl/          M3：grammar 调用、serialize.ts、parse.ts、diff.ts
  services/     副作用集中层（file / image / clipboard / media / ai / db）
  lib/          coords.ts、id、颜色、快捷键等纯函数
  serializers/  JSON 导入导出
```

## 代码风格

- TS strict；禁止 `any` 逃逸，边界用 `unknown` + 类型守卫。
- 组件单一职责；组件层不直接调平台 API（走 `src/services`）。
- 状态更新函数式、不可变（Immer 内允许 mutating 风格，但必须经 Command）。
- 注释与 UI 文案用简体中文。

## 里程碑纪律

一次只推进一个里程碑；当前里程碑验收通过后才开始下一个的新功能。
每个里程碑收尾：`CHANGELOG.md` 条目 + git 提交 + tag `ms/Mn` + 可复现验收记录。
开工先给 3–6 条计划（涉及文件 + 验收标准），确认后再写代码。
