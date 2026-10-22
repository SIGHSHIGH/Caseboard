# 鸿蒙移植 · 里程碑与验收台账

本文件是鸿蒙侧的唯一进度台账。每个里程碑收尾必须：`CHANGELOG.md` 条目 + git 提交 + tag `hs/Hn` + 可复现验收脚本 PASS。

## 已完成

| 里程碑 | 范围 | 验收 | 提交 / tag |
|---|---|---|---|
| H0 | ArkWeb 骨架 + 25 方法原生桥 + SQLite/文件/剪贴板/OCR/图像服务 | `scripts/accept-h0.ps1` 8 条 | `e105c12` / `hs/H0` |
| H1 | 平板形态：视口分档（1180/900）、触控控件 28→40px、抽屉、只做横屏 | `scripts/accept-h1.ps1` 13 条 | `40a2645` / `hs/H1` |
| H1.1 | 竖屏/小窗提示层 `_(:3」∠)_` | 13 条 | `3ff12b2` |
| H2 | 顶栏收容修正（预算扣常驻元素 + flex-end 左溢出检测） | 17 条 | `0a8fa58` / `hs/H2` |
| H2.1 | 侧栏开关改左右下角 44px 圆形按钮（画布 888→920）+ 桌面回填 | 18 条 | `9ea74df` |
| H3 | 触控手势层：拖拽惯性（长按/双指/单指平移本来就通） | 21 条 | `963f854` / `hs/H3` |
| H4 | 手指可用性：连线命中带、图例/分组控件放大、导出链路验通 | `scripts/accept-h4.ps1` 7 条 | `f2d5840` / `hs/H4` |
| H5.1 | 素材通路：导入 → 沙箱落盘 → 缩略图显示 → 触摸长按拖入画布；**图片全军覆没的真根因** | `scripts/accept-h5.ps1` 10 条 | 见下方「H5.1 结项」 |
| H5.2 | 静默失败清账 + 触屏多选/组框收编 + 画布帧耗时实测 | `scripts/accept-h5.ps1` 16 条 | 见下方「H5.2 结项」 |
| H5.3 | 集中钉子 + 钉集（图片钉在一颗钉子上整体移动/绕钉旋转）+ 图钉自由落点与换色 + 各节点层级控件 + 组框直接挑节点加入 + 拖入画布卡壳量化 | `scripts/accept-h5.ps1` 25 条 | 见下方「H5.3 结项」 |
| H5.4 | 素材跨栏拖拽不再「卡住」+ 长按阈值 480ms + 长按菜单贴边自动夹进视口 | `scripts/accept-h5.ps1` 25 条（H5-24 菜单贴边） | 本节结论 20–22 |
| H5.5 | 集中钉子改圆点（连接点同心、便签在圆点上边正中、默认无便签、新建时弹窗询问）+ 拖钉带动钉集 + 绕钉真旋转 + 钉子右栏成员增减 + 成员相对位置控件 + 长按阈值 100ms + 杀掉 ArkWeb 原生拖影（整图跟随 + 背景高斯模糊）+ 右栏开关挪到小地图左侧 | `scripts/accept-h5.ps1` 31 条（H5-25…H5-30） | 见下方「H5.5 结项」 |
| H5.6 | 拖钉集时「钉子与图片相对位置」不再漂移（预览坐标压过推导坐标 + 松手清预览）+ 集中钉右栏去掉别名/地图坐标/评论 + 成员「相对 X / 相对 Y / 自身旋转」各占一行、滑块+数字输入 + 长按钉子「创建红线」→ 点另一钉子生成 4px 红色实线 | `scripts/accept-h5.ps1` 36 条（H5-31…H5-35） | 见下方「H5.6 结项」 |

桌面回填（`main`）：`774fa62` 顶栏两处修正 + `.cb-btn{flex-shrink:0}`，已 cherry-pick 回 harmony（`4a6315c`）。

## 进行中

### H5 · 导入与交互闭环

目标：把「点了没反应」这一类静默失败全部消灭，并补齐触屏多选。

