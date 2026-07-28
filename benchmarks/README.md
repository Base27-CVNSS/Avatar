# Benchmark tiếng Việt

Cybergirl 3.3 benchmark tại runtime thay vì chép số liệu từ máy khác.

## TTS

Dashboard gọi `benchmark_tts` qua Native Messaging. Windows SAPI và Piper/VITS
được chạy với cùng câu tiếng Việt. Kết quả trả về JSON với thời gian tổng hợp,
thời lượng WAV, RTF, thông lượng và lỗi khả dụng.

## STT và LLM

Phiên bản kế tiếp có thể mở rộng cùng nguyên tắc:

- STT: WER/CER trên tập kiểm thử tiếng Việt có giấy phép rõ ràng, kèm RTF;
- LLM GGUF: token/giây, độ trễ token đầu và RAM đỉnh;
- VAD: thời gian xử lý cửa sổ 32 ms, false-start và missed-speech.

Không trộn kết quả API đám mây với kết quả CPU cục bộ trong cùng bảng xếp hạng.
