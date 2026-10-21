<#
.SYNOPSIS
  构建 ArkWeb 前端产物到 entry/src/main/resources/rawfile（含 rel-URI / 去 crossorigin 收尾）。

.DESCRIPTION
  做三件事，任一失败即 exit 1：
    1) tsc --noEmit（web/ 的严格类型检查）
    2) vite build（base './'，outDir 直指 rawfile）
    3) node scripts/postbuild-rawfile.mjs（断言相对路径、剥 crossorigin、输出 JSON 报告）

  本机没有独立 node，统一用 DevEco 自带的 node，避免 spawn EPERM 与 PATH 缺失。
  临时目录必须指到仓库内（系统 Temp 处理大产物会失败）。
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $ProjectRoot 'web'
$Node = 'D:\DevEco Studio\tools\node\node.exe'
$Pnpm = 'E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs'
$StoreDir = Join-Path (Split-Path -Parent $ProjectRoot) '.pnpm-store'

if (-not (Test-Path $Node)) { throw "找不到 DevEco node：$Node" }
if (-not (Test-Path (Join-Path $WebRoot 'node_modules'))) {
  if (-not (Test-Path $Pnpm)) { throw "web/node_modules 缺失，且找不到 pnpm：$Pnpm（先手工 pnpm install）" }
  Write-Host '[web] 首次安装依赖…'
  Push-Location $WebRoot
  try {
    $env:TMP = Join-Path $WebRoot '.tmp'
    $env:TEMP = $env:TMP
    & $Node $Pnpm install --store-dir $StoreDir --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败（exit $LASTEXITCODE）" }
  } finally { Pop-Location }
}

Push-Location $WebRoot
try {
  $env:TMP = Join-Path $WebRoot '.tmp'
  $env:TEMP = $env:TMP

  Write-Host '[web] tsc --noEmit'
  & $Node 'node_modules\typescript\bin\tsc' --noEmit
  if ($LASTEXITCODE -ne 0) { throw "tsc 失败（exit $LASTEXITCODE）" }

  Write-Host '[web] vite build → rawfile'
  & $Node 'node_modules\vite\bin\vite.js' build
  if ($LASTEXITCODE -ne 0) { throw "vite build 失败（exit $LASTEXITCODE）" }

  Write-Host '[web] postbuild-rawfile（断言 + 去 crossorigin）'
  & $Node 'scripts\postbuild-rawfile.mjs'
  if ($LASTEXITCODE -ne 0) { throw "postbuild-rawfile 失败（exit $LASTEXITCODE）" }
} finally { Pop-Location }

Write-Host '[web] 完成'