| 编号 | 事项 | 现状 | 验收方式 |
|---|---|---|---|
| H5-1 | 四条导入（示例案卷 / 导入素材 / 圈选成组 / 导入背景图） | **已通**：素材导入走 `onShowFileSelector` → `FileService.openFile` → 桥回传字节 → 沙箱 `filesDir/assets|thumbs`；照片选择器取回链路已验（导入后素材卡出现、SHA-256 去重生效） | `accept-h5.ps1` H5-1（探针合成 JPEG 走真实 drop → 点确认导入） |
| H5-2 | 画布拖动迟滞 | **已通**：探针 phase 15 用 rAF 采样 + 合成 30 步 pan，`p50=16.8ms p95=16.9ms drop=1/124 帧`（阈值 p95≤34ms）。原嫌疑的 `onMove` 采样没有造成掉帧，H6 没有性能理由 | `accept-h5.ps1` H5-2 |
| H5-3 | 项目内嵌样图 | **已通**：`CASEBOARD_TEST_FIXTURES=1` 时 postbuild 把 `test-fixtures/` 拷进 rawfile，探针 `fetch('caseboard://rawfile/test-fixtures/sample-id-card.jpg')` 直接可读 | `accept-h5.ps1` H5-1/H5-4 |
| H5-4 | `window.confirm/alert` 全量替换 | **已通**：新增 `store/uiStore.ts` 的 `askConfirm()`/`pushNotice()` + `components/panels/SystemDialogs.tsx`（ConfirmHost/NoticeHost），9 处全改（TopBar 4、AiPanel 3、AiImagePanel 1、HistoryDialog 1）。云端授权两处走 `askConfirm` 带 `danger`，符合硬约束 7 的二次确认 | `accept-h5.ps1` H5-11/12/13 |
| H5-5 | 长按节点多选 | **已通**（两条通道）：①卡片 480ms 长按进多选；②**真机上长按被 ArkWeb 抢成 contextmenu**，所以右键菜单加了「多选卡片（选多张一起加进组框）」。多选态下右栏顶部显示「已选 N 个卡片 + 加入组框…/清空选择」 | `accept-h5.ps1` H5-14 + 真手势截图 |
| H5-6 | 组框「加入已有节点」 | **已通**：新命令 `addNodesToGroup(nodeIds, groupId)`（pad 24 / 组头 40 / 间距 16 / 卡片高度下限 96，**不收窄卡片**，只放大组框），配 `GroupPickDialog.tsx` 选目标组框 | `accept-h5.ps1` H5-15 + 真手势截图（诈骗团伙 3 → 5 个对象） |
| H5-7 | 桌面 / 鸿蒙双版本同步 | 未开始 | 桌面四件套 PASS |

`window.confirm/alert` 剩余清单：**已清零**（`accept-h5.ps1` H5-11 断言 `web/src` 内 0 命中）。

## H5.1 结项（素材通路）

四条验收全部落在 `scripts/accept-h5.ps1`（10 条断言，探针 `--ps caseboardSelftest 13`）：

| 断言 | 内容 | 判据 |
|---|---|---|
| H5-1 | 合成 JPEG（画布画 `Date.now()` 保证字节唯一）→ `File` → `DataTransfer` → 对 `.cb-main` 派发真 `drop` → 轮询点「确认导入」 | `summary drop=1 confirm=确认导入 1 张` |
| H5-2 | 素材卡缩略图走 `caseboard://rawfile/asset/thumbs/…` | `tiles=7` + URL 前缀 |
| H5-3 | 缩略图真解码 | `thumb0=256` |
| H5-4 | 缩略图 URL 可直接取字节 | `fetch=200-image/jpeg` |
| H5-5 | 新导入不写 IndexedDB | `idb=no-stores`，前后一致 |
| H5-6 | 长按 450ms 起拖 → 指尖跟手影 → 落点建图片节点 | `nodes 14 -> 15`、`ghost=1` |
| H5-7 | 画布图片节点真实像素 | `free-img[0] natural=1024x614` |
| H5-8 | Board 背景图走 `usesNativeAssetStore` | 源码断言 |
| H5-9 | imageStore 无 IndexedDB 回退死路 | 源码断言 |
| H5-10 | 三张真 `<img>` 对照（scheme / blob / data） | `scheme=256 blob=256 data=1` |

