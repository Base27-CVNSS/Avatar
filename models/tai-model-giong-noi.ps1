param(
  [ValidateSet("tiny", "base", "small")]
  [string]$Whisper = "small",
  [string]$Destination = (Join-Path $env:LOCALAPPDATA "Cybergirl\Models")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

$sileroUrl = "https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/data/silero_vad.onnx"
$sileroPath = Join-Path $Destination "silero_vad.onnx"
Invoke-WebRequest -Uri $sileroUrl -OutFile $sileroPath

$whisperFile = "ggml-$Whisper-q5_1.bin"
$whisperUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$whisperFile"
$whisperPath = Join-Path $Destination $whisperFile
Invoke-WebRequest -Uri $whisperUrl -OutFile $whisperPath

Write-Host "Đã tải model vào $Destination"
Write-Host "Silero: $sileroPath"
Write-Host "Whisper: $whisperPath"
Write-Host "Bạn vẫn cần chọn whisper-cli.exe, llama-server.exe và LLM GGUF trong dashboard."

