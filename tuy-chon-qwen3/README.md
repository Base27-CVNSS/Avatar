# Qwen3-TTS thử nghiệm

Thư mục này chỉ dành cho người phát triển muốn thử Qwen3-TTS bằng Python.
Nó **không được đóng gói** vào Cybergirl Windows và không phải điều kiện để
người dùng cuối chạy ứng dụng.

Qwen3-TTS hiện không công bố tiếng Việt trong danh sách ngôn ngữ hỗ trợ chính
thức. Vì vậy, Cybergirl 2.0 mặc định dùng giọng `vi-VN` có sẵn trong Microsoft
Edge/Windows. Tùy chọn này cần được benchmark riêng trước khi đưa vào bản ổn định.

Các thay đổi so với mã thử nghiệm ban đầu:

- Dùng chữ ký `generate_voice_clone` hiện tại: `ref_audio`, `ref_text`,
  `language="Auto"`.
- Tự chọn CUDA nếu khả dụng; có thể chạy CPU để kiểm thử.
- Không khởi động thêm bảng điều khiển HTTP; nhân vật do lõi Cybergirl quản lý.
- Chuẩn hóa audio 16 kHz mono PCM và giới hạn biên độ trước khi gửi.

