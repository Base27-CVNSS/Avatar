# Cybergirl Companion 3.3

Companion là Native Messaging host chạy cục bộ trên Windows. Microsoft Edge
giao tiếp bằng JSON có tiền tố độ dài; không mở cổng mạng công khai và không
nhận ảnh chân dung.

## Chuỗi xử lý

```text
Microphone 16 kHz
  → Silero VAD ONNX (CPU)
  → WAV của một câu nói
  → whisper.cpp đa ngôn ngữ, ép ngôn ngữ vi
  → GGUF qua llama-server hoặc OpenAI/Gemini/OpenRouter API
  → Windows SAPI hoặc Piper/VITS tiếng Việt
  → phoneme timing + Emotion Engine
  → Mouth Engine, gaze, blink và head motion trong Edge
```

Silero VAD dùng cửa sổ 512 mẫu ở 16 kHz. Hai cửa sổ liên tiếp vượt ngưỡng mới
mở câu; khoảng lặng mặc định 650 ms đóng câu. Khi người dùng bắt đầu nói,
companion phát sự kiện ngắt để dừng TTS hiện tại.
Khi TTS đang phát, echo-guard nâng ngưỡng VAD và yêu cầu nhiều cửa sổ liên tiếp
hơn; lời nói thật đủ rõ vẫn tạo barge-in. Đây là lớp chống vọng nhẹ, không tuyên
bố thay thế WebRTC Acoustic Echo Cancellation ở cấp hệ điều hành.

## Lệnh Native Messaging

| Lệnh | Mục đích |
|---|---|
| `status` | Kiểm tra host và model/binary |
| `configure` | Lưu đường dẫn, model, provider; khóa API chỉ vào RAM |
| `start_listening` | Mở Silero VAD và microphone |
| `stop_listening` | Đóng stream, thread và bộ đệm |
| `chat` | GGUF/OpenAI/Gemini/OpenRouter tạo câu trả lời |
| `speak` | Tổng hợp và phát TTS cục bộ |
| `interrupt` | Dừng phát giọng ngay |
| `benchmark_tts` | Đo thời gian tổng hợp, RTF và ký tự/giây |
| `registry` | Danh bạ model/voice để hot-swap |
| `memory_status` | Thống kê bộ nhớ SQLite cục bộ |
| `clear_memory` | Xóa bộ nhớ dài hạn |

Sự kiện gồm `audio.level`, `vad.speech_start`, `vad.speech_end`, `stt.final`,
`llm.thinking`, `llm.answer`, `emotion.changed`, `audio.echo_suppressed`,
`tts.started`, `tts.ended` và `pipeline.error`.

## Model không được nhúng vào Git

- `silero_vad.onnx`: mô hình chính thức từ Silero VAD.
- Whisper: mô hình đa ngôn ngữ của whisper.cpp; máy RAM 16 GB nên bắt đầu với
  `small` đã lượng tử hóa.
- GGUF: ưu tiên mô hình hướng dẫn 3–4B Q4 cho CPU/RAM 16 GB.
- Piper/VITS: người dùng tự chọn model tiếng Việt và chịu giấy phép riêng của
  model. Windows SAPI là lựa chọn cục bộ mặc định.

## Benchmark TTS

Chạy từ dashboard hoặc:

```powershell
python -m companion.benchmark_tts
```

Mỗi engine tổng hợp cùng một câu. Báo cáo không dùng số dựng sẵn:

- `synthesis_ms`: thời gian từ lúc gọi đến khi WAV hoàn thành;
- `audio_seconds`: thời lượng WAV;
- `rtf = synthesis_seconds / audio_seconds`;
- `characters_per_second`: thông lượng văn bản.

`RTF < 1` nghĩa là tổng hợp nhanh hơn thời gian phát. Kết quả phụ thuộc CPU,
voice và model trên chính máy đang chạy, vì vậy Cybergirl không công bố một
bảng số liệu giả định dùng chung cho mọi máy.
