# 双版本对抗审查 · 开发问题总账与缺陷清单

> 审查对象：Windows 桌面版（`main` 分支，工作树 `F:\DSH PROJECT\.cb-main`）与鸿蒙版（`harmony` 分支，`platforms/harmony`）。
> 审查方式：读代码 + 逐条比对 + 在模拟器/桌面实跑验证；只写有证据的结论，推测项单独标注「未证实」。
> 时间：2026-10-24。两个分支各自的 HEAD：`a06a59e`（harmony，tag `hs/H5.11`）、`bbf11db`（main）。

---

## 一、开发过程中踩到的问题（按主题归纳）

数量：鸿蒙侧台账已沉淀 **38 条硬结论**（`platforms/harmony/docs/HARMONY-MILESTONES.md`）+ 桌面侧打包 5 类坑。下面按「为什么会踩」重排，不是按时间。

### 1. 内核/平台行为与文档不符（10 条）

| 现象 | 真因 | 改法 |
|---|---|---|
| ESM 全站白屏 | `resource://` 下 ESM 被 CORS 拦死 | 自定义 scheme `caseboard://rawfile/` |
| 页面显示成源码 | `setMimeType('text/html; charset=utf-8')` 非法 | 裸 MIME + `setEncoding('utf-8')` |
| 桥调用只拿到 `0` | `asyncMethodList` 不回传返回值 | 末尾多传 JS 回调，ArkTS 侧 `cb(JSON.stringify(...))` |
| 所有图片 `naturalWidth=0` | `Web` 组件上显式 `.onlineImageAccess(false)` 会把图片加载**整体**关掉，`fetch()` 却照常 200 | 删掉该调用 |
| 长按卡片先弹菜单 | ArkWeb 把长按合成 `contextmenu`，卡片的 480ms 计时器拿不到完整序列 | 多选入口放进右键菜单 |
| 触屏长按 `draggable` 出现两层拖影 + 背景高斯模糊 | 浏览器自起原生拖拽预览，与我们自己的跟手影同时存在 | `onDragStart` 里 `preventDefault()`，不能只靠 CSS |
| 素材从左栏拖进画布「卡住」 | 手指跨栏时 ArkWeb 判成滚动，对卡片派 `pointercancel`，绑在卡片上的监听随之断掉 | 监听挂 `window`；`pointercancel` 按「就地松手」处理 |
| `uitest drag` 测不到拖拽 | ArkWeb 把 `drag` 认成长按，弹菜单打断 | 用 `fling` 或探针合成事件 |
| `window.innerWidth` 首帧大 8px | ArkWeb 首帧布局视口未稳定 | 取 `min(innerWidth, clientWidth)` + 260ms 后二次校正 |
| `window.confirm/alert` 静默失效 | ArkWeb 不支持 | 自建 `ConfirmHost` / `NoticeHost` |

### 2. 桥与文件通路（6 条）

- **桥返回必须 `JSON.stringify`**：`{"ok":true,"value":<裸串>}` 是非法 JSON，曾让四条导入全灭。
- **`new File([bytes], name)` 必须带 `type`**：否则 `file.type === ''`，「不是图片」判定把整条导入链掐断。
- **素材二进制要落文件，不能只进 IndexedDB**：鸿蒙端 `imageStore` 原本只判 `isTauri()`，导致「有素材、无缩略图」；`caseboard://rawfile/asset/…` 因此 404。修法：`usesNativeAssetStore() = isTauri() || isHarmony()`，并给 `assetFileUrl()` 补「绝对路径里的 `assets/`|`thumbs/` 标记切分」。
- **缩略图目录不能每次导入就地作废**：`thumbNames = null` 会让下一次渲染各过一次桥；改 `thumbNameCache`（落盘 add、删除 delete）。
- **离线 OCR 是桌面独有能力**：鸿蒙只有系统 OCR 桥，模拟器上不可用。
- **`hdc install` 的 HAP 路径必须 Windows 反斜杠绝对路径**，正斜杠会被拼到工作目录后报 `no such file`。

### 3. 交互与布局（8 条）

