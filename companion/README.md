# Cybergirl Companion 5.2

Companion là Native Messaging host tùy chọn chạy cục bộ trên Windows. Microsoft
Edge giao tiếp bằng JSON có tiền tố độ dài; không mở cổng mạng công khai và
không nhận ảnh chân dung.

## Chuỗi xử lý

```text
Microphone
  → PCM16 + Edge Web Speech trong frontend dùng chung
  → văn bản qua Native Messaging
  → Demo/GGUF qua llama-server hoặc OpenAI/Gemini/OpenRouter API
  → Windows SAPI hoặc Piper/VITS tiếng Việt
  → phoneme timing + Emotion Engine
  → Mouth Engine, gaze, blink và head motion trong Edge
```

Các adapter Silero/Whisper 3.x vẫn còn để đọc cấu hình cũ, nhưng nút Chat live
5.2 không gọi `start_listening`. PCM VAD, lựa chọn thiết bị và phục hồi digital
silence nằm trong `audio/pcm-web-speech.js`.

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
