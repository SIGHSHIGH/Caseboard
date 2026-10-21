# H1 平板形态适配 · 一键验收
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h1.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\accept-h1.ps1 -SkipBuild
# 产出：.tmp-esbuild\accept-h1.json，全通过 exit 0

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$SkipWeb,
  [string]$BundleName = 'com.caseboard.harmony',
  [string]$Hdc = '',
  [string]$DevEcoHome = '',
  [string]$OutFile = ''
)

$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '_env.ps1')

$root = Split-Path -Parent $PSScriptRoot
$envInfo = Initialize-DevEcoEnv -DevEcoHome $DevEcoHome -ProjectRoot $root
if (-not $Hdc) { $Hdc = $envInfo.Hdc }
$Hvigorw = $envInfo.Hvigorw
if (-not $OutFile) { $OutFile = Join-Path $root '.tmp-esbuild\accept-h1.json' }
$web = Join-Path $root 'web'
$rawfile = Join-Path $root 'entry\src\main\resources\rawfile'
$hap = Join-Path $root 'entry\build\default\outputs\default\entry-default-unsigned.hap'

$checks = New-Object System.Collections.ArrayList
function Add-Check([string]$id, [string]$name, [bool]$ok, [string]$detail) {
  [void]$checks.Add([ordered]@{ id = $id; name = $name; ok = $ok; detail = $detail })
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("  [{0}] {1} {2}  {3}" -f $mark, $id, $name, $detail)
}
function Get-CbLog([string]$tmpName, [string]$phase, [int]$waitSec = 6) {
  & $hdc shell aa force-stop $BundleName 2>&1 | Out-Null
  & $hdc shell hilog -r 2>&1 | Out-Null
  $startOut = & $hdc shell aa start -a EntryAbility -b $BundleName --ps caseboardSelftest $phase 2>&1
  if (($startOut -join ' ') -notmatch 'successfully') {
    Write-Host ("  ! aa start 失败：{0}" -f ($startOut -join ' '))
  }
  $file = Join-Path $env:TEMP $tmpName
  # 探针有一串延时打点：分档 1s 起稳定、[clip2] 2s、[more] 3s、[moreclick2] 4.2s。
  # 所以第一次就等够 waitSec 秒再一次抓齐，别用「抓到了就返回」——那会漏掉后面的关键行。
  Start-Sleep -Seconds $waitSec
  & $hdc shell "hilog -x" 2>&1 | Out-File $file -Encoding utf8
  $hit = @((Get-Content $file) | Select-String -SimpleMatch '/CaseBoard' | ForEach-Object { $_.Line })
  if ($hit.Count -eq 0) {
    # 缓冲可能还没刷出来，补一次
    Start-Sleep -Seconds 5
    & $hdc shell "hilog -x" 2>&1 | Out-File $file -Encoding utf8
    $hit = @((Get-Content $file) | Select-String -SimpleMatch '/CaseBoard' | ForEach-Object { $_.Line })
  }
  return $hit
}

Write-Host ''
Write-Host '=== H1 平板形态适配 · 验收 ===' -ForegroundColor Cyan

# ---------- 静态 ----------
if (-not $SkipWeb) {
  Write-Host '-- 前端构建 --'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-web.ps1') 2>&1 | Out-Null
  $buildExit = $LASTEXITCODE
  Add-Check 'H1-1' 'tsc + vite + 产物收尾' ($buildExit -eq 0) ("exit=$buildExit")

  $reportPath = Join-Path $root '.tmp-esbuild\rawfile-report.json'
  $reportOk = $false
  $reportDetail = 'report missing'
  if (Test-Path $reportPath) {
    $report = Get-Content $reportPath -Raw | ConvertFrom-Json
    $reportOk = [bool]$report.ok
    $reportDetail = ("files={0} mb={1} crossoriginRemoved={2}" -f $report.fileCount, $report.totalMB, $report.crossoriginRemoved)
  }
  Add-Check 'H1-2' 'rawfile 产物断言（相对路径 / 无 crossorigin / 无 tesseract）' $reportOk $reportDetail
} else {
  Write-Host '-- 跳过前端构建 --'
}

