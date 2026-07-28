# Thông báo thành phần bên thứ ba

Cybergirl bao gồm thành phần MediaPipe Face Mesh do Google cung cấp:

- Package: `@mediapipe/face_mesh`
- Version: `0.4.1633559619`
- Website: <https://developers.google.com/mediapipe>
- License: Apache License 2.0

Các tệp trong `vendor/face_mesh/` giữ nguyên thông báo bản quyền và giấy phép của thành phần gốc.

```text
Copyright 2019 The MediaPipe Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Hai wrapper Emscripten được chỉnh tối thiểu để thay helper `new Function`
bằng closure tĩnh tương đương, giúp WASM cục bộ tuân thủ Content Security
Policy của Microsoft Edge Manifest V3. Trọng số model và phép tính không đổi.

Bản GUI Windows được đóng gói bằng Python và PyInstaller. Python được phân phối
theo Python Software Foundation License; PyInstaller được phân phối theo GPL
với ngoại lệ đặc biệt cho phép đóng gói và phân phối ứng dụng tạo ra.

Companion dùng adapter cho các dự án sau nhưng repository Cybergirl không nhúng
model hoặc binary của chúng:

- Silero VAD — MIT License.
- whisper.cpp — MIT License.
- llama.cpp — MIT License.
- ONNX Runtime — MIT License.
- NumPy — BSD-3-Clause.
- python-sounddevice — MIT License; PortAudio có giấy phép MIT tương thích.
- Piper/VITS và từng voice tiếng Việt — giấy phép phụ thuộc binary/model do
  người dùng chọn. Cybergirl không phân phối các model này.

Tùy chọn Qwen3-TTS không nằm trong bản EXE. Người dùng tự cài thành phần này và
cần tuân thủ giấy phép của Qwen3-TTS, PyTorch, NumPy và SciPy.
