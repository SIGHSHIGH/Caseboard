# _env.ps1 —— DevEco 工具链定位（accept-h0 / accept-h1 / build-web 共用）
#
# 为什么有这层：验收脚本最初把本机路径（D:\DevEco Studio、某个 pnpm.cjs 的绝对路径）
# 写死在脚本里，换一台机器就整体失效。这里统一收口，优先级：
#   显式参数  >  环境变量  >  常见安装位置  >  PATH
#
# 注意 1：本文件被 dot-source，不要在这里改 $ErrorActionPreference。
# 注意 2：**不要用 $HOME / $host / $input 等自动变量名**。Windows PowerShell 里 $HOME 只读，
#         写成 `$home = ...` 会抛 "Cannot overwrite variable HOME because it is read-only"，
#         而 dot-source 的错误不会中断脚本，只会让后面所有路径变成 $null，
#         症状是一连串 "BadExpression: The expression after '&' ... was not valid"。
#         所以这里统一用 $devEcoRoot / $nodeDir 这类名字。

function Resolve-DevEcoHome {
  param([string]$Override)
  if ($Override -and (Test-Path $Override)) { return (Resolve-Path $Override).Path }
  if ($env:DEVECO_HOME -and (Test-Path $env:DEVECO_HOME)) { return (Resolve-Path $env:DEVECO_HOME).Path }
  foreach ($candidate in @('D:\DevEco Studio', 'C:\Program Files\Huawei\DevEco Studio', 'C:\DevEco Studio')) {
    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
  }
  throw '找不到 DevEco Studio 安装目录：请设置环境变量 DEVECO_HOME，或传 -DevEcoHome。'
}

function Resolve-DevEcoNode {
  param([string]$DevEcoRoot)
  $exe = Join-Path $DevEcoRoot 'tools\node\node.exe'
  if (Test-Path $exe) { return $exe }
  if ($env:NODE_HOME -and (Test-Path (Join-Path $env:NODE_HOME 'node.exe'))) {
    return (Join-Path $env:NODE_HOME 'node.exe')
  }
  throw "找不到 node.exe：$exe（DevEco 自带 node 缺失时可设置 NODE_HOME）"
}

function Resolve-Hdc {
  param([string]$DevEcoRoot)
  if ($env:HDC -and (Test-Path $env:HDC)) { return $env:HDC }
  $exe = Join-Path $DevEcoRoot 'sdk\default\openharmony\toolchains\hdc.exe'
  if (Test-Path $exe) { return $exe }
  $cmd = Get-Command hdc.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "找不到 hdc：$exe"
}

function Resolve-Hvigorw {
  param([string]$DevEcoRoot)
  $bat = Join-Path $DevEcoRoot 'tools\hvigor\bin\hvigorw.bat'
  if (Test-Path $bat) { return $bat }
  throw "找不到 hvigorw.bat：$bat"
}

# pnpm 只在 web/node_modules 缺失时才需要，所以单独 lazy 调用，别放进 Initialize-DevEcoEnv。
function Resolve-PnpmCli {
  if ($env:PNPM_CLI -and (Test-Path $env:PNPM_CLI)) { return $env:PNPM_CLI }
  $candidates = @(
    (Join-Path $env:APPDATA 'npm\node_modules\pnpm\bin\pnpm.cjs'),
    (Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.cjs'),
    'E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs'
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  throw '找不到 pnpm 的 pnpm.cjs：请先手工 pnpm install，或设置环境变量 PNPM_CLI。'
}

# 共享 store 能省掉首次安装的下载量；优先用仓库根已有的 .pnpm-store。
function Resolve-PnpmStore {
  param([string]$ProjectRoot)
  if ($env:PNPM_STORE_DIR) { return $env:PNPM_STORE_DIR }
  $repoRoot = Split-Path -Parent (Split-Path -Parent $ProjectRoot)   # platforms/harmony → 仓库根
  foreach ($candidate in @((Join-Path $ProjectRoot '.pnpm-store'), (Join-Path $repoRoot '.pnpm-store'))) {
    if (Test-Path $candidate) { return $candidate }
  }
  return (Join-Path $ProjectRoot '.pnpm-store')
}

# 一次性解析并注入环境变量（NODE_HOME / DEVECO_SDK_HOME / PATH），返回各工具路径。
function Initialize-DevEcoEnv {
  param([string]$DevEcoHome = '', [string]$ProjectRoot = '')
  $devEcoRoot = Resolve-DevEcoHome $DevEcoHome
  $nodeExe = Resolve-DevEcoNode $devEcoRoot
  $nodeDir = Split-Path -Parent $nodeExe
  $env:NODE_HOME = $nodeDir
  $env:DEVECO_SDK_HOME = Join-Path $devEcoRoot 'sdk'
  $env:PATH = "$nodeDir;$env:PATH"
  $storeDir = ''
  if ($ProjectRoot) { $storeDir = Resolve-PnpmStore $ProjectRoot }
  return [pscustomobject]@{
    DevEcoRoot = $devEcoRoot
    NodeExe    = $nodeExe
    NodeDir    = $nodeDir
    Hdc        = (Resolve-Hdc $devEcoRoot)
    Hvigorw    = (Resolve-Hvigorw $devEcoRoot)
    PnpmStore  = $storeDir
  }
}
