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