落盘位置（模拟器实测）：`/data/app/el2/100/base/com.caseboard.harmony/haps/entry/files/{assets,thumbs,selftest}`。
`assets/a_2bt9d.jpg` 635,804B、`thumbs/a_2bt9d_256.jpg` 10,321B、`thumbs/a_2bt9d_1024.jpg` 98,335B。

## H5.2 结项（静默失败清账 + 触屏多选 + 帧耗时）

`scripts/accept-h5.ps1` 扩到 **16 条**，一条命令覆盖（探针 phase 13/14/15）：

| 断言 | 内容 | 判据 |
|---|---|---|
| H5-1…H5-10 | H5.1 的素材通路十条（回归） | 见上表 |
| H5-11 | `web/src` 内 `window.confirm(` / `window.alert(` 归零 | 静态 grep |
| H5-12 | `App.tsx` 挂载 `<ConfirmHost` 与 `<NoticeHost` | 静态断言 |
| H5-13 | `AiPanel`/`AiImagePanel` 的云端授权走 `askConfirm` | 静态断言 |
| H5-14 | 长按卡片进多选 → 点第二张累加 → 右栏横幅 | `summary14 banner=1 sel=2` |
| H5-15 | 多选 → 「加入组框…」→ 选组 → 两张卡进框 | `picked=1 contained=1 rect=180x374 inside=2/2` |
| H5-2 | 画布平移帧耗时 | `p50=16.8 p95=16.9 drop=1 frames=124` |

真手势复核（`uitest uiInput`，物理像素 = 截图预览坐标 × 1.8367）：
长按卡片 → 菜单 4 项 → 「多选卡片」→ 点第二张 → 右栏「已选 2 个卡片」→「加入组框…」→
选「诈骗团伙」→ 组框标题变「5 个对象」、组成员清单 5 条、两张卡落进框内（H5 组框加入实测通过）。

## 未开始

| 里程碑 | 内容 | 前置 |
|---|---|---|
| H6 | 原生画布（ArkUI Canvas）性能决策 | H5-2 的帧耗时数据 |
| H7 | 真机专属验收：OCR（Core Vision Kit）、PDF（PDFKit）、签名打包 | 需真机签名 profile |

## 已知环境事实（省得重复踩）

- 模拟器 `127.0.0.1:5555` 不校验签名；真机（`MLR-AL10` / `5KLBB25A09200487`）拒绝未签名 HAP（`code:9568320 no signature file`）。
- 真机 hilog 抓不到应用日志（缓冲被冲），**调试优先在模拟器做**。
- 同步方向：仓库 `platforms/harmony` → DevEco `F:\dsh-project\harmony` 单向覆盖，`build-profile.json5` 等签名相关文件永不覆盖。
- ArkWeb 三条硬结论：`resource://` 下 ESM 被 CORS 拦死（用 `caseboard://`）；`asyncMethodList` 不回传返回值（末尾传回调 + 信封）；`setMimeType` 只能裸 MIME（字符集另设 `setEncoding`）。

## ArkWeb 硬结论续（H5.1 新增，别再试一遍）

7. **`.onlineImageAccess(false)` 会关掉 ArkWeb 的图片加载**：`<img>` 全部 `naturalWidth=0`、`complete=false`，连 `data:` URL 都不例外；内核根本不发图片请求，`fetch()` 却照常 200 —— 这个组合最容易把锅甩给「自定义 scheme 不支持图片」。默认值就是 true，**不要显式关它**。
8. **hilog 的 console 转发会丢包**：页面加载后 4 秒内的 `console.log` 几乎全丢，密集连发也会丢。探针必须把所有结论汇总成**一条**晚到的 `[diag] summary …`（19s），脚本只认这一行；零散日志只能当辅助。
9. **`.ps1` 用 write/edit 改完必须补 UTF-8 BOM**（`node scripts/fix-bom.mjs <file>`）：PS5.1 无 BOM 时按 ANSI 解析中文，会在随机行报假错（`字符串缺少终止符` / `意外的标记 }`），改一处看起来「改坏了」其实是编码。改完先 `parse.ps1` 语法校验再跑。
10. 探针注入块必须先过 `node scripts/check-probe.mjs <Index.ets> 13`（抽字符串 → 还原转义 → `new Function` 只编译不执行）；改后 121→142 行都靠它先拦。

