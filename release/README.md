# release/

本目录放**可直接交付的安装包**（构建产物，随里程碑一起提交，便于拿到仓库就能装）。

| 文件 | 版本 | 大小 | SHA-256 | 签名 |
|---|---|---|---|---|
| `CaseBoard_0.9.0_x64-setup.exe` | 0.9.0（M9） | 3,614,153 字节 | `B7ADBC7D04E615E42234B13AB541E3951FDCD6BBD9A60C15EDBEA5AD487751C9` | 未签名 |

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
powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1 -Installer release\CaseBoard_0.9.0_x64-setup.exe
```

`-SelfSignedTest` 只用于演练签名流程（自签证书不能消除 SmartScreen 提示）。

## 数据位置

安装后用户数据在 `%APPDATA%\app.caseboard.desktop`（普通 `caseboard.db` + `assets\`）。
M9 起应用内不再提供解锁与整库加密，数据保护依赖系统账户权限与 BitLocker。
