# CHANGELOG

本项目的变更记录。每个里程碑收尾追加一条，并打 git tag `ms/M<n>` / 鸿蒙侧 `hs/H<n>`。

## [未发布] · 鸿蒙 H5.6：钉集相对位置恒定 + 集中钉右栏瘦身 + 成员滑块 + 创建红线

### 反馈
1. 有时把图片钉到集中钉后再拖动，钉子与图片的相对位置会变。
2. 集中钉右栏去掉「别名 / 地图坐标 / 评论」，其它节点不受影响。
3. 「相对钉子的位置」与「旋转」改成可直接输入数值的滑块，每个自由度一行。
4. 长按集中钉新增「创建红线」：点另一颗集中钉，连出一条略宽的红色实心线。

### 根因（第 1 条）
`Board.tsx` 里图片节点的渲染顺序是 `derived ?? dockPreview ?? dragPos`：`derived`（钉子位置 + `clusterOffset` 推导）优先级最高，于是拖动集内成员时，**成员自己被推导坐标钉在原地**，只有钉子和同伴在动；松手时按「拖动位置 − 推导位置」算出位移再 `moveClusterBy`，整集平移、成员位置跳一下 —— 用户看到的就是「钉子与图片的相对位置变了」。

### 改了什么
- 渲染改成 `dockPreview ?? dragPos ?? derived`；拖成员时把**被拖的那张**也放进预览表；松手时清掉成员与钉子的 `dragPos` 以及 `dockPreview`。
- 集中钉右栏用 `{isPin ? null : …}` 包掉「别名 / 地图坐标 / 评论」三块，其它节点类型不受影响。
- 成员面板新增「相对钉子的 X / 相对钉子的 Y / 自身旋转」三行，每行是 `range` + `number` 双向联动；新增命令 `setClusterOffset(imageId, x, y)`（绝对值，滑块拖动不累积误差）。
- 右键/长按菜单在 `clusterPin` 上多一项「创建红线」；`uiStore` 加 `redLineFrom` 待连接态、画布顶部提示条与取消；连线复用 `addEdge`，规格 `#C0392B` / 4px / solid / 无箭头。

### 验收
- `scripts/accept-h5.ps1` 扩到 36 条：新增 H5-31…H5-35，全绿；`summary23 … keptPin=1 keptMem=1 follow=1 alias=1 map=1 comment=1 rows=3 nums=3 slide=1 hint=1 red=1 redW=4`。
- 截图：`dsh-shot-64/65`（成员面板三行滑块；真手势拖 X 滑块 −277 → 461，图片同步移动）、`dsh-shot-63`（集中钉右栏已无三栏）。

## [未发布] · 鸿蒙 H5.6.1：红线终于画得出来 + 长按菜单删节点

### 反馈
1. 「红线看不到」。
2. 鸿蒙版长按卡片，右键列表要有「删除」。

### 根因（红线三条叠加）
1. **钉子只有 source handle**：`BaseNode.tsx` 的集中钉只渲染了 `type="source"` 的 `Handle`，以钉子为**终点**的边算不出终点位置，React Flow 直接不画。
2. **自动锚点把手柄 id 改掉了**：`Board.tsx` 组装边时 `targetHandle = auto?.target ?? edge.targetHandle ?? 'left'`，自动锚点优先级高于存下来的 handle；钉子身上根本没有 `left/top/bottom` 这些 handle，于是这条边**静默消失**。这是「连上了却看不见」的真凶。
3. **两颗新钉子落在同一坐标**：左栏连点两次「集中钉子」都落在画布中心，红线长度 0，藏在圆点底下。`addNode` 加阶梯错开（12 单位内视为撞位，每次 +32/+32，最多试 12 次）。

### 改了什么
- `components/flow/BaseNode.tsx`：钉子补 `type="target"` 的几何锚点，id 用 `right-in`（与 source 的 `right` **必须不同 id**，同 id 会让 React Flow 的 handle 映射互相覆盖）。
- `components/flow/Board.tsx`：
  - 组装边时若任一端是 `clusterPin`，强制用它自己的 handle（`right` / `right-in`），不让自动锚点插手；
  - 待连接态新增全画布热区 `.cb-redline-layer`（`z-index:26`），点击换算世界坐标取最近的**另一颗**钉子，90 单位内即连（起点不参与竞争——脏案卷里多颗钉子叠得很近时，把起点算进来会把「点第二颗」误判成「点自己」而取消）；
  - 长按/右键菜单新增「删除此节点（连带其关系线，可撤销）」：删除集中钉前先把成员图全部 `detachImageFromCluster`，再 `deleteNode`（命令内部会连带删掉两端连着它的边）。
- `commands/nodeCommands.ts`：`addNode` 阶梯错开。
- `styles/responsive.css`：`.cb-redline-layer`。

### 验收
- `scripts/accept-h5.ps1` 扩到 **39 条全绿**：新增 H5-36（红线路径长度 ≥40，实测 317）、H5-37（菜单项存在且节点数 −1，`before=20 after=19`）、H5-38（点击命中热区 `layer=1`）。
- 真机复现（截图 `dsh-shot-81`）：两颗分开的集中钉之间出现 **4px 红色实心曲线 + 「红线」标签**；`dsh-shot-71` 里长按菜单五项齐全，含「删除此节点（连带其关系线，可撤销）」。

## [未发布] · 鸿蒙 H5.5：集中钉子圆点化 + 钉集跟手 + 清掉 ArkWeb 原生拖影 + 右栏开关归位

### 反馈
1. 长按阈值改短到 100ms。
2. 长按图片会「先出现方形缩略图，随后整个图片跟手、屏幕还高斯模糊」。
3. 集中钉子改成圆点，关系线连接点与该圆点重合，便签在圆点上边正中；默认无便签；新建该节点时弹窗询问。
4. 钉集图片要跟着钉子一起被拖动。
5. 绕钉旋转此前只是绕钉平移，要真的转。
6. 钉子右栏要能增减钉集成员；成员右栏要能改相对钉子的位置。
7. 右栏展开后的折叠箭头挡住右栏内容，挪到小地图左边。

### 根因
1. **双重拖影**：素材卡是 `draggable` 的 `<button>`（给桌面 HTML5 DnD 用），ArkWeb 触屏长按会自起一套原生拖拽——整块缩略图跟手 + 背景高斯模糊；我方 96×96 跟手影同时在跑，于是先方影后整图影。触屏下必须在 `onDragStart` 里 `preventDefault()`。
2. **圆点与连接点不同心**：钉子原来按 168×132 的卡片渲染，Handle 挂在卡片边上，视觉上是一个大头针 + 徽章。改成 30×30 只渲染圆点，Handle 用 absolute + translate 强拉圆心。
3. **绕钉旋转只改偏移**：`rotateClusterMember` 只重算了 `clusterOffset`，没写 `image.rotation`，所以图片只是绕圈平移。
4. **新建集中钉子绕过了弹窗**：左栏类型按钮直接走 `addNode` 落在画布中心，便利贴开关没有询问时机。改为借 `NewNodeDialog`（预选类型 clusterPin）。
5. **右栏开关固定在窗口右下角**：`position: fixed; right:12px`，右栏展开时正好压在右栏内容上。挪进画布容器（`position: relative`）并按小地图几何定位。

### 改了什么
- `lib/clusterPin.ts`：钉子尺寸 168×132 → 30×30；`stickyVisible` 缺省 false（只有写「显示」才显示便签）。
- `components/flow/BaseNode.tsx`：钉子分支重写为「同心 Handle + 圆点 + 可选便签」，圆点带 `data-pin-id`；`styles/responsive.css` 加 `.cb-pin__dot` / `.cb-pin__handle` / `.cb-pin__paper`（便签上沿与圆点下半部重叠、`pointer-events:none` 不挡点击）。
- `components/panels/NewNodeDialog.tsx`：集中钉子的「要不要便利贴 + 便签文字」勾选区；`commands/nodeCommands.ts` 默认字段改「隐藏」；`store/uiStore.ts` 新增 `newNodePreset`，`requestNewNode(at, preset)`；`components/flow/Board.tsx` 左栏点「集中钉子」改为开弹窗。
- `commands/imageNodeCommands.ts`：`rotateClusterMember` 同时写 `image.rotation`；新增 `nudgeClusterOffset(id, dx, dy)`。
- `components/panels/RightPanel.tsx`：钉子右栏「钉集成员」+「钉入」下拉；成员右栏「相对钉子的位置 + 四方向键 + 钉到钉心」；图钉颜色色板。
- `components/panels/AssetLibrary.tsx`：`LONG_PRESS_MS` → 100；触屏下禁用原生拖拽；`index.css` 加 `-webkit-user-drag: none`。
- `App.tsx` + `styles/responsive.css`：右栏开关移进 `.cb-work__canvas`，`right:175px`（小地图左侧）；地图视图退回 `.cb-collapse--stage`。
- `components/flow/FreeImageNode.tsx`：图片框加 `data-cluster-id` / `data-rot`，便于机器断言。

### 验收
`scripts/accept-h5.ps1` 扩到 **31 条全绿**，新增 H5-25…H5-30：
- H5-25 集中钉子建出来是圆点、新建弹窗会问便利贴（dlg=1 cb=1 dot=1）
- H5-26 便签默认不显示、右栏切「显示」后才出现（paper0=0 → paperOn=1）
- H5-27 连接点与圆点同心（hdx=0 hdy=0）
- H5-28 拖钉子时成员同位移（pin=67,42 member=67,42）
- H5-29 绕钉旋转带动图片自身角度（rot 0→15）、方向键可挪位置（nudge=6）
- H5-30 右栏开关停在小地图左边、不压右栏（togX=953 < mmX=963 < rpX=1128）

