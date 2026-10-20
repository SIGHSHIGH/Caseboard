# 贡献指南 / Contributing

感谢你愿意改进案情板。开始之前请先读 [README](README.md) 与 [AGENTS.md](AGENTS.md)（仓库约定：技术栈锁定、Gate 0 硬约束、命令与目录规范）。

Thanks for helping out. Please read [README](README.md) and [AGENTS.md](AGENTS.md) first — the stack is locked and the Gate 0 constraints are non-negotiable.

## 本地开发 / Local setup

```bash
pnpm install
pnpm dev         # 浏览器预览
pnpm typecheck   # TypeScript 严格检查
pnpm smoke       # 逻辑层自测（Node CJS）
pnpm ui-smoke    # 界面自测（需先 pnpm build）
pnpm bench       # 1000 节点解析链基准
```

桌面打包需要 Rust 工具链与 `@tauri-apps/cli`，命令见 [AGENTS.md](AGENTS.md)。

## 提 PR 前 / Before opening a PR

1. `pnpm typecheck` 与 `pnpm smoke` 必须全绿；改了界面请顺手 `pnpm build && pnpm ui-smoke`。
2. 所有写操作必须走 `src/commands`（不要直接改 store 或 Model）。
3. 新的可机器断言逻辑请放在 `src/lib/` 或 `src/serializers/`（`tsconfig.smoke.json` 只编译这些目录）。
4. 界面文案用简体中文；不要引入紫蓝主题或绕过线型语义的开关。
5. 提交信息用一句话说明「改了什么、为什么」，必要时在正文补验收方式。

1. Keep `pnpm typecheck` and `pnpm smoke` green; for UI changes also run `pnpm build && pnpm ui-smoke`.
2. All writes go through `src/commands` — never mutate the store or the model directly.
3. Put machine-checkable logic under `src/lib/` or `src/serializers/`.
4. UI copy is Simplified Chinese; do not add purple-blue themes or switches that bypass line-style semantics.

## 许可 / License

提交贡献即表示你同意以本项目的 [PolyForm Noncommercial License 1.0.0](LICENSE) 授权你的贡献；请勿提交你无权授权的代码或素材。

By contributing you agree that your contribution is licensed under the project's [PolyForm Noncommercial License 1.0.0](LICENSE). Do not submit code or assets you are not entitled to license.