## ArkWeb 硬结论续（H5.2 新增）

11. **触屏长按会被 ArkWeb 抢去合成 `contextmenu`**：卡片上的长按计时器（`pointerdown` + 480ms）在真机/模拟器上拿不到完整序列，先弹的是页面右键菜单。要做「长按多选」，必须在右键菜单里给入口，而不是只依赖长按计时器。
12. **React Flow 的 select 变更会和自管多选打架**：点第二张卡时 React Flow 会发「取消其它 / 选中自己」的 `select` 变更，把多选态清空。多选态下 `onNodesChange` 必须放行图片节点、忽略卡片的 select 变更，由 `onNodeClick` 自己 toggle。
13. `uitest uiInput longClick` 等价于「按住不动 ≥500ms」；`drag` 才会产生连续 move。抓截图预览坐标换算物理像素用 **×1.8367**（预览 1568 宽 ↔ 物理 2880 宽），菜单项位置随长按点变化，每次都要重新截图定位。
14. PowerShell 解析坑：`$lines | Select-String -Pattern X | ForEach-Object { $_.Line }` 取不到行文本（实测拿到 `"2"` 之类垃圾），必须 `$hit = @($lines | Select-String -Pattern X); $hit[-1].Line`。

## H5.3 结项（集中钉子 / 钉集 / 层级 / 组框挑节点）

`scripts/accept-h5.ps1` 扩到 **25 条**（探针 phase 13–21），一条命令覆盖：

| 断言 | 内容 | 判据（本轮实测） |
|---|---|---|
| H5-1…H5-15 | H5.1 / H5.2 的十五条（回归） | 全 PASS |
| H5-16 | 左栏「节点类型」能建出集中钉子 | `summary16 pins=1 made=1` |
| H5-17 | 图片能钉进钉集（右栏「钉到…」或拖到钉子上） | `cluster=1` |
| H5-18 | 钉集对外永远置顶（成员 z ≥ 1000，钉子在其上） | `imgZ=1000 pinZ=1600` |
| H5-19 | 长按拖入画布后 2s 内最大帧间隔 ≤ 500ms | `gap=151ms` |
| H5-20 | 组框可直接挑实体（右栏 + 分组总览）且图钉可换色 | 静态断言 `picker=True right=1 tree=2 color=2` |
| H5-21 | 长按拖入画布三段（按住 / 拖动 / 落点）帧间隔 ≤ 200ms | `hold=34 move=17 up=84 ghost=1` |
| H5-22 | 图钉可在图片范围内任意落点并换色（phase=20：开「显示图钉」→ 合成拖图钉 → 点色板） | `pin=1 move=1 active=1 color=rgb(47,111,78)` |
| H5-23 | 卡片右栏层级按钮真的生效（先「置底」再「置顶」，zIndex 先降后升） | `btn=2 z0=101 bottom=99 top=101` |
| H5-24 | 长按/右键菜单在屏幕右下角也不被视口切掉（phase=21 在视口右下 12px 处开菜单） | `inside=1 right=1440 vw=1440 bottom=952 vh=960` |
| H5-2 | 画布平移帧耗时（回归） | `p50=16.8 p95=16.9 drop=3 frames=126` |

### 本轮新增的硬结论（踩过就别再踩）

15. **图片「拖入画布一瞬间卡壳」是测量假象**：探针分段计时的 `mark(name)` 只能给「刚结束的那一段」赋值；写成 `res[name]=segMax` 会把**启动那一段**（300–676ms）算到下一段头上。修正后实测 hold=34ms / move=17ms / 落点 84–151ms，画布本身没有卡顿。顺手把长按阈值 450→320ms，并在 `pointerdown` 立刻加缩放反馈（`.cb-asset--pressing`），消除「按下去半秒没动静」的主观卡壳。
16. **React Flow v12 选中会自动抬层**（`elevateNodesOnSelect` 默认 true）：钉集要求「对外永远置顶」，必须显式关掉，否则选中的成员图会压住钉子。
17. **`uitest uiInput drag` 在 ArkWeb 里会被识别成长按**，弹出页面右键菜单、拖拽被中断（钉子的合成长拖因此测不到位移）。验证拖拽要么用探针合成 `PointerEvent`，要么用 `uitest uiInput fling`（高速、短时长）。
18. **合成 PointerEvent 的 pointermove 必须派发到 `window`**：d3-drag 的监听挂在 window 上，派到 `document` 不会冒泡过去，节点纹丝不动。
19. **缩略图目录不能每次导入后就地作废**：`thumbNames=null` 会让下一次渲染/起拖各过一次桥 `listAppDir`。改成 `thumbNameCache`（落盘时 add、删除时 delete），只首次列目录。