- **`position: fixed` 只给 `left` 的盒子会按「右侧剩余空间」shrink-to-fit**：夹取一次就变窄，下次又贴边（实测恒 `right = 视口宽`）。修法 `width: max-content` 让宽度与 `left` 解耦。
- **固定按钮要跟画布走而不是跟窗口走**：右栏开关原先 `right:12px`，右栏展开就压在右栏上；挪进 `.cb-work__canvas` 后按小地图几何量 `right:175px`。
- **抽屉态要整体让位**：右栏在 `<1180px` 变 `position:absolute` 抽屉，`right ≤ 312px` 的按钮与小地图全被盖住（H5.11 修）。
- **画布太窄时小地图与按钮互相挤**：`<520px` 时隐藏小地图、按钮退回 `right:12px`。
- **React Flow v12 选中会自动抬层**（`elevateNodesOnSelect` 默认 true）：钉集要求对外永远置顶，必须显式关掉。
- **钉集拖拽的坐标优先级**：`derived`（钉子+偏移推导）盖过预览态会导致「被拖的那张自己被钉住、松手跳一下」——预览必须优先。
- **同一个节点的 source/target handle 不能同 id**，否则 React Flow 静默不画边。
- **边进文档 ≠ 画得出来**：`targetHandle` 被自动锚点覆盖成钉子上不存在的 `left/top/bottom` 时，React Flow 不报错、直接不渲染。

### 4. 工具链与工程（9 条）

- **`.ps1` 写完必须补 UTF-8 BOM**（`fix-bom.mjs`），否则 PS5.1 按 ANSI 解析中文，在随机行报假语法错。
- **`robocopy` 在 git-bash 里必须 `MSYS_NO_PATHCONV=1`**，否则 `/MIR`、`/E` 被当路径改写（`无效参数 #3`）。
- **同步 rawfile 必须 `/MIR`**：只 `/E` 会让历史 hash 的 bundle 堆在 DevEco 侧，HAP 从 4.9MB 涨到 46MB。
- **esbuild >1MiB 输入会落临时文件**，本机删不掉（`Access is denied`）→ 把 `node_modules/esbuild/lib/main.js` 的阈值调到 1 GiB 走 stdin。
- **Tauri release 必须带 `--features tauri/custom-protocol`**，否则窗口去连 `devUrl`，显示「localhost 拒绝连接」。
- **WebView2 用户数据目录必须独立**，复用会 `HRESULT(0x800700AA) 请求的资源在使用中`。
- **exe 被上次 `--selftest` 进程锁住**：`cargo build` 报 `os error 5`，要先杀进程并删 `.fingerprint/caseboard-*`。
- **模拟器 install 服务刚启动时不稳定**：`Not match target`/`Not found` 频发，重启后等 25s 再装。
- **探针注入块的抽取不能用「一行恰好是 4 空格 + `}`」当终点**：块内天然有内层收尾，会提前截断并把数组逗号吃掉；改尾部锚点 + `// end-of-phase` 标记。

### 5. 测量与验收的可信度（5 条）

- **hilog 的 console 转发会丢包**：页面加载后 4 秒内几乎全丢、密集连发也丢 → 探针必须把结论汇总成**一条**晚到的 `summary`。
- **分段计时会把启动那段算到下一段头上**：曾把「按住」测成 300–676ms，实为 34ms；更正后才发现「卡壳」是**体感**问题（按下 450ms 无反馈），不是性能问题。
- **探针必须可重复跑**：固定方向的拖拽在第二次运行时被 clamp，`move=0` 假失败；改成朝图片中心方向拖。
- **验收断言依赖文案与选择器**，文案一改就全红；要给关键元素加 `data-diag` / `data-pin-id` 这类稳定锚点。
- **验收会污染数据**：各相位之间不清库，脏文档会让「取最后一个钉子」这类断言选错对象。

---

## 二、对抗审查：已确认的缺陷

> 下列每条都给了 `文件:行号`，在两棵树里**都存在**（除特别标注）。行号以桌面 `main` 分支工作树为准，鸿蒙侧行号略有偏移但代码同构。

### D1（严重）导出物丢红线，集中钉子被画成小卡片

- 证据：`src/serializers/svg.ts:297` 的 `boardToSvg()` 只遍历 `doc.edges`、`doc.imageNodes`、`doc.nodes`，**从未读 `doc.pinLinks`**；`src/serializers/png.ts:280` 的 `drawBoardToCanvas()` 同构。`svg.ts:171 renderNode()` 对所有节点统一画「圆角卡片 + 色条 + 图标 + 标题」。
- 影响：导出的 PNG / SVG / PDF 里红线**完全消失**；`clusterPin`（30×30）会被画成一张小卡片，图标与标题互相压字。
- 复现：任意两颗钉子连一条红线 → 右栏「导出」→ 选 PNG，画面里没有红线。
- 建议：`png.ts` / `svg.ts` 各加一段 `drawPinLinks`（直线、`#C0392B`、`doc.settings.pinLinkWidth ?? 4`）；`renderNode` 对 `clusterPin` 走专用分支（画 12px 圆点 + 可选便签）。

