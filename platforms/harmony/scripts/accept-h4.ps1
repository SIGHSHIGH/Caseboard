<#
.SYNOPSIS
  H4 验收：手指命中体检 + 导出能力。
.DESCRIPTION
  一条命令跑完 H4-1..H4-7，产出 .tmp-esbuild/accept-h4.json，全通过 exit 0。
  依赖：已连接模拟器/真机；entry 已构建（-SkipBuild 时复用现有 HAP）。
.PARAMETER SkipBuild
  跳过前端产物与 HAP 构建，直接装现有 HAP。
.PARAMETER SkipWeb
  跳过前端产物（tsc + vite + 收尾），但要构建 HAP。
.PARAMETER OutFile
  报告路径，默认 <root>/.tmp-esbuild/accept-h4.json
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$SkipWeb,
  [string]$OutFile
)

# hvigorw / hdc 会把正常警告写 stderr，Stop 会把它们当终止错误
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot '_env.ps1')
$envs = Initialize-DevEcoEnv -ProjectRoot $root
$node = $envs.NodeExe
$hdc = $envs.Hdc
$hvigor = $envs.Hvigorw

$bundleName = 'com.caseboard.harmony'
$ability = 'EntryAbility'
$hap = Join-Path $root 'entry\build\default\outputs\default\entry-default-unsigned.hap'
$rawfile = Join-Path $root 'entry\src\main\resources\rawfile'
$tmpDir = Join-Path $root '.tmp-esbuild'
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }
if (-not $OutFile) { $OutFile = Join-Path $tmpDir 'accept-h4.json' }

$results = New-Object System.Collections.ArrayList
function Add-Result([string]$Id, [string]$Name, [bool]$Ok, [string]$Detail) {
  [void]$results.Add([ordered]@{ id = $Id; name = $Name; ok = $Ok; detail = $Detail })
  $mark = if ($Ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("  [{0}] {1} {2} — {3}" -f $mark, $Id, $Name, $Detail)
}
function Fail([string]$Message) {
  Write-Host "错误：$Message" -ForegroundColor Red
  $report = [ordered]@{ ok = $false; error = $Message; results = $results }
  $report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8
  exit 1
}

function Invoke-Cb([string]$phase, [int]$waitSec = 8, [scriptblock]$MidAction = $null, [int]$MidDelay = 6) {
  $tmp = Join-Path $env:TEMP ("cb-h4-$phase-" + [Guid]::NewGuid().ToString('N').Substring(0, 6) + ".txt")
  & $hdc shell aa force-stop $bundleName 2>&1 | Out-Null
  & $hdc shell hilog -r 2>&1 | Out-Null
  if ($phase -eq '') {
    & $hdc shell aa start -a $ability -b $bundleName 2>&1 | Out-Null
  } else {
    & $hdc shell aa start -a $ability -b $bundleName --ps caseboardSelftest $phase 2>&1 | Out-Null
  }
  if ($MidAction) {
    Start-Sleep -Seconds $MidDelay
    & $MidAction
    Start-Sleep -Seconds ([Math]::Max(1, $waitSec - $MidDelay))
  } else {
    Start-Sleep -Seconds $waitSec
  }
  & $hdc shell "hilog -x" 2>&1 | Out-File $tmp -Encoding utf8
  $lines = (Get-Content $tmp) | Select-String -SimpleMatch '/CaseBoard' | ForEach-Object { $_.Line }
  return $lines
}

Write-Host '=== H4 手指命中 + 导出能力 ==='

# ---------- 构建 ----------
if (-not $SkipBuild) {
  if (-not $SkipWeb) {
    Write-Host '[构建] 前端产物'
    $web = Join-Path $root 'scripts\build-web.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $web 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'build-web.ps1 失败' }
  }
  Write-Host '[构建] HAP'
  Push-Location $root
  $buildOut = & $hvigor assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1
  Pop-Location
  if (-not ($buildOut | Select-String -Pattern 'BUILD SUCCESSFUL')) {
    $buildOut | Select-Object -Last 8 | Out-Host
    Fail 'hvigorw assembleHap 失败'
  }
}
if (-not (Test-Path $hap)) { Fail "找不到 HAP：$hap" }

Write-Host '[安装] ' -NoNewline
& $hdc install -r $hap 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'hdc install 失败' }
Write-Host 'ok'

