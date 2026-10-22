<#
.SYNOPSIS
  H5 验收：素材文件仓 + 触屏拖拽（9 条）。
.DESCRIPTION
  只覆盖能靠日志断言的部分：缩略图/拖拽。画布背景图仍需人工导入一张验；
  confirm/alert 那 9 处也不在本脚本范围。
  依赖：已连接模拟器（默认 127.0.0.1:5555），且已装同签名的包。
.PARAMETER SkipBuild
  跳过前端产物与 HAP 构建，直接装现有 HAP。
.PARAMETER SkipWeb
  跳过前端产物（tsc + vite + 收尾），但要构建 HAP。
.PARAMETER Target
  设备串号，默认优先模拟器 127.0.0.1:5555。
.PARAMETER Hap
  直接指定要安装的 HAP。模拟器上已装的是 DevEco 签名的包，未签名包装不进去
  （code:9568332 install sign info inconsistent），所以要装签名站点构建出的包。
.PARAMETER OutFile
  报告路径，默认 <root>/.tmp-esbuild/accept-h5.json
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$SkipWeb,
  [string]$Target,
  [string]$Hap,
  [string]$OutFile
)

# hvigorw / hdc 会把正常警告写 stderr，Stop 会把它们当终止错误
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot '_env.ps1')
$envs = Initialize-DevEcoEnv -ProjectRoot $root
$hdc = $envs.Hdc
$hvigor = $envs.Hvigorw

$bundleName = 'com.caseboard.harmony'
$ability = 'EntryAbility'

if (-not $Hap) {
  $found = Get-ChildItem -Path (Join-Path $root 'entry\build') -Filter '*.hap' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($found) {
    $Hap = $found.FullName
  } else {
    $Hap = Join-Path $root 'entry\build\default\outputs\default\entry-default-unsigned.hap'
  }
}

$tmpDir = Join-Path $root '.tmp-esbuild'
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }
if (-not $OutFile) { $OutFile = Join-Path $tmpDir 'accept-h5.json' }

