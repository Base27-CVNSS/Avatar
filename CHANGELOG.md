# Changelog

Các thay đổi đáng chú ý của Avatar VN được ghi tại đây.

## 1.2.0 — 28/07/2026

- Tách mỗi ảnh upload thành một revision; kết quả landmark trễ không thể áp vào ảnh mới.
- Kiểm tra tỷ lệ mắt, miệng và khung mặt trước khi dựng; hiển thị điểm chất lượng.
- Giới hạn độ rộng/độ cao vùng môi để ngăn patch tràn xuống cằm.
- Nội suy coarticulation giữa các viseme tiếng Việt thay vì đổi khẩu hình đột ngột.
- Chuyển lịch TTS từ theo từ sang theo ký tự để môi bám lời đọc mượt hơn.
- Thêm chớp mắt đôi ngẫu nhiên và chuyển động đầu theo mục tiêu mềm.
- Giới hạn render 30 FPS, giảm xuống 10 FPS khi tab bị ẩn.
- Hiển thị cảnh báo rõ ràng khi dashboard bị mở trực tiếp bằng `file://`.
- Thêm bộ kiểm tra không dependency cho Manifest, CSP, asset Face Mesh và WASM.

## 1.1.0 — 28/07/2026

- Tích hợp MediaPipe Face Mesh và model WebAssembly cục bộ.
- Tự định vị môi, mắt và khung mặt; bổ sung hiệu chỉnh thủ công 5 điểm.
- Giữ texture môi/mắt gốc, loại bỏ oval đen, răng và lưỡi giả.
- Không lưu hoặc tái sử dụng landmark giữa các ảnh.

## 1.0.0 — 28/07/2026

- Phiên bản Microsoft Edge Manifest V3 đầu tiên.
- TTS/STT tiếng Việt, tệp audio, Canvas lip-sync, snapshot PNG và dashboard responsive.
