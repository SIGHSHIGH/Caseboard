# H0 验收记录 · 案情板 CaseBoard 鸿蒙移植

> 结论先行：**H0 八条验收全部 PASS**，一条命令可复现：
> `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h0.ps1`
> 报告落 `.tmp-esbuild/accept-h0.json`；全部通过时 exit 0。

## 1. 环境

| 项 | 值 |
| --- | --- |
| DevEco Studio | 26.0.0.851（`D:\DevEco Studio`） |
| SDK | API 26 / `26.0.0.105` / platformVersion `26.0.0`（HarmonyOS 26.0.0 Release） |
| compatibleSdkVersion | **`"26.0.0"`**（不带 `(26)` 后缀，见 §5 坑 2） |
| 运行目标 | 模拟器 `MatePad Pro 13`（tablet / x86_64 / 2880×1920 / API 26），`hdc` 见 `127.0.0.1:5555` |
| 签名 | **未签名 HAP 可直接安装**，模拟器不校验签名，无需华为账号自动签名 |
| 构建工具链 | `hvigorw.bat` + `NODE_HOME=D:\DevEco Studio\tools\node` + `DEVECO_SDK_HOME=D:\DevEco Studio\sdk` |

模拟器启动（Windows 需先开 Hyper-V / WHPX，否则 `-start` 静默失败）：

```
Emulator.exe -start "MatePad Pro 13" ^
  -instancePath "C:/Users/<user>/AppData/Local/Huawei/Emulator/deployed" ^
  -imageRoot "C:\Users\<user>\AppData\Local\Huawei\Sdk"
```

`-instancePath` 要传 **deployed 父目录**，不是实例目录。

## 2. 架构落点

```
entry/src/main/ets/
  entryability/EntryAbility.ets   onCreate：AppContext.setContext + registerAppScheme
  pages/Index.ets                 Web({src:'caseboard://rawfile/index.html'})
                                  .onControllerAttached → setWebSchemeHandler
                                  .javaScriptProxy({name:'__CASEBOARD_NATIVE__', asyncMethodList})
  bridge/RawfileScheme.ets        caseboard:// → $rawfile 的自定义 scheme 处理器
  bridge/CaseBoardBridge.ets      25 个方法的原生桥（回调式，见 §3）
  service/{Platform,Db,File,Clipboard,Ocr,Image}Service.ets
  common/{AppContext,Types}.ets
web/                              桌面 src/ 的镜像副本 + 三缝改造（桌面仓库零改动）
  src/services/harmony.ts         唯一触达原生桥的文件，回调式 → Promise
  src/services/db/harmony.ts      SqlDriver 的鸿蒙实现
  src/services/{platform,file,ocr}.ts  三路分发（harmony / tauri / web）
  vite.config.ts                  base:'./'，outDir 直指 rawfile
  scripts/postbuild-rawfile.mjs   断言相对路径 + 剥 crossorigin
```

### 为什么不用 `resource://` 或 `$rawfile()`

`resource://rawfile/` 是 **opaque origin（`null`）**，ArkWeb 对 `type="module"` 脚本做 CORS 校验，
直接 `ERR_FAILED`：

```
Access to script at 'resource://rawfile/assets/index-xxx.js' from origin 'null'
has been blocked by CORS policy: Cross origin requests are only supported for
protocol schemes: arkweb, arkweb-extension, chrome, chrome-extension,
chrome-untrusted, data, http, https.
```

Vite 产物必然是 ESM（还带 `new Worker(new URL(...), {type:'module'})`），所以官方文档里
"`resource://` 能加载页面"是对的，但装不下整个应用。改走 **自定义 scheme `caseboard://rawfile/`**：
`customizeSchemes` + `WebSchemeHandler`，响应头自带 `Access-Control-Allow-Origin: *`，module/Worker 全部放行。

## 3. 桥的调用契约（H0 最重要的一条结论）

**ArkWeb 的 `asyncMethodList` 不会把 ArkTS 的返回值送回 JS。** 实测：

| 页面侧写法 | 结果 |
| --- | --- |
| `B.ping()`（ArkTS 返回 `string`） | `typeof number`，值 `0`（受理码） |
| `B.pingPromise()`（ArkTS 返回 `Promise<string>`） | `typeof number`，值 `0` |
| `B.pingCb(fn)`（ArkTS 形参收 `(result:string)=>void`） | **`fn("pong-callback")` 被真正调用** |

因此 25 个方法统一改成「**参数表末位收一个 JS 回调**」：

```ts
// ArkTS 侧
ping(cb: (result: string) => void): void       { cb('{"ok":true,"value":"pong"}'); }
dbSelect(sql: string, params: string, cb: (result: string) => void): void { … }
```

```ts
// 页面侧（web/src/services/harmony.ts 把它包回 Promise）
callNative<T>(method, ...args)  // 内部：fn(...args, done)，done 解信封、超时 20s、ok=false 转中文错误
```

信封：成功 `{"ok":true,"value":<json>}`，失败 `{"ok":false,"error":"<中文>"}`。
失败也走回调——抛给 ArkWeb 只会让 JS 侧 Promise 永远悬着。

## 4. 三处平台缝的替换结果

| 缝 | 桌面实现 | 鸿蒙实现 |
| --- | --- | --- |
| `src/services/db/repo.ts:14` `SqlDriver` | `tauri-plugin-sql` | `web/src/services/db/harmony.ts` → `@ohos.data.relationalStore` |
| `src/services/platform.ts` | 16 个 `invoke` + `convertFileSrc` | 三路分发 → `callNative`；素材落 `<filesDir>/assets/<id>.<ext>`，URL 走 `file://` |
| `src/services/file.ts` | `@tauri-apps/plugin-dialog` | `DocumentViewPicker`（`save`/`select`） |

