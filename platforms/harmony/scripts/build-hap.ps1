<#
.SYNOPSIS
  构建 HAP（复用 _env.ps1 定位 hvigorw）。
.DESCRIPTION
  单独抽出来的原因：hvigorw.bat 位于 "D:\DevEco Studio\tools\hvigor\bin\"，路径带空格，
  从 bash 里用 cmd /c 套引号必踩坑；统一走 PowerShell -File 最稳。
  默认在仓库内的 platforms/harmony 构建（无签名配置 → 未签名包，模拟器可直接装）。
.PARAMETER ProjectRoot
  工程根，默认本脚本的上一级目录。
.PARAMETER Clean
  先删 entry\build（11204003 资源占用错误的官方解法）。
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [switch]$Clean
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
. (Join-Path $PSScriptRoot '_env.ps1')
$envs = Initialize-DevEcoEnv -ProjectRoot $ProjectRoot
Write-Host ("[env] node={0}" -f $envs.NodeExe)
Write-Host ("[env] hvigorw={0}" -f $envs.Hvigorw)

$buildDir = Join-Path $ProjectRoot 'entry\build'
if ($Clean -and (Test-Path $buildDir)) {
  Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
  Write-Host '[clean] 已删 entry\build'
}

Push-Location $ProjectRoot
$out = & $envs.Hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1
Pop-Location

$text = ($out | Out-String)
if ($text -match 'BUILD SUCCESSFUL') {
  $hap = Get-ChildItem -Path (Join-Path $ProjectRoot 'entry\build') -Filter '*.hap' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($hap) {
    Write-Host ("[ok] {0} ({1:N0} B)" -f $hap.FullName, $hap.Length)
  } else {
    Write-Host '[ok] 但没找到 HAP 产物'
  }
  exit 0
}

# 失败时把错误行原样打出来，别只留最后 8 行（restool 的 Detail 常在中间）
$out | ForEach-Object { $line = "$_"; if ($line -match 'ERROR|error:|Detail|Try the following|restool') { Write-Host $line } }
Write-Host '[fail] BUILD FAILED'
exit 1