# 响应式样式确实进了产物
$cssFile = Get-ChildItem (Join-Path $rawfile 'assets\*.css') -ErrorAction SilentlyContinue | Select-Object -First 1
$cssOk = $false
$cssDetail = 'css missing'
if ($cssFile) {
  $css = [System.IO.File]::ReadAllText($cssFile.FullName, [System.Text.Encoding]::UTF8)
  $hasTouch = $css.Contains("data-input='touch'") -or $css.Contains('data-input=touch')
  $hasScrim = $css.Contains('.cb-scrim')
  $hasCtrl = $css -match '--cb-control-h:\s*40px'
  $cssOk = $hasTouch -and $hasScrim -and $hasCtrl
  $cssDetail = ("touch={0} scrim={1} control40={2} file={3}" -f $hasTouch, $hasScrim, $hasCtrl, $cssFile.Name)
}
Add-Check 'H1-3' '触控样式与抽屉样式已打包' $cssOk $cssDetail

if (-not $SkipBuild) {
  Write-Host '-- 构建 + 安装 --'
  Push-Location $root
  $buildOut = & $Hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1
  $buildExit = $LASTEXITCODE
  Pop-Location
  Add-Check 'H1-4' 'hvigorw assembleHap' ($buildExit -eq 0) ("exit=$buildExit")

  & $hdc shell aa force-stop $BundleName 2>&1 | Out-Null
  $installOut = & $hdc install -r $hap 2>&1
  $installOk = ($installOut -join ' ') -match 'successfully'
  Add-Check 'H1-5' 'HAP 安装' $installOk ("hap={0:N0}B" -f (Get-Item $hap).Length)
} else {
  Write-Host '-- 跳过构建 --'
}

# ---------- 上机：横屏全宽 ----------
Write-Host '-- 上机：横屏全宽（phase 1）--'
$phase = '1'
$log1 = Get-CbLog 'cb-h1-wide.txt' $phase 26

$layoutLine = $log1 | Select-String -Pattern '\[layout\] tier=' | Select-Object -First 1
$layoutOk = $false
$layoutDetail = 'no layout line'
if ($layoutLine) {
  $text = $layoutLine.Line
  $tier = if ($text -match 'tier=(\w+)') { $Matches[1] } else { '?' }
  $small = if ($text -match 'small=(\d+)') { [int]$Matches[1] } else { -1 }
  $scroll = if ($text -match 'scroll=(\d+)/(\d+)') { "$($Matches[1])/$($Matches[2])" } else { '?' }
  $layoutOk = ($tier -eq 'wide') -and ($small -eq 0)
  $layoutDetail = "tier=$tier small=$small scroll=$scroll"
}
Add-Check 'H1-6' '横屏定档 wide 且触控目标无过小项' $layoutOk $layoutDetail

$inputLine = $log1 | Select-String -Pattern '\[input\]' | Select-Object -First 1
$inputOk = $false
$inputDetail = 'no input line'
if ($inputLine) {
  $inputOk = $inputLine.Line -match 'dataInput=touch'
  $inputDetail = $inputLine.Line -replace '^.*\[input\] ', ''
}
Add-Check 'H1-7' '触控形态已开启（data-input=touch）' $inputOk $inputDetail

$scrollOk = $false
$scrollDetail = 'no scroll line'
if ($layoutLine -and ($layoutLine.Line -match 'scroll=(\d+)/(\d+)')) {
  $scrollOk = $Matches[1] -eq $Matches[2]
  $scrollDetail = "$($Matches[1])/$($Matches[2])"
}
Add-Check 'H1-8' '页面无横向溢出' $scrollOk $scrollDetail

# ---------- 上机：窄档抽屉 ----------
Write-Host '-- 上机：窄档抽屉（phase 3）--'
$phase = '3'
$log3 = Get-CbLog 'cb-h1-narrow.txt' $phase 26

