# H1 · 平板形态适配

目标：让同一套前端在平板（MatePad Pro 13，1440×893 CSS px、dpr=2）上可用——不是「能显示」，而是手指点得到、窄档不挤爆。桌面版功能一行不减，八条硬约束一条不动。

> **产品决策（H1 定性）：本产品只支持横屏，不做竖屏适配。**
> 案情板是横向信息密度工具：画布要宽、时间线要长、左右栏各占一列。竖屏下无论怎么折叠都只剩一条窄缝，
> 做了也只是把「勉强能用」伪装成「适配完成」。所以平台侧强制横屏
> （`module.json5 → abilities[0].orientation: "landscape"`），前端再兜一层提示层，见 §七。
> `medium` / `compact` 两档保留下来只服务 **2in1 小窗与分屏**，不再为竖屏优化。

## 一、分档模型

| 档 | 视口宽度 | 左栏 | 右栏 | 顶栏 |
| --- | --- | --- | --- | --- |
| `wide` | ≥ 1180 | 常驻 | 常驻 | 全量 |
| `medium` | 900–1179 | 常驻 | 抽屉（贴右，带遮罩） | 收紧 gap，隐藏案件编号 |
| `compact` | < 900 | 抽屉（贴左） | 抽屉（贴右） | 同上 |

- 纯逻辑在 `web/src/lib/viewport.ts`（`classifyViewport` / `defaultPanelState` / `panelIsDrawer` / `shouldResetPanels`），可被 jsdom 单测直接断言；组件里只做「读宽度 → 调用 → 落状态」。
- 平板横屏实测 1440 落在 `wide`，因此 H1 在平板上的主要收益是**触控尺寸**而不是抽屉；抽屉是为竖屏与手机档准备的（phase 3 用 1000vp 视口实测过）。
- **只在变窄时收起侧栏**：`shouldResetPanels` 看档位序号，宽→窄才收起，窄→宽不自动弹开（用户收起过的栏不该被强行打开）。

## 二、触控尺寸

统一开关是 `<html data-input="touch">`，由 `web/src/main.tsx` 在 `bootTheme()` 之后设置：

```ts
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const touch = coarsePointer || navigator.maxTouchPoints > 0;
if (touch) document.documentElement.dataset.input = 'touch';
```

> **实测坑**：平板 ArkWeb 的 `navigator.maxTouchPoints === 0` 而 `matchMedia('(pointer: coarse)') === true`。只判断前者会让整套触控样式静默失效（第一版就是这样，`small=16`）。必须「或」。

`web/src/styles/responsive.css`（在 `index.css` **之后**加载，只做增量覆盖，避免改动 5367 行大文件）覆盖三个设计令牌：

| 令牌 | 桌面 | 触控 |
| --- | --- | --- |
| `--cb-control-h` | 28px | 40px |
| `--cb-control-h-sm` | 22px | 36px |
| `--cb-control-pad` | 8px | 12px |

配套：顶栏 52→56、左右折叠条 16→36px、视图页签 `min-height: 36px`、画布缩放控件 26→40px、分组折叠/计数按钮补 `min-height: 26px`、图例钮 `min-height: 36px`；触屏上撤掉 hover 变色（`:hover` 在触屏会粘住）。

## 三、顶栏在 1440 的取舍

`max-width: 1560px` 收紧顶栏 gap 与案件名宽度（`max-width: 18ch`）；`max-width: 1280px` 隐藏案件编号（右栏「案件概览」里仍有）。既有 `planTopbarOverflow`（`web/src/lib/topbarOverflow.ts`）会把低优先级按钮收进「⋯」。

**已知遗留**：触控放大后，顶栏「主题·默认」按钮在 1440 会被左边缘裁掉约 1/3（实测 `theme left=226` vs 其父容器 `left=596`）。根因是 `.cb-topbar__io` 用 `justify-content: flex-end`，内容溢出时向左跑，而 `scrollWidth` 只统计右侧溢出，所以既有溢出算法认为「没超」，不把按钮收进「⋯」。修法是把 撤销/重做/主题/背景/搜索 这五个**手工渲染**的控件并入 `actions` 列表，让溢出算法统一收容——属顶栏改造，排到 H2/H3，不在 H1 硬塞。

## 四、上机验证

