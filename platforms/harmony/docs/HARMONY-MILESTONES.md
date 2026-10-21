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

