param([switch]$Chrome)

$hostName = "vn.base27.cybergirl"
$edgeKey = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
$manifestPath = Join-Path $env:LOCALAPPDATA "Cybergirl\NativeMessaging\$hostName.json"

Remove-Item -Path $edgeKey -Recurse -Force -ErrorAction SilentlyContinue
if ($Chrome) {
  Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue
Write-Host "Đã gỡ đăng ký $hostName."