复现：`powershell -File platforms/harmony/scripts/accept-h5.ps1 -SkipBuild -SkipWeb -Target 127.0.0.1:5555 -Hap F:dsh-projectharmonyentryuilddefaultoutputsdefaultentry-default-signed.hap`
## [未发布] · 鸿蒙 H5.4：素材跨栏拖拽不再卡住 + 长按阈值 480ms + 长按菜单贴边

### 反馈
1. 拖动素材进画布要「长按久一点」，否则从左栏进入画布范围时会卡住。
2. 打开长按菜单时若在屏幕边缘会被遮挡。

### 根因
1. **跨栏卡住**：手指从左栏移进画布时，ArkWeb 把这一串触摸判成滚动并对卡片派 `pointercancel`；监听绑在卡片上，一收到 cancel 就 `cancelAssetDrag()`，缩略影凭空消失、这次拖动白做。同时 320ms 阈值在平板上偏灵敏，手指没稳就起拖，更容易触发上面那条。
2. **菜单被切**：菜单原样用 `clientX/clientY` 当 left/top，在右下角打开时有一半落在视口外。

### 改了什么
- `components/panels/AssetLibrary.tsx`：`LONG_PRESS_MS` 320 → **480**；起拖后把 `pointermove`/`pointerup`/`pointercancel` 挂到 `window`（`winRef` 保存引用，清理时逐个 remove），元素自身的 handler 在拖拽中直接返回避免双处理；`pointercancel` 不再当放弃，而是按「就地松手」用最后一次位置完成落点。
- `index.css`：`.cb-asset` 加 `touch-action: pan-y`（竖向滚动仍归内核，横向拖拽不再被抢）。
- `components/flow/Board.tsx`：新增 `ctxMenuRef` + `ctxPos`，`useLayoutEffect` 里量菜单真实尺寸并按「视口 − 8px」夹住 left/top（首帧即正确，不闪）。
- 验收：探针新增 phase=21（在视口右下 12px 处合成 `contextmenu`，量菜单是否完整落在视口内），`accept-h5.ps1` 新增 H5-24，共 **25 条**。

### 验收
`accept-h5.ps1 -Target 127.0.0.1:5555` → **25/25 PASS**：`H5-24 inside=1 left=1224 top=818 right=1440 bottom=952 vw=1440 vh=960`；拖拽链路 `H5-21 hold=17 move=17 up=17 ghost=1 nodes=22`、`H5-19 maxGap=67ms`、`H5-16 pins=5 made=1 cluster=9`。

### H5.4.1 补记：菜单夹取精度与产物纯净
1. **菜单仍然贴死屏幕右边**：`position: fixed` 只给 `left` 的盒子会按「右侧剩余空间」shrink-to-fit —— 夹一次变窄、可用空间变大、下次又贴边，实测恒为 `right = 视口宽`。修法：`.cb-ctxmenu { width: max-content; max-width: min(300px, calc(100vw - 16px)) }` 让宽度与 `left` 解耦，夹取随即一次到位（`left=1145 right=1432 vw=1440`）。
2. **ArkWeb 首帧的 `window.innerWidth` 比布局视口大 8px**（1448 对 1440），只用 innerWidth 会吃掉安全边。改为 `Math.min(window.innerWidth, document.documentElement.clientWidth)`，并在 260ms 后再校正一次。
3. **探针可重复性**：phase 20 的图钉拖拽改成「朝图片中心方向拖」（`pct > 50 ? -70 : +70`），避免图钉已在 100% 角时被 clamp 住假失败；phase 17 只挑「完整落在视口内」的素材卡，避免素材变多后选到滚动区外的卡。
4. **HAP 产物膨胀**：robocopy 同步 `resources/rawfile` 只用 `/E`，历史 hash 的 `assets/index-*` 一直堆在 DevEco 侧，HAP 从 4.9MB 涨到 46MB。同步该子树改用 `/MIR`，并清掉 `index.html` 未引用的旧 `index-*`。
5. 验收：`accept-h5.ps1` → **25/25 PASS**（`H5-22 pin=1 move=1 color=rgb(47,111,78)`、`H5-24 inside=1 right=1432`）。


## [未发布] · 鸿蒙 H5.3：集中钉子与钉集（把多张图片钉在一颗钉子上）

### 需求
1. 图片拖动「卡壳」，其余功能正常。
2. 组框的「对象总览」与「分组总览」要能直接点按钮挑节点加入。
3. 图片的图钉要能落在图片范围内的任意位置，并能换颜色。
4. 各类节点在右栏都要有和图片一致的上下层控件。
5. 新节点类型「集中钉子」：大图钉钉在规整矩形黄色便利贴上，便利贴可显隐、便利贴文字可编辑、只有一个关系线连接点、默认最顶层。
6. 被钉子吸附的图片成为「钉集」：只能由拖钉子本身移动整集（拖元素等价于拖钉子），图片只能绕钉子旋转/移动，集内上下关系相对外界独立、对外永远置顶，右栏可调整集内成员。

### 根因 / 关键结论
1. 「卡壳」是**测量假象**：探针分段计时把启动那一段（300–676ms）记到了 hold 段头上。修正后实测按住 34ms / 拖动 17ms / 落点 84–151ms。真正的体感问题是「按下到起拖的 450ms 毫无反馈」。
2. React Flow v12 默认开启 `elevateNodesOnSelect`，选中的成员图会压住钉子——钉集要「对外永远置顶」必须显式关掉。
3. `uitest uiInput drag` 在 ArkWeb 里会被识别成长按、弹右键菜单打断拖拽；合成 `PointerEvent` 的 pointermove 必须派发到 `window`（d3-drag 的监听在 window 上）。
4. 缩略图目录每次导入后就作废，导致下一次渲染/起拖各过一次桥 `listAppDir`（100–300ms）；改成「落盘即记住文件名」。

### 改了什么
- 数据层：`types/index.ts` 加 `NodeType: 'clusterPin'`、`ImageNode.{pinPos,pinColor,clusterId,clusterOffset}`；新增 `lib/clusterPin.ts`（层级常量、命中测试、成员位置与绕钉旋转、便利贴可见性与文字）；`commands/imageNodeCommands.ts` 新增 `attachImageToCluster` / `detachImageFromCluster` / `rotateClusterMember` / `moveClusterBy` / `syncClusterMembers`；`commands/nodeCommands.ts` 新增 `setNodeLayer`。
- 画布：`Board.tsx` 钉集成员坐标由「钉子 + clusterOffset」推导、成员层级走集内空间（基准 1000、钉子 1600）、拖钉子或拖任意成员都换算成整集平移、素材直接落在钉子上即入集、关掉 `elevateNodesOnSelect`。
- 节点：`BaseNode.tsx` 新增 `clusterPin` 分支（黄色便利贴 + 图钉头 + 单一右侧连线点）；`FreeImageNode.tsx` 图钉改为可拖（`pinPos` 0–1 相对坐标）+ 可换色 + 「钉集」徽标。
- 右栏：`RightPanel.tsx` 所有节点加「层级（置顶/上移/下移/置底）」；图片加「图钉颜色」色板与「钉到「集中钉子」」入口；成员图显示「钉集内层级（第 N 层，对外永远置顶）」+ 绕钉左右转 15°/移出钉集；集中钉子节点显示钉集成员清单（移出、旋转）。
- 组框：新增 `NodePickerDialog.tsx`，右栏组框表单与「分组总览」每组都有「＋ 加入…」入口。
- 触屏体感：素材卡长按阈值 450→320ms，`pointerdown` 立刻缩放高亮（`.cb-asset--pressing`）；`platform.ts` 缩略图名改成落盘即记忆（`thumbNameCache`）。
- 验收：`scripts/accept-h5.ps1` 扩到 **24 条**，探针新增 phase 16（建钉子/入钉集/层级/帧间隔）、17（长按拖入画布分段帧间隔）、18（合成指针归因对照）、19（拖素材到钉子入集）、20（图钉在图片内拖动换色 + 卡片「置底/置顶」）。

### 验收
`accept-h5.ps1` → **24/24 PASS**：`summary16 pins=1 made=1 cluster=1 imgZ=1000 pinZ=1600`、`hold=34 move=17 up=84 ghost=1`、`p95=16.9 frames=126`、`summary20 pin=1 move=1 active=1 color=rgb(47,111,78) btn=2 z0=101 z1=99 z2=101`（图钉从 50%/6% 拖到 83.3%/41.1%，卡片先置底 99 再置顶 101）。
真手势：`fling` 拖钉子后成员图跟着走（图片 X/Y 553→917 同步）；拖素材卡到钉子上松手 → 立即可见「钉集」徽标。

## [未发布] · 鸿蒙 H5.2：静默失败清账 + 触屏多选 + 组框收编 + 帧耗时实测

### 症状
1. 「保存/打开/导出失败」「云端授权」「清空回收站」这些提示在鸿蒙上**完全无声**——`window.confirm/alert` 在 ArkWeb 里静默失效（`confirm` 直接返回 `false`，`alert` 直接丢弃）。
2. 触屏**没法多选**卡片（快捷键 `Ctrl/Cmd` 在平板上不存在），因此「把几个已有节点收进组框」也做不到。
3. 画布拖动是否掉帧一直只有主观感受，没有数字（H6 原生画布要不要做取决于这个）。

