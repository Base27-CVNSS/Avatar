param(
  [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
  [string]$ExtensionId = "pcfncoabnpdbnnhiigkeicboimiilphl",
  [switch]$Chrome
)

$ErrorActionPreference = "Stop"
$hostName = "vn.base27.cybergirl"
$hostExe = Join-Path $InstallDir "Cybergirl-Companion.exe"
$template = Join-Path $PSScriptRoot "$hostName.json"
$manifestDir = Join-Path $env:LOCALAPPDATA "Cybergirl\NativeMessaging"
$manifestPath = Join-Path $manifestDir "$hostName.json"

if (-not (Test-Path $hostExe)) {
  throw "Không tìm thấy Cybergirl-Companion.exe tại $hostExe"
}

New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null
$manifest = Get-Content -LiteralPath $template -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest.path = $hostExe
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$json = $manifest | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($manifestPath, $json, (New-Object Text.UTF8Encoding($false)))

$edgeKey = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
New-Item -Path $edgeKey -Force | Out-Null
Set-Item -Path $edgeKey -Value $manifestPath

if ($Chrome) {
  $chromeKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  New-Item -Path $chromeKey -Force | Out-Null
  Set-Item -Path $chromeKey -Value $manifestPath
}

Write-Host "Đã đăng ký $hostName cho Microsoft Edge."
