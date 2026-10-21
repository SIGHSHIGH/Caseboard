# H3 · 触控手势层

目标：让画布像平板该有的样子——长按出菜单、双指缩放、单指拖动带惯性。
原则：**能在 ArkWeb 里接住的就不写原生**，只在确实缺手感的地方补一层。

## 一、结论先放这里

| 能力 | 谁实现的 | 要不要改代码 |
| --- | --- | --- |
| 长按出上下文菜单 | ArkWeb 把长按映射成 `contextmenu`，桌面版 M17 的 `onPaneContextMenu` / `onNodeContextMenu` 直接接住 | **不用改**，只补了验收 |
| 双指缩放 | d3-zoom（React Flow 内置）在 ArkWeb 下正常 | **不用改**，只补了验收 |
| 单指拖动平移 | `panOnDrag={[1, 2]}` 在触屏上照样生效 | **不用改** |
| 拖拽惯性 | 前端自己算，React Flow 没有 | **新增**（`web/src/components/flow/Board.tsx`） |

一句话：H3 只真正写了一件事——惯性；其余两件是「验明本来就通」，把它们钉进验收，防止以后回归。

## 二、惯性怎么实现的

`web/src/components/flow/Board.tsx`，挂在 `<ReactFlow>` 的 `onMoveStart` / `onMove` / `onMoveEnd` 上。

- **只给触控**：`document.documentElement.dataset.input !== 'touch'` 直接返回，鼠标手感保持桌面版原样（鼠标松手还在飘是不能接受的）。
- **速度取最近 120ms**：整段拖拽的平均速度会把末速算低，甩不起来。
- **上限 3.2 px/ms**：超快多数是拖拽抖动或误触，压住上限，别让整块画布飞出去。
- **下限 0.12 px/ms**：慢慢挪一下不该起飞。
- **衰减用指数积分**：`位移 = v · τ · (1 − e^(−Δt/τ))`，τ = 190ms。这样帧率高低不影响滑行距离——按帧乘衰减系数在掉帧时会滑得明显变短。
- **必须能区分「用户划的」和「我们自己推的」**：惯性靠 `setViewport` 驱动，而 `setViewport` 又会回调 `onMove`。用 `appliedRef` 记住上一帧推到的位置，位置对得上（< 0.6px）就跳过采样，否则第一帧就把自己停掉。

## 三、验收（都是机器可判的）

`scripts/accept-h1.ps1` 里三条，报告落 `.tmp-esbuild/accept-h1.json`：

- **H1-19 双指缩放**：探针 `phase=5` 在 `.react-flow__pane` 上合成两指 `TouchEvent`（60px → 180px），断言 `transform` 里的 zoom 变大。
- **H1-20 拖拽惯性**：探针 `phase=6` 合成单指快划（每 16ms 40px，共 5 步），松手后读三次 `transform`，断言 `coasted=true`（松手后还在动）且 `stopped=true`（会自己停）。
- **H1-21 长按菜单**：**用真机手势** `uitest uiInput longClick` 长按一张实体卡片，断言页面上出现 `.cb-ctxmenu` 且条目里含「新建关系气泡并连到此实体」。

三个坑，都是踩出来的：

1. **uitest 没有 pinch**。`uitest uiInput` 只有 `click / doubleClick / longClick / swipe / drag / fling / dircFling / keyEvent / inputText / text`，多指手势只能靠 `runJavaScript` 合成 `TouchEvent`。
2. **长按坐标不能写死**。视图平移会持久化，两次启动的节点位置未必一样。做法：探针先把 `.react-flow__node` 的屏幕矩形打出来（`[rect]`），脚本挑第一个宽度 ≤ 140 的实体卡片（第一个往往是分组矩形，长按它的空白处不弹节点菜单），中心点 ×dpr 换成物理像素再长按。
3. **长按会被「AI 生图」对话框挡掉**。顶栏验收那段探针会真点「生图」按钮验证菜单项可点，对话框盖住画布后长按就落在遮罩上。修法：那段点击只在 `phase=1/3` 跑，长按用不点东西的 `phase=8`。

另外两条环境噪音（不是 bug）：

- 平板 ArkWeb 报 `(pointer: coarse)=true` 但 `maxTouchPoints=0`，触控形态判定必须两个信号「或」。
- 长按文字会弹系统文本选择工具条（复制/全选/翻译/搜索）。画布里没有可选文字，只在提示层卡片上会遇到，属预期。

## 四、没做 / 留到后面

- **惯性没有阻尼边界**：画布可以一直滑到看不见节点的地方（桌面版也没有边界限制）。要加「滑出多远自动回弹」需要知道画布内容的包围盒，属于交互策略而不是手感，等真机试用反馈再定。
- **双指缩放没有手写补偿**：完全交给 d3-zoom，缩放中心是两指中点，符合直觉，但没有做「缩放到某个倍率时自动吸附」这类增强。
- **长按时长没调**：用的是浏览器默认的 long-press 阈值（约 500ms），没有拦截 `contextmenu` 自己计时。若真机上觉得「要按好久」，再在 `Board.tsx` 里加 `touchstart` 计时器替代。
