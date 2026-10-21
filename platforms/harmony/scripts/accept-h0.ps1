<#
.SYNOPSIS
  案情板鸿蒙 H0 验收：一条命令跑完 A1–A4 / B1–B4，输出 JSON 报告。

.DESCRIPTION
  机器断言（全部通过才 exit 0）：
    A1  hvigorw assembleHap 成功；HAP 内含 resources/rawfile/index.html 与 ≥1 个 assets/*.js
    A2  rawfile/index.html 里没有以 "/" 开头的 src/href；有 "./assets/"；assets/*.js 里没有 "/assets/"
    A3  HAP ≤ 8MB；rawfile 下无 ocr/、traineddata、tesseract-core-
    A4  hvigor 输出里没有出自本项目源文件的 error:
    B1  uitest dumpLayout 出现「画布」「节点类型」「案件概览」
    B2  本次启动区间内 [web-console] 无错误行；无新增 jscrash
    B3  hilog 出现 [bridge] ping -> {"ok":true,"value":"pong"} 且 appinfo 的 platform 为 harmony
    B4  内置自检 dbOk / fsOk / rawfileOk 全 true，并记录 fts5Ok

.PARAMETER SkipBuild
  跳过 hvigorw 构建，直接复用已有 HAP（改完 ArkTS 没重新构建时别用）。
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$SkipWeb,
  [string]$OutFile = ''
)

$ErrorActionPreference = 'Continue'  # 原生命令（hvigorw/hdc）会往 stderr 写正常警告，Stop 会误判为致命错误

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $ProjectRoot 'web'
$RawfileDir = Join-Path $ProjectRoot 'entry/src/main/resources/rawfile'
$HapPath = Join-Path $ProjectRoot 'entry/build/default/outputs/default/entry-default-unsigned.hap'
$Bundle = 'com.caseboard.harmony'
$Ability = 'EntryAbility'
$Hdc = 'D:\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$Hvigorw = 'D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat'
$DevEcoNode = 'D:\DevEco Studio\tools\node'
if (-not $OutFile) { $OutFile = Join-Path $ProjectRoot '.tmp-esbuild/accept-h0.json' }

$report = [ordered]@{
  generatedAt = (Get-Date).ToString('s')
  project = $ProjectRoot
  A1 = $null; A2 = $null; A3 = $null; A4 = $null
  B1 = $null; B2 = $null; B3 = $null; B4 = $null
  ok = $false
}

function Fail([string]$message) { throw $message }

# ------------------------------------------------------- 第 0 步：前端产物 --
if (-not $SkipWeb) {
  $webScript = Join-Path $PSScriptRoot 'build-web.ps1'
  Write-Host '[0/3] 构建 ArkWeb 前端产物'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $webScript
  if ($LASTEXITCODE -ne 0) { Fail "前端产物构建失败（exit $LASTEXITCODE）" }
}

# ------------------------------------------------------------------ A1 构建 --
if (-not (Test-Path $Hdc)) { Fail "找不到 hdc：$Hdc" }
if (-not $SkipBuild) {
  $env:NODE_HOME = $DevEcoNode
  $env:DEVECO_SDK_HOME = 'D:\DevEco Studio\sdk'
  $env:PATH = "$DevEcoNode;$env:PATH"
  Push-Location $ProjectRoot
  try {
    $buildLog = & $Hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1
    $buildExit = $LASTEXITCODE
  } finally { Pop-Location }
  $buildText = ($buildLog | Out-String)
} else {
  $buildText = ''
  $buildExit = 0
}
if (-not (Test-Path $HapPath)) { Fail "HAP 不存在：$HapPath（构建未成功）" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($HapPath)
try {
  $entryNames = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
} finally { $zip.Dispose() }
$hasIndexHtml = [bool]($entryNames | Where-Object { $_ -like '*rawfile/index.html' })
$packedJs = @($entryNames | Where-Object { $_ -match 'rawfile/assets/.*\.js$' })
$hapBytes = (Get-Item $HapPath).Length
$report.A1 = [ordered]@{
  ok            = ([bool]$hasIndexHtml) -and ($packedJs.Count -ge 1) -and ($buildExit -eq 0)
  buildExit     = $buildExit
  hap           = $HapPath
  hapBytes      = $hapBytes
  hasIndexHtml  = $hasIndexHtml
  packedJsCount = $packedJs.Count
}

# ------------------------------------------------------- A2 相对路径断言 --
$indexHtmlPath = Join-Path $RawfileDir 'index.html'
if (-not (Test-Path $indexHtmlPath)) { Fail "rawfile/index.html 不存在：$indexHtmlPath" }
$indexHtml = Get-Content -LiteralPath $indexHtmlPath -Raw
$absSrc = ([regex]::Matches($indexHtml, 'src="/')).Count
$absHref = ([regex]::Matches($indexHtml, 'href="/')).Count
$relAssets = ([regex]::Matches($indexHtml, '(?:src|href)="\./assets/')).Count
$crossorigin = ([regex]::Matches($indexHtml, '\scrossorigin')).Count
$jsFiles = @(Get-ChildItem -LiteralPath (Join-Path $RawfileDir 'assets') -Filter '*.js' -File)
$jsAbsAssets = 0
foreach ($js in $jsFiles) {
  $text = Get-Content -LiteralPath $js.FullName -Raw
  $jsAbsAssets += ([regex]::Matches($text, '"/assets/')).Count
}
$report.A2 = [ordered]@{
  ok                = ($absSrc -eq 0) -and ($absHref -eq 0) -and ($relAssets -ge 1) -and ($jsAbsAssets -eq 0)
  absSrcCount       = $absSrc
  absHrefCount      = $absHref
  relAssetsCount    = $relAssets
  crossoriginInHtml = $crossorigin
  jsAbsAssetsCount  = $jsAbsAssets
  jsFileCount       = $jsFiles.Count
}

# ---------------------------------------------------------- A3 体积与去皮 --
$allRaw = @(Get-ChildItem -LiteralPath $RawfileDir -Recurse -File)
$ocrArtifacts = @($allRaw | Where-Object { $_.FullName -match '(\\|/)ocr(\\|/)|traineddata|tesseract-core-' } |
  ForEach-Object { $_.FullName.Substring($ProjectRoot.Length + 1) })
$hapMB = [math]::Round($hapBytes / 1MB, 2)
$report.A3 = [ordered]@{
  ok           = ($hapMB -le 8) -and ($ocrArtifacts.Count -eq 0)
  hapMB        = $hapMB
  ocrArtifacts = $ocrArtifacts
  rawfileFiles = $allRaw.Count
}

# ------------------------------------------------------------ A4 编译报错 --
$ownErrorLines = @()
if ($buildText) {
  $ownErrorLines = @($buildText -split "`r?`n" | Where-Object {
      $_ -match 'error:\s' -and $_ -notmatch 'arkts\.lang\.d\.ets'
    })
}
$report.A4 = [ordered]@{
  ok             = ($ownErrorLines.Count -eq 0) -and ($buildExit -eq 0)
  ownErrorLines  = $ownErrorLines.Count
  note           = 'arkts_check 的 6 条 error 全部出自 SDK 自身 @arkts.lang.d.ets，已按文件名过滤'
}

# ------------------------------------------------- B1–B4 上机（自检启动） --
$jscrashBefore = @(& $Hdc shell "ls /data/log/faultlog/faultlogger/ 2>/dev/null" 2>&1 |
  Where-Object { $_ -match 'jscrash' -and $_ -match 'caseboard' }).Count

& $Hdc shell aa force-stop $Bundle 2>&1 | Out-Null
$installOut = (& $Hdc install -r $HapPath 2>&1 | Out-String)
$installOk = $installOut -match 'successfully'
& $Hdc shell hilog -r 2>&1 | Out-Null
$startOut = (& $Hdc shell aa start -a $Ability -b $Bundle --ps caseboardSelftest 1 2>&1 | Out-String)
if ($startOut -notmatch 'successfully') { Fail "启动失败：$startOut" }
Start-Sleep -Seconds 16

# B1：界面文案断言
& $Hdc shell 'uitest dumpLayout -p /data/local/tmp/caseboard-h0.json' 2>&1 | Out-Null
Start-Sleep -Milliseconds 500
$layout = (& $Hdc shell 'cat /data/local/tmp/caseboard-h0.json' 2>&1 | Out-String)
$requiredTexts = @('画布', '节点类型', '案件概览')
$foundTexts = @($requiredTexts | Where-Object { $layout.Contains($_) })
$report.B1 = [ordered]@{
  ok       = ($foundTexts.Count -eq $requiredTexts.Count)
  required = $requiredTexts
  found    = $foundTexts
  layoutBytes = $layout.Length
}

# 取本次启动区间的 hilog
$hilog = @(& $Hdc shell 'hilog -x' 2>&1)
$appLines = @($hilog | Where-Object { $_ -match 'A0c0de/CaseBoard' -or $_ -match 'ARKWEB-CONSOLE' })

# B2：控制台错误 + 新增 jscrash
$consoleLines = @($hilog | Where-Object { $_ -match '\[web-console\]' })
$consoleErrors = @($consoleLines | Where-Object {
    $_ -match 'Uncaught|Error:|TypeError|ReferenceError|SyntaxError|Failed to|ERR_'
  })
$webErrors = @($hilog | Where-Object { $_ -match '\[web-error\]' })
$jscrashAfter = @(& $Hdc shell "ls /data/log/faultlog/faultlogger/ 2>/dev/null" 2>&1 |
  Where-Object { $_ -match 'jscrash' -and $_ -match 'caseboard' }).Count
$report.B2 = [ordered]@{
  ok                = ($consoleErrors.Count -eq 0) -and ($webErrors.Count -eq 0) -and
                      ($jscrashAfter -le $jscrashBefore)
  consoleLineCount  = $consoleLines.Count
  consoleErrorCount = $consoleErrors.Count
  webErrorCount     = $webErrors.Count
  newJsCrash        = ($jscrashAfter - $jscrashBefore)
  consoleErrorSample = @($consoleErrors | Select-Object -First 3)
}

# B3：bridge ping + appinfo
# 只认我们自己转发进 hilog 的那一份（A0c0de/CaseBoard）；ARKWEB-CONSOLE 的重复行尾部带 ", source: (n)"，会污染 JSON
$bridgeLines = @($hilog | Where-Object { $_ -match 'A0c0de/CaseBoard' -and $_ -match '\[bridge\] ' })
$pingLine = @($bridgeLines | Where-Object { $_ -match '\[bridge\] ping -> ' } | Select-Object -First 1)
$infoLine = @($bridgeLines | Where-Object { $_ -match '\[bridge\] appinfo -> ' } | Select-Object -First 1)
$pingOk = ($pingLine.Count -eq 1) -and ($pingLine[0] -match '"value":"pong"')
$infoOk = ($infoLine.Count -eq 1) -and ($infoLine[0] -match '"platform":"harmony"')
$pingText = ''; if ($pingLine.Count -gt 0) { $pingText = $pingLine[0] }
$infoText = ''; if ($infoLine.Count -gt 0) { $infoText = $infoLine[0] }
$report.B3 = [ordered]@{
  ok       = $pingOk -and $infoOk
  pingLine = if ($pingLine.Count -gt 0) { $pingLine[0] } else { '' }
  appInfoLine = if ($infoLine.Count -gt 0) { $infoLine[0] } else { '' }
}

# B4：内置自检（db / 文件 / rawfile / FTS5）
$selftestLine = @($bridgeLines | Where-Object { $_ -match '\[bridge\] selftest -> ' } | Select-Object -Last 1)
$selftest = $null
if ($selftestLine.Count -eq 1) {
  $jsonText = ($selftestLine[0] -split '\[bridge\] selftest -> ', 2)[1]
  try { $selftest = $jsonText | ConvertFrom-Json } catch { $selftest = $null }
}
$selftestValue = if ($selftest) { $selftest.value } else { $null }
$selftestMessage = '未取到自检结果'; if ($selftestValue) { $selftestMessage = $selftestValue.message }
$selftestRaw = ''; if ($selftestLine.Count -gt 0) { $selftestRaw = $selftestLine[0] }
$report.B4 = [ordered]@{
  ok        = [bool]($selftestValue -and $selftestValue.dbOk -and $selftestValue.fsOk -and $selftestValue.rawfileOk)
  dbOk      = [bool]($selftestValue -and $selftestValue.dbOk)
  fsOk      = [bool]($selftestValue -and $selftestValue.fsOk)
  rawfileOk = [bool]($selftestValue -and $selftestValue.rawfileOk)
  fts5Ok    = [bool]($selftestValue -and $selftestValue.fts5Ok)
  message   = if ($selftestValue) { $selftestValue.message } else { '未取到自检结果' }
  raw       = if ($selftestLine.Count -gt 0) { $selftestLine[0] } else { '' }
}

$report.installOk = $installOk
$report.ok = [bool]($report.A1.ok -and $report.A2.ok -and $report.A3.ok -and $report.A4.ok -and
                    $report.B1.ok -and $report.B2.ok -and $report.B3.ok -and $report.B4.ok)

$dir = Split-Path -Parent $OutFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutFile -Encoding utf8

$report.GetEnumerator() | Where-Object { $_.Key -match '^[AB]\d$' } | ForEach-Object {
  $status = if ($_.Value.ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("{0} {1}" -f $_.Key, $status)
}
Write-Host ("报告：{0}" -f $OutFile)
if (-not $report.ok) { exit 1 }
exit 0