### 改了什么
- 新增 `web/src/store/uiStore.ts`：`askConfirm()`（返回 Promise，同屏只留一个请求，旧的按取消收尾）、`pushNotice()` / `dismissNotice()`。
- 新增 `web/src/components/panels/SystemDialogs.tsx`：`ConfirmHost`（遮罩/Esc 取消，危险操作走 `cb-btn--danger`）+ `NoticeHost`（4.2s 自动消失，`role="status"`），在 `App.tsx` 挂载。
- 9 处 `window.confirm/alert` 全部替换：`TopBar.tsx` 4 处改 `pushNotice`；`AiPanel.tsx` 2 处导出失败提示改 `pushNotice`、云端授权改 `askConfirm`（`danger`，符合硬约束 7 的二次确认）；`AiImagePanel.tsx` 云端生图授权同上；`HistoryDialog.tsx` 清空回收站改 `askConfirm`。
- 触屏多选两条通道：`BaseNode.tsx` 卡片长按 480ms 进多选（`enterMultiSelect`/`toggleMultiSelect`）；**真机上长按会被 ArkWeb 合成 `contextmenu` 抢走**，因此在画布右键菜单新增「多选卡片（选多张一起加进组框）」。
- 多选态下 `Board.tsx` 的 `onNodesChange` 忽略卡片的 `select` 变更（否则「点第二张」会被 React Flow 清空选择），由 `onNodeClick` 自己 toggle；右栏顶部出现「已选 N 个卡片 + 加入组框…/清空选择」横幅。
- 新增命令 `addNodesToGroup(nodeIds, groupId)`（`commands/groupCommands.ts`）：按组头 40 / 内边距 24 / 间距 16 竖排进框，**不压窄卡片**，组框只放大不缩小。
- 新增 `web/src/components/panels/GroupPickDialog.tsx`：多选后选目标组框，成功后 `pushNotice('已把 N 个卡片收进「…」')` 并退出多选。
- `platforms/harmony/scripts/accept-h5.ps1` 扩到 16 条（H5-11/12/13 静态清账、H5-14/15 多选与组框、H5-2 帧耗时），探针加 `--ps caseboardSelftest 14`（多选/组框）与 `15`（rAF 帧采样）。

### 实测
- `accept-h5.ps1` → **16/16 PASS**：`summary14 banner=1 sel=2 picked=1 contained=1 rect=180x626 inside=2/2`；`p50=16.8 p95=16.9 drop=1 frames=130`（阈值 p95≤34ms，60fps 稳）。
- 真手势复核（`uitest`）：长按卡片 → 菜单 → 多选卡片 → 点第二张 → 「已选 2 个卡片」→ 加入组框 → 「诈骗团伙」3 → 5 个对象、组成员清单 5 条、两张卡落进框内。
- 结论：**H6 原生画布没有性能理由**，画布平移已经贴 60fps。

## [未发布] · 鸿蒙 H5.1：素材通路（缩略图 / 背景图 / 触屏拖拽）

### 症状
素材能导入、能进库，但素材卡与画布图片节点**全是破图**，缩略图不显示，也无法把素材拖到画布上。

### 根因（三条叠加）
1. **图片加载被整体关掉**：`platforms/harmony/entry/src/main/ets/pages/Index.ets` 的 Web 组件上写了
   `.onlineImageAccess(false)`。它让所有 `<img>` 都没有像素——连 `data:` URL 也不例外
   （`naturalWidth=0`、`complete=false`），内核根本不发图片请求，但 `fetch()` 仍旧 200，
   极易误判成「ArkWeb 不支持自定义 scheme 加载图片」。该属性默认即 true，已删除。
2. **素材存储是半截迁移**：`services/platform.ts` 早已写好 `isHarmony()` 的按字节读写文件分支，
   但 `services/imageStore.ts` 四个读写口只判 `isTauri()` → 鸿蒙全走 IndexedDB，
   `assetFileUrl()` 因此永远拿不到文件路径，画布背景图也走错分支。
3. **没有触屏拖拽**：素材卡只依赖 HTML5 DnD（`dataTransfer`），触屏浏览器不产生拖拽事件。

### 改了什么
- `web/src/services/platform.ts`：修 `assetFileUrl()`（原来先剥前导斜杠再比 `/data/…/files/` 前缀，
  永远比不中，把绝对路径直接塞进 URL）；新增 `thumbFilePath(assetId,size)` 与 `usesNativeAssetStore()`。
- `web/src/services/imageStore.ts`：改按 `usesNativeAssetStore()` 分流（Tauri 与鸿蒙都写文件仓），
  旧 IndexedDB 数据保留只读回退；`thumbUrl()` 优先进文件仓 URL，未命中才回退 blob objectURL。
- `web/src/components/flow/Board.tsx`：`canvasBgUrl` 的门从 `isTauri()` 改 `usesNativeAssetStore()`；
  抽出 `dropAssetOnCanvas()`，桌面 DnD 与触屏落点共用一条建节点路径。
- `web/src/store/uiStore.ts` + `web/src/components/panels/AssetLibrary.tsx` +
  新增 `web/src/components/flow/AssetDragGhost.tsx`：长按 450ms 起拖、指尖跟手影、松手落点建图片节点
  （长按后移动超 8px 即取消；鼠标仍走 DnD）。
- `platforms/harmony/scripts/`：新增 `accept-h5.ps1`（10 条上机验收）、`build-hap.ps1`（签名站点构建）、
  `check-probe.mjs`（探针注入块语法校验）、`fix-bom.mjs`（.ps1 补 BOM）。

### 验收
`accept-h5.ps1` **10/10 PASS**（导入 → 沙箱落盘 → 缩略图 256×160 真解码 → 长按拖入画布建节点 → 画布节点 1024×614 真实像素）；
模拟器截图里 7 张素材卡与 2 个画布图片节点均为真实图像。

## [未发布] · 顶栏收容修正（从鸿蒙移植回填）

### 症状
窗口宽度不够时，顶栏最左边的按钮（如「主题·默认」）被裁掉一截，而顶栏看起来「没有溢出」——
「⋯」菜单不会把它收进去，用户只能自己缩窗口试。

### 根因（两条叠加）
1. `.cb-topbar__io` 是 `justify-content: flex-end`，**溢出时内容往左跑**，而 `scrollWidth` 只统计
   右侧溢出，于是 `scrollWidth == clientWidth` 恒成立，溢出检测永远判「没超」。
2. `.cb-topbar__io` 里除了动作按钮，还常驻「⋯」按钮与「SQLite · 已保存 hh:mm」文字（约 150 px）。
   它们**也吃宽度**，但不在 `planTopbarOverflow` 的账本里，预算因此虚高约 190 px。

### 改了什么
- `src/components/panels/TopBar.tsx`：新增 `staticWidth` 状态与 `saveRef`，`useLayoutEffect` 里用
  `getBoundingClientRect().width + columnGap` 实测「⋯」按钮与保存文字的占位，从预算里扣掉；
  溢出判定除 `scrollWidth` 外再判「首个子元素的左边界是否已跑到容器左边界之外」。
- `src/index.css`：`.cb-btn` 补 `flex-shrink: 0`——原来顶栏挤不下时 flex 会把按钮压扁、文字裁掉，
  而不是触发收进菜单。

### 验收
`typecheck` 0 error；`smoke` 全部通过（871 PASS）；`ui-smoke` 全部通过（430 PASS / 0 FAIL）；`build` 成功。
本机桌面窗口 1440 宽时顶栏零裁切，「⋯」菜单内容与点击行为正常（同一份改动在鸿蒙平板 1440×893 上
由 17 条上机验收覆盖）。

## [1.0.0-beta.1] · 首个 Beta（M1–M18 全部验收通过）

### 这个版本意味着什么

M1–M18 的 18 个里程碑全部验收通过（最近一轮是 M18 关系线自动梳理 + R7 判定范围修正），功能面已经定型，进入 **Beta 1.0**：核心办案闭环（画布 / 代码双视图 · 时间线 · 演示 / 地图 · 素材与 OCR · 证据链 · 多轨时间线 · 关系气泡 · 关系线自动梳理）可用、数据只落本机 SQLite、离线可用。Beta 期间只修缺陷与手感，不再加新模块。

### 版本号

- `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` 三处统一为 **`1.0.0-beta.1`**（语义化版本里这是「1.0 之前的第一个 Beta」，界面与安装包上读作 **Beta 1.0**）。
- 许可仍为 PolyForm Noncommercial 1.0.0：可自由修改与分发，不得商用。

### 验收

