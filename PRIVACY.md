# Chính sách riêng tư — Cybergirl

Ngày hiệu lực: 28/07/2026

Cybergirl được thiết kế theo nguyên tắc ảnh cục bộ, API minh bạch và quyền tối
thiểu.

## Dữ liệu được xử lý cục bộ

- Ảnh và tệp âm thanh do người dùng chọn.
- Landmark khuôn mặt do MediaPipe Face Mesh tạo.
- Texture môi, răng, mắt và các khung Canvas.
- Tùy chọn khẩu hình, chuyển động, tốc độ và cao độ.
- Lịch sử hội thoại của phiên đang mở.

Ảnh, landmark và texture khuôn mặt không được gửi tới lõi Python hoặc API AI.

## Microphone và Web Speech

Microphone chỉ mở sau khi người dùng bấm bắt đầu. Khi dừng hoặc đóng ứng dụng,
track microphone được đóng. Web Speech API do Microsoft Edge/Windows cung cấp;
tùy phiên bản và cấu hình, dịch vụ nhận dạng giọng có thể xử lý trực tuyến theo
chính sách của Microsoft.

## API hội thoại

Khi người dùng chọn Ollama, Gemini hoặc API tương thích OpenAI, Cybergirl gửi:

- Câu hỏi dạng văn bản.
- Tối đa mười hai tin nhắn gần nhất.
- System prompt của nhân vật đang chọn.
- Tên mô hình và tham số sinh câu trả lời.

Cybergirl không gửi ảnh, landmark, canvas hoặc tệp âm thanh tới API hội thoại.
Người dùng tự chọn nhà cung cấp và chịu sự điều chỉnh của chính sách nhà cung cấp
đó.

## Khóa API

Khóa API:

- Chỉ tồn tại trong RAM của tiến trình `Cybergirl.exe`.
- Không ghi vào `localStorage`, `chrome.storage` hoặc `cau-hinh.json`.
- Bị xóa khi thoát ứng dụng.
- Có thể được nạp từ biến môi trường `CYBERGIRL_API_KEY` cho môi trường quản trị.

## Cổng vòng lặp

Cybergirl chỉ lắng nghe `127.0.0.1`, dùng token ngẫu nhiên cho mỗi phiên, kiểm
tra Origin, không bật CORS và giới hạn kích thước yêu cầu. Cổng vòng lặp không
được mở ra mạng LAN.

## Dữ liệu được lưu

Tệp `%LOCALAPPDATA%\Cybergirl\cau-hinh.json` chỉ lưu:

- Nhà cung cấp API.
- Địa chỉ API.
- Tên mô hình.
- Nhân vật đang dùng.

Extension chỉ dùng `chrome.storage.local` cho độ mở miệng, vi chuyển động, tốc
độ, cao độ và tùy chọn hội thoại. Không có analytics, quảng cáo hoặc cookie theo
dõi.

## Liên hệ

Mã nguồn: `https://github.com/Base27-CVNSS/Avatar`