$narrowLine = $log3 | Select-String -Pattern '\[narrow\]' | Select-Object -First 1
$narrowOk = $false
$narrowDetail = 'no narrow line'
if ($narrowLine) {
  $text = $narrowLine.Line
  $tier = if ($text -match 'tier=(\w+)') { $Matches[1] } else { '?' }
  $scrim = if ($text -match 'scrim=(\w+)') { $Matches[1] } else { '?' }
  $edge = if ($text -match 'rightEdge=(\d+)') { [int]$Matches[1] } else { -1 }
  $width = if ($text -match 'rightW=(\d+)') { [int]$Matches[1] } else { -1 }
  $narrowOk = ($tier -eq 'medium') -and ($scrim -eq 'true') -and ($edge -eq 1000) -and ($width -gt 0)
  $narrowDetail = "tier=$tier scrim=$scrim rightW=$width rightEdge=$edge"
}
Add-Check 'H1-9' '窄档右栏转为贴边抽屉并带遮罩' $narrowOk $narrowDetail

# ---------- 上机：竖屏 / 小窗拦截层 ----------
Write-Host '-- 上机：竖屏 / 小窗提示层（phase 4）--'
$phase = '4'
$log4 = Get-CbLog 'cb-h1-gate.txt' $phase 26

$wideGate = $log1 | Select-String -Pattern '\[gate\] present=' | Select-Object -First 1
$gateOff = $false
$gateOffDetail = 'no gate line'
if ($wideGate) {
  $gateOff = $wideGate.Line -match 'present=false'
  $gateOffDetail = ($wideGate.Line -replace '^.*\[gate\] ', '')
}
Add-Check 'H1-11' '横屏全宽不弹提示层' $gateOff $gateOffDetail

$gateLine = $log4 | Select-String -Pattern '\[gate2\] present=' | Select-Object -First 1
$gateOk = $false
$gateDetail = 'no gate2 line'
if ($gateLine) {
  $text = $gateLine.Line
  $present = $text -match 'present=true'
  $w = if ($text -match 'w=(\d+)') { [int]$Matches[1] } else { 0 }
  $h = if ($text -match 'h=(\d+)') { [int]$Matches[1] } else { 0 }
  $gateOk = $present -and ((($h -gt $w)) -or ($w -lt 900))
  $gateDetail = "present=$present w=$w h=$h"
}
Add-Check 'H1-12' '竖屏/小窗（700×893）弹 _(:з」∠)_ 提示层' $gateOk $gateDetail

# 提示层文案确实在构建产物里（不依赖运行时截图判断）
$gateTextOk = $false
Get-ChildItem (Join-Path $rawfile 'assets\*.js') -ErrorAction SilentlyContinue | ForEach-Object {
  if (-not $gateTextOk) {
    $t = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    if ($t.Contains('请横屏使用') -and $t.Contains('cb-gate')) { $gateTextOk = $true }
  }
}
Add-Check 'H1-13' '提示层文案与样式已打包' $gateTextOk ("hit=$gateTextOk")

# ---------- 顶栏收容（H2） ----------
Write-Host '-- 顶栏收容（phase 1 / 3）--'

$clip1 = $log1 | Select-String -Pattern '\[clip2\] count=' | Select-Object -First 1
$clipOk = $false
$clipDetail = 'no clip2 line'
if ($clip1) {
  $n = if ($clip1.Line -match 'count=(\d+)') { [int]$Matches[1] } else { -1 }
  $inline = if ($clip1.Line -match 'inline=(\d+)') { [int]$Matches[1] } else { -1 }
  $clipOk = ($n -eq 0) -and ($inline -gt 0)
  $clipDetail = "clipped=$n inline=$inline"
}
Add-Check 'H1-14' '1440 顶栏零裁切（稳态）' $clipOk $clipDetail

$more1 = $log1 | Select-String -Pattern '\[more\] open=' | Select-Object -First 1
$moreOk = $false
$moreDetail = 'no more line'
if ($more1) {
  $open = $more1.Line -match 'open=true'
  $items = if ($more1.Line -match 'items=(\d+)') { [int]$Matches[1] } else { 0 }
  $moreOk = $open -and ($items -gt 0)
  $moreDetail = "open=$open items=$items"
}
Add-Check 'H1-15' '「⋯」菜单可打开且装着被收走的按钮' $moreOk $moreDetail