- `pnpm typecheck` 0 error；`pnpm smoke` **871 PASS**；`pnpm ui-smoke` **430 PASS / 0 FAIL**；`pnpm bench` 1000 节点解析链 **74.5 ms**（阈值 300）；`pnpm build` 成功。
- 桌面自检两轮 **PASS**（`phase1=PASS phase2=PASS`）。
- 产物：`caseboard.exe` **19,162,112 字节**；安装包 `CaseBoard_1.0.0-beta.1_x64-setup.exe`（**12,210,066 字节**，SHA-256 `892A3146050025170424DF3B0E60208EA4E7D34A3AFC0915FF7BE9C1A859DB41`，未签名）归档到本地 `release\`。

## [未发布] v0.18.1 · M18 复验 R7 修正（判定范围＝卡片全部边框）

### 用户 R7 反馈

> R7 绕过卡片的判定范围为全部的边框，其他逻辑不要改动。

### 改了什么（只动判定范围）

- `src/lib/edgeCurve.ts` 新增 `nearbyRectsOf(points, entries, pad, exclude)`：按**折线自己**的包围盒预筛障碍。原来按「两端锚点包围盒 + 80 px」预筛，贝塞尔曲线鼓出去的部分（曲率上限 0.9 时最远可达弦长的 22.5%）会落到包围盒外，卡片明明被线穿过四个边框之一却不被判到。
- `src/lib/edgeOptimize.ts`：`countEdgeConflicts` 与 `detectEdgeConflicts` 改用 `nearbyRectsOf(line.points, …)`；命中判定从 `polylineHitsRect(points, rect, 2)` 改成 `polylineHitsRect(points, rect, 0)`（新增常量 `EDGE_JUDGE_PAD = 0`），即**判定区域严格等于卡片边框本身**——四边、四角都算，边框外 2 px 的「擦边」不再误判。
- 锚点挑选的保守预筛改用 `obstacleReach(from, to) = 80 + 弦长 × 0.25 × 曲率上限`，保证任何候选曲率能鼓到的位置都在预筛范围内（`Board.tsx` 即时描边同样走它）。
- 代价模型、锚点集合、曲率档位、命令与撤销语义**未改动**。

### 验收

- `pnpm typecheck` 0 error；`pnpm smoke` **871 PASS**（[79] 段新增 2 条：贴边算压卡 / 离边框 1.5 px 不算；曲线鼓出两端包围盒时仍能判到卡片）；`pnpm ui-smoke` **430 PASS / 0 FAIL**（新增 2 条源码断言）；`pnpm build` 成功。
- 版本三处升 **0.18.1**；`tauri build --no-bundle` 重建 `caseboard.exe`（**19,162,112 字节**），`node scripts/run-selftest.cjs` 两轮 PASS（`phase1=PASS phase2=PASS`）；`--bundles nsis` 出 `CaseBoard_0.18.1_x64-setup.exe`（**12,211,004 字节**，SHA-256 `5A76D7A91839211080E68C394E89A9DE70A196124F82525D9C51E84A79FCAE5B`，未签名），归档到本地 `release\`。

## [未发布] v0.18.0 · M18 关系线自动梳理

### M18 整体验收通过（2026-10-20，tag ms/M18）

- **手动创建的关系线也吃自动梳理**：以前 `sourceHandle`/`targetHandle` 一旦由用户拖出来就被画布当成定论，布局后线仍从老锚点绕出去。现在画布只把 `edge.autoAnchor === false` 视为「钉住」，其余一律用算出来的锚点（`Board.tsx` 的 `autoAnchors`），手画线与自动连线走同一条路。
- **每条关系线可单独开关**：`CaseEdge.autoAnchor?: boolean`（缺省 = 可被影响）走类型 / 迁移 / 命令 / 右栏三处；右栏关系属性新增「连接点受自动梳理影响」勾选框，取消勾选就钉住当前连接点，`optimizeDocEdges` 会把它计入 `locked` 且不改写。
- **自动布局面板新增「关系线自动梳理（M18）」小节**：两个按钮——「关系线单独自动调整」只重排线的连接点与弧度、不动任何卡片坐标（一次操作压一条撤销记录，状态栏给出压卡/交叉前后对比）；「检测交叉与压卡」只体检不改数据，零问题直接报「检测通过」。
- **锚点从 8 个里挑最合适的**：`pickAnchorPair(source, target, obstacles)` 在四边中点 + 四角的 8×8 组合里按代价挑；`nearbyRects` 先用连线包围盒预筛附近卡片（不看全板，1000 节点也不卡），避免出现「线穿卡片」。
- **贝塞尔形状自动优化（Q2）**：新增 `src/lib/edgeOptimize.ts`——`bestGeometry` 在曲率候选 `[0, ±0.35, ±0.6]` 里按「压卡 1200 × 交叉 320 + 曲率 6/单位」挑最小代价；`curvatureOffset`/`sampleCurve` 把标量曲率换成控制点偏移并用 8 段折线近邻采样做几何判定（`polylineHitsRect`、`polylinesIntersect`）；画布即时渲染用轻量版 `pickEdgeCurvature`（只避卡片，不做 O(E) 交叉比较）。手调 `controlPoints` 永远优先，其次才是自动曲率与平行错开。
- **DSL 与右栏**：`CaseEdge.curvature`（-0.9~0.9）随边序列化解析；右栏「立即梳理此线」（只梳理这一条）与「清掉手调弧度」（把形状交还自动梳理）。
- **自动检验加一条**：`selfCheck` 从 12 项变 13 项，新增「关系线交叉与压卡」——有压卡或交叉给 warn 并指路到自动布局面板。
- **验收**：`pnpm typecheck` 0 error；`pnpm smoke` **869 PASS**（新增 [79] 段 13 条：几何判定、障碍预筛、曲率符号与幅度、迁移夹取、交叉检测、锁定边不改写、命令一次撤销、布局同时梳理，并改「自检 12 项 → 13 项」旧断言）；`pnpm ui-smoke` **428 PASS / 0 FAIL**（新增 M18 段 15 条，改 M17 段两处旧断言：自动检验项数与布局锚点实现方式）；`pnpm bench` 1000 节点解析链 **74.1 ms**（阈值 300）；`pnpm build` 成功。
- **打包**：版本三处升 **0.18.0**；`tauri build --no-bundle` 重建 `caseboard.exe`（**19,162,112 字节**），`node scripts/run-selftest.cjs` 两轮 PASS（`phase1=PASS phase2=PASS`，含 OCR 内置引擎与零外呼两项）；`--bundles nsis` 出 `CaseBoard_0.18.0_x64-setup.exe` 归档到本地 `release\`（**12,209,827 字节**，SHA-256 `25A65D5E788981B69BA98770112A61E0689D8D2FEE151A81D01991334F7C2338`，未签名；`release/` 已不在版本控制内，文件只留在本机，记录见 `docs/RELEASES.md`）。
- **文档**：`docs/MILESTONES.md` 写入 M18 三表与 D98–D101，`docs/MANUAL-ACCEPTANCE.md` 新增 R 节，`AGENTS.md` 里程碑范围改「M1–M18 / D1–D101」。

## [未发布] v0.17.0 · M17 关系气泡与线宽

### M17 整体验收通过（2026-10-20，tag ms/M17）

- **关系线在八个锚点上自由流转**：新增 `pickAnchorPair(source, target, obstacles)`，在 8×8 锚点组合里按「线段长度 + 背面出入线惩罚 + 穿过障碍惩罚」算代价挑最优对；`applyLayout` 布局后**无条件覆盖**每条边的 `sourceHandle`/`targetHandle`，画布自动锚点也走同一函数。连线不再穿卡片、不再从背面绕出来。
- **平行关系线错开**：`parallelSpreads` 把同一对实体之间的多条关系线按 34px 间距均匀错开（单条偏移 0），画布与 DSL 都按 `edge.id` 稳定取偏移。
- **关系线可调粗细**：`CaseEdge.thickness`（1–8，缺省按 `weight` 推导）走类型 / 迁移夹取 / 命令 / DSL 解析与序列化 / 空行渲染全链路；右栏关系属性新增「线宽」滑杆（0.5 步进），渲染时选中与高亮各加 1px / 1.8px。
- **新增第 9 类节点「关系气泡」**：圆角胶囊外形（隐藏卡片栏、字段区与脚注），用来把多条关系线汇到同一个节点上表达「一对多」「多方共同」；模板自带「关系类型 / 强度 / 说明」三字段，默认尺寸 168×64。
- **右键新建菜单**：画布空白右键 → 「新建节点…」「新建关系气泡」；卡片右键额外提供「新建关系气泡并连到此实体」（一条 `composeCommands` 同时建节点与虚线关系）。
- **仓库卫生与开源规范**：`release/` 与 `*.mp4` 移出索引并写进 `.gitignore`（安装包与录屏都是产物，不入库），发布记录迁到 `docs/RELEASES.md`；新增 `CONTRIBUTING.md`、`SECURITY.md`；隐私扫描确认仓库内无本机绝对路径、无 token / 私钥、无真实口令。
- **README 重写**：中英双语保留，新增 4 张真实截图（`docs/screenshots/`）、能力表补「关系气泡」与「八方向连线、可调线宽、布局后按障碍自动换锚点」，安装包说明指向 `docs/RELEASES.md`。
- **验收**：`pnpm typecheck` 0 error；`pnpm smoke` **855 PASS**（新增 [78] 段 20 条，并修「9 类节点模板」「DSL 字段白名单」两处旧断言）；`pnpm ui-smoke` **411 PASS / 0 FAIL**（新增 M17 段 14 条、改 4 处 8→9 类节点断言）；`pnpm bench` 1000 节点解析链 **74.1 ms**（阈值 300）；`pnpm build` 成功。
- **打包**：版本三处升 **0.17.0**；`tauri build --no-bundle` 重建 `caseboard.exe`（19,159,040 字节），`node scripts/run-selftest.cjs` 两轮 PASS（`phase1=PASS phase2=PASS`，含 OCR 内置引擎与零外呼两项）；NSIS 安装包归档到本地 `release\CaseBoard_0.17.0_x64-setup.exe`（**12,205,592 字节**，SHA-256 `8E9AB2D542BF65DE5358DE3E21AF74816B436D388E778873AEEB59C5679EF9C7`，未签名；`release/` 已不在版本控制内，文件只留在本机，记录见 `docs/RELEASES.md`）。
- **文档**：`docs/MILESTONES.md` 写入 M17 三表与 D94–D97，`docs/MANUAL-ACCEPTANCE.md` 新增 Q 节，`AGENTS.md` 里程碑范围改「M1–M17 / D1–D97」。

## [未发布] v0.16.0 · M16 许可与示范案卷

### M16 整体验收通过（2026-10-20，tag ms/M16）

- **许可**：新增 `LICENSE`（PolyForm Noncommercial License 1.0.0 全文 + 中文摘要）、`package.json` 的 `license` 字段与 README 中英双语许可章节，明确「可自由使用、修改、分发；不得商用；不是 OSI 开源许可」。
- **布局带走吸附图片（缺陷修复）**：`applyLayout` 写坐标时同步产出位移表，交给命令层 `applyDockedMoves`，吸附在卡片上的图片随布局一起搬家，一次撤销整体还原；`applyDockedMoves` 同时兼容没有图片节点的手写 draft。
- **助手面板新增「操作方式」**：6 组主题（画布 / 关系线与连线 / 图片工作台 / 视图与分析 / 素材与文字识别 / 我的操作方式），最后那组讲清助手侧的工作方式（只走命令层、先给计划、改完就验、痕迹留档、拿不准就问）。
- **助手面板新增「自动检验」**：`src/lib/selfCheck.ts` 只读扫描 12 项结构一致性（关系端点、分组引用、图片与吸附目标、标题、时间、坐标、线型语义、AI 合规、假设与证据链引用、时间覆盖、tag 连线候选），给出结论条与计数，问题实体可点击跳回画布定位。
- **内置示范案卷**：新增《ABC 谋杀案》示范案卷（23 实体 / 20 关系 / 3 分组 / 2 条对立假设 / 1 条自定义证据链 / 双轨时间线 / 5 个带坐标地点），顶栏「示例案卷」可一键载入连环诈骗案或 ABC 案（先确认再替换，清空撤销历史）。
- **验收**：`typecheck` 0 error、`smoke` 845 PASS、`ui-smoke` 399 PASS、`bench` 102.1 ms；桌面自检两轮 PASS；安装包归档到 `release\`。
- **文档**：本条目 + `docs/MILESTONES.md` M16 章节与 D90–D93 + `docs/MANUAL-ACCEPTANCE.md` P 节。

## [未发布] v0.15.0 · M15 顶栏重排与背景图修复

### M15 整体验收通过（2026-10-20，tag ms/M15）

- **「⋯」菜单打不开（N3 / N4）**：根因是 `overflow` 裁剪 —— `.cb-topbar` 有 `overflow: hidden`、`.cb-topbar__io` 有 `overflow-x: auto`（M10 为防挤压加的），而溢出菜单是它的绝对定位子元素，整块被裁到可视区外，所以点「⋯」看起来毫无反应、菜单项也点不到。改成 `createPortal` 挂到 `document.body` + `position: fixed`，按「⋯」按钮的 `getBoundingClientRect()` 定位；点外部、Esc、窗口 resize 都会收起。顺带去掉「主题 / 底衬不进菜单」的过滤 —— 这两个按钮一旦被挤出去就再也点不到。
- **背景图不显示（N7 / N8 / N12）**：`Board.tsx` 用的是 `useAssetThumb(assetId, 1600)`，而缩略图只按 `THUMB_SMALL = 256` / `THUMB_LARGE = 1024` 两个固定尺寸写进 IndexedDB，1600 永远查不到 ⇒ `<img class="cb-canvas__bg">` 拿不到 `src`。改为桌面端直接用原件 `assetFileUrl(asset.path)`（与地图底图同一条链路），浏览器里退回 1024 缩略图；并把 `.react-flow` 抬一层、`--xy-background-color: transparent`，保证背景图不被画布底色盖住。
- **去掉背景原点矩阵**：删掉 `BackgroundVariant.Dots` 那一层，只留很淡的 80px 线条；抽出纯函数 `showsCanvasGrid(skin)`，软木板与黑板自带纹理不再叠网格。
- **撤销 / 重做只留图标**：改成 `↶` / `↷` 两个图标按钮（`.cb-btn--icon`），操作名与快捷键仍在 `title` 与 `aria-label` 里，不影响可访问性。
- **顶栏自动检测遮挡**：以前只用 `estimateLabelWidth` 估算宽度，估算与真实字体 / 内边距不一致，窗口缩小时仍有残留遮挡。现在渲染后用 `getBoundingClientRect()` 采集每个按钮的**实测宽度**参与规划，并在 `useLayoutEffect` 里检查容器 `scrollWidth - clientWidth`：真挤爆了就把当前内联项里优先级最低的一项强制收进菜单，逐帧收敛；窗口一 resize 就清空「强制收起」集合并关闭菜单，按新宽度重排。
- **导入背景图入口（N5）**：顶栏新增「背景图…」动作（复用 `useCanvasImagePicker`，与右栏「画布底衬与背景图」是同一条导入链路）。
- **验收**：`pnpm typecheck` 0 error；`pnpm smoke` **806**（新增 [74] 段 6 条：`showsCanvasGrid` 三档与未知底衬回落、实测宽度规划）；`pnpm ui-smoke` **374**（新增 M15 段 12 条：图标按钮、portal + fixed、实测宽度与自动收敛、背景图走原件地址、无点阵层、React Flow 透明、顶栏「背景图…」入口）；`pnpm bench` 1000 节点解析链 **76.6 ms**（阈值 300）；`pnpm build` 成功（主包 975.13 kB / gzip 332.66、CodePanel 345.92 kB）。
- **打包**：版本三处（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`）升 **0.15.0**；`tauri build --no-bundle` 2m03s → `caseboard.exe` **19,148,800 字节**，桌面自检两轮 **PASS**（`phase1=PASS phase2=PASS`，含「OCR 字段抽取 — 识别引擎可用 内置 Tesseract（WASM）」「零外呼」）；`--bundles nsis` 2m48s → `CaseBoard_0.15.0_x64-setup.exe`（11.63 MiB），归档到 `release\`，**12,197,737 字节**，SHA-256 `F4E710FF8CDC4884B26EEF590A777BE93313D1A06B25E425FD5BBAF0712A9BB5`，未签名。
- **文档**：`docs/MILESTONES.md` §1 M15 置 ✅、§3 写入拆步 / 验收 / 偏离三表、§6 新增 D86–D89、§7 追加验收行；`docs/MANUAL-ACCEPTANCE.md` 新增 O 节；`AGENTS.md` / `README.md` 里程碑范围改 M1–M15 与 D1–D89。

## [未发布] v0.14.0 · M14 画布底衬与顶栏折叠

### M14 整体验收通过（2026-10-20，tag ms/M14）

- **右栏「发生时刻 / 地点」各占一行（M5）**：`TemplateField` 里 `field.wide || field.kind === 'datetime'` 一律用整行样式——日期时间控件以前塞在半列里，浏览器默认外观被压得放不下；event 模板的「地点」也标 `wide: true`，两行等长，不再一长一短。
- **顶栏按钮不再重叠（M8）**：窗口变窄时以前靠 `overflow: hidden` 硬裁，右边的按钮互相盖住。新增纯函数 `src/lib/topbarOverflow.ts`（`estimateLabelWidth` 估算中文/西文宽度、`planTopbarOverflow` 按优先级贪心保留，装不下的收进菜单），顶栏用 `ResizeObserver` 量真实可用宽度，放不下的按钮收进 `⋯`：点开是一列菜单项，点外部或 Esc 关闭。**宽度还没量到时（`ioWidth <= 0`）不折叠**——否则 jsdom 里 `clientWidth` 恒为 0 会把所有按钮塞进菜单。搜索/打开/保存/导出/代码视图优先级最高，历史/安全/导入最低。
- **软木板 / 黑板底衬与背景图（新需求）**：
  - 新增 `src/lib/canvasSkin.ts`：`paper`（纸张，跟随深浅色主题）/ `cork`（软木板，木屑点 + 木纹）/ `chalk`（黑板，椭圆高光 + 斜纹）三档，`SKIN_GRID` 自带网点与叠色，`canvasGrid(skin, theme)` 决定 React Flow 的网格颜色。
  - 底衬与背景图存进 `settings.canvas`（`CanvasConfig{skin, assetId?, opacity?}`），迁移 `normalizeCanvas` 做皮肤白名单、素材 id 存在性校验（素材没了只摘图、保留底衬；纸张且无图时整块丢弃）、不透明度夹到 0.1–1。
  - 两条命令：`setCanvasSkin(skin)` 与 `setCanvasImage(assetId | null, opacity?)`；顶栏新增「背景·纸张 / 背景·软木板 / 背景·黑板（+图）」按钮循环切换。
  - 背景图导入复用素材库同一条链路：`fileService.pickFiles` → `imageService.prepare/save` → `importAssets` → `setCanvasImage`，抽出 `src/components/hooks/useCanvasImage.ts` 供顶栏与右栏共用。图片以 `object-fit: cover`、`pointer-events: none` 铺在 React Flow 之下。
  - 右栏「案件概览」新增「画布底衬与背景图」块（`src/components/panels/CanvasBackdropForm.tsx`）：底衬下拉、导入 / 清除背景图、不透明度 10–100%。
- **结构分析与自我优化（用户要求）**：盘点发现 `src/index.css` 5183 行、16 组重复选择器（多数是后续里程碑的有意覆盖，如 `.cb-btn` / `.cb-tab` / `.cb-input` / `.cb-timeline__lanes`），只合并了**完全重复**的 `.cb-group__header` 一对；把右栏画布块从 1400 多行的 `RightPanel.tsx` 抽成独立组件 `CanvasBackdropForm.tsx`（RightPanel 不再直接依赖 canvasSkin 库、导入钩子与两条画布命令）；顶栏重写时顺手删掉重复的隐藏文件选择框。最大源文件仍是 `RightPanel.tsx`（≈1355 行）、`src/dsl/parse.ts`（903 行），后续可继续按面板拆分。
- **验收**：`pnpm typecheck` 0 error；`pnpm smoke` **800**（新增 [73] 段 22 条：底衬三档与循环切换、不透明度夹取、`withCanvasImage`/`withCanvasSkin`、`canvasLabel`、`canvasGrid`、`estimateLabelWidth('假设')===52`、窄窗收起顺序与优先级、迁移四种画布场景、「发生时刻」`datetime` + 「地点」整行）、`pnpm ui-smoke` **362**（新增 M14 段 20 条，实测点「背景」按钮三类底衬依次切换）、`pnpm bench` 1000 节点解析链 **80.9 ms**（阈值 300）、`pnpm build` 成功（`index-BiPoxijM.js` 973.64 kB / gzip 332.01、CSS 101.57 kB）。
- **打包**：版本三处升 **0.14.0**（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`）；`tauri build --no-bundle` 3m03s → `caseboard.exe` **19,148,288 字节**，桌面自检两轮 **PASS**（第 2 轮 18 项，含「OCR 字段抽取 — 内置 Tesseract（WASM）」「零外呼」）；`--bundles nsis` 2m47s → `CaseBoard_0.14.0_x64-setup.exe`（11.63 MiB），归档到 `release\CaseBoard_0.14.0_x64-setup.exe`，**12,195,548 字节**，SHA-256 `63C946010C092490CD6CAC5E18D6C5EECCCD9F964C90151A7FC7F3E56275869F`，未签名。
- **文档**：`docs/MILESTONES.md` §1 M14 置 ✅、§3 写入 M14 拆步/验收/偏离三表、§6 新增 D82–D85、§7 追加验收行；`docs/MANUAL-ACCEPTANCE.md` 新增 N 节；`AGENTS.md` / `README.md` 里程碑范围改 M1–M14 与 D1–D85。