### D2（严重）键盘删除留下孤儿数据

- 证据：`src/components/flow/Board.tsx:794` 的 `onNodesDelete` 对普通节点只调 `removeWithTrash('node', [id])`；而右键菜单删除（`:1531-1543`）会先 `detachImageFromCluster` 再 `removePinLinksOf` 再 `deleteNode`。`deleteKeyCode` 在 `:1401` 打开。
- 影响：选中钉子按 Delete 后 —— ①`doc.pinLinks` 里留下指向不存在钉子的链接（`PinLinkLayer.centerOf` 返回 `null`，不画，但数据在；DSL 里会输出 `redline: [已删钉子]`）；②被钉的图片 `clusterId` 悬空，**停在原地**且右栏仍显示「钉集内层级（第 N 层，对外永远置顶）」，UI 再也解不开。
- 复现：拖一张图到钉子上 → 选中钉子 → Delete。
- 建议：把「删钉子」的清理抽成一个 `deleteClusterPin(id)` 命令（自动解绑成员 + 删链接 + 删节点），两条删除路径都走它。

### D3（中）删除提示说「可撤销」，但撤销后数据不再原样

- 证据：`src/components/flow/Board.tsx:1531-1543` 一次点击派发 **3 条独立命令**（`detachImageFromCluster` × N、`removePinLinksOf`、`deleteNode`），而撤销栈是按命令回退的。
- 影响：按一次 Ctrl+Z，钉子回来、成员却成了自由图片、红线也回不来；用户会以为「撤销把数据搞坏了」。
- 建议：同 D2，合并成单条复合命令，撤销即完整还原。

### D4（轻）生产代码里留着诊断日志

- 证据：`src/components/flow/Board.tsx:1298 / 1302 / 1310` 三行 `console.log('[diag] redline …')`，每次点第二颗钉子都打。
- 影响：控制台噪音；日志里带节点 id 与缩放值。桌面与鸿蒙各 3 行。
- 建议：包一层 `if (import.meta.env.DEV)`，或用探针开关（`window.__CASEBOARD_DIAG__`）。

### D5（中）验收脚本结果不可比，不能当发版门禁

- 证据：同一份代码，本轮 `43/44`（唯一失败 `H5-19 maxGap=0ms`），上一轮 `40/40`、再上一轮 `37/40`、`39/40`。失败项在 `H5-19`（帧间隔）、`H5-32`（会员跟随）、`H5-35/36`（红线）之间漂移。
- 影响：无法用「全绿」证明没有回归；真正稳定的只有静态断言与带 `data-diag` 锚点的几条。
- 建议：①每条动态断言前 `bm clean` 或给文档打唯一前缀；②flaky 项改为「重试 2 次取最好」并单独标记；③把导出、撤销、大文档纳入断言（见 V2/V4）。

### D6（结构）两棵树已分叉 29 个文件，共享逻辑必须双份维护

- 证据：`diff -rq .cb-main/src platforms/harmony/web/src` → 29 个文件不同；共享逻辑差异行数：`Board.tsx` 565、`RightPanel.tsx` 440、`imageNodeCommands.ts` 153、`BaseNode.tsx` 89、`nodeCommands.ts` 56、`groupCommands.ts` 58。
- 影响：H5.7–H5.11 的每次修复都是我手工双写；下一次漏搬就会变成「这个功能桌面没有 / 鸿蒙没有」。已经出现过一次：桌面 `SystemDialogs` 未回填但 `askConfirm` 留在 store 里（D7）。
- 建议：`src/` 作为唯一源，`platforms/harmony/web/src` 只保留平台覆盖层（`services/platform.ts`、`services/harmony.ts`、`services/db/harmony.ts`、`styles/responsive.css`、`lib/viewport.ts`、`OrientationGate`、`SystemDialogs`、`AssetDragGhost`），其余文件由同步脚本生成；CI 里加一条 `diff` 白名单校验。

### D7（轻但危险）桌面 store 暴露 `askConfirm` 却没有宿主组件

