# Chính sách riêng tư — Avatar VN

Ngày hiệu lực: 28/07/2026

Avatar VN được thiết kế theo nguyên tắc xử lý cục bộ.

## Dữ liệu ứng dụng xử lý

- Ảnh do người dùng chọn.
- Tệp âm thanh do người dùng chọn.
- Luồng microphone khi người dùng chủ động bật.
- Văn bản nhập để phát giọng.
- Bản chép lời do Speech Recognition trả về.
- Landmark khuôn mặt được MediaPipe Face Mesh tính trong bộ nhớ.
- Tùy chọn độ mở miệng, vi chuyển động, tốc độ và cao độ.

## Dữ liệu được lưu

Extension chỉ dùng `chrome.storage.local` để lưu:

- Độ mở khẩu hình.
- Mức vi chuyển động gương mặt.
- Tốc độ phát giọng.
- Cao độ phát giọng.
- Phiên bản và thời điểm cài đặt extension.

Ảnh, audio, văn bản và bản chép lời không được extension tải lên máy chủ hoặc lưu vào cơ sở dữ liệu bên ngoài.
Landmark môi, mắt và gương mặt chỉ tồn tại trong phiên hiện tại và không được dùng lại cho ảnh khác.

## Truyền dữ liệu

Mã nguồn Avatar VN:

- Không chứa endpoint API.
- Không chứa analytics hoặc tracking.
- Không yêu cầu host permission.
- Không sử dụng cookie quảng cáo.
- Không gửi ảnh hay audio cho tác giả.

Web Speech API là tính năng do Microsoft Edge/Windows cung cấp. Cách triển khai voice hoặc nhận dạng giọng nói có thể phụ thuộc vào phiên bản hệ điều hành, gói ngôn ngữ và chính sách của Microsoft. Người dùng cần xem chính sách của Microsoft đối với dịch vụ giọng nói đang được bật trên thiết bị.

## Microphone

Microphone chỉ được mở sau thao tác bấm rõ ràng của người dùng. Khi bấm dừng hoặc đóng dashboard, các track microphone được đóng. Người dùng có thể thu hồi quyền trong phần cài đặt quyền của Microsoft Edge.

## Liên hệ

Dự án mã nguồn mở: `Base27-CVNSS/Avatar`