## [未发布] v0.13.0 · M13 复验收尾（L 反馈）

### M13 整体验收通过（2026-10-20，tag ms/M13）

- **改地点自动断开旧线（L9）**：此前「地点」只会往里加线——把地点改到别处、或把地点清空，原来那条线还留在画布上，得手动删。新增纯函数 `planPlaceRelink(doc, nodeId, text)`（`src/lib/placeLink.ts`）：只认 `label === '地点'`、另一端是 place/org 的**自动线**，目标没变就既不删也不加；改到新地点就断开旧线再连新线；清空地点则只断开。右栏提交地点时改成一条 `composeCommands`（`updateNode` + 若干 `deleteEdge` + 命中时 `addEdge`），撤销一次整体回退。人工建的其它关系线一根不动，两端已有其它关系时也不重复连。
- **控件视觉对齐**：新增尺寸令牌 `--cb-control-h: 28px` / `--cb-control-h-sm: 22px` / `--cb-control-r: 6px` / `--cb-control-pad: 8px`。按钮由 `padding: 5px 11px`（约 27.6px 高）改为 `min-height: 28px` + `inline-flex` 居中，与输入框（`height: 28px`）等高；标签页按钮统一到 22px 小号高度；单行输入框与下拉用 `:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='color'])` 排除后统一高度与内边距——顺带把此前完全没有样式的 `datetime-local` / `date` / `search` 输入框纳入（「发生时刻」以前是浏览器默认外观）；多行文本保留可换行但圆角与内边距统一；`.cb-geo__ops` / `.cb-ocr__ops` / `.cb-timeline__zoombar` / `.cb-hyp__add` 等混排行容器统一 `align-items: center`，按钮与输入框不再一高一低。
- **验收**：`pnpm typecheck` 0 error；`pnpm smoke` **777**（新增 [72] 段 12 条，含「只把『地点』标签的线当成自动线」）、`pnpm ui-smoke` **344**（新增 M13 段 8 条）、`pnpm bench` 1000 节点解析链 **74.6–74.6–116.4 ms**（两次实测抖动）（阈值 300）、`pnpm build` 成功（`index-H1HYGgr0.js` 966.90 kB / gzip 329.29）、桌面自检两轮 PASS。
- **打包**：版本三处升 **0.13.0**（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`）；`tauri build --no-bundle` 4m24s → `caseboard.exe` 19,145,728 字节；`--bundles nsis` → `CaseBoard_0.13.0_x64-setup.exe`（11.63 MiB），归档到仓库根 `release\CaseBoard_0.13.0_x64-setup.exe`，**12,192,983 字节**，SHA-256 `D7DD6C6EA53236C72282AAA58D759B2C63093D68B774378A29605E5DAA408E5E`，未签名。
- **文档**：`docs/MILESTONES.md` §1 M13 置 ✅、§3 写入拆步/验收/偏离三表、§6 新增 D80–D81、§7 追加验收行；`docs/MANUAL-ACCEPTANCE.md` 新增 M 节（M1–M8）；`AGENTS.md` / `README.md` 里程碑范围改 M1–M13 与 D1–D81。

## [未发布] v0.12.0 · M12 复验修订（K 反馈）

### M12 整体验收通过（2026-10-20，tag ms/M12）

- **框选（K1 / K13）**：`.cb-lasso` 是容器的绝对定位层，原来把 `clientX/clientY` 直接当框的 `left/top`，整框被左栏宽度 + 顶栏高度整体偏移——改为 `onPointerDown` 记下容器 `getBoundingClientRect()` 的左上角，框位置改为相对坐标（世界坐标仍走 `screenToFlowPosition`，那部分本来就是对的）；`SelectionMode.Full` 改 **`Partial`**，框到对象的一部分即选中，不必把整个卡片框进去。
- **时间线（K8）**：数轴占满可用宽度（去掉 1180px 上限），时间片按 `stackChips` **错行排布**（`CHIP_ROW_HEIGHT 22` / `CHIP_MIN_GAP 0.045`，轨道高度 `chipTrackHeight` 跟着行数长高），挤在一起的条目上下分开而不是互相遮挡；靠右端的时间片用 `.is-end` 改成向左展开，不再被裁掉。
- **假设面板（K14a / K14b）**：「新增假设」输入与「分数」不再出框（`.cb-hyp__add` 改 `display: grid` + `minmax(0,1fr)` + 按钮 `nowrap`，`.cb-hyp__item-head` 允许换行，表头 `max-width: 200px`）；新增**按关系与 tag 自动构建假设**：`proposeHypotheses(doc)` 用并查集按关系线聚出 ≥3 个实体的连通群体、再按 tag 聚出 ≥2 个实体的群体，已覆盖的跳过，界面列成草案勾选确认后**一次 `composeCommands` 落库**（实体作为「支持」立场），草案本身不改 Model。
- **自定义证据链（K14c）**：`CaseDoc.chains?: ChainDef[]`（`ChainEntry{nodeId, stageId}`，六个阶段 id `motive/plan/prepare/act/escape/launder` 定义在 `src/types/index.ts`，`evidenceChain.ts` 改为 re-export）；新增 `chainCommands`（`addChain` / `updateChain` / `deleteChain` / `setChainEntry`）与 `src/lib/chains.ts`（`customChainStages` / `chainCoverage` / `isChainStageId` / `assignableNodes`）；迁移 `normalizeChain` 丢掉未知阶段、未知实体与重复条目；假设面板「证据链」页签顶部多了**链选择条**（「自动（字段 + 关键词）」+ 自建链 chips + 新建/删除），选中自建链时六阶段按该链独立展示，归入/移出写 `setChainEntry`。
- **地点自动连线（K15）**：新增纯函数 `src/lib/placeLink.ts`（`matchPlaceForNode` 只认标题完全相同、忽略大小写与首尾空白、不看自己、已有关系不重复连；`PLACE_LINK_EDGE` = `related` + 虚线 + 置信度 50），右栏「地点」字段提交时命中已有地点/单位就用 `composeCommands` 一次写「字段 + 关系线」，并在字段下给出「已自动连到「X」」提示——字段推断按**推测线**处理，不冒充已证实。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **770 条全绿**（M12 新增 [68] 时间片错行 / [69] 自动构建假设草案 / [70] 自定义证据链与迁移 / [71] 地点自动连线）、`pnpm ui-smoke` **354 条全绿**（新增 M12 段：草案面板列条目 + 确认后真的落库、链选择条 + 新建/删除自建链、六阶段仍按链展示、M12 样式区块）、`pnpm bench` 1000 节点解析链 **110.8 ms**、`pnpm build` 成功、桌面自检两轮 PASS。
- **打包**：版本三处升 **0.12.0**（`package.json` / `tauri.conf.json` / `Cargo.toml`）；`tauri build --no-bundle` 重建 `caseboard.exe`；NSIS 安装包归档到仓库根 `release\CaseBoard_0.12.0_x64-setup.exe`。
- **文档**：`docs/MILESTONES.md` §1 M12 置 ✅、§3 新增 M12 目标/范围/验收/拆步表/偏离表、§6 新增 D75–D79、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 L 节（K1–K18 逐条复验）。
## [未发布] v0.11.0 · M11 用户复验修订

### M11 整体验收通过（2026-10-20，tag ms/M11）

- **外壳与控件（I7 / I8 / I13 / I14 / J2）**：地图视图也渲染右栏（原来只有画布视图挂 `<RightPanel />`，所以地图里改不了经纬度）；自动布局的「层级」标签改为用户找的**「分层」**（提示里保留「也写作层级」）；素材库拖入画布不再误触发导入向导（`onDrop` 先判断 `ASSET_DND_TYPE`——WebView2 的拖拽会带 file item 才被误判为导入）；安全面板删掉整块「本机存储」说明；左右栏各加一个可点击的折叠箭头（`.cb-collapse--left` / `--right`，`aria-expanded` 同步）。
- **连接点与组（J4 / I3）**：八个连接点常驻时 `opacity: 0`，鼠标悬停卡片才显形（尺寸仍 18px）；组标题栏去掉 `nodrag` —— 这正是「组拖不动」的根因（有 `nodrag` 时 React Flow 的 d3-drag 不接管 pointerdown），并加 `⠿` 抓手图标与 `cursor: grab`；组成员点击改为「选中 + `focusEntity` 居中」；左栏新增 `GroupTree` 组树总览（层级组、成员、成员计数、折叠开关、点条目跳转画布）。
- **图片（I1 / I6 / J6）**：`nodes` 数组按 `zIndex` 排序后再交给 React Flow，DOM 顺序与层级一致，「上移/下移/置顶/置底」立刻可见；新增 `ImageNode.dotMode`，图片可压成 26px 小圆点（双击圆点或点 `⤢` 展开，右栏与工具条都有开关），便于把图片拖到卡片角落吸附；卡片拖动时 `onNodeDrag` 实时算 `dockPreview`，吸附图片**跟着指针走**，不再是松手才跳过去。
- **时间线（I9 / J8）**：轨道支持**手工挑选条目**（`TimelineTrack.nodeIds`，迁移时去重去空；清单为空即回到按 `kind` + `ref` 自动归集），多轨模式下每条泳道有「编辑」面板可勾选这条时间线包含哪些事件；缩放滑杆移到最下方与游标滑杆并排（同一份 `spanRatio`，拖一下整条数轴跟着缩放）；新增贯穿所有泳道的**公用指针**（`.cb-timeline__cursor`，跟着游标走）；数轴宽度上限 1180px，宽屏不再无限拉长。
- **地图（J9）**：双击图钉弹出「手动编辑经纬度」面板（纬度/经度输入 + 回车写回 + 越界提示），仍走 `updateNode` 命令。
- **素材库（J10）**：从某个素材文件夹里导入图片时，`confirm()` 用 `composeCommands` 把 `importAssets` 与 `moveAssetsToFolder` 合成**一条**命令，导完直接落在当前文件夹，撤销一次同时回退。
- **证据链（I5 / J11）**：新增 `CHAIN_STAGE_FIELD`（字段名「链条阶段」）+ `manualStage` / `stageFields`，**人工阶段优先于关键词**——证据链页签每个阶段有「＋ 把实体归入本阶段」下拉、条目上有「移出阶段」，不再是一屏关键词猜出来的 `missing`；假设面板表格改 `table-layout: fixed` + `overflow-wrap: anywhere`，修掉字体出框。
- **地点关联（I11）**：事件「地点」字段改成「可选已有对象 + 可手填」双通道输入（`datalist` 列出全部地点/单位标题）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **729 条全绿**（M11 新增 [64] 图片小圆点 / [65] 轨道手工挑选条目 / [66] 证据链人工归类 / [67] 导入直接进文件夹）、`pnpm ui-smoke` **314 条全绿**（新增折叠箭头、组树、小圆点、工具条 6 按钮、时间线缩放与公用指针、地图右栏、M11 样式区块）、`pnpm bench` 1000 节点解析链 **74.3 ms**、`pnpm build` 成功、桌面自检两轮 PASS。
- **打包**：版本三处升 **0.11.0**（`package.json` / `tauri.conf.json` / `Cargo.toml`）；`tauri build --no-bundle` 重建 `caseboard.exe`；NSIS 安装包归档到仓库根 `release\CaseBoard_0.11.0_x64-setup.exe`。
- **文档**：`docs/MILESTONES.md` §1 M11 置 ✅、§3 新增 M11 目标/范围/验收/拆步表/偏离表、§6 新增 D69–D74、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 K 节（I1–I15 / J1–J15 逐条复验）。

## [未发布] v0.10.0 · M10 交互打磨与内置能力

### M10 整体验收通过（2026-10-20，tag ms/M10）

- **顶栏与外壳**：删除顶栏「案情板」logo；删除常驻「线型语义」图例，改为右下角可折叠的「图示」按钮（展开仍是实线/虚线/点线三条 + 操作提示，且不提供绕过线型语义的开关，D66）；修掉案件编号 `A-2026-1018` 被压成竖排两行并被裁切的问题（`.cb-topbar__brand` 改 `nowrap` + `flex:0 0 auto`，工具区改可横向滚动）；MiniMap 缩到 150×100 并半透明，图示按钮上移到它上方，不再互相压住。
- **画布连线**：关系线连接点由 14px 放大到 **18px 且常驻可见**（`opacity:.45`，hover `scale(1.2)`）；锚点从四边中点扩到**八端口**（四边 + 四角 `tl/tr/br/bl`），`bestAnchors` 在斜向时选对角，`.cb-node` 放开 `overflow` 让角端口不被裁（D64）。
- **图片层级与吸附**：卡片与图片进入**共用层级空间**——卡片固定 `CARD_LAYER_Z=100`，图片 `zIndex` 分 1–99（卡片下）与 101–199（卡片上），`reorderLayers` 改带状重编号，图片「置顶/上移/下移/置底」首次真正生效（D62）；吸附判定改为「卡片外扩 140px 的角落区」，可吸到四角并记录 `dockCorner` / `dockOffset`；卡片移动时吸附图片由**命令层** `applyDockedMoves` 随动，`moveNode` / `moveNodes` / `moveGroup` 都带，撤销仍是一条命令（D63）。
- **时间线**：新增多轨并行（按类型 / 多轨并行可切）、比例滑杆（`spanRatio` 0.1–1）、新建与删除时间线；轨道与偏好进入文档 `doc.timeline`（`TimelineTrack` / `TimelinePrefs`），切视图与重开不丢，且能进 undo（D67）；修掉时间滑杆贴最右侧被裁的样式问题。
- **地图**：可导入背景图片（存 `settings.mapBackground` 指向素材库，带不透明度滑杆与移除），图钉可拖动、松手写回 `fields.经纬度`；`replaceDocument` 补上 `imageNodes` / `hypotheses` / `assetFolders` / `timeline`，打开项目不再丢图片节点。
- **素材库**：新增**文件夹**树形分组（新建 / 重命名 / 删除、`parentId` 环检测），分组模式扩到「按文件夹 / 按来源 / 按日期 / 不分」；删除文件夹只做子级上提 + 素材回未分类，**永不删素材**（D68）；右栏素材表单可直接改所属文件夹。
- **面板编辑**：假设面板「证据链」页签从只读快照改为可编辑（改标题、改状态、在画布定位），编辑仍走 `updateNode` 命令（D65）；演示页联动编辑补上 tag 编辑（复用 `TagEditor`）。
- **内置 OCR**：打包 `tesseract.js`（WASM）worker + 三档 SIMD 内核 + `chi_sim` / `eng` 语言包进 `public/ocr`（15.7 MB），随 Vite 产物分发并由 Tauri 内嵌进 exe；探测顺序「系统 Tesseract → 内置 WASM」，右栏显示引擎来源、预热与逐张识别进度，离线干净机也能识别（D61）。原计划的 Tesseract CLI 方案因 winget/GitHub 下载被网络阻断而放弃（记为偏离）。
- **数据迁移 v9**：`types` 新增 `CaseNode.zIndex`、`ImageNode.dockCorner`/`dockOffset`、`Asset.folderId`、`AssetFolder`、`MapBackground`、`TimelineConfig`；`migrate.ts` 新增 `normalizeAssetFolder` / `normalizeTimelineTrack` / `normalizeTimeline` / `normalizeMapBackground`，清理悬空父级、悬空 `trackIds`、越界 `spanRatio` 与无 `linkedNodeId` 的角标记。
- **打包**：版本三处升 **0.10.0**（`package.json` / `tauri.conf.json` / `Cargo.toml`）；`tauri build --no-bundle` 重建 `caseboard.exe`；NSIS 安装包归档到仓库根 `release\CaseBoard_0.10.0_x64-setup.exe`。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **713 条全绿**（M10 新增 [56] 图片层级与吸附随动 / [57] 八端口连线 / [58] 时间线多轨与比例 / [59] 地图底图与拖动改坐标 / [60] 素材文件夹 / [61] 内置 OCR 随包 / [62] 数据迁移 v9 / [63] 卡片移动带吸附图片）、`pnpm ui-smoke` **298 条全绿**（改 4 处旧断言 + 新增顶栏 logo 与素材文件夹入口）、`pnpm bench` 1000 节点解析链 **75.5 ms**、`pnpm build` 成功且 `dist/ocr` 随包、桌面自检 **17 / 18 两轮 PASS**。
- **文档**：`docs/MILESTONES.md` §1 M10 置 ✅、§3 新增 M10 目标/范围/10 条验收/拆步表 M10-1…M10-16/验收记录/偏离表、§6 新增 D61–D68、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 J 节人工复验清单。

## [未发布] v0.9.0 · M9 交互修订与安全精简

### M9 整体验收通过（2026-10-20，tag ms/M9）

- **交互修订（A2/A4/A5）**：自由图片选中后的工具条从图片顶部横排改到**右侧竖排**、按钮内文字仍横排，让出顶部旋转手柄（原来 `top:-60px` 的工具条与 `top:-36px` 的旋转手柄重叠）；混合多选（卡片 + 图片）拖动改用 `composeCommands` 把 `moveNodes` 与 `moveImageNodes` 合成**一条**命令，撤销一次整体回退；组头、折叠按钮与右下角改尺寸手柄补 `nodrag`（这是「新建组后拖右下角改不动」的根因：React Flow 的 d3-drag 抢走 pointerdown）；组头成员计数变按钮、点开弹出组成员清单，右栏 `GroupForm` 同步列出直接成员与子组成员（点标题跳转选中）；关闭 React Flow 双击缩放，空白双击改为弹出「新建节点」对话框（选类型 + 标题，`uiStore.newNodeAt` 只记落点）。
- **面板与视图（T1–T7）**：`HypothesisPanel`、`AiImagePanel` 根节点补 `.cb-modal__mask` 遮罩并居中，不再被塞进顶栏；区域锚点高亮改为「悬停 ∪ 单选 ∪ 多选 ∪ `anchorFocus`」集合，锚点可点击选中实体并在高亮时浮出实体名（`.cb-free-image__anchor-tag`）；地图给无坐标实体提供「点选设坐标」入口（左栏待摆放清单 + 点网格取点逆投影写回），右栏新增「地图坐标」块（纬度/经度两个输入框、清除坐标、跳地图点选），坐标统一走合并字段 `经纬度`，place 模板删掉 `经度`/`纬度` 两个独立字段，演示数据补齐 5 个带坐标实体。
- **布局与时间线（S3–S5）**：`applyLayout` 在写坐标的**同一条命令**里按新相对位置对每条边重算 `sourceHandle`/`targetHandle`（`bestAnchors`），渲染层再用 `edge.sourceHandle ?? auto.source` 兜底，解决交叉与线穿卡片；边标签按格分区错开（`fanOutLabels`，`LABEL_CELL=120` / `LABEL_STEP=16`）；`nodeTimeRange` 在 `node.time` 缺失时回退读 `fields` 的「发生时刻/时间/交易时间/日期/案发时间」，老节点终于能进时间线、滑杆与播放可用；演示页新增联动编辑控件（标题输入、状态下拉、备注文本域，即时写回 Model）。
- **新增能力**：事件节点「发生时刻」改日期时间控件（`kind:'datetime'` + `src/lib/datetime.ts`，同时写 `node.time`）；所有节点统一 tag 编辑（`TagEditor` chip 编辑 + 已有标签快捷选择）与「按 tag 自动连线」确认面板（`tagLinkCandidates` 只取出现 ≥2 次的 tag、已有关系跳过、确认后生成**点线** + 置信度 35，符合线型语义）；关系线连接点从 9px 放大到 14px（含 hover 放大与描边）；素材库分组（按来源 / 按日期 / 不分，纯函数 `groupAssets`）；导入图片后自动 OCR（引擎可用则一条 `composeCommands` 批量写回 `ocrText`，缺失则面板给出 Tesseract 安装指引而不打断导入）。
- **安全精简（H3，决策 D53/D60）**：彻底删除应用解锁与整库加密——删除 `src-tauri/src/vault.rs`、`src/services/vault.ts`、`src/store/vaultStore.ts`、`src/components/panels/LockScreen.tsx`、七个 `vault_*` Rust 命令、`aes-gcm`/`argon2`/`rand` 依赖、`run-selftest.cjs` 的第 3 轮、`index.css` 的 `.cb-lock*` 样式；数据库回到普通 `caseboard.db`；安全面板首块改成「本机存储」说明（建议系统账户权限 + BitLocker）。`smoke [55]` 用字面扫描守住这条边界：`src` 与 `src-tauri/src` 里 `vault`/`保险库` 零命中、四个已删文件不存在、Cargo 无加密依赖、自检只跑两轮。
- **打包（H2）**：版本三处升 **0.9.0**（`package.json` / `tauri.conf.json` / `Cargo.toml`）；`tauri build --no-bundle` 1m44s 重建 `src-tauri\target\release\caseboard.exe`；NSIS 安装包归档到仓库根 `release\CaseBoard_0.9.0_x64-setup.exe`（3,614,153 字节，SHA-256 `B7ADBC7D04E615E42234B13AB541E3951FDCD6BBD9A60C15EDBEA5AD487751C9`，未签名）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **658 条全绿**（M9 新增 [49] 发生时刻控件 / [50] 时间线回退 / [51] 地图坐标与点选逆投影 / [52] tag 自动连线候选 / [53] 素材库分组 / [54] 布局换锚点与标签避让 / [55] 应用解锁与整库加密已删除）、`pnpm ui-smoke` **296 条全绿**（新增约 40 条：地图点选、双击新建对话框、tag 面板、素材库分组、图片竖排工具条、锚点可点、演示联动编辑、连接点尺寸、已删样式不得残留）、`pnpm bench` 1000 节点解析链 **75.3 ms**、`pnpm build` CSS 84.53 kB（gzip 14.31）/ 主包 908.58 kB（gzip 308.72）/ CodePanel 345.92 kB、桌面自检 **17 / 18 两轮 PASS**（v0.9.0，第 3 轮解锁自检已随功能移除）。
- **文档**：`docs/MILESTONES.md` §1 M9 置 ✅、§3 拆步（M9-1…M9-16）+ 验收记录 + 偏离表、§6 新增 D53–D60、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 I 节 15 条并把 H3 标为作废；`docs/CaseBoard-SPEC.md` 七处「加密/启动密码」表述注明 M9 已删；`README.md` 与 `AGENTS.md` 同步（自检两轮、安全边界如实说明）。

## [未发布] v0.8.0 · M8 安全与打磨

### M8 整体验收通过（2026-10-19，tag ms/M8）

- **启动密码保险库**（`src-tauri/src/vault.rs` + `src/services/vault.ts` + `vaultStore` + `LockScreen.tsx` + `SecurityDialog.tsx`）：整库文件加密（`CBV1` 容器，Argon2id 派生密钥 + AES-256-GCM），锁定态磁盘只有 `caseboard.db.vault`，普通 SQLite 工具打不开；错误密码被拒「启动密码不正确」；关闭与改密即使已解锁也必须先解密校验密码；`ensure_db_file` 拒绝在保险库存在时建空明文库。
- **脱敏全链路**（`src/lib/maskText.ts` + `src/serializers/manifest.ts`）：身份证保留前 6 后 4、手机前 3 后 4、银行卡前 4 后 4 按 4 位分组，图片包 `manifest.csv` 的 OCR 文本同源脱敏；像素层马赛克仍可像素级验证抹平。
- **AI 合规审计**（`src/lib/aiAudit.ts` + `SecurityDialog` 区块）：从 `aiMeta` 生成「逐张明细 / 提示词审计 / 合规结论」三节 Markdown，缺 AI 分区、缺角标、缺提示词等逐条点名，可导出 Word 或 Markdown。
- **打印与 PDF 版式**（`src/index.css` 的 `@media print` + `App.tsx` 的 `.cb-print-head` + `pdfExport.ts` 的 `composePage`）：打印隐藏顶栏侧栏、A4 横向页首页脚（标题/编号/实体关系数/打印时间/页码），节点不跨页切断；多页 PDF 每页同样带页眉页脚。
- **全局搜索与命令面板**（`src/lib/search.ts` + `CommandPalette.tsx` + `paletteStore`）：覆盖实体标题/别名/标签/字段/备注/附件、关系两端与备注、分组、素材名称/编号/OCR 文本，AND 多词与字段权重排序，命中带片段；Ctrl+K 随时唤起，↑↓ 选择、Enter 跳转并选中、Esc 关闭，内置切视图/代码视图/立即快照命令。
- **打包与签名**：版本三处 0.8.0；`tauri build --bundles nsis` 产出 `CaseBoard_0.8.0_x64-setup.exe`（3,628,425 字节）；新增 `scripts/sign-installer.ps1`（纯 ASCII，`signtool sign /fd SHA256 /td SHA256 /tr … /sha1` + `verify /pa`，支持指定指纹与 `-SelfSignedTest` 演练）。本机无代码签名证书，签名链路就绪但安装包未签名（如实记录为偏离）。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **598 条全绿**（M8 新增 25：[45] 搜索 10 / [46] 脱敏 8 / [47] AI 审计 8）、`pnpm ui-smoke` **256 条全绿**（新增 22）、`pnpm build` CSS 74.06 kB（gzip 12.66）、主包 888.82 kB（gzip 301.79）、`tauri build --no-bundle` 3m11s、`run-selftest.cjs` 三轮 **PASS 17 / 18 / 7**（第 3 轮为保险库专用轮）。
- **文档**：`docs/MILESTONES.md` §0 新增成功指标达成情况表、§1 M8 置 ✅、§3 拆步表 + 验收记录 + 偏离表、§6 新增 D49–D52、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 H 节（v0.8.0 人工复验清单）。

## [未发布] v0.7.0 · M7 高级功能 + AI 生图

### M7 整体验收通过（2026-10-19，tag ms/M7）

- **多假设画布**（`src/lib/hypothesis.ts` + `src/commands/hypothesisCommands.ts` + `HypothesisPanel.tsx`）：同一证据可分别标支持/反驳，支持度按置信度加权、反驳 ×0.6 折算，-100..100 可复现；排行榜与并排比较表标出「分歧」证据。
- **六段证据链**（`src/lib/evidenceChain.ts`）：动机→预谋→准备→实施→逃离→销赃纵向排列，证据来源取相邻关系的 `evidenceIds` 与节点附件，自动标断点（missing）与弱证据（weak）。
- **区域锚点增强**（`src/lib/annotation.ts` 的 `annotationsForNode` 等 + `FreeImageNode` 的 `.cb-free-image__anchor`）：框选区域可绑定实体，悬停或选中实体时在图片中高亮对应框，点锚点跳到素材库。
- **OCR 结构化**（`src/lib/ocr.ts` + `src/services/ocr.ts` + Rust `ocr_available`/`ocr_image`）：全角归一化后抽金额/时间/账号/对方户名，四个字段全部可人工改写；右栏可一键「写入素材」或「生成证据卡」；引擎缺失时给出 Tesseract 安装指引。
- **AI 生图**（`src/lib/aiImage.ts` + `src/services/aiImage.ts` + `AiImagePanel.tsx`）：四预设（模拟画像/场景复原/物品示意/图像增强），三通道（内置程序化绘制默认、ComfyUI、OpenAI 兼容图像接口）；七类换脸/伪造红线在输入时即拒绝并解释；角标写进像素（顶部窄带 + 右下角）且界面无移除开关；`aiMeta` 记全提示词/负向/模型/种子/参数/时间；落素材库 `zone:'ai'` 分区，画布上虚线边框；`updateNode` 命令层拦截「AI 图改已证实」。
- **离线示意地图**（`src/lib/map.ts` + `MapView.tsx`）：按右栏「经纬度」字段相对摆放实体，不请求任何瓦片，常驻「未加载瓦片」声明。
- **验收**：`pnpm typecheck` 0 error、`pnpm smoke` **573 条全绿**（M7 新增 61：[42] 23 / [43] 31 / [44] 7）、`pnpm ui-smoke` **234 条全绿**（新增 41）、`pnpm build` 834 modules、`tauri build --no-bundle` 2m46s、`run-selftest.cjs` 两轮 **PASS 17 / 18**（新增 AI 模拟图角标像素复核与 OCR 字段抽取）。
- **文档**：`docs/MILESTONES.md` §1 M7 置 ✅、§3 拆步表 + 验收记录 + 偏离表（ComfyUI/PaddleOCR 未安装、图生图与生成日志延期、地图无瓦片）、§6 新增 D45–D48、§7 一行；`docs/MANUAL-ACCEPTANCE.md` 新增 G 节；版本三处升 0.7.0。
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
