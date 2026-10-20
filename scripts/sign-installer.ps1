# CaseBoard installer code signing (M8 acceptance 5).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1 -CertThumbprint XXXXX
#   powershell -ExecutionPolicy Bypass -File scripts/sign-installer.ps1 -SelfSignedTest
#
# Note (2026-10-19): this machine has no code signing certificate in Cert:\CurrentUser\My,
# so the build pipeline can only prove that the installer exists and that this script is ready.
# A trusted certificate is required before distribution, otherwise Windows still warns about an unknown publisher.
param(
  [string]$InstallerPath = "",
  [string]$ExePath = "src-tauri/target/release/caseboard.exe",
  [string]$CertThumbprint = "",
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [switch]$SelfSignedTest
)

$ErrorActionPreference = "Stop"

function Find-SignTool {
  $candidates = @(
    "F:\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
  )
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  $found = Get-ChildItem "F:\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\signtool.exe" } | Select-Object -First 1
  if ($found) { return $found.FullName }
  throw "signtool.exe not found: install the Windows SDK signing tools."
}

function Resolve-Certificate {
  if ($SelfSignedTest) {
    Write-Host "[sign] creating a self-signed test certificate (trusted only on this machine)"
    return New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=CaseBoard Test Signing" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1)
  }
  if ($CertThumbprint) {
    $cert = Get-ChildItem "Cert:\CurrentUser\My" | Where-Object { $_.Thumbprint -eq $CertThumbprint } | Select-Object -First 1
    if (-not $cert) { throw "No certificate with thumbprint $CertThumbprint in the current user store." }
    return $cert
  }
  $cert = Get-ChildItem "Cert:\CurrentUser\My" -CodeSigningCert -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cert) {
    throw "No code signing certificate on this machine. Import a trusted code signing certificate first, or pass -SelfSignedTest to rehearse the signing flow (a self-signed certificate does not remove the unknown publisher warning on other machines)."
  }
  return $cert
}

$signTool = Find-SignTool
$cert = Resolve-Certificate
Write-Host "[sign] certificate: $($cert.Subject) ($($cert.Thumbprint))"

# With no explicit installer path, sign the newest installer (bundle output first, then release\ archive)
if (-not $InstallerPath) {
  $candidates = @()
  foreach ($dir in @("src-tauri/target/release/bundle/nsis", "release")) {
    if (Test-Path $dir) { $candidates += Get-ChildItem $dir -Filter "*setup.exe" -File -ErrorAction SilentlyContinue }
  }
  $newest = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($newest) { $InstallerPath = $newest.FullName }
}

$targets = @()
foreach ($path in @($ExePath, $InstallerPath)) {
  if ($path -and (Test-Path $path)) { $targets += (Resolve-Path $path).Path }
}
if ($targets.Count -eq 0) { throw "Nothing to sign: run node scripts/tauri-cli.cjs build --bundles nsis first." }

foreach ($target in $targets) {
  Write-Host "[sign] $target"
  & $signTool sign /fd SHA256 /td SHA256 /tr $TimestampUrl /sha1 $cert.Thumbprint $target
  if ($LASTEXITCODE -ne 0) { throw "Signing failed: $target" }
  & $signTool verify /pa $target
  if ($LASTEXITCODE -ne 0) {
    if ($SelfSignedTest) {
      Write-Host "[sign] verify reports an untrusted root: expected for a self-signed rehearsal certificate"
    } else {
      throw "Signature verification failed: $target"
    }
  }
}

Write-Host "[sign] done: $($targets.Count) file(s) signed and verified."
Write-Host "[sign] note: a self-signed certificate is trusted only on this machine."
