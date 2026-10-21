# 桌面版与鸿蒙版：仓库管理建议

结论先说：**一个仓库、两个应用目录、一条主干、按里程碑打 tag；鸿蒙版走 `harmony` 主线的独立分支，桌面版维护走 `main`。**

## 一、为什么不建两个仓库

当前状态是「鸿蒙工程在桌面仓库里，但被 `.git/info/exclude` 挡在外面」，这是临时隔离手段，长期有两个真问题：

1. **`web/` 是桌面前端的副本**（163 个 `.ts/.tsx`）。它会持续漂移：H1 已经在副本里改了 `App.tsx`、`main.tsx`、`TopBar.tsx`、新增 `lib/viewport.ts` 与 `styles/responsive.css`。这些改动里有相当一部分（触控尺寸、抽屉分档、`TopBar` 的 flex-shrink 缺陷）**桌面版也该要**。两个仓库的话，每次都是手工挑 commit、cherry-pick，三个月后必然对不齐。
2. 硬约束 1「单一数据源」在工程层面同样适用：`types/`、`commands/`、`store/`、`dsl/`、`serializers/` 合计约 15,000 行逻辑层，桌面与鸿蒙**必须逐字一致**。两个仓库等于两份真相。

## 二、推荐结构

```
caseboard/                        ← 一个仓库
├─ src/           桌面版前端（Tauri 宿主）
├─ src-tauri/     桌面版 Rust 壳
├─ platforms/harmony/              ← 鸿蒙宿主工程（本仓库现状整体搬进来）
│  ├─ entry/                      ArkTS 侧：桥、scheme handler、EntryAbility
│  ├─ web/                        鸿蒙版前端副本（由 src/ 同步 + 平台缝替换）
│  ├─ scripts/                    build-web.ps1 / accept-h0.ps1 / accept-h1.ps1
│  └─ docs/H0-ACCEPTANCE.md, H1-TABLET.md
├─ docs/          SPEC / MILESTONES（两份共用）
└─ CHANGELOG.md   按里程碑记
```

好处：逻辑层只有一份；鸿蒙宿主工程是一个目录，`git log -- platforms/harmony` 就是移植史；`docs/HARMONYOS-PORT.md` 从「未跟踪的草稿」变成正式文档。

## 三、`web/` 副本怎么管（关键）

副本不能手工维护，要**生成 + 白名单 diff**：

1. `src/` 是唯一真相。`web/src/` = `src/` 的镜像，只允许下列文件不同（白名单）：
   - `services/platform.ts`、`services/file.ts`、`services/ocr.ts`、`services/storage.ts`
   - `services/harmony.ts`、`services/db/harmony.ts`（鸿蒙独有，新增）
   - `services/ocrBuiltin.ts`（鸿蒙版删除）
2. 加一个 `scripts/sync-web.ps1`：`robocopy src web\src` + 从 `web/overrides/` 覆盖白名单文件。任何不在白名单里的差异，由 CI 直接判红。
3. `web/vite.config.ts` 的差异只有三项（`base:'./'`、`outDir` 指向 `rawfile`、`target:'es2022'`），也用 `overrides/` 承载。

这样「桌面改了什么、鸿蒙跟没跟上」是一次 `git diff src web/src` 就能答的问题。

## 四、分支与发布

| 分支 | 用途 |
| --- | --- |
| `main` | 桌面版发布线，`ms/M1`…`ms/M18` tag 不动 |
| `harmony` | 鸿蒙主线，`hs/H0`、`hs/H1`… tag |
| `harmony-shared`（可选） | 从 `harmony` 挑出的「桌面也该要」的改动，成群回合 `main` |

合并方向只有一个：`harmony → main`（挑共享改动），**永不 `main → harmony` 整支合并**（会把桌面宿主相关改动拖进鸿蒙副本）。

三条纪律：

1. **每个里程碑收尾必打 tag**（`hs/H0`、`hs/H1`），tag 里写清验收脚本与实测数字，与桌面 `ms/Mn` 同一套格式。
2. `platforms/harmony/docs/` 记录「与桌面的差异」与「上机踩过的坑」，不写在 PR 描述里——PR 会过期，文档不会。
3. 逻辑层改动**先在 `main` 落，再同步到 `harmony`**。反过来会制造二分查找地狱。

## 五、迁移步骤（建议 H2 开工前做，约半小时）

```powershell
# 1. 桌面仓库里建目录，把鸿蒙工程整体搬进去（保留 git 历史：先搬文件，再 git add）
#    当前鸿蒙工程是独立仓库，历史已提交，搬入后用 git log --follow 可追溯
# 2. 桌面仓库 .git/info/exclude 里删掉 masaike board hamonyos/ 那一行
# 3. 在 caseboard 仓库建 harmony 分支承接，main 保持桌面发布线
# 4. CI：pnpm typecheck + smoke + ui-smoke（桌面） 与  accept-h0/h1 脚本（鸿蒙）分两条流水线
```

**但现在别搬**：H1 刚验收，鸿蒙工程目录还在高频改动，搬仓库会打断验证节奏。建议 H2 结束时一次性迁入，迁移前把 `web/` 同步脚本写好（否则搬完立刻漂移）。

## 六、如果坚持两个仓库

那就必须接受两条硬性约束，否则一定烂掉：

1. 逻辑层用 **git subtree**（不是 submodule）双向同步，`src/{types,commands,store,dsl,serializers,lib}` 作为 subtree 目录；
2. 每次改逻辑层，**同一天**在两个仓库各提交一次，CI 里加一条「两边 sha 一致」的检查。

这会比单仓库多付约 15% 的日常成本，换来的只是「鸿蒙仓库权限单独控制」——除非有真实的权限隔离需求，不划算。