20. **素材从左侧栏拖进画布会「卡住」**：手指跨出左栏时 ArkWeb 把这一串触摸判成滚动，对卡片派 `pointercancel`，绑在卡片上的监听随即断掉，缩略影停在画布边上、素材再也拖不动。改法：起拖后把 `pointermove` / `pointerup` / `pointercancel` 挂到 `window`（元素离开手指也不丢），并且 `pointercancel` 不再当「放弃」，而是按「就地松手」收尾（落点在画布上就照常建节点）。同时 `.cb-asset` 加 `touch-action: pan-y`，只让竖向滚动被内核认领。
21. **长按起拖阈值要跟着「误触容忍」调**：320ms 在平板上太灵敏（手指还没稳住就起拖），实测反馈要求「长按久一点」→ 480ms。
22. **长按/右键菜单贴边会被视口切掉**：菜单原来直接用 `clientX/clientY` 定位，在右下角打开时有一半在屏幕外。改法：`useLayoutEffect` 里量一次真实尺寸，按「视口 − 8px」夹住；用 `useLayoutEffect` 而不是 `useEffect`，首帧就落在正确位置、不会闪一下。

## H5.4.1 补记（菜单夹取精度 + 产物纯净）

23. **`position: fixed` 只给 `left` 的盒子会按「右侧剩余空间」shrink-to-fit**：夹取一次→盒子变窄→可用空间变大→下一次又贴边，实测永远 `right=1440`（=视口宽）。修法是让宽度与 `left` 解耦：`.cb-ctxmenu { width: max-content; max-width: min(300px, calc(100vw - 16px)) }`，夹取随即一次到位（实测 `left=1145 right=1432 vw=1440`）。
24. **ArkWeb 里 `window.innerWidth` 在首帧可能比布局视口大 8px**（实测 1448 对 1440）：只用 `innerWidth` 做夹取会吃掉那 8px 安全边。取 `Math.min(window.innerWidth, document.documentElement.clientWidth)`，并在 260ms 后再校正一次。
25. **探针断言必须能重复跑**：phase 20 的图钉拖拽原来固定往「右下 +60/+40」，图钉一旦已被上一次运行拖到 100% 角，再往右下就被 clamp 住、`move=0` 假失败。改成朝图片中心方向拖（`pct > 50 ? -70 : +70`）。
26. **rawfile 同步必须用 `/MIR`**：robocopy 只 `/E` 会把历史 hash 的 `assets/index-*` 留在 DevEco 侧，HAP 从 4.9MB 一路涨到 46MB。同步 `resources/rawfile` 子树要 `/MIR`，并清掉 `index.html` 未引用的旧 `index-*` 产物。
27. **验收命令（一条可复现）**：`powershell -File platforms/harmony/scripts/accept-h5.ps1 -SkipBuild -SkipWeb -Target "127.0.0.1:5555" -Hap "F:\dsh-project\harmony\entry\build\default\outputs\default\entry-default-signed.hap"` → 25/25。


## H5.5 结项（集中钉子圆点化 / 钉集跟手 / 拖影清理 / 右栏开关归位）

用户此轮反馈六条，对应实现与断言：