if (-not $Target) {
  $targets = @((& $hdc list targets 2>&1) -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
  if ($targets -contains '127.0.0.1:5555') {
    $Target = '127.0.0.1:5555'
  } elseif ($targets.Count -gt 0) {
    $Target = $targets[0]
  } else {
    $Target = ''
  }
}
$hdcArgs = @()
if ($Target) { $hdcArgs = @('-t', $Target) }

$results = New-Object System.Collections.ArrayList
function Add-Result([string]$Id, [string]$Name, [bool]$Ok, [string]$Detail) {
  [void]$results.Add([ordered]@{ id = $Id; name = $Name; ok = $Ok; detail = $Detail })
  $mark = if ($Ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("  [{0}] {1} {2} — {3}" -f $mark, $Id, $Name, $Detail)
}
function Fail([string]$Message) {
  Write-Host "错误：$Message" -ForegroundColor Red
  $report = [ordered]@{ ok = $false; error = $Message; target = $Target; results = $results }
  $report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8
  exit 1
}
# 日志行里只留 [diag] 之后的内容，别把时间戳和 tag 带进报告
function Short([string]$Line) {
  if (-not $Line) { return '' }
  $i = $Line.IndexOf('[diag]')
  if ($i -lt 0) { return $Line }
  return $Line.Substring($i)
}

function Invoke-Cb([string]$phase, [int]$waitSec = 24) {
  $tmp = Join-Path $env:TEMP ("cb-h5-" + $phase + "-" + [Guid]::NewGuid().ToString('N').Substring(0, 6) + ".txt")
  & $hdc @hdcArgs shell aa force-stop $bundleName 2>&1 | Out-Null
  & $hdc @hdcArgs shell hilog -r 2>&1 | Out-Null
  & $hdc @hdcArgs shell aa start -a $ability -b $bundleName --ps caseboardSelftest $phase 2>&1 | Out-Null
  Start-Sleep -Seconds $waitSec
  & $hdc @hdcArgs shell "hilog -x" 2>&1 | Out-File $tmp -Encoding utf8
  # 不能 Select-Object -Last N：应用日志在缓冲区头部
  return @((Get-Content $tmp) | Select-String -SimpleMatch '/CaseBoard' | ForEach-Object { $_.Line })
}

Write-Host '=== H5 素材文件仓 + 触屏拖拽 ==='

# ---------- 构建 ----------
if (-not $SkipBuild) {
  if (-not $SkipWeb) {
    Write-Host '[构建] 前端产物'
    $web = Join-Path $root 'scripts\build-web.ps1'
    $env:CASEBOARD_TEST_FIXTURES = '1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $web 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'build-web.ps1 失败' }
  }
  Write-Host '[构建] HAP'
  Push-Location $root
  $buildOut = & $hvigor assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1
  Pop-Location
  if (-not ($buildOut | Select-String -Pattern 'BUILD SUCCESSFUL')) {
    $buildOut | Select-Object -Last 12 | Out-Host
    Fail 'hvigorw assembleHap 失败'
  }
}
if (-not (Test-Path $Hap)) { Fail ("找不到 HAP：" + $Hap) }

Write-Host ("[安装] {0} -> {1}" -f (Split-Path -Leaf $Hap), $Target)
$installOut = (& $hdc @hdcArgs install -r $Hap 2>&1) -join "`n"
if (-not ($installOut -match 'success')) { Fail ("hdc install 失败：" + $installOut) }

# ---------- 动态断言：phase=13 ----------
$lines = Invoke-Cb '13' 26
if (-not $lines -or $lines.Count -eq 0) { Fail 'phase=13 没有抓到任何 /CaseBoard 日志' }
$joined = $lines -join "`n"
$joined | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase13.log') -Encoding utf8

function Get-Diag([string]$pattern) {
  $hit = @($lines | Select-String -Pattern $pattern)
  if ($hit.Count -eq 0) { return '' }
  return $hit[-1].Line
}

# 导入链：canvas 合成 JPEG → File → DataTransfer → drop → 导入向导 → 点确认
# 探针在 19s 会补一条 summary（早期 console 转发常被吞，靠它兜底）
$summaryLine = Get-Diag '\[diag\] summary'
$dropLine = Get-Diag '\[diag\] drop dispatched'
$dtLine = Get-Diag '\[diag\] dt files='
$confirmLine = Get-Diag '\[diag\] confirm clicked'
$sumDrop = 0
$sumConfirm = 'none'
if ($summaryLine -match 'drop=(\d+)') { $sumDrop = [int]$Matches[1] }
if ($summaryLine -match 'confirm=([^ ]+)') { $sumConfirm = $Matches[1] }
$dropOk = (($dropLine -ne '') -and ($dtLine -match 'dt files=1') -and ($confirmLine -ne '')) -or
          (($sumDrop -ge 1) -and ($sumConfirm -ne 'none') -and ($sumConfirm -ne ''))
$dropDetail = (Short $dtLine) + ' / ' + (Short $confirmLine) + ' / ' + (Short $summaryLine)
Add-Result 'H5-1' '合成拖入走通导入向导（drop → 确认导入）' $dropOk $dropDetail

$tileLine = Get-Diag '\[diag\] tiles='
$tiles = 0
if ($tileLine -match 'tiles=(\d+)') { $tiles = [int]$Matches[1] }
if ($tiles -eq 0 -and $summaryLine -match 'tiles=(\d+)') { $tiles = [int]$Matches[1] }
$thumbLines = @($lines | Select-String -Pattern '\[diag\] thumb\[' | ForEach-Object { $_.Line })
$thumbUrlOk = $false
foreach ($line in $thumbLines) { if ($line -match 'caseboard://rawfile/asset/(assets|thumbs)/') { $thumbUrlOk = $true } }
# 12s 那批日志也常常被吞，用 16s 的 free-img 行补判（同一套 URL 规则）
$freeUrlLine = Get-Diag '\[diag\] free-img\[0\] natural='
if ($freeUrlLine -match 'caseboard://rawfile/asset/(assets|thumbs)/') { $thumbUrlOk = $true }
$thumbLine = if ($thumbLines.Count -gt 0) { $thumbLines[0] } elseif ($freeUrlLine -ne '') { $freeUrlLine } else { '' }
Add-Result 'H5-2' '缩略图走沙箱文件 URL（caseboard://rawfile/asset/thumbs/…）' ($tiles -gt 0 -and $thumbUrlOk) (('tiles=' + $tiles) + ' / ' + (Short $thumbLine))

# 只要有任意一张缩略图解码成功就算过（导入的新图排在后面）；12s 日志被吞时用 summary 的 thumb0=
$natural = 0
foreach ($line in $thumbLines) {
  if ($line -match 'natural=(\d+)x(\d+)') {
    $w = [int]$Matches[1]
    if ($w -gt $natural) { $natural = $w }
  }
}
if ($natural -eq 0 -and $summaryLine -match 'thumb0=(\d+)') { $natural = [int]$Matches[1] }
Add-Result 'H5-3' '缩略图能解码（naturalWidth>0，说明 URL 真的取到了字节）' ($natural -gt 0) ('naturalWidth=' + $natural)


$fetchLine = Get-Diag '\[diag\] thumb\.fetch status='
# summary 里带 fetch=<状态-类型>，比 12s 那批零散日志可靠（hilog 的 console 转发会丢包）
$fetchText = ''
if ($summaryLine -match 'fetch=(\S+)') { $fetchText = $Matches[1] }
if ($fetchText -eq '' -and $fetchLine -match 'status=(\S+)') { $fetchText = $Matches[1] }
$fetchOk = $fetchText -match '^200'
$mimeOk = $fetchText -match 'image/'
Add-Result 'H5-4' '缩略图 URL 直接可取（fetch 200 + image/*）' ($fetchOk -and $mimeOk) $fetchText

# H5-10：同一份字节挂三张真 <img>，记录 ArkWeb 到底吃哪种 URL。
# 判据：data 必须能解码（否则是图片加载被整体关掉）；scheme/blob 至少一个能用。
$schemeNat = Get-Diag '\[diag\] img\.scheme nat='
$blobNat = Get-Diag '\[diag\] img\.blob nat='
$dataNat = Get-Diag '\[diag\] img\.data nat='
$schemeW = 0; $blobW = 0; $dataW = 0
if ($schemeNat -match 'nat=(\d+)') { $schemeW = [int]$Matches[1] }
if ($blobNat -match 'nat=(\d+)') { $blobW = [int]$Matches[1] }
if ($dataNat -match 'nat=(\d+)') { $dataW = [int]$Matches[1] }
if ($schemeW -eq 0 -and $summaryLine -match 'imgS=(\d+)') { $schemeW = [int]$Matches[1] }
if ($blobW -eq 0 -and $summaryLine -match 'imgB=(\d+)') { $blobW = [int]$Matches[1] }
if ($dataW -eq 0 -and $summaryLine -match 'imgD=(\d+)') { $dataW = [int]$Matches[1] }
Add-Result 'H5-10' 'img 解码对照（data 必须 >0；scheme 与 blob 至少一个 >0）' ($dataW -gt 0 -and ($schemeW -gt 0 -or $blobW -gt 0)) (('scheme=' + $schemeW) + ' blob=' + $blobW + ' data=' + $dataW)

# 新旧两次 idbReport 必须一致；absent 也算一致（本来就没人写过 IndexedDB）
# 6s 那次日志可能被吞，此时用 summary 里的 idb= 字段。
$idbBefore = Get-Diag '\[diag\] idb '
$idbAfter = Get-Diag '\[diag\] after\.idb '
$idbShape = { param($text) ($text -replace '^.*\[diag\] ', '') -replace '^(after\.)?idb ', '' }
$shapeBefore = & $idbShape $idbBefore
$shapeAfter = & $idbShape $idbAfter
$sumIdb = ''
if ($summaryLine -match 'idb=([a-z-]+)') { $sumIdb = $Matches[1] }
$beforeKnown = ($shapeBefore -ne '') -or ($sumIdb -ne '')
$sameShape = ($shapeBefore -eq $shapeAfter) -or (($sumIdb -ne '') -and ($sumIdb -eq $shapeAfter))
$noIdbWrites = ($sumIdb -eq 'no-stores') -or ($sumIdb -eq 'absent')
Add-Result 'H5-5' '新导入不写 IndexedDB（前后一致）' ($beforeKnown -and $sameShape -and $noIdbWrites) (('before=' + $shapeBefore) + '/' + $sumIdb + ' after=' + $shapeAfter)

$dragLine = Get-Diag '\[diag\] drag nodes'
$before = -1
$after = -2
if ($dragLine -match 'drag nodes (\d+) -> (\d+)') {
  $before = [int]$Matches[1]
  $after = [int]$Matches[2]
}
Add-Result 'H5-6' '触摸长按起拖后画布多出图片节点' ($dragLine -ne '' -and $after -eq $before + 1) ('nodes ' + $before + ' -> ' + $after)

$freeLine = Get-Diag '\[diag\] free-img\[0\] natural='
$freeNatural = 0
if ($freeLine -match 'natural=(\d+)x(\d+)') { $freeNatural = [int]$Matches[1] }
$freeUrlOk = $freeLine -match 'caseboard://rawfile/asset/'
Add-Result 'H5-7' '拖入的图片节点有真实像素' ($freeNatural -gt 0 -and $freeUrlOk) (Short $freeLine)

# ---------- 静态断言 ----------
$boardSrc = Join-Path $root 'web\src\components\flow\Board.tsx'
$storeSrc = Join-Path $root 'web\src\services\imageStore.ts'
$boardText = ''
$storeText = ''
if (Test-Path $boardSrc) { $boardText = Get-Content $boardSrc -Raw }
if (Test-Path $storeSrc) { $storeText = Get-Content $storeSrc -Raw }
$boardOk = ($boardText -match 'usesNativeAssetStore') -and (-not ($boardText -match 'canvasBg && isTauri'))
Add-Result 'H5-8' '画布背景图改走 usesNativeAssetStore' $boardOk 'Board.tsx'

$legacyOk = ($storeText -match 'idbGetOriginal') -and ($storeText -match 'idbGetThumb') -and ($storeText -match 'usesNativeAssetStore')
Add-Result 'H5-9' '旧 IndexedDB 素材有回退读路径' $legacyOk 'imageStore.ts'

# H5-11：全仓库不许再出现 window.confirm / window.alert（ArkWeb 里两个都静默失效）
$srcRoot = Join-Path $root 'web\src'
$leftCalls = @(Get-ChildItem -Path $srcRoot -Recurse -Include '*.ts', '*.tsx' |
  Select-String -Pattern 'window\.(confirm|alert)\(')
Add-Result 'H5-11' 'src 内 window.confirm/alert 归零' ($leftCalls.Count -eq 0) (($leftCalls.Count.ToString()) + ' 处')

# H5-12：确认框/提示条宿主必须挂在 App 根上，否则调用点等到的 Promise 永远没人答
$appSrc = Join-Path $srcRoot 'App.tsx'
$appText = ''
if (Test-Path $appSrc) { $appText = Get-Content $appSrc -Raw }
$hostOk = ($appText -match '<ConfirmHost') -and ($appText -match '<NoticeHost')
Add-Result 'H5-12' 'ConfirmHost/NoticeHost 已挂到 App 根' $hostOk 'App.tsx'

# H5-13：三处硬约束 7 的云端授权必须走应用内确认（不能用原生 confirm）
$aiText = ''
$aiImgText = ''
$aiSrc = Join-Path $srcRoot 'components\panels\AiPanel.tsx'
$aiImgSrc = Join-Path $srcRoot 'components\panels\AiImagePanel.tsx'
if (Test-Path $aiSrc) { $aiText = Get-Content $aiSrc -Raw }
if (Test-Path $aiImgSrc) { $aiImgText = Get-Content $aiImgSrc -Raw }
$confirmOk = ($aiText -match 'askConfirm') -and ($aiImgText -match 'askConfirm')
Add-Result 'H5-13' '云端授权（远程模型/云端生图）走应用内确认' $confirmOk 'AiPanel + AiImagePanel'

# ---------- 动态断言：phase=14（触屏长按多选 + 收进组框） ----------
$lines14 = Invoke-Cb '14' 20
if (-not $lines14 -or $lines14.Count -eq 0) {
  Add-Result 'H5-14' '长按卡片进入多选并出现「已选 N 项」' $false 'phase=14 没有日志'
  Add-Result 'H5-15' '「加入组框…」把卡片放进组框内' $false 'phase=14 没有日志'
} else {
  $lines14 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase14.log') -Encoding utf8
  $sum14Line = ''
  $hit14 = @($lines14 | Select-String -Pattern '\[diag\] summary14')
  if ($hit14.Count -gt 0) { $sum14Line = $hit14[-1].Line }
  # 早期 console 转发会丢：summary14 没到就退回用逐条日志判断
  if ($sum14Line -eq '') {
    $tap14 = @($lines14 | Select-String -Pattern '\[diag\] msel after tap') | Select-Object -Last 1
    if ($tap14) { $sum14Line = $tap14.Line }
  }
  $banner = 0; $sel = 0; $picked = 0; $contained = 0; $rect = ''
  if ($sum14Line -match 'banner=(\d+)') { $banner = [int]$Matches[1] }
  if ($sum14Line -match 'sel=(\d+)') { $sel = [int]$Matches[1] }
  if ($sum14Line -match 'picked=(\d+)') { $picked = [int]$Matches[1] }
  if ($sum14Line -match 'contained=(\d+)') { $contained = [int]$Matches[1] }
  if ($sum14Line -match 'rect=([0-9x]+)') { $rect = $Matches[1] }
  if ($sel -eq 0 -and $sum14Line -match 'selected=(\d+)') { $sel = [int]$Matches[1] }
  Add-Result 'H5-14' '长按卡片进入多选并出现「已选 N 项」' (($banner -eq 1) -and ($sel -ge 2)) ('sel=' + $sel + ' banner=' + $banner + ' ' + (Short $sum14Line))
  Add-Result 'H5-15' '「加入组框…」把卡片放进组框内' (($picked -eq 1) -and ($contained -eq 1)) ('picked=' + $picked + ' contained=' + $contained + ' rect=' + $rect)
}

# ---------- 动态断言：phase=15（画布迟滞量） ----------
$lines15 = Invoke-Cb '15' 16
$sum15Line = ''
if ($lines15 -and $lines15.Count -gt 0) {
  $lines15 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase15.log') -Encoding utf8
  $hit15 = @($lines15 | Select-String -Pattern '\[diag\] summary15')
  if ($hit15.Count -gt 0) { $sum15Line = $hit15[-1].Line }
}
$p50 = -1
$p95 = -1
$drop = -1
$frames = 0
if ($sum15Line -match 'p50=([0-9.]+)') { $p50 = [double]$Matches[1] }
if ($sum15Line -match 'p95=([0-9.]+)') { $p95 = [double]$Matches[1] }
if ($sum15Line -match 'drop=(\d+)') { $drop = [int]$Matches[1] }
if ($sum15Line -match 'frames=(\d+)') { $frames = [int]$Matches[1] }
# 60Hz 下正常帧 16.7ms；p95 超过 34ms 就说明拖动期间掉到 30fps 以下
Add-Result 'H5-2' '拖动画布时帧率（p95 ≤ 34ms）' (($frames -ge 60) -and ($p95 -gt 0) -and ($p95 -le 34.0)) ('p50=' + $p50 + ' p95=' + $p95 + ' drop=' + $drop + ' frames=' + $frames)

# ---------- 动态断言：phase=16（集中钉子 / 钉集 / 拖入卡顿） ----------
$lines16 = Invoke-Cb '16' 26
$sum16Line = ''
if ($lines16 -and $lines16.Count -gt 0) {
  $lines16 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase16.log') -Encoding utf8
  $hit16 = @($lines16 | Select-String -Pattern '\[diag\] summary16')
  if ($hit16.Count -gt 0) { $sum16Line = $hit16[-1].Line }
  else {
    $fallback = @($lines16 | Select-String -Pattern '\[diag\] pin ')
    if ($fallback.Count -gt 0) { $sum16Line = $fallback[-1].Line }
  }
}
$pinCount = 0
$pinMade = 0
$clusterCount = 0
$imgZ = -1
$pinZ = -1
$maxGap = -1
if ($sum16Line -match 'pins=(\d+)') { $pinCount = [int]$Matches[1] }
if ($sum16Line -match 'made=(\d+)') { $pinMade = [int]$Matches[1] }
if ($sum16Line -match 'cluster=(\d+)') { $clusterCount = [int]$Matches[1] }
if ($sum16Line -match 'imgZ=(-?\d+)') { $imgZ = [int]$Matches[1] }
if ($sum16Line -match 'pinZ=(-?\d+)') { $pinZ = [int]$Matches[1] }
if ($sum16Line -match 'gap=(\d+)') { $maxGap = [int]$Matches[1] }
Add-Result 'H5-16' '左栏「节点类型」能建出集中钉子（.cb-pin 上屏）' (($pinMade -eq 1) -and ($pinCount -ge 1)) ('made=' + $pinMade + ' pins=' + $pinCount + ' ' + (Short $sum16Line))
Add-Result 'H5-17' '图片可钉进钉集（右栏「钉到…」或拖到钉子上）' ($clusterCount -ge 1) ('cluster=' + $clusterCount)
Add-Result 'H5-18' '钉集对外永远置顶（成员 z ≥ 1000，钉子在其上）' (($imgZ -ge 1000) -and ($pinZ -gt $imgZ)) ('imgZ=' + $imgZ + ' pinZ=' + $pinZ)
Add-Result 'H5-19' '长按拖入画布不再卡死（落点后 2s 内最大帧间隔 ≤ 500ms）' (($maxGap -gt 0) -and ($maxGap -le 500)) ('maxGap=' + $maxGap + 'ms')

# H5-20：三个入口的静态检查（右栏挑实体 / 分组总览「＋」/ 图钉颜色）
$pickerOk = (Test-Path (Join-Path $srcRoot 'components\panels\NodePickerDialog.tsx'))
$rightPickLine = @(Select-String -Path (Join-Path $srcRoot 'components\panels\RightPanel.tsx') -Pattern 'requestNodePick' -SimpleMatch)
$treePickLine = @(Select-String -Path (Join-Path $srcRoot 'components\panels\GroupTree.tsx') -Pattern 'requestNodePick' -SimpleMatch)
$swatchLine = @(Select-String -Path (Join-Path $srcRoot 'components\panels\RightPanel.tsx') -Pattern 'pinColor' -SimpleMatch)
Add-Result 'H5-20' '组框可直接挑实体加入（右栏 + 分组总览）且图钉可换色' ($pickerOk -and $rightPickLine.Count -gt 0 -and $treePickLine.Count -gt 0 -and $swatchLine.Count -gt 0) ('picker=' + $pickerOk + ' right=' + $rightPickLine.Count + ' tree=' + $treePickLine.Count + ' color=' + $swatchLine.Count)

# ---------- 动态断言：phase=17（长按拖入画布的分段帧间隔） ----------
$lines17 = Invoke-Cb '17' 16
$sum17Line = ''
if ($lines17 -and $lines17.Count -gt 0) {
  $lines17 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase17.log') -Encoding utf8
  $hit17 = @($lines17 | Select-String -Pattern '\[diag\] summary17')
  if ($hit17.Count -gt 0) { $sum17Line = $hit17[-1].Line }
  else {
    $fb17 = @($lines17 | Select-String -Pattern '\[diag\] seg ')
    if ($fb17.Count -gt 0) { $sum17Line = $fb17[-1].Line }
  }
}
$gHold = -1
$gMove = -1
$gUp = -1
$gSettle = -1
$gGhost = 0
$gNodes = 0
if ($sum17Line -match 'hold=(\d+)') { $gHold = [int]$Matches[1] }
if ($sum17Line -match 'move=(\d+)') { $gMove = [int]$Matches[1] }
if ($sum17Line -match 'up=(\d+)') { $gUp = [int]$Matches[1] }
if ($sum17Line -match 'settle=(\d+)') { $gSettle = [int]$Matches[1] }
if ($sum17Line -match 'ghost=(\d+)') { $gGhost = [int]$Matches[1] }
if ($sum17Line -match 'nodes=(\d+)') { $gNodes = [int]$Matches[1] }
Add-Result 'H5-21' '长按拖入画布不再卡壳（按住 / 拖动两段 ≤ 200ms；落点段含建节点 + 写库，放宽到 ≤ 400ms）' (($gGhost -eq 1) -and ($gNodes -ge 1) -and ($gHold -ge 0) -and ($gHold -le 200) -and ($gMove -le 200) -and ($gUp -le 400)) ('hold=' + $gHold + ' move=' + $gMove + ' up=' + $gUp + ' settle=' + $gSettle + ' ghost=' + $gGhost + ' nodes=' + $gNodes)

# ---------- 动态断言：phase=20（图钉自由落点 / 换色 / 卡片层级按钮） ----------
$lines20 = Invoke-Cb '20' 16
$sum20Line = ''
if ($lines20 -and $lines20.Count -gt 0) {
  $lines20 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase20.log') -Encoding utf8
  $hit20 = @($lines20 | Select-String -Pattern '\[diag\] summary20')
  if ($hit20.Count -gt 0) { $sum20Line = $hit20[-1].Line }
}
$p20Pin = 0
$p20Move = 0
$p20Active = 0
$p20Btn = 0
$p20Z0 = -1
$p20Z1 = -1
$p20Z2 = -1
$p20Color = ''
if ($sum20Line -match 'pin=(\d+)') { $p20Pin = [int]$Matches[1] }
if ($sum20Line -match 'move=(\d+)') { $p20Move = [int]$Matches[1] }
if ($sum20Line -match 'active=(\d+)') { $p20Active = [int]$Matches[1] }
if ($sum20Line -match 'btn=(\d+)') { $p20Btn = [int]$Matches[1] }
if ($sum20Line -match 'z0=(-?\d+)') { $p20Z0 = [int]$Matches[1] }
if ($sum20Line -match 'z1=(-?\d+)') { $p20Z1 = [int]$Matches[1] }
if ($sum20Line -match 'z2=(-?\d+)') { $p20Z2 = [int]$Matches[1] }
if ($sum20Line -match 'color=(rgba?\([^)]*\)|#[0-9a-fA-F]+)') { $p20Color = $Matches[1] }
Add-Result 'H5-22' '图钉可在图片范围内任意落点并换色' (($p20Pin -eq 1) -and ($p20Move -eq 1) -and (($p20Active -ge 1) -or ($p20Color -match 'rgb\(')) -and ($p20Color -ne '')) ('pin=' + $p20Pin + ' move=' + $p20Move + ' active=' + $p20Active + ' color=' + $p20Color + ' ' + (Short $sum20Line))
Add-Result 'H5-23' '卡片右栏「置底 / 置顶」真的改了层级（先降后升）' (($p20Btn -ge 2) -and ($p20Z1 -le $p20Z0) -and ($p20Z2 -gt $p20Z1)) ('btn=' + $p20Btn + ' z0=' + $p20Z0 + ' bottom=' + $p20Z1 + ' top=' + $p20Z2)

# ---------- 动态断言：phase=21（菜单贴边不被视口切掉） ----------
$lines21 = Invoke-Cb '21' 14
$sum21Line = ''
if ($lines21 -and $lines21.Count -gt 0) {
  $lines21 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase21.log') -Encoding utf8
  $hit21 = @($lines21 | Select-String -Pattern '\[diag\] summary21')
  if ($hit21.Count -gt 0) { $sum21Line = $hit21[-1].Line }
}
$m21Inside = 0
if ($sum21Line -match 'inside=(\d+)') { $m21Inside = [int]$Matches[1] }
Add-Result 'H5-24' '长按/右键菜单在屏幕右下角也不被视口切掉' ($m21Inside -eq 1) (Short $sum21Line)

# ---------- 动态断言：phase=22（H5.5 集中钉子改圆点 / 便利贴默认关 / 成员跟随 / 绕钉旋转 / 位置微调） ----------
$lines22 = Invoke-Cb '22' 34
$sum22Line = ''
if ($lines22 -and $lines22.Count -gt 0) {
  $lines22 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase22.log') -Encoding utf8
  $hit22 = @($lines22 | Select-String -Pattern '\[diag\] summary22')
  if ($hit22.Count -gt 0) { $sum22Line = $hit22[-1].Line }
}
$p22Dlg = 0; $p22Cb = 0; $p22Dot = 0; $p22Paper0 = -1; $p22PaperOn = 0
$p22Hdx = 99; $p22Hdy = 99; $p22Attach = 0
$p22PinDx = 0; $p22PinDy = 0; $p22MemDx = 0; $p22MemDy = 0
$p22Rot0 = 0; $p22Rot1 = 0; $p22Nudge = 0
$p22Tog = -1; $p22TogPanel = -1
if ($sum22Line -match 'dlg=(\d+)') { $p22Dlg = [int]$Matches[1] }
if ($sum22Line -match 'cb=(\d+)') { $p22Cb = [int]$Matches[1] }
if ($sum22Line -match 'dot=(\d+)') { $p22Dot = [int]$Matches[1] }
if ($sum22Line -match 'paper0=(-?\d+)') { $p22Paper0 = [int]$Matches[1] }
if ($sum22Line -match 'paperOn=(\d+)') { $p22PaperOn = [int]$Matches[1] }
if ($sum22Line -match 'hdx=(-?\d+)') { $p22Hdx = [int]$Matches[1] }
if ($sum22Line -match 'hdy=(-?\d+)') { $p22Hdy = [int]$Matches[1] }
if ($sum22Line -match 'attach=(\d+)') { $p22Attach = [int]$Matches[1] }
if ($sum22Line -match 'pinDx=(-?\d+)') { $p22PinDx = [int]$Matches[1] }
if ($sum22Line -match 'pinDy=(-?\d+)') { $p22PinDy = [int]$Matches[1] }
if ($sum22Line -match 'memDx=(-?\d+)') { $p22MemDx = [int]$Matches[1] }
if ($sum22Line -match 'memDy=(-?\d+)') { $p22MemDy = [int]$Matches[1] }
if ($sum22Line -match 'rot0=(-?\d+)') { $p22Rot0 = [int]$Matches[1] }
if ($sum22Line -match 'rot1=(-?\d+)') { $p22Rot1 = [int]$Matches[1] }
if ($sum22Line -match 'nudge=(-?\d+)') { $p22Nudge = [int]$Matches[1] }
if ($sum22Line -match 'tog=(-?\d+)') { $p22Tog = [int]$Matches[1] }
if ($sum22Line -match 'togPanel=(-?\d+)') { $p22TogPanel = [int]$Matches[1] }
Add-Result 'H5-25' '集中钉子建出来是一个圆点，新建弹窗会问要不要便利贴' (($p22Dlg -eq 1) -and ($p22Cb -eq 1) -and ($p22Dot -eq 1)) ('dlg=' + $p22Dlg + ' cb=' + $p22Cb + ' dot=' + $p22Dot)
Add-Result 'H5-26' '便利贴默认不显示，右栏切「显示」后才出现' (($p22Paper0 -eq 0) -and ($p22PaperOn -eq 1)) ('paper0=' + $p22Paper0 + ' paperOn=' + $p22PaperOn)
Add-Result 'H5-27' '关系线连接点与圆点同心' ((([math]::Abs($p22Hdx)) -le 2) -and (([math]::Abs($p22Hdy)) -le 2)) ('hdx=' + $p22Hdx + ' hdy=' + $p22Hdy)
Add-Result 'H5-28' '拖动集中钉子时钉集成员跟着一起走' ((([math]::Abs($p22PinDx)) -ge 10) -and (([math]::Abs($p22PinDx - $p22MemDx)) -le 3) -and (([math]::Abs($p22PinDy - $p22MemDy)) -le 3)) ('pin=' + $p22PinDx + ',' + $p22PinDy + ' member=' + $p22MemDx + ',' + $p22MemDy + ' 贴入=' + $p22Attach)
Add-Result 'H5-29' '绕钉旋转会带着图片自身角度一起转，右栏能精确挪位置' (((($p22Rot1 - $p22Rot0 + 360) % 360) -eq 15) -and ($p22Nudge -ge 3)) ('rot=' + $p22Rot0 + '->' + $p22Rot1 + ' nudge=' + $p22Nudge)
Add-Result 'H5-30' '右栏开关停在小地图左边、不压右栏内容' (($p22Tog -eq 1) -and ($p22TogPanel -eq 1)) ('tog=' + $p22Tog + ' togPanel=' + $p22TogPanel + ' ' + ((($sum22Line -split 'tog=')[1]) -replace ' err=.*', ''))

# ---------- 动态断言：phase=23（H5.6 相对位置恒定 / 集中钉右栏瘦身 / 滑块数值输入 / 创建红线） ----------
$lines23 = Invoke-Cb '23' 52
$sum23Line = ''
if ($lines23 -and $lines23.Count -gt 0) {
  $lines23 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase23.log') -Encoding utf8
  $hit23 = @($lines23 | Select-String -Pattern '\[diag\] summary23')
  if ($hit23.Count -gt 0) { $sum23Line = $hit23[-1].Line }
}
$p23KeptPin = -1; $p23KeptMem = -1; $p23Follow = -1
$p23Alias = -1; $p23Map = -1; $p23Comment = -1
$p23Rows = 0; $p23Nums = 0; $p23Slide = -1
$p23Hint = -1; $p23Red = -1; $p23RedW = -1; $p23RedLen = -1; $p23Layer = -1; $p23Attach = 0; $p23Straight = -1; $p23EdgesDelta = 99
if ($sum23Line -match 'keptPin=(-?\d+)') { $p23KeptPin = [int]$Matches[1] }
if ($sum23Line -match 'keptMem=(-?\d+)') { $p23KeptMem = [int]$Matches[1] }
if ($sum23Line -match 'follow=(-?\d+)') { $p23Follow = [int]$Matches[1] }
if ($sum23Line -match 'alias=(-?\d+)') { $p23Alias = [int]$Matches[1] }
if ($sum23Line -match 'map=(-?\d+)') { $p23Map = [int]$Matches[1] }
if ($sum23Line -match 'comment=(-?\d+)') { $p23Comment = [int]$Matches[1] }
if ($sum23Line -match 'rows=(\d+)') { $p23Rows = [int]$Matches[1] }
if ($sum23Line -match 'nums=(\d+)') { $p23Nums = [int]$Matches[1] }
if ($sum23Line -match 'slide=(-?\d+)') { $p23Slide = [int]$Matches[1] }
if ($sum23Line -match 'hint=(-?\d+)') { $p23Hint = [int]$Matches[1] }
if ($sum23Line -match 'red=(-?\d+)') { $p23Red = [int]$Matches[1] }
if ($sum23Line -match 'redW=(-?\d+)') { $p23RedW = [int]$Matches[1] }
if ($sum23Line -match 'redLen=(-?\d+)') { $p23RedLen = [int]$Matches[1] }
if ($sum23Line -match 'layer=(-?\d+)') { $p23Layer = [int]$Matches[1] }
if ($sum23Line -match 'straight=(-?\d+)') { $p23Straight = [int]$Matches[1] }
if ($sum23Line -match 'edgesDelta=(-?\d+)') { $p23EdgesDelta = [int]$Matches[1] }
if ($sum23Line -match 'attach=(\d+)') { $p23Attach = [int]$Matches[1] }
Add-Result 'H5-31' '拖动集中钉子后，钉子与成员图片的相对位置不变' ($p23KeptPin -eq 1) ('keptPin=' + $p23KeptPin + ' 贴入=' + $p23Attach + ' ' + ((($sum23Line -split 'keptPin=')[1]) -replace ' keptMem=.*', ''))
Add-Result 'H5-32' '拖动钉集成员时成员跟手走、松手后相对位置不变' (($p23KeptMem -eq 1) -and ($p23Follow -eq 1)) ('keptMem=' + $p23KeptMem + ' follow=' + $p23Follow)
Add-Result 'H5-33' '集中钉右栏不再显示别名 / 地图坐标 / 评论' (($p23Alias -eq 1) -and ($p23Map -eq 1) -and ($p23Comment -eq 1)) ('alias=' + $p23Alias + ' map=' + $p23Map + ' comment=' + $p23Comment)
Add-Result 'H5-34' '相对位置与旋转是「每行一个滑块 + 可输入数字」' (($p23Rows -ge 3) -and ($p23Nums -ge 3) -and ($p23Slide -eq 1)) ('rows=' + $p23Rows + ' nums=' + $p23Nums + ' slide=' + $p23Slide)
Add-Result 'H5-35' '长按集中钉 → 创建红线 → 点另一钉子，出现略宽红色实心线' (($p23Hint -eq 1) -and ($p23Red -ge 1) -and ($p23RedW -ge 3)) ('hint=' + $p23Hint + ' red=' + $p23Red + ' redW=' + $p23RedW)
Add-Result 'H5-36' '红线在画布上真的有长度（不是两端重合的隐形线）' ($p23RedLen -ge 40) ('redLen=' + $p23RedLen)
Add-Result 'H5-38' '红线待连接态有全画布热区，点第二颗钉子能落在热区上（不被手柄吃掉）' ($p23Layer -eq 1) ('layer=' + $p23Layer)
Add-Result 'H5-39' '红线是一条直线，且没有变成关系线（关系数不变）' (($p23Straight -eq 1) -and ($p23EdgesDelta -eq 0)) ('straight=' + $p23Straight + ' edgesDelta=' + $p23EdgesDelta)

# ---------- 动态断言：phase=24（H5.6.1 右键菜单删除节点） ----------
$lines24 = Invoke-Cb '24' 20
$sum24Line = ''
if ($lines24 -and $lines24.Count -gt 0) {
  $lines24 -join "`n" | Set-Content -Path (Join-Path $tmpDir 'accept-h5-phase24.log') -Encoding utf8
  $hit24 = @($lines24 | Select-String -Pattern '\[diag\] summary24')
  if ($hit24.Count -gt 0) { $sum24Line = $hit24[-1].Line }
}
$p24Menu = -1; $p24Deleted = -1; $p24Before = -1; $p24After = -1
if ($sum24Line -match 'menu=(-?\d+)') { $p24Menu = [int]$Matches[1] }
if ($sum24Line -match 'before=(-?\d+)') { $p24Before = [int]$Matches[1] }
if ($sum24Line -match 'after=(-?\d+)') { $p24After = [int]$Matches[1] }
if ($sum24Line -match 'deleted=(-?\d+)') { $p24Deleted = [int]$Matches[1] }
Add-Result 'H5-37' '长按/右键菜单有「删除此节点」，点了之后画布节点 -1' (($p24Menu -eq 1) -and ($p24Deleted -eq 1)) ('menu=' + $p24Menu + ' before=' + $p24Before + ' after=' + $p24After + ' deleted=' + $p24Deleted)

# ---------- 汇总 ----------
$failed = @($results | Where-Object { -not $_.ok })
$report = [ordered]@{
  ok      = ($failed.Count -eq 0)
  passed  = @($results | Where-Object { $_.ok }).Count
  failed  = $failed.Count
  total   = $results.Count
  target  = $Target
  hap     = (Get-Item $Hap).Length
  results = $results
}
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding utf8
Write-Host ''
Write-Host ("H5 验收：{0}/{1} 通过，报告 {2}" -f $report.passed, $report.total, $OutFile)
if ($failed.Count -gt 0) { exit 1 }
exit 0
