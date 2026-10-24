# 鸿蒙应用市场上架操作手册（CaseBoard）

> 适用对象：本案情板鸿蒙版（`bundleName = com.caseboard.harmony`）。
> 官方一手依据：[发布应用](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-publish-app)、[在应用市场分发](https://developer.huawei.com/consumer/cn/appgallery/devstart/)、[应用审核 Checklist](https://developer.huawei.com/consumer/cn/doc/doccenter-submission/50170)、[HarmonyOS 应用备案指导](https://developer.huawei.com/consumer/cn/doc/doccenter-dev-faq/appgallery-kit-faq-0003)、[软件包解析错误说明](https://developer.huawei.com/consumer/cn/doc/app/agc-help-harmonyoserror-0000001651912985)。
> 注：华为文档站正文由 JS 渲染，命令行抓不到正文；本文的操作路径按官方「发布应用」流程整理，若与 AGC 页面实际文案不一致，以页面为准。

---

## 0. 上架前必须先满足的六件事

| # | 事项 | 本项目现状 | 要做什么 |
|---|---|---|---|
| 1 | 华为开发者账号 + 实名认证 | 有（能装包调试说明已登录） | 确认已完成**企业/个人实名** |
| 2 | **APP 备案**（工信部，境内分发强制） | ❌ 无 | 在 AGC 走「应用备案」流程，拿到备案号后再提审 |
| 3 | 隐私政策（可公开访问的 URL） | ❌ 无 | 写一页隐私政策，托管到任意 HTTPS 地址 |
| 4 | 应用版权/资质 | ❌ 无 | 一般工具类需软著或版权承诺；按 AGC 表单提示上传 |
| 5 | 正式发布证书 + 发布 Profile | ❌ 只有调试签名 | 见下文第 2–5 步 |
| 6 | 兼容版本覆盖 | ⚠️ `compatibleSdkVersion = 26.0.0` | 见「第 7 节 上架前建议」 |

---

## 1. AGC 建项目、建应用

1. 登录 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html#/)。
2. 「我的项目」→「添加项目」→ 填项目名（如 `CaseBoard`）→ 创建（分析服务可跳过）。
3. 进入项目 → 「添加应用」：
   - 平台选 **APP（HarmonyOS）**
   - **应用包名必须逐字等于 `com.caseboard.harmony`**（取自 `AppScope/app.json5`）
   - 是否元服务：**否**
4. 记下 AGC 里的 **APP ID**（后面申请权限/备案会用到）。

## 2. 生成密钥库与 CSR

DevEco Studio：`Build > Generate Key and CSR`

- `Key Store File`：新建 `.p12`（**永久保存**，丢了只能废除证书重来）
- 密码：**≥8 位且含大小写/数字/符号中至少两类**
- `Alias`：如 `caseboard_release`（**记住**）
- 有效期：建议 **25 年以上**
- 证书信息：Name / Organization / City / Province / Country Code（两位大写，如 `CN`）
- 输出 `.csr`

## 3. 申请发布证书（AGC）

「用户与访问」→「证书管理」→「新增证书」

- 类型：**发布证书**
- 上传第 2 步的 `.csr`
- 下载得到的 **`.cer`**

> 一个 AGC 账号**只能有一个有效发布证书**；废除会让用它签的所有 Profile 失效。

## 4. 申请发布 Profile（AGC）

「我的项目」→ 项目 → 应用 → 「HarmonyOS 应用 > HAP Provision Profile 管理」→「添加」

- 名称：`CaseBoard_release_v1`
- 类型：**发布**
- 选择证书：第 3 步的发布证书
- 申请权限：**按 `entry/src/main/module.json5` 里实际声明的权限勾选**。本项目当前**未声明任何权限**（纯本地、不联网），应保持为空；将来若启用云端 AI，需补 `ohos.permission.INTERNET` 并在此一并勾选。
- 提交后下载 **`.p7b`**

## 5. DevEco 配置签名

`File > Project Structure > Project > Signing Configs`：

| 字段 | 值 |
|---|---|
| Store File | 第 2 步的 `.p12` |
| Store Password | 密钥库密码 |
| Key alias | 第 2 步的别名 |
| Key password | 同上（未单独设置时） |
| Sign alg | `SHA256withECDSA` |
| Profile file | 第 4 步的 `.p7b` |
| Certpath file | 第 3 步的 `.cer` |

> 仓库里的 `build-profile.json5` 的 `signingConfigs` 是空数组（签名只存在构建现场 `F:\dsh-project\harmony`），这是故意的——签名材料不进 git。

## 6. 打包要上架的 `.app`

商场上架要 **`.app`**，不是我们 CI 出的 `.hap`：

- IDE：`Build > Build App(s)`
- 命令行（在 `F:\dsh-project\harmony`）：
  ```powershell
  $env:NODE_HOME = "D:\DevEco Studio\tools\node"
  $env:DEVECO_SDK_HOME = "D:\DevEco Studio\sdk"
  & "D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat" assembleApp --mode project -p product=default -p buildMode=release --no-daemon
  ```
  产物：`entry/build/outputs/default/*.app`（本次已验证 `assembleApp` / `SignApp` 任务存在）

`AppScope/app.json5` 里 `versionCode`/`versionName` 每次提审必须**递增**（当前 `1000000 / 1.0.0`）。

## 7. 提交审核（AGC）

「我的应用」→「HarmonyOS」→ 选应用：

1. **应用信息**：中文名、简介、详细描述、分类（建议「效率」）、年龄分级、图标（512×512 PNG）、截图（建议平板 16:10，至少 3 张）、隐私政策 URL、备案号。
2. **版本信息**：选发布国家/地区 → 上传 `.app` → 填版本号与更新说明 → 按提示上传资质。
3. 「提交审核」→ 状态在「我的应用」查看；审核通常 1–3 个工作日。

## 8. 上架前的技术建议（本项目特有的坑）

1. **`compatibleSdkVersion: "26.0.0"` 会让应用只能装在 HarmonyOS 6 及以上**，覆盖面极小。上架前建议降到实际用到的 API（先试 `21` 或 `18`，验证 ArkWeb 自定义 scheme、`onShowFileSelector`、`relationalStore` 是否仍可用），再全量跑 `accept-h5.ps1`。
2. **签好后必须再验一次**：release 包（不是 debug 包）装到真机上跑一遍导入、缩略图、钉集、导出；debug 签名行为不同（尤其 `caseboard://` scheme 与文件选择器）。
3. **首次启动隐私合规**：华为审核重点核对「未同意隐私政策前不收集信息」。本项目全本地、无账号，仍需首启一个隐私概要弹窗（明确「数据仅存本机」）。
4. **材料齐全**：图标、截图、隐私政策 URL、备案号四件套缺一不可，否则会被打回。
5. 上传报 **「非法软件包 / Profile 文件非法 / 证书不匹配」** 时，按官方 [解析错误说明](https://developer.huawei.com/consumer/cn/doc/app/agc-help-harmonyoserror-0000001651912985) 对照：几乎都是「证书 ↔ Profile ↔ 包名」三者不一致。

---

# 项目介绍（可直接填 AGC 表单）

## 一句话（≤40 字，用于副标题/搜索摘要）

把案情画成一张图：人物、关系、证据、时间线在一个本地画布上对齐。

## 应用简介（AGC「应用简介」，约 100 字）

案情板 CaseBoard 是一款面向办案人员与案件分析者的可视化梳理工具。它把人物、组织、地点、物品、事件、证据变成可自由摆放的卡片，用实线/虚线/点线区分「已证实 / 推测 / 待核实」，支持总览画布、代码视图、时间线、地图与演示五种视角，所有数据只存本机、离线可用。

## 详细描述（AGC「应用描述」，约 400 字）

**两种视图，同一份案情**
图形视图拖动卡片梳理关系，代码视图用结构化文本（DSL）批量改写；两边读写同一个文档，不会出现两份数据。

**关系线即结论强度**
实线＝已证实，虚线＝推测，点线＝待核实。图标常驻，不提供「关掉线型」的开关——这是产品对证据严肃性的硬约束。

**集中钉子与钉集**
一张图里材料太多时，用集中钉子把多张图片钉成一集：拖钉子带动整集，集内可调顺序与旋转，对外永远浮在其它内容之上。两颗钉子之间还能拉一条红线，表示「这两堆材料一起看」。

**素材、标注与导出**
图片进库自动生成缩略图，可打码、加标注、吸附到卡片。支持导出 PNG / SVG / PDF / Word。

**多视角复用同一份数据**
时间线按日期自动排布、地图按经纬度落点、演示模式按序讲解，不用重录一遍。

**本地优先**
没有账号、不联网也能用；数据保存在设备本地数据库，导出与备份由你掌握。所有 AI 能力默认关闭，开启前会明确提示数据将离开本机。

## 关键词（AGC 关键词，逗号分隔）

案情梳理,关系图,办案,证据管理,时间线,案件分析,可视化,离线

## 截图建议（至少 3 张）

1. 演示案卷总览（能看到卡片、线型图例、左右栏）
2. 集中钉子 + 钉集 + 红线
3. 代码视图（DSL）与图形视图对照
4. 时间线 / 地图

## 版本更新说明（首次提审）

首发版本：图形/代码双视图、集中钉子与钉集、红线、素材与标注、时间线/地图/演示、导出 PNG/SVG/PDF/Word，全本地存储。
