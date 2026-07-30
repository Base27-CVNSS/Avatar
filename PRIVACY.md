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
- Bộ nhớ dài hạn SQLite nếu người dùng chủ động bật.
- Bản ghi microphone tạm trong bộ nhớ trình duyệt nếu người dùng bấm **Ghi âm**.

Ảnh, landmark và texture khuôn mặt không được gửi tới lõi Python hoặc API AI.

## Microphone, PCM và Web Speech

Microphone chỉ mở sau khi người dùng bấm bắt đầu. Khi dừng hoặc đóng ứng dụng,
track microphone được đóng. Cả Extension và Windows dùng một
`MediaStreamTrack`.

AudioWorklet chuẩn hóa track thành PCM16 little-endian, 16 kHz, mono để đo RMS,
VAD, lip-sync và chẩn đoán. Cybergirl không gửi raw PCM này tới backend LLM.
Cùng track được chuyển cho Microsoft Edge Web Speech với `vi-VN`.

Tùy phiên bản Edge, chính sách Windows và vùng, nhận dạng có thể dùng dịch vụ
của Microsoft. Edge 150 on-device thử nghiệm chưa liệt kê tiếng Việt, nên bản
5.2 không tuyên bố nhận dạng `vi-VN` hoàn toàn offline. Các cấu hình
Silero/Whisper cũ được giữ để tương thích nhưng không còn là đường Chat live mặc
định.

Nút **Ghi âm** của dashboard dùng `MediaRecorder` trong Edge. Bản ghi chỉ tồn
tại dưới dạng Blob cục bộ để nghe lại, tối đa 5 phút, không tự tải lên API và
được giải phóng khi người dùng xóa hoặc đóng ứng dụng.

## API hội thoại

Khi người dùng chọn OpenAI, Gemini, OpenRouter, Ollama hoặc API tương thích,
Cybergirl gửi:

- Câu hỏi dạng văn bản.
- Tối đa mười hai tin nhắn gần nhất.
- System prompt của nhân vật đang chọn.
- Tên mô hình và tham số sinh câu trả lời.

Cybergirl không gửi ảnh, landmark, canvas hoặc tệp âm thanh tới API hội thoại.
Chế độ GGUF giữ cả câu hỏi và câu trả lời trên máy.
Người dùng tự chọn nhà cung cấp và chịu sự điều chỉnh của chính sách nhà cung cấp
đó.

Với OpenRouter, Cybergirl có thể gửi thêm `HTTP-Referer` và
`X-OpenRouter-Title` để nhận diện ứng dụng. Hai giá trị không chứa khóa API và
có thể chỉnh trong dashboard. Khi bật Zero Data Retention, yêu cầu có thêm
`provider.zdr: true`; việc định tuyến vẫn phụ thuộc khả năng của model/nhà cung
cấp trong tài khoản OpenRouter.

## Khóa API

Khóa API:

- Chỉ tồn tại trong RAM của `Cybergirl.exe` hoặc `Cybergirl-Companion.exe`.
- Không ghi vào `localStorage`, `chrome.storage` hoặc `cau-hinh.json`.
- Bị xóa khi thoát ứng dụng.
- Có thể được nạp từ biến môi trường `CYBERGIRL_API_KEY` cho môi trường quản trị.

Không đặt khóa thật trực tiếp trong `app.js`, `index.html`, manifest, README
hoặc kho Git.

## Cổng vòng lặp

Cybergirl chỉ lắng nghe `127.0.0.1`, dùng token ngẫu nhiên cho mỗi phiên, kiểm
tra Origin, không bật CORS và giới hạn kích thước yêu cầu. Cổng vòng lặp không
được mở ra mạng LAN.

## Native Messaging

Edge giao tiếp với `vn.base27.cybergirl` bằng stdio. Host manifest chỉ cho phép
extension ID của Cybergirl. Native host giới hạn mỗi JSON ở một MB, không mở
WebSocket và không lắng nghe cổng mạng. `llama-server` chỉ được companion khởi
động trên `127.0.0.1` khi người dùng chọn GGUF.

## Dữ liệu được lưu

Tệp `%LOCALAPPDATA%\Cybergirl\cau-hinh.json` chỉ lưu:

- Nhà cung cấp API.
- Địa chỉ API.
- Tên mô hình.
- Nhân vật đang dùng.
- Metadata nhận diện OpenRouter và lựa chọn Zero Data Retention.

Tệp `cau-hinh-companion.json` chỉ lưu đường dẫn binary/model, engine TTS, ngưỡng
VAD, số luồng CPU và nhà cung cấp. Tệp này không chứa khóa API.

`bo-nho-hoi-thoai.sqlite3` chỉ được ghi khi bật **Bộ nhớ dài hạn cục bộ**.
Nội dung không được đồng bộ hoặc gửi tới dịch vụ lưu trữ. Dashboard có nút xóa
toàn bộ bộ nhớ; tắt tùy chọn sẽ ngừng ghi và truy hồi lượt mới.

Extension chỉ dùng `chrome.storage.local` cho độ mở miệng, vi chuyển động, tốc
độ, cao độ và tùy chọn hội thoại. Không có analytics, quảng cáo hoặc cookie theo
dõi.

## Liên hệ

Mã nguồn: `https://github.com/Base27-CVNSS/Avatar`