# ---------- H4-1/2/3/4：命中体检 ----------
$lines = Invoke-Cb '11' 8
$hit = (($lines | Select-String -SimpleMatch 'console] [hit] ' | Select-Object -First 1).Line + '') -replace '^.*\[hit\] ', ''
$joined = ($lines -join "`n")
$band = if ($joined -match '\[hitband\] edge=(\d+)px') { "edge=" + $Matches[1] + "px" } else { "" }
$input = (($lines | Select-String -SimpleMatch '[input] ' | Select-Object -First 1).Line + '')
Add-Result 'H4-1' '触控形态已生效' ($input -match 'dataInput=touch') ($input -replace '^.*\[input\] ', '')

$edge = if ($band -match 'edge=(\d+)px') { [int]$Matches[1] } else { 0 }
Add-Result 'H4-2' '连线命中带 ≥30px（手指可点中 1.6~4.5px 的线）' ($edge -ge 30) "edge=${edge}px"

$fold = if ($hit -match '分组折叠=\d+x(\d+)x(\d+)') { [int]$Matches[2] } else { 0 }
$legend = if ($hit -match '图例按钮=\d+x(\d+)x(\d+)') { [int]$Matches[2] } else { 0 }
Add-Result 'H4-3' '图例按钮高 ≥40px' ($legend -ge 40) "图例=${legend}px"
# 画布缩放约 0.5，折叠/计数按 32px 设计 → 屏幕上约 16px
Add-Result 'H4-4' '分组折叠/计数已放大（画布缩放后 ≥15px）' ($fold -ge 15) "折叠=${fold}px（画布内，随缩放）"

$cssOk = $false
$builtCss = Get-ChildItem -Path (Join-Path $rawfile 'assets') -Filter 'index-*.css' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($builtCss) {
  $cssText = Get-Content $builtCss.FullName -Raw
  $cssOk = ($cssText -match 'min-height:\s*32px')
  $jsHit = Get-ChildItem -Path (Join-Path $rawfile 'assets') -Filter '*.js' | Where-Object { (Get-Content $_.FullName -Raw) -match 'cb-edge-hit' } | Select-Object -First 1
  $cssOk = $cssOk -and ($null -ne $jsHit)
}
Add-Result 'H4-5' '产物 CSS 含放大规则' $cssOk ($(if ($builtCss) { $builtCss.Name } else { '无 css' }))

# ---------- H4-6：导出面板 ----------
$lines = Invoke-Cb '10' 12
$exportLine = (($lines | Select-String -SimpleMatch '[export] dialog=open' | Select-Object -First 1).Line + '')
$items = 0
foreach ($name in @('导出 PNG', '导出 SVG', '导出 PDF', '导出图片包', '保存项目', '打开', '导出 JSON')) {
  if ($exportLine -match [regex]::Escape($name)) { $items++ }
}
Add-Result 'H4-6' '导出面板 7 项全部渲染' ($items -eq 7) "命中 $items/7"

# ---------- H4-7：导出 PNG 真实落盘 + mime ----------
# 点「导出 PNG」→ 系统保存对话框 → 点保存（坐标按 1440x893 横屏、dpr=2 固定）
$tapSave = {
  # 保存 → 若同名文件已存在会弹「要替换它？」，再点一次「替换」
  & $hdc shell uitest uiInput click 2248 1602 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  & $hdc shell uitest uiInput click 1624 1067 2>&1 | Out-Null
}
$lines = Invoke-Cb '10' 30 -MidAction $tapSave -MidDelay 13
$saveLine = (($lines | Select-String -SimpleMatch '[file] save ' | Select-Object -Last 1).Line + '')
$bytes = if ($saveLine -match '\((\d+)B,') { [int]$Matches[1] } else { 0 }
$mimeOk = $saveLine -match 'image/png'
Add-Result 'H4-7' '导出 PNG 落盘且 mime=image/png' ($bytes -gt 10000 -and $mimeOk) ("bytes=$bytes mime=" + $(if ($mimeOk) { 'image/png' } else { 'other' }))

# ---------- 汇总 ----------
$failed = @($results | Where-Object { -not $_.ok })
$report = [ordered]@{
  ok      = ($failed.Count -eq 0)
  passed  = @($results | Where-Object { $_.ok }).Count
  failed  = $failed.Count
  total   = $results.Count
  hap     = (Get-Item $hap).Length
  hit     = $hit
  results = $results
}
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8
Write-Host ''
Write-Host ("H4 验收：{0}/{1} 通过，报告 {2}" -f $report.passed, $report.total, $OutFile)
if ($failed.Count -gt 0) { exit 1 }
exit 0