- 证据：`.cb-main/src/store/uiStore.ts:121`（接口）/`:234`（实现）；`SystemDialogs.tsx` 仅存在于鸿蒙树；桌面 `App.tsx` 未挂 `ConfirmHost`。
- 影响：当前没有消费者，所以不报错；但任何人照着鸿蒙代码写 `await askConfirm(...)`，桌面上这个 Promise **永不 resolve**（点了没反应、按钮像坏了）。
- 建议：桌面要么一起回填 A5，要么把 `askConfirm` 从桌面 store 删掉（当前是死代码）。

### D8（待定）红线在画布上的层叠位置未定义

- 证据：`src/components/flow/PinLinkLayer.tsx` 用 `ViewportPortal` 插 `<svg className="cb-pinlinks">`，CSS（`src/index.css:5741`）**没有 `z-index`**，绘制顺序取决于 portal 插入位置。
- 现状：实测红线会压在卡片之上（截图 `dsh-shot-84` 可看到线穿过卡片区域）。
- 需要确认：红线应该在卡片下面（像连线）还是上面（像便签）？若要压在下面，给 `.cb-pinlinks` 指定 `z-index: 0` 并把节点层抬到 1。

---

## 三、风险与隐性耦合（未证实为缺陷，但会咬人）

| 编号 | 风险 | 证据 | 触发条件 |
|---|---|---|---|
| R1 | 红线粗细不进 DSL | `dsl/serialize.ts:11` 注释明确「settings 不在文本视图里」 | 用户以为能在代码视图调线宽 |
| R2 | `PinLinkLayer` 顶部注释已过时 | 注释写「不进 …/代码视图」，但 H5.6.3 已让它进 DSL | 后来者按注释删掉 DSL 支持 |
| R3 | 桥与内置前端无版本握手 | HAP 内置 `rawfile`，`callNative('x')` 无版本校验 | 将来做前端热更，调用桥里不存在的方法 → 20s 超时 |
| R4 | `parse.ts` 用 `settings: DEFAULT_SETTINGS` 造文档 | `dsl/parse.ts:269`、`:997`；靠 `mergeDslEdit` 从 `cloneDoc(current)` 起步（`diff.ts:183`）才不丢设置 | 有人改用 `applyDslChanges(parsed)` 直接落盘 → 底衬/线宽被重置 |
| R5 | 写入侧不 clamp 线宽 | `CanvasBackdropForm.tsx:80` 直接 `updateSettings({pinLinkWidth: Number(...)})`，读取侧才 `normalizePinLinkWidth` | 手工改 JSON 或将来加输入框 |
| R6 | `uitest drag` 与真实手指不同语义 | 硬结论 17 | 用脚本验证拖拽结论不可靠 |

---

## 四、验证盲区（现有验收覆盖不到的地方）

- **V1 真实手指路径少**：40+ 条里绝大多数是 DOM 合成或静态检查；只有帧时（H5-19）、拖拽（H5-21）、菜单删除（H5-37）三条接近真实手势。
- **V2 导出没有自动化**：PNG/SVG/PDF/Word 全靠人眼（D1 就是这么漏掉的）；桌面有 `--selftest` 但没断言导出内容，鸿蒙完全没接。
- **V3 大文档未在鸿蒙端测**：`pnpm bench`（1000 节点 86.3ms）只跑桌面；鸿蒙是同一份 JS，但内核不同，未测。
- **V4 撤销/重做无断言**：红线、钉集、删除、组框加入都能撤销，但没有一条自动断言（D3 因此一直没人发现）。
- **V5 脏数据与迁移无断言**：老文档（168×132 的钉子、无 `pinLinks`、无 `pinLinkWidth`）只做过手工打开验证。

---

## 五、建议的修复顺序

1. **D2 + D3**（一次改动）：把「删钉子」做成单条复合命令 `deleteClusterPin`，键盘删除与右键删除共用 → 同时消除孤儿数据与撤销不一致。
2. **D1**：导出补红线 + `clusterPin` 专用渲染 —— 这是交付物与画布不一致，属于对外可见问题。
3. **D4**：诊断日志加 DEV 开关（顺手）。
4. **D7**：桌面删掉 `askConfirm` 死代码，或回填 A5。
5. **D5**：验收脚本加「清库 + 重试 + 分类标记」，把 flaky 与真失败分开。
6. **D6**：先加一条 CI 校验（共享文件白名单 diff），再谈「单一源 + 覆盖层」的重构。
7. **D8 / R1–R5**：各自确认产品预期后单项处理。

> 本文只做诊断，未改代码。上面 1–4 项我可以直接修（改动小、可被现有断言覆盖），需要你点头。
