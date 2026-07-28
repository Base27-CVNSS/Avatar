# Mô hình cục bộ

Thư mục này không chứa model nhị phân trong Git để tránh làm repository quá
lớn. Companion cho phép chọn các tệp đã tải trên máy:

```text
models/
├── silero_vad.onnx
├── ggml-small-q5_1.bin       # Whisper đa ngôn ngữ
├── qwen3-4b-q4_k_m.gguf     # ví dụ LLM GGUF
└── vi_VN-voice.onnx         # TTS Piper tiếng Việt tùy chọn
```

Các binary `whisper-cli.exe`, `llama-server.exe` và `piper.exe` được chọn trong
dashboard. Không đặt khóa API hoặc dữ liệu hội thoại vào thư mục này.

Có thể tải Silero và Whisper đa ngôn ngữ sau khi cài:

```powershell
powershell -ExecutionPolicy Bypass -File .\tai-model-giong-noi.ps1 -Whisper small
```

Script chỉ chạy khi người dùng chủ động gọi và tải từ repository chính thức của
Silero VAD cùng kho model whisper.cpp.