```powershell
$env:NODE_HOME = "D:\DevEco Studio\tools\node"; $env:DEVECO_SDK_HOME = "D:\DevEco Studio\sdk"
$env:PATH = "$env:NODE_HOME;$env:PATH"
hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon
hdc install -r entry\build\default\outputs\default\entry-default-unsigned.hap
# 横屏全宽
hdc shell aa start -a EntryAbility -b com.caseboard.harmony --ps caseboardSelftest 1
# 窄档（Web 组件真实收到 1000vp）
hdc shell aa start -a EntryAbility -b com.caseboard.harmony --ps caseboardSelftest 3
```

探针输出（`hilog` 里 `A0c0de/CaseBoard`）：

```
[input]    maxTouchPoints=0 dataInput=touch coarse=true
[layout]   tier=wide scroll=1440/1440 buttons=43 small=0 canvasMarks=2 min=21x12
[narrow]   inner=1000 tier=medium scrim=true rightPanel=true rightW=312 rightEdge=1000
```

`small` 是「命中方块小于 36×36 的可见控件」计数（画布内被 React Flow 缩放的节点内部件按 `closest('.react-flow__node')` 排除，单列 `canvasMarks`）。收敛过程 16 → 12 → 5 → 0。

一键验收：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h1.ps1
```

13 条检查（H1-1…H1-13）全绿，报告 `.tmp-esbuild/accept-h1.json`，实测 `3,894,128B` HAP、`consoleError=0`、`webError=0`。

## 五、窄档怎么测的

模拟器没有 `rotate` 子命令，`hdc` 也改不了朝向。所以用 ArkUI 侧改视口：`Index.ets` 的 `Web(...)` 按 `selftestPhase` 给不同尺寸，页面侧 `window.innerWidth/innerHeight` 就真实变化，`@media` 全部照常生效：

| phase | Web 尺寸 | 页面视口 | 用来验 |
| --- | --- | --- | --- |
| 1 / 2 | `100%` | 1440×893 | 横屏全宽 |
| 3 | `1000vp` × `100%` | 1000×893 | 窄档右栏抽屉 |
| 4 | `700vp` × `100%` | 700×893 | 竖屏 / 小窗提示层 |

这条手法以后测任何响应式断点都能复用。

## 六、上机环境（模拟器会被后台任务连带杀掉）

Emulator 用**后台任务**启动时，任务一收尾进程就被带走。要用脱离式启动：

```powershell
$argstr = '-start "MatePad Pro 13" -instancePath "C:/Users/SIGHS/AppData/Local/Huawei/Emulator/deployed" -imageRoot "C:\Users\SIGHS\AppData\Local\Huawei\Sdk"'
Start-Process -FilePath 'D:\DevEco Studio\tools\emulator\Emulator.exe' -ArgumentList $argstr -WindowStyle Minimized
```

两个坑：① `-ArgumentList` 传**单个字符串**，传数组会按空格拆参、报 `Invalid command: please attach - or -- before the option!`；
② 许可协议会隔一段时间重置，启动前若日志出现 `Please agree to the agreement first.`，先跑 `Emulator.exe -license accept`。

## 七、只做横屏：平台锁 + 前端兜底

- **平台侧**：`entry/src/main/module.json5` 的 `abilities[0].orientation` 设为 `"landscape"`，手机/平板固定横屏。
- **前端侧**：`web/src/lib/viewport.ts` 的 `shouldGateLayout(width, height)` —— `height > width`（竖屏）或 `width < USABLE_MIN_WIDTH (900)`（2in1 拖成小窗、分屏、折叠屏半折）时，
  `App.tsx` 渲染 `web/src/components/OrientationGate.tsx` 盖住整个视口：

  ```
  _(:з」∠)_
  请横屏使用
  案情板要横向铺开才看得清：画布要宽、时间线要长、左右栏各占一列。
  把平板横过来就好，案件数据不会丢。
  ─────────────
  当前 700×893，是竖屏
  ```

  几点实现约定：遮挡层**不透明**且 `z-index: 9000`；**底下界面不卸载**（保住 React Flow 的视口状态，转回横屏立刻恢复）；文案用简体中文，颜文字取证据红 `#C0392B`，不引入任何新色板。
- 判定是纯函数，`shouldGateLayout` 可被 jsdom 直接断言，不依赖运行时截图。

## 八、未做

- 触控手势层（双指缩放、长按菜单、拖拽惯性）：`@xyflow/react` 自带 pinch，长按菜单仍需自定义，排 H3。
- 竖屏：**已决策不做**（见文档开头与 §七）。
- 键盘快捷键（Ctrl+K、Delete 等）：平板外接键盘未测。
- 顶栏「主题·默认」在 1440 被左边缘裁切（§三），修法已记录，排 H2/H3。