| 用户要求 | 实现 | 断言 |
|---|---|---|
| 长按阈值改短到 100ms | `AssetLibrary.tsx` 的 `LONG_PRESS_MS = 100` | H5-21（hold/move/up 均 ≤200ms） |
| 长按先方影、后整图影 + 屏幕高斯模糊 | ArkWeb 对 `draggable` 元素自起原生拖拽：触屏下 `onDragStart` 直接 `preventDefault`，并加 `-webkit-user-drag:none` | H5-21（只应有我方 `.cb-asset-drag` 一个影） |
| 集中钉子改成圆点、连接点与圆点同心、便签在圆点上边正中、默认无便签、新建时弹窗询问 | `clusterPin.ts` 尺寸 30×30 + `stickyVisible` 缺省 false；`BaseNode.tsx` 只渲染同心 Handle + `.cb-pin__dot`；`.cb-pin__paper { top: calc(50% + 8px) }`；左栏点「集中钉子」改为开 `NewNodeDialog`（带便利贴勾选） | H5-25（dlg=1 cb=1 dot=1）、H5-27（hdx=0 hdy=0） |
| 便利贴默认不显示、右栏可切显示 | `addNode` 默认字段 `显示便利贴: '隐藏'`，右栏下拉写回 | H5-26（paper0=0 → paperOn=1） |
| 钉集图片跟着钉子一起拖 | `Board.tsx` 的 `onNodeDragStop` 拖钉子走 `moveClusterBy`，成员由 `memberPosition` 重算 | H5-28（pin=67,42 member=67,42） |
| 绕钉旋转要真的转（此前只是绕钉平移） | `rotateClusterMember` 同时写 `clusterOffset` 与 `image.rotation` | H5-29（rot 0→15） |
| 钉子右栏可增减成员、成员右栏可调相对位置 | `RightPanel.tsx` 的 `.cb-pinpick`（未入集图片下拉 + 钉入）与「相对钉子的位置 + 四方向键 + 钉到钉心」 | H5-29（nudge=6）、H5-28（贴入链路） |
| 右栏开关挡内容 → 挪到小地图左边 | `App.tsx` 把按钮移进 `.cb-work__canvas`，`responsive.css` 里 `.cb-collapse--right { position:absolute; right:175px; bottom:15px }`（=小地图右边距 15 + 宽 150 + 间距 10），地图视图退回 `.cb-collapse--stage` | H5-30（tog=1 togPanel=1，实测 togX=953 < mmX=963 < rpX=1128） |

### 本轮新增的硬结论

28. **ArkWeb 触屏长按 `draggable` 元素会自起一套原生拖拽**（整块缩略图跟手 + 背景高斯模糊），与我们自己的跟手影同时存在就是「先方影后整图影」；`draggable` 在触屏下要 `onDragStart` 直接 `preventDefault()`，光靠 CSS `-webkit-user-drag:none` 不够稳。
29. **xyflow 节点拖拽吃 `mousedown`，不吃 `pointerdown`**：`@xyflow/system` 只监听 `mousedown/mousemove/pointermove`。合成拖拽必须派 `MouseEvent('mousedown', {button:0, buttons:1})`，且 `pointermove` 要派到 `window`。
30. **抽探针注入块不能用「一行恰好是 `    }`」当终点**：相位 JS 里天然有内层收尾行，会提前截断（曾把块尾的数组逗号吃掉）。改为「`    }` 收尾行之后紧跟 `"  }",` 再跟 `"}catch(e)…"`」的尾部锚点，并在块尾写 `// end-of-phase` 标记；`check-probe.mjs` 同步按标记/尾部锚点判定，并跳过块间的 `//` 注释行。
31. **`position: fixed` 的按钮要跟着「画布」而不是「窗口」走**：右栏开关原先 `right:12px` 固定在窗口右下角，右栏展开时正好压在右栏内容上。挪进 `position: relative` 的 `.cb-work__canvas` 里、按小地图几何量出 `right:175px`，画布收窄时它自动左移。
32. **右栏层级/颜色控件需要 DOM 锚点才好做机器验收**：给 `.cb-pin__dot` 加 `data-pin-id`、给图片框加 `data-cluster-id` / `data-rot` 后，探针能精确定位「这颗钉子 / 这张成员图」，不再靠「取最后一个元素」瞎猜。

### 一条可复现验收

```
powershell -File platforms/harmony/scripts/accept-h5.ps1 -SkipBuild -SkipWeb -Target "127.0.0.1:5555" -Hap "F:\dsh-project\harmony\entry\build\default\outputs\default\entry-default-signed.hap"
```
→ 31/31 PASS（报告落 `platforms/harmony/.tmp-esbuild/accept-h5.json`）。

## H5.6 结项（相对位置恒定 / 集中钉右栏瘦身 / 滑块数值输入 / 创建红线）

