# release/

本目录放**可直接交付的安装包**（构建产物，随里程碑一起提交，便于拿到仓库就能装）。

| 文件 | 版本 | 大小 | SHA-256 | 签名 |
|---|---|---|---|---|
| `CaseBoard_0.13.0_x64-setup.exe` | 0.13.0（M13） | 12,192,983 字节 | `D7DD6C6EA53236C72282AAA58D759B2C63093D68B774378A29605E5DAA408E5E` | 未签名 |
| `CaseBoard_0.12.0_x64-setup.exe` | 0.12.0（M12） | 12,193,338 字节 | `96E1F35F8843E6AC1E41C7F4F5C7AB2CE0AFD5F59D5E346464F1655BDE6683B9` | 未签名 |
| `CaseBoard_0.11.0_x64-setup.exe` | 0.11.0（M11） | 12,190,409 字节 | `7350B90391F085A0223E149A1C80ED577786794B52121B9BC600301B897B43DD` | 未签名 |
| `CaseBoard_0.10.0_x64-setup.exe` | 0.10.0（M10） | 12,185,556 字节 | `9B3D7DBD9AE9CECBF6770CE07FCF8B73F8DB33EF4B8F14B342A67C4B6E9FEC92` | 未签名 |
| `CaseBoard_0.9.0_x64-setup.exe` | 0.9.0（M9） | 3,614,153 字节 | `B7ADBC7D04E615E42234B13AB541E3951FDCD6BBD9A60C15EDBEA5AD487751C9` | 未签名 |

M13 的 0.13.0 与 0.12.0 体积几乎一致（少 355 字节：改地点断线与控件对齐都只是逻辑与样式）。M12 的 0.12.0 与 0.11.0 基本一致（多 2.9 KB）。M11 的 0.11.0 与 0.10.0 也基本一致（多 4.8 KB）。`0.10.0` 比 `0.9.0` 大约 8.6 MB：M10 把 OCR 引擎（`tesseract.js` WASM worker + 三档 SIMD 内核 + 中英文语言包，源目录 `public/ocr` 约 15.7 MB）内嵌进了安装包，换来「干净机不装任何东西也能离线识别文字」。安装包内的资源是压缩后的体积，所以只涨 8.6 MB。

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
powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1 -Installer release\CaseBoard_0.13.0_x64-setup.exe
```

`-SelfSignedTest` 只用于演练签名流程（自签证书不能消除 SmartScreen 提示）。

## 数据位置

安装后用户数据在 `%APPDATA%\app.caseboard.desktop`（普通 `caseboard.db` + `assets\`）。
M9 起应用内不再提供解锁与整库加密，数据保护依赖系统账户权限与 BitLocker。
