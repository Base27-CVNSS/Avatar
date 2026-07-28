# Thông báo thành phần bên thứ ba

Avatar VN bao gồm thành phần MediaPipe Face Mesh do Google cung cấp:

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