### 断言表（accept-h5.ps1 36 条，本次新增 5 条）

| 编号 | 断言 | 实测 |
| --- | --- | --- |
| H5-31 | 拖动集中钉子后，钉子与成员图片的相对位置不变 | `keptPin=1`（拖前拖后成员相对偏移差 ≤3px） |
| H5-32 | 拖动钉集成员时成员跟手、松手后相对位置不变 | `keptMem=1 follow=1` |
| H5-33 | 集中钉右栏不再有别名 / 地图坐标 / 评论 | `alias=1 map=1 comment=1` |
| H5-34 | 相对位置与旋转是「每行一个滑块 + 可输入数字」 | `rows=3 nums=3 slide=1` |
| H5-35 | 长按钉子 → 创建红线 → 点另一钉子 → 略宽红色实心线 | `hint=1 red=1 redW=4` |

### 相对位置漂移的真根因

`Board.tsx` 渲染图片节点时用的是 `derived ?? dockPreview ?? dragPos`——
`derived`（钉子位置 + clusterOffset 推导）优先级最高，于是拖动集内成员时：
成员自己被推导坐标钉在原地，只有钉子与其它成员在动；松手后 `onNodeDragStop`
按「拖动位置 − 推导位置」算出位移再 `moveClusterBy`，整集平移，成员位置跳一下，
看起来就是「钉子与图片的相对位置变了」。

修法三处：
1. 渲染改成 `dockPreview ?? dragPos` 优先于 `derived`（预览态盖住推导坐标）；
2. 拖成员时把**被拖的那张**也放进预览表（否则它仍被推导坐标钉住）；
3. 松手时把拖拽用到的 `dragPos`（成员 + 钉子）与 `dockPreview` 全部清掉，
   避免残留坐标和 Model 打架。

### 红线

- 走现成的 `addEdge`（`CaseEdge` 本来就有 `color/thickness/style`），不新增数据结构：
  `relType:'related'`、`label:'红线'`、`style:'solid'`、`color:'#C0392B'`、`thickness:4`、`directed:false`。
- 入口在右键/长按菜单：只有右键对象是 `clusterPin` 时才渲染「创建红线（点另一颗集中钉子连起来）」，
  点了之后画布顶部出现提示条 `红线：点另一颗集中钉子连起来`，再点另一颗钉子即连线，点同一颗或点空白则取消。

### 新增硬结论（续 28 起）

33. 触屏上 React 受控 `input` 用「原型 setter + `input` 事件」可以写进去，但**必须写对元素**：
   H5-34 第一版误写 `nums[2]`（自身旋转），旋转只转自己、中心不动，`slide` 恒为 0。
34. 探针里先改过相对位置、再量「相对位置不变」，基准必须重抽（`pinAt0 = relOf()`），否则比的是旧基准。
35. `splice-phase.mjs` 替换既有块时只能用自己写进去的 `// end-of-phase` 标记收尾；
   退回老判据（`"  }",` + `}catch(e)`）会把后面的相位块一起吞掉（曾整段吃掉 phase 22）。

### 一条可复现验收

```
powershell -File platforms/harmony/scripts/accept-h5.ps1 -SkipBuild -SkipWeb -Target "127.0.0.1:5555" -Hap "F:\dsh-project\harmony\entry\build\default\outputs\default\entry-default-signed.hap"
```
→ 36/36 PASS（报告落 `platforms/harmony/.tmp-esbuild/accept-h5.json`）。

## H5.6.1 补记（红线画不出来 / 长按菜单加删除）

用户反馈两条：「红线看不到」「长按卡片右键列表要加删除」。红线是三个问题叠在一起：

| 断言 | 修之前 | 修之后 |
| --- | --- | --- |
| H5-35 红线存在 | `hint=1 red=0 redW=-1` | `red=1 redW=4` |
| H5-36 红线有长度 | 无此断言 | `redLen=317` |
| H5-37 菜单删除生效 | 无此断言 | `menu=1 before=20 after=19 deleted=1` |
| H5-38 点击命中热区 | 无此断言 | `layer=1` |

三条根因：