$click1 = $log1 | Select-String -Pattern '\[moreclick' | ForEach-Object { $_.Line }
$clickOk = ($click1 | Select-String -SimpleMatch 'found=true').Count -gt 0
$clickDetail = ($click1 -join ' ')
Add-Check 'H1-16' '菜单内按钮可点击（生图 样本）' $clickOk $clickDetail

$clip3 = $log3 | Select-String -Pattern '\[clip2\] count=' | Select-Object -First 1
$clip3Ok = $false
$clip3Detail = 'no clip2 line'
if ($clip3) {
  $n = if ($clip3.Line -match 'count=(\d+)') { [int]$Matches[1] } else { -1 }
  $clip3Ok = ($n -eq 0)
  $clip3Detail = "clipped=$n"
}
Add-Check 'H1-17' '窄档 1000 顶栏零裁切' $clip3Ok $clip3Detail

# ---------- 侧栏开关：左右下角圆形按钮（H3 起取代 16px 竖向折叠条） ----------
$toggle = $log1 | Select-String -Pattern '\[toggle\]' | Select-Object -First 1
$toggleOk = $false
$toggleDetail = 'no toggle line'
if ($toggle) {
  $line = $toggle.Line
  $size = if ($line -match 'size=(\d+)x(\d+)') { @([int]$Matches[1], [int]$Matches[2]) } else { @(0, 0) }
  $leftX = if ($line -match 'left=(\d+),') { [int]$Matches[1] } else { -1 }
  $rightX = if ($line -match 'right=(\d+)') { [int]$Matches[1] } else { -1 }
  $inner = if ($line -match 'inner=(\d+)') { [int]$Matches[1] } else { 0 }
  $canvas = if ($line -match 'canvas=(\d+)') { [int]$Matches[1] } else { 0 }
  $isFixed = $line -match 'fixed=true'
  # 44×44 命中尺寸、贴左右下角（12px 边距）、脱流（fixed），且画布拿到 1440-208-312 = 920
  $toggleOk = $isFixed -and ($size[0] -ge 40) -and ($size[1] -ge 40) -and
    ([Math]::Abs($leftX - 12) -le 2) -and ([Math]::Abs(($inner - $rightX) - 12) -le 2) -and ($canvas -ge 916)
  $toggleDetail = "fixed=$isFixed size=$($size[0])x$($size[1]) leftX=$leftX rightGap=$($inner - $rightX) canvas=$canvas"
}
Add-Check 'H1-18' '侧栏开关为左右下角圆形按钮（44px、脱流、还回画布宽度）' $toggleOk $toggleDetail

# ---------- 控制台 ----------
$allLog = $log1 + $log3 + $log4
$consoleErrors = ($allLog | Select-String -SimpleMatch 'web-console' | Where-Object { $_.Line -match '\berror\b' }).Count
$webErrors = ($allLog | Select-String -SimpleMatch 'web-error').Count
Add-Check 'H1-10' '控制台无 error、无 Web 加载错误' (($consoleErrors -eq 0) -and ($webErrors -eq 0)) ("consoleError=$consoleErrors webError=$webErrors")

# ---------- 汇总 ----------
$failed = @($checks | Where-Object { -not $_.ok })
$result = [ordered]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  device = '127.0.0.1:5555'
  bundle = $BundleName
  total = $checks.Count
  passed = $checks.Count - $failed.Count
  failed = $failed.Count
  ok = ($failed.Count -eq 0)
  checks = $checks
}

$dir = Split-Path -Parent $OutFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$json = $result | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
if ($result.ok) {
  Write-Host ("=== H1 验收全通过 {0}/{1} ===" -f $result.passed, $result.total) -ForegroundColor Green
  Write-Host ("报告：{0}" -f $OutFile)
  exit 0
} else {
  Write-Host ("=== H1 验收未通过：{0}/{1} 失败 ===" -f $failed.Count, $checks.Count) -ForegroundColor Red
  $failed | ForEach-Object { Write-Host ("  - {0} {1}: {2}" -f $_.id, $_.name, $_.detail) -ForegroundColor Red }
  Write-Host ("报告：{0}" -f $OutFile)
  exit 1
}
