# Changelog

Các thay đổi đáng chú ý của Avatar VN được ghi tại đây.

## 1.4.0 — 28/07/2026

- Thay ảnh mặc định bằng bản phục hồi mới: môi hé nhẹ, răng màu ngà và bóng khoang miệng tự nhiên hơn.
- Xóa hoàn toàn cơ chế `cavityColor` từng tạo dải hồng/đỏ cố định.
- Tách vùng dựng thành lớp môi trên, môi dưới, khẩu độ cong và mặt nạ feathered.
- Thu vùng biến dạng sát môi để không kéo đường ngang sang má, cằm hoặc bàn tay.
- Giữ texture răng từ ảnh nguồn; không vẽ răng trắng hoặc oval miệng nhân tạo.
- Thêm noise gate và nén biên độ cho audio/microphone để miệng không bật mở quá mức.
- Bổ sung viseme cho `ph`, `th`, `tr`, `ch`, `nh`, `ng`, `kh`, `gh`, `qu`, `gi`.
- Dùng target viseme thực tại sự kiện ranh giới TTS thay cho xung mở cố định.
- Hạ mặc định khẩu hình xuống 52% và vi chuyển động xuống 24%.

## 1.3.0 — 28/07/2026

- Phục hồi vùng môi của ảnh mặc định, loại đường đen dày và giữ bóng môi/răng tự nhiên.
- Dùng WebP 3840×2160 cho runtime Edge và tạo ảnh master 7680×4320 cục bộ theo yêu cầu.
- Chuyển dashboard sang khung hình 16:9 và thêm nút tải ảnh master 8K.
- Giảm độ mở môi, độ tối khoang miệng và nét mí để chuyển động không tạo vệt đen.
- Lập lịch viseme tiếng Việt theo nguyên âm, phụ âm, khoảng trắng và dấu câu.
- Giữ kết quả nhận dạng giọng nói làm viseme ưu tiên ngắn hạn khi dùng microphone.
- Đổi toàn bộ icon extension sang nhận diện màu hồng.

## 1.2.1 — 28/07/2026

- Đặt ảnh chân dung do người dùng cung cấp làm avatar mặc định.
- Tự chạy Face Mesh trên ảnh mặc định ngay khi studio khởi động hoặc được đặt lại.
- Bổ sung bộ landmark dự phòng đã căn theo mắt, miệng và khung mặt của ảnh này.
- Giữ nguyên tệp PNG gốc, không nén lại hoặc thay đổi nội dung ảnh.

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