1. **钉子只有 source handle**：以钉子为终点的边算不出终点，React Flow 静默不画。
2. **自动锚点覆盖了手柄 id**（真凶）：`targetHandle = auto?.target ?? edge.targetHandle ?? 'left'`，
   自动锚点算出的 `left/top/bottom` 在钉子上并不存在 → 边照样进文档（关系数 +1）但画不出来。
   修法：边任一端是 `clusterPin` 时强制用它自己的 handle（`right` / `right-in`），自动锚点不参与。
3. **两颗新钉子同坐标**：红线长度 0 藏在圆点底下。`addNode` 加 12 单位撞位检测、每次 +32/+32 阶梯错开。

另外两处配套改动：

- target handle 的 id 必须是 `right-in`，不能与 source 的 `right` 重名——同 id 会让 React Flow 的 handle 映射互相覆盖。
- 待连接态用全画布热区 `.cb-redline-layer` 接收点击（钉子中心的连线手柄会吃掉 `onNodeClick`），
  取最近**另一颗**钉子（起点不参与竞争），90 世界单位内即连。

### 新增硬结论（续 36 起）

36. 边进文档 ≠ 边能画出来：handle id 在节点上不存在时 React Flow 不报错、直接不渲染。
   排查顺序：先看 `doc.edges.length` 有没有 +1，再看 handle id 是否真实存在于两端节点。
37. 同一个节点上的 source / target handle **不能用同一个 id**。
38. 待连接态不要依赖 `onNodeClick`：节点中心的手柄会吃掉点击，用覆盖层接管指针事件最稳。

### 一条可复现验收

```
powershell -File platforms/harmony/scripts/accept-h5.ps1 -SkipBuild -SkipWeb -Target "127.0.0.1:5555" -Hap "F:\dsh-project\harmony\entry\build\default\outputs\default\entry-default-signed.hap"
```
→ 39/39 PASS。

## H5.6.2（红线瘦身：只要实线）

按用户要求，红线不再带任何语义装饰：

- `relType` 用专有值 `clusterLink`（`lib/clusterPin.ts` 的 `CLUSTER_LINK_REL`），不再借 `related`；
  `isClusterLink(edge)` 兼容旧数据（`label === '红线'`）。
- `BezierEdge.tsx`：命中 `plainLink` 时不渲染中间标签块、强制无箭头。
- `RightPanel` 的 `EdgeForm`：红线只留「线宽 + ID」，关系类型 / 标签 / 线型 / 有向 / 置信度 / 备注全部不出现。
- 样式不变：`#C0392B`、4px、solid。

验收：`accept-h5.ps1` 39 条全绿；真机截图 `dsh-shot-84`（只有一条红线，无箭头无标签）。

## H5.6.3（红线改成直线，且不再是关系线；新建弹窗不抢焦点）

用户口径：「红线不要贝塞尔曲线，只需要直线；红线也不被视作关系线；新建节点时不要默认点标题框（会弹键盘）」。

- **红线不是关系线**：新增 `types/index.ts` 的 `PinLink { id, source, target }` 与 `CaseDoc.pinLinks?: PinLink[]`，
  命令在 `commands/pinLinkCommands.ts`（`addPinLink` / `removePinLink` / `removePinLinksOf`）。
  红线不再写进 `doc.edges`，因此**关系数不变**，也不进时间线 / 地图 / 导出 / 代码视图。
- **画法**：新组件 `components/flow/PinLinkLayer.tsx`，在 `<ViewportPortal>` 里按世界坐标画
  `<line class="cb-pinlink">`，`vector-effect: non-scaling-stroke` 保证任何缩放下都是 4px。
- **待连接态命中半径改为屏幕像素**：`finishRedLineAt` 原先把 90 当世界单位，画布缩到 0.2 倍时
  两颗钉子屏幕上只隔 140px、世界里却隔 700 单位，永远点不中（真机实测 `dist=704` 被取消）。
  现在 `hitFlow = 90 / getViewport().zoom`。
- **新建节点弹窗不再自动聚焦标题框**：删掉 `NewNodeDialog` 里的 `setTimeout(() => inputRef.current?.focus(), 0)`。

验收：`accept-h5.ps1` **40 条全绿**，新增 H5-39（`straight=1 && edgesDelta=0`）；真机截图 `dsh-shot-93`（两颗钉子之间一条红色直线，无箭头无标签）。