**FTS5 可用**：`relationalStore` 里 `CREATE VIRTUAL TABLE … USING fts5(...)` 建表成功，
`repo.ts:62` 的 `search_index MATCH ?` 检索链**不需要降级**。`DbService.applySchema()` 仍保留
try/catch 兜底（失败只打 warn 并置 `fts5Ready=false`），属于防御而非当前事实。

第四处缝外改动：`src/services/ocr.ts` 不再引 Tesseract（`ocrBuiltin.ts` 已从 `web/` 删除），
改走 `@hms.ai.ocr.textRecognition`（Core Vision Kit），`canIUse('SystemCapability.AI.OCR.TextRecognition')`
守卫，不可用时明确提示"改用手工录入"。省下桌面 `public/ocr/` 的 16MB。

## 5. 上机踩过的坑（按代价排序）

1. **`setWebSchemeHandler` 只能在 `.onControllerAttached()` 里调。** 放 `aboutToAppear` 会抛
   `17100001 The WebviewController must be associated with a Web component`，并被 AMS 以
   `Kill Reason:Js Error` **直接杀进程**（表现是"点了图标闪一下回桌面"）。
2. **`setMimeType` 只能给裸 MIME。** 传 `text/html; charset=utf-8` 会让 ArkWeb 把页面当
   `text/plain` 渲染出源码；字符集单独 `setEncoding('utf-8')`。
3. **`compatibleSdkVersion "26.0.0(26)"` 会构建失败**：`00308018 … api version parameter is illegal!`
   只要 `"26.0.0"`。
4. **`WebNetErrorList` 不在 `webview` 命名空间**，要从 `@kit.ArkWeb` 具名导入；成员是
   `ERR_FILE_NOT_FOUND = -6` 这种 `ERR_*`，不是 `NET_ERROR_*`。
5. **看 hilog 的正确姿势**：`hdc shell hilog -r` 清缓冲 → 启动 → `hdc shell "hilog -x"` 全量落文件 →
   再 `Select-String "/CaseBoard"`。**别用 `Select-Object -Last N`**，应用日志在 dump 头部，会被截掉。
6. **PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1 会乱码并语法报错**（`The string is missing the terminator`）。
   脚本必须存成 **UTF-8 with BOM**。
7. 用 `Set-Content` 回写 `.ts` 文件会破坏编码，之后 `read`/`write` 工具连环报 `invalid UTF-8 text`。
   改内容一律用编辑器工具；非用 PowerShell 时写
   `[System.IO.File]::WriteAllText($p,$text,(New-Object System.Text.UTF8Encoding($false)))`。

## 6. 八条验收标准（当前全 PASS）

| 编号 | 断言 | 实测值 |
| --- | --- | --- |
| A1 | `hvigorw assembleHap` 成功；HAP 含 `rawfile/index.html` 与 ≥1 个 `assets/*.js` | exit 0；`hasIndexHtml=true`，`packedJsCount=11` |
| A2 | `index.html` 无 `src="/`、无 `href="/`；有 `./assets/`；`assets/*.js` 无 `"/assets/` | 0 / 0 / 2 / 0 |
| A3 | HAP ≤ 8MB；rawfile 无 `ocr/`、`traineddata`、`tesseract-core-` | 3.7 MB；14 个文件；0 命中 |
| A4 | 构建输出无出自本项目的 `error:` | 0（`arkts_check` 的 6 条全在 SDK 自带 `@arkts.lang.d.ets`，属检查器误报） |
| B1 | 首屏渲染出顶栏与画布 | `uitest dumpLayout` 命中「画布」「节点类型」「案件概览」 |
| B2 | 控制台 0 error、无新 jscrash | `consoleErrorCount=0`，`webErrorCount=0`，`newJsCrash=0` |
| B3 | 桥通：`ping -> pong` 且 `platform=harmony` | 命中 |
| B4 | 自检：db / 文件 / rawfile / FTS5 | `db=true(1 row); fs=true; rawfile=true; fts5=true` |

自检入口：`hdc shell aa start -a EntryAbility -b com.caseboard.harmony --ps caseboardSelftest 1`
（`AppContext.selftestPhase` 非空时 `Index.onPageEnd` 才跑探针；普通启动完全无副作用）。

## 7. 遗留与 H1 入口

- 模拟器分辨率 2880×1920 下桌面布局是"能用"而非"好看"：顶栏按钮偏挤、右栏偏窄。
  H1 第一件事做 **平板形态适配**（断点 + 可折叠面板），不动数据层。
- `2in1` 不支持 `metaViewport`，窗口尺寸变化要靠 ArkUI 侧布局；`src/lib/coords.ts` 的世界↔屏幕
  换算需补一个"容器尺寸来源"（原生注入 vs `ResizeObserver`），这是 H2 画布性能的前置。
- 剪贴板：`ohos.permission.READ_PASTEBOARD` 是 `system_basic`，普通应用声明不了；
  `pasteText()` 保留调用并 catch 返回 `''`，需在 UI 上给出"请手动粘贴"的降级提示。
- `build-profile.json5` 未设 `targetSdkVersion`，hvigor 每次告警，H1 补上。
- `web/` 与桌面 `src/` 是**复制关系，不是共享**：桌面侧改动需要手动同步。H1 决定是
  改为 git submodule / 软链，还是干脆以 `web/` 为唯一真相、桌面版反向同步。
