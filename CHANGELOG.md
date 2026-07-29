# Nhật ký thay đổi

Các thay đổi đáng chú ý của Cybergirl được ghi tại đây.

## 3.4.0 — 29/07/2026

- Tách microphone người dùng khỏi bus điều khiển miệng của avatar.
- Thay timer viseme rời rạc bằng timeline duy nhất lấy mẫu theo frame.
- Dùng boundary elapsed time để tái neo timeline Edge Web Speech.
- Chuẩn hóa năm dấu thanh tiếng Việt trong cả frontend và companion, đồng thời
  giữ đúng các nguyên âm ă, â, ê, ô, ơ và ư.
- Ngăn STT interim/final ghi đè viseme của nhân vật.
- Cải thiện barge-in ở kết quả interim và khóa đầu vào đúng chế độ half-duplex.
- Khôi phục trạng thái microphone sau TTS.
- Nút Stop dừng cả TTS companion và tệp WAV tạm được dọn sau phát.
- Thêm kiểm thử hồi quy cho scheduler, phân tách input/output và dấu thanh.
- Công bố rõ giới hạn talking portrait 2D; chưa quảng bá cử động tay/toàn thân.

## 3.3.0 — 28/07/2026

- Thiết kế lại GUI theo luồng Avatar ở trên, dock hội thoại trực tiếp ngay bên dưới.
- Chuyển lịch sử chat, bản chép lời và ô nhập khỏi cột cấu hình sang sân khấu chính.
- Thêm nút **Chat live** để bật microphone, nhận dạng vi-VN và tự gửi câu hoàn chỉnh.
- Thêm ghi âm cục bộ tối đa 5 phút, bộ đếm thời gian, nghe lại và xóa khỏi RAM.
- Bản ghi phát lại điều khiển khẩu hình bằng biên độ và ba dải phổ âm thanh thật.
- Thêm `scheduleTextAlignedVisemes` để căn viseme tiếng Việt hữu hạn theo text,
  dấu câu, tốc độ TTS và đồng cấu âm.
- Thêm trạng thái hội thoại `listening/transcribing/thinking/speaking/interrupted`.
- Gaze ưu tiên nhìn người dùng khi nghe; head micro-motion và nod thay đổi theo
  trạng thái hội thoại, cảm xúc và mức âm thanh.
- Bổ sung kiểm thử thứ tự bố cục, điều khiển live, MediaRecorder và text-viseme.

## 3.2.0 — 28/07/2026

- Thêm OpenRouter Chat Completions vào GUI Windows và Native Companion.
- Thêm hồ sơ mặc định `openai/gpt-4o`, endpoint
  `https://openrouter.ai/api/v1` và chuyển nóng model từ dashboard.
- Dùng header chuẩn `X-OpenRouter-Title` cùng `HTTP-Referer`; không gửi
  `X-Title` cũ.
- Thêm tùy chọn định tuyến Zero Data Retention qua `provider.zdr`.
- Xác thực URL/header để ngăn chèn dòng mới và giới hạn độ dài metadata.
- Giữ khóa OpenRouter trong RAM của tiến trình companion; không ghi vào
  `chrome.storage`, `localStorage` hay tệp cấu hình.
- Bổ sung kiểm thử adapter, attribution header, ZDR và quét khóa bí mật.

## 3.1.0 — 28/07/2026

- Thêm bộ nhớ hội thoại dài hạn SQLite, mặc định tắt và có nút xóa cục bộ.
- Thêm truy hồi ký ức liên quan theo từ khóa tiếng Việt và độ gần thời gian.
- Thêm Emotion Engine tiếng Việt chạy cục bộ; nối cảm xúc tới gaze, blink và head motion.
- Thêm gaze saccade mềm, nhịp chớp mắt và năng lượng chuyển động theo cảm xúc.
- Thêm full-duplex cho Web Speech; microphone không còn đóng khi gửi câu.
- Thêm echo-guard cho Edge và Native VAD, đồng thời giữ barge-in để người dùng ngắt lời.
- TTS cục bộ trả timeline phoneme/viseme theo thời lượng WAV và release đồng cấu âm.
- Lip-sync audio dùng ba dải phổ tần ngoài RMS để chọn hình môi.
- Thêm Model Profile Registry, tên giọng Windows SAPI và health pipeline chi tiết.
- Thêm quay Canvas 30 FPS và xuất WebM cục bộ.
- Bổ sung kiểm thử memory, emotion, phoneme timing và các thành phần UI mới.

## 3.0.0 — 28/07/2026

- Thêm Microsoft Edge Native Messaging host `vn.base27.cybergirl`.
- Thêm companion cục bộ đóng gói EXE, không yêu cầu người dùng cài Python.
- Tích hợp Silero VAD ONNX 16 kHz và máy trạng thái cắt câu.
- Tích hợp whisper.cpp đa ngôn ngữ, ép nhận dạng tiếng Việt.
- Tích hợp llama.cpp/LLM GGUF chạy CPU, chỉ lắng nghe localhost.
- Thêm OpenAI Responses API và Gemini Interactions API.
- Giữ Ollama và API tương thích OpenAI.
- Thêm Windows SAPI và adapter Piper/VITS TTS tiếng Việt.
- Thêm benchmark TTS thực trên máy: thời gian tổng hợp, RTF và ký tự/giây.
- Thêm barge-in: VAD phát hiện lời mới sẽ ngắt TTS hiện tại.
- Dashboard hiển thị trạng thái VAD, Whisper, GGUF và TTS.
- Bộ cài tự đăng ký/gỡ Native Host trong registry HKCU của Microsoft Edge.
- GitHub Actions tạo GUI EXE, companion EXE, Edge ZIP và bộ cài đầy đủ.

## 2.0.0 — 28/07/2026

- Đổi sản phẩm từ Avatar VN thành Cybergirl.
- Thêm GUI Windows một lần cài, tự mở bằng Microsoft Edge ở chế độ ứng dụng.
- Không cần Python, Node hoặc CUDA sau khi đóng gói.
- Thêm cổng API vòng lặp có token phiên, Origin check, CSP và giới hạn dữ liệu.
- Hỗ trợ Ollama, Google Gemini và API tương thích OpenAI.
- Thêm hội thoại giọng nói tiếng Việt liên tục.
- Thêm registry ba nhân vật tiếng Việt: Mai, Linh và An.
- Khóa API chỉ giữ trong RAM, không ghi xuống ổ đĩa.
- Giữ Face Mesh/WASM, Mouth Engine 1.4, ảnh mặc định 4K và xuất 8K.
- Cập nhật mã Qwen3-TTS của người dùng thành tùy chọn thử nghiệm.
- Thêm PyInstaller, Inno Setup và GitHub Actions đóng gói Windows.
- Đổi toàn bộ màu nhận diện GUI sang hồng/tím.

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
