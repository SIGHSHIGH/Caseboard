# 发布产物（RELEASES）

> 面向维护者：安装包是**构建产物**，不随仓库分发。
> 本地构建完成后放在仓库根目录的 release\（已加入 .gitignore），
> 需要对外分发时请走 GitHub Releases 或另行提供下载地址。

## 历史安装包（本机归档）

下表是本项目在本机构建过的安装包记录，便于回溯版本与校验。
安装包本身不入库，release\ 目录只在本地保留。

| 文件 | 版本 | 大小 | SHA-256 | 签名 |
|---|---|---|---|---|
| `CaseBoard_1.0.0-beta.1_x64-setup.exe` | 1.0.0-beta.1（Beta 1.0） | 12,210,066 字节 | `892A3146050025170424DF3B0E60208EA4E7D34A3AFC0915FF7BE9C1A859DB41` | 未签名 |
| `CaseBoard_0.18.1_x64-setup.exe` | 0.18.1（M18 复验 R7） | 12,211,004 字节 | `5A76D7A91839211080E68C394E89A9DE70A196124F82525D9C51E84A79FCAE5B` | 未签名 |
| `CaseBoard_0.18.0_x64-setup.exe` | 0.18.0（M18） | 12,209,827 字节 | `25A65D5E788981B69BA98770112A61E0689D8D2FEE151A81D01991334F7C2338` | 未签名 |
| `CaseBoard_0.17.0_x64-setup.exe` | 0.17.0（M17） | 12,205,592 字节 | `8E9AB2D542BF65DE5358DE3E21AF74816B436D388E778873AEEB59C5679EF9C7` | 未签名 |
| `CaseBoard_0.16.0_x64-setup.exe` | 0.16.0（M16） | 12,205,174 字节 | `8CA1BB3870054F79CAFA518F57E0D9E658266E590E0E0E2BBDC6FA3F7849DC74` | 未签名 |
| `CaseBoard_0.15.0_x64-setup.exe` | 0.15.0（M15） | 12,197,737 字节 | `F4E710FF8CDC4884B26EEF590A777BE93313D1A06B25E425FD5BBAF0712A9BB5` | 未签名 |
| `CaseBoard_0.14.0_x64-setup.exe` | 0.14.0（M14） | 12,195,548 字节 | `63C946010C092490CD6CAC5E18D6C5EECCCD9F964C90151A7FC7F3E56275869F` | 未签名 |
| `CaseBoard_0.13.0_x64-setup.exe` | 0.13.0（M13） | 12,192,983 字节 | `D7DD6C6EA53236C72282AAA58D759B2C63093D68B774378A29605E5DAA408E5E` | 未签名 |
| `CaseBoard_0.12.0_x64-setup.exe` | 0.12.0（M12） | 12,193,338 字节 | `96E1F35F8843E6AC1E41C7F4F5C7AB2CE0AFD5F59D5E346464F1655BDE6683B9` | 未签名 |
| `CaseBoard_0.11.0_x64-setup.exe` | 0.11.0（M11） | 12,190,409 字节 | `7350B90391F085A0223E149A1C80ED577786794B52121B9BC600301B897B43DD` | 未签名 |
| `CaseBoard_0.10.0_x64-setup.exe` | 0.10.0（M10） | 12,185,556 字节 | `9B3D7DBD9AE9CECBF6770CE07FCF8B73F8DB33EF4B8F14B342A67C4B6E9FEC92` | 未签名 |
| `CaseBoard_0.9.0_x64-setup.exe` | 0.9.0（M9） | 3,614,153 字节 | `B7ADBC7D04E615E42234B13AB541E3951FDCD6BBD9A60C15EDBEA5AD487751C9` | 未签名 |

Beta 1.0 的 1.0.0-beta.1 与 0.18.1 体积几乎一致（少 938 字节，只改了版本号）。0.18.1 与 0.18.0 体积几乎一致（多 1,177 字节：只改了折线包围盒预筛与命中判定范围，逻辑几乎没加）。M18 的 0.18.0 与 0.17.0 体积几乎一致（多 4,235 字节：关系线自动梳理、锚点挑选与曲率优化都是逻辑改动，DSL 只多两行序列化）。M17 的 0.17.0 与 0.16.0 体积几乎一致（多 418 字节：关系气泡、线宽与锚点代价模型都是逻辑改动，仓库卫生只动了文档）。M16 的 0.16.0 与 0.15.0 体积几乎一致（多 7,437 字节：许可文件与示范案卷数据不进安装包，涨的是自动检验与示例面板的代码）。M15 的 0.15.0 与 0.14.0 体积几乎一致（多 2,189 字节：顶栏改 portal 与实测重排、背景图改走原件地址，都是逻辑改动）。M14 的 0.14.0 与 0.13.0 体积几乎一致（多 2,565 字节：画布底衬与顶栏折叠都是样式与纯函数逻辑）。M13 的 0.13.0 与 0.12.0 体积几乎一致（少 355 字节：改地点断线与控件对齐都只是逻辑与样式）。M12 的 0.12.0 与 0.11.0 基本一致（多 2.9 KB）。M11 的 0.11.0 与 0.10.0 也基本一致（多 4.8 KB）。`0.10.0` 比 `0.9.0` 大约 8.6 MB：M10 把 OCR 引擎（`tesseract.js` WASM worker + 三档 SIMD 内核 + 中英文语言包，源目录 `public/ocr` 约 15.7 MB）内嵌进了安装包，换来「干净机不装任何东西也能离线识别文字」。安装包内的资源是压缩后的体积，所以只涨 8.6 MB。

## 重新产出

```powershell
Get-Process caseboard -ErrorAction SilentlyContinue | Stop-Process -Force
$env:TMP = "$PWD\.tmp-esbuild"; $env:TEMP = $env:TMP
$env:CARGO_HOME = "$PWD\.rust\cargo"; $env:RUSTUP_HOME = "$PWD\.rust\rustup"
$env:PATH = "$PWD\.rust\cargo\bin;" + $env:PATH
node scripts/tauri-cli.cjs build --bundles nsis
```

产物在 `src-tauri\target\release\bundle\nsis\CaseBoard_<version>_x64-setup.exe`，复制到本目录即可。
体积变化时以实际文件为准，请同步更新上表（`Get-FileHash <file> -Algorithm SHA256`）。

## 签名

本机 `Cert:\CurrentUser\My` 没有代码签名证书，当前安装包**未签名**，Windows 可能提示「未知发布者」。
拿到证书后：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1 -Installer release\CaseBoard_0.16.0_x64-setup.exe
```

`-SelfSignedTest` 只用于演练签名流程（自签证书不能消除 SmartScreen 提示）。

## 数据位置

安装后用户数据在 `%APPDATA%\app.caseboard.desktop`（普通 `caseboard.db` + `assets\`）。
M9 起应用内不再提供解锁与整库加密，数据保护依赖系统账户权限与 BitLocker。
