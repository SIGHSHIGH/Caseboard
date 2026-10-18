# 案情板 CaseBoard

> 数字时代的刑侦白板：把人物、照片、证据、事件钉在无限画布上，用贝塞尔曲线织出关系网，并可随时切换为代码（DSL）视图精确编辑。

Windows 优先、本地优先、离线可用；图形视图与代码视图是**同一份数据的两个对等视图**；AI 只产出「待确认」的线索，永不落定结论。

## 文档地图

| 文档 | 作用 |
|---|---|
| [docs/CaseBoard-SPEC.md](docs/CaseBoard-SPEC.md) | 产品构思与 AI 提示词库（规格原文，v0.2） |
| [docs/MILESTONES.md](docs/MILESTONES.md) | **里程碑契约**：M1–M8 范围、交付物、验收标准、环境、决策记录 |
| [AGENTS.md](AGENTS.md) | 工程约定：技术栈锁定、硬约束、命令、目录与代码风格 |
| [CHANGELOG.md](CHANGELOG.md) | 版本与里程碑变更 |

## 里程碑状态

| # | 主题 | 状态 |
|---|---|---|
| M1 | 画布 MVP | ⬜ 未开始 |
| M2 | 领域模型 + 组 + 图片工作台 | ⬜ 未开始 |
| M3 | DSL + 双向同步 | ⬜ 未开始 |
| M4 | Tauri + SQLite + 项目文件 + 导出 | ⬜ 未开始（前置：安装 Rust 工具链） |
| M5 | 分析视图 | ⬜ 未开始 |
| M6 | AI 文本能力 | ⬜ 未开始 |
| M7 | 高级功能 + AI 生图 | ⬜ 未开始 |
| M8 | 安全与打磨 | ⬜ 未开始 |

## 技术栈

Tauri 2 + Rust · React 18 + TypeScript + Vite · React Flow(@xyflow/react) · CodeMirror 6 + Lezer · Zustand + Immer · SQLite · graphology/dagre/d3-force

## 开发环境

本机 **没有 npm**，包管理走 pnpm 直连：

```powershell
scripts\pnpm.cmd install
scripts\pnpm.cmd dev
scripts\pnpm.cmd build
```

Rust 工具链（Tauri，M4 起需要）当前未安装。

详细环境实测见 [docs/MILESTONES.md](docs/MILESTONES.md) §5。
