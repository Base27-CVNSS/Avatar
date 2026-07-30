# Hợp đồng âm thanh PCM Cybergirl

## CG-PCM/1

Mọi đường microphone chính của Cybergirl phải xuất telemetry theo hợp đồng:

```json
{
  "type": "pcm16",
  "sequence": 0,
  "sampleRate": 16000,
  "channelCount": 1,
  "format": "s16le",
  "rms": 0.0123,
  "peak": 0.081,
  "timestamp": 0.02,
  "buffer": "ArrayBuffer(640 bytes)"
}
```

## Bất biến

| Thuộc tính | Giá trị |
|---|---|
| Kiểu mẫu | signed integer 16-bit |
| Byte order | little-endian |
| Tần số | 16.000 mẫu/giây |
| Kênh | một kênh |
| Packet | 20 ms |
| Mẫu/packet | 320 |
| Byte/packet | 640 |
| Biên độ | `[-32768, 32767]` |

## Chuyển đổi

1. `getUserMedia` trả `MediaStreamTrack`.
2. Web Audio chuyển track thành các frame Float32.
3. AudioWorklet trộn nhiều kênh về mono.
4. Resampler theo dòng thời gian đổi sample rate nguồn thành 16 kHz.
5. Float `[-1, 1]` được clamp và lượng tử hóa thành PCM16.
6. Main thread nhận packet bằng transferable `ArrayBuffer`.

Việc chuyển đổi không thay đổi track gốc. Cùng track đó được chuyển vào
`SpeechRecognition.start(audioTrack)`.

## Xác minh tín hiệu

Một packet được coi là có tín hiệu sử dụng được khi:

```text
rms >= signalFloor
peak >= signalFloor × 1,8
```

Ba packet liên tiếp phải đạt điều kiện mới đặt `signalVerified=true`. Mục tiêu
là phân biệt tiếng nền thật với buffer toàn số 0.

## Profile đầu vào

- `processed`: bật AEC, noise suppression và auto gain nếu Edge hỗ trợ.
- `compatibility`: tắt xử lý giọng để khắc phục một số driver tạo digital silence.

Nếu không có tín hiệu sau thời gian hiệu chuẩn, engine đổi profile một lần. Người
dùng luôn có thể bấm **Làm mới đầu vào PCM**.

## Web Speech

- Ngôn ngữ: `vi-VN`.
- Ưu tiên: `recognition.start(track)`.
- Fallback: `recognition.start()` chỉ khi dùng micro mặc định và Edge cũ không
  chấp nhận tham số track.
- Không fallback âm thầm khi người dùng khóa một `deviceId` khác.
- Tự nối lại có backoff khi Edge đóng phiên nhận dạng.

`processLocally=false` là chủ ý ở phiên bản 5.2 vì tài liệu Edge 150 chưa liệt
kê tiếng Việt trong nhóm model on-device.

## Kiểm thử bắt buộc

- Float `-1/0/1` phải thành `-32768/0/32767`.
- 48 kHz phải phát packet 16 kHz đúng 320 mẫu.
- `format` phải luôn là `s16le`.
- Web Speech phải gọi `start(this.track)`.
- Extension ZIP và Windows EXE phải cùng chứa hai tệp trong `audio/`.
