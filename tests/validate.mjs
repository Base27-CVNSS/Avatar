import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (file) => readFile(path.join(root, file), "utf8");
const functionBody = (source, name, nextName) => {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `Không tìm thấy ${name}`);
  assert.notEqual(end, -1, `Không tìm thấy mốc ${nextName}`);
  return source.slice(start, end);
};

const [
  manifestText,
  packageText,
  html,
  app,
  background,
  workflow,
  installer,
  apiClient,
  companionEngines,
  nativeHost,
  realtime,
  guiCore,
  companionVersion
] = await Promise.all([
  readText("manifest.json"),
  readText("package.json"),
  readText("index.html"),
  readText("app.js"),
  readText("background.js"),
  readText(".github/workflows/build-windows.yml"),
  readText("installer/Cybergirl.iss"),
  readText("api_client.py"),
  readText("companion/engines.py"),
  readText("companion/native_host.py"),
  readText("companion/realtime.py"),
  readText("cybergirl.py"),
  readText("companion/__init__.py")
]);
const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);

assert.equal(manifest.manifest_version, 3, "Extension phải dùng Manifest V3");
assert.equal(manifest.version, packageJson.version, "Version manifest và package.json phải trùng");
const escapedManifestVersion = manifest.version.replaceAll(".", "\\.");
assert.match(guiCore, new RegExp(`PHIEN_BAN = "${escapedManifestVersion}"`), "GUI core phải trùng phiên bản");
assert.match(companionVersion, new RegExp(`PHIEN_BAN = "${escapedManifestVersion}"`), "Companion phải trùng phiên bản");
assert.match(html, new RegExp(`Cybergirl v${manifest.version.replaceAll(".", "\\.")}`));
assert.equal(manifest.name, "Cybergirl — Trợ lý ảo tiếng Việt");
assert.deepEqual(
  manifest.permissions,
  ["storage", "nativeMessaging"],
  "Extension chỉ được dùng storage và Native Messaging"
);
assert.equal(manifest.host_permissions, undefined, "Extension local-first không cần host_permissions");
assert.match(manifest.content_security_policy.extension_pages, /wasm-unsafe-eval/);
const extensionId = [...createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest()
  .subarray(0, 16)]
  .flatMap((byte) => [byte >> 4, byte & 15])
  .map((nibble) => String.fromCharCode(97 + nibble))
  .join("");
const nativeManifest = JSON.parse(await readText("native-host/vn.base27.cybergirl.json"));
assert.ok(
  nativeManifest.allowed_origins.includes(`chrome-extension://${extensionId}/`),
  "Native host phải cho phép đúng ID sinh từ khóa công khai của extension"
);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML không được trùng id");
const selectors = [...app.matchAll(/\$\("#([A-Za-z][\w:-]*)"\)/g)].map((match) => match[1]);
const missingSelectors = [...new Set(selectors.filter((id) => !ids.includes(id)))];
assert.deepEqual(missingSelectors, [], `Thiếu phần tử HTML: ${missingSelectors.join(", ")}`);

const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
for (const script of scripts) {
  assert.ok((await stat(path.join(root, script))).size > 0, `Thiếu script ${script}`);
}

const imageAssets = [
  "assets/default-avatar.webp"
];
const faceMeshAssets = [
  "vendor/face_mesh/face_mesh.binarypb",
  "vendor/face_mesh/face_mesh_solution_packed_assets.data",
  "vendor/face_mesh/face_mesh_solution_packed_assets_loader.js",
  "vendor/face_mesh/face_mesh_solution_simd_wasm_bin.js",
  "vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm",
  "vendor/face_mesh/face_mesh_solution_wasm_bin.js",
  "vendor/face_mesh/face_mesh_solution_wasm_bin.wasm"
];
const localAssets = [...imageAssets, ...faceMeshAssets];
for (const asset of localAssets) {
  assert.ok((await stat(path.join(root, asset))).size > 0, `Thiếu asset cục bộ ${asset}`);
}

const desktopFiles = [
  "cybergirl.py",
  "api_client.py",
  "voice_registry.py",
  "characters.json",
  "cybergirl.spec",
  "icons/cybergirl.ico",
  "installer/Cybergirl.iss",
  "installer/Vietnamese.isl",
  ".github/workflows/build-windows.yml"
];
for (const file of desktopFiles) {
  assert.ok((await stat(path.join(root, file))).size > 0, `Thiếu thành phần GUI Windows ${file}`);
}

const companionFiles = [
  "cybergirl_native_host.py",
  "cybergirl_companion.spec",
  "companion/native_host.py",
  "companion/audio.py",
  "companion/engines.py",
  "companion/emotion.py",
  "companion/memory.py",
  "companion/phonemes.py",
  "companion/registry.py",
  "companion/protocol.py",
  "native-host/vn.base27.cybergirl.json",
  "native-host/register-native-host.ps1",
  "native-host/unregister-native-host.ps1",
  "models/README.md"
];
for (const file of companionFiles) {
  assert.ok((await stat(path.join(root, file))).size >= 0, `Thiếu companion ${file}`);
}

const runtimeImage = await readFile(path.join(root, "assets/default-avatar.webp"));
assert.equal(runtimeImage.subarray(0, 4).toString("ascii"), "RIFF", "Ảnh runtime phải là WebP");
assert.equal(runtimeImage.subarray(8, 12).toString("ascii"), "WEBP", "Ảnh runtime phải là WebP");
assert.equal(runtimeImage.subarray(12, 16).toString("ascii"), "VP8 ", "Ảnh runtime phải dùng WebP VP8");
assert.deepEqual(
  {
    width: runtimeImage.readUInt16LE(26) & 0x3fff,
    height: runtimeImage.readUInt16LE(28) & 0x3fff
  },
  { width: 3840, height: 2160 },
  "Ảnh runtime phải đúng 3840x2160"
);

const wasmFiles = faceMeshAssets.filter((asset) => asset.endsWith(".wasm"));
await Promise.all(wasmFiles.map(async (asset) => {
  const binary = await readFile(path.join(root, asset));
  assert.ok(await WebAssembly.compile(binary), `WASM không hợp lệ: ${asset}`);
}));

const wasmLoaders = await Promise.all(
  faceMeshAssets.filter((asset) => asset.endsWith("_bin.js")).map(readText)
);
assert.ok(wasmLoaders.every((source) => !source.includes("new Function")), "CSP MV3 chặn new Function");

const runtimeSource = `${html}\n${app}\n${background}`;
for (const forbidden of ["fal.ai", "FAL_KEY", "/api/generate", "analytics"]) {
  assert.ok(!runtimeSource.includes(forbidden), `Phát hiện phụ thuộc ngoài ý muốn: ${forbidden}`);
}
assert.match(app, /imageRevision/, "Phải chống landmark cũ áp vào ảnh mới");
assert.match(app, /assessFaceGeometry/, "Phải kiểm tra tỷ lệ landmark trước khi vẽ");
assert.match(app, /1000 \/ 30/, "Phải giới hạn render để giảm tải CPU");
assert.match(app, /assets\/default-avatar\.webp/, "Phải dùng WebP chân dung mặc định");
assert.match(app, /MASTER_WIDTH = 7680/, "Phải xuất ảnh master rộng 7680 px");
assert.match(app, /MASTER_HEIGHT = 4320/, "Phải xuất ảnh master cao 4320 px");
assert.match(app, /buildVietnameseVisemeTimeline/, "Phải có lịch viseme tiếng Việt");
assert.match(app, /drawProceduralHalfBody/, "Phải có Motion Rig bán thân theo vùng ảnh");
assert.match(app, /drawMotionRegion/, "Phải có renderer vùng tóc, trán, mũi, vai và tay");
assert.match(app, /gestureStrength/, "Phải cho phép chỉnh cường độ cử chỉ");
assert.match(app, /playback_started_unix_ms/, "Lip-sync native phải bù trễ vận chuyển sự kiện");
assert.match(html, /id="motionEnabled"/, "GUI phải có công tắc Motion Rig bán thân");
assert.match(html, /id="performanceProfile"/, "GUI phải có hồ sơ hiệu năng");
assert.match(nativeHost, /BoDieuPhoiLuot/, "Companion phải hủy theo turn id");
assert.match(nativeHost, /llm\.delta/, "Companion phải phát token LLM theo luồng");
assert.match(nativeHost, /tts\.stream_finished/, "Companion phải phát TTS theo câu");
assert.match(realtime, /BoTachCauStreaming/, "Phải có bộ tách câu cho streaming TTS");
assert.match(companionEngines, /_yeu_cau_json_dong/, "Adapter LLM phải đọc SSE\/JSONL");
assert.match(app, /stripVietnameseToneMarks/, "Phải giữ đúng khẩu hình nguyên âm có dấu thanh");
assert.match(app, /compoundVisemes/, "Phải xử lý cụm âm tiếng Việt");
assert.match(app, /updateTimedViseme\(timestamp\)/, "Viseme phải được lấy mẫu theo frame");
assert.ok(!app.includes("visemeTimers"), "Không được tạo timer riêng cho từng viseme");
const renderFrameSource = functionBody(app, "renderFrame", "stopTts");
assert.ok(
  !renderFrameSource.includes('state.activeSignal === "audio" || state.activeSignal === "mic"'),
  "Microphone người dùng không được điều khiển miệng avatar"
);
const recognitionStart = app.indexOf("recognition.onresult =");
const recognitionEnd = app.indexOf("recognition.onerror =", recognitionStart);
assert.notEqual(recognitionStart, -1, "Phải có Speech Recognition");
assert.ok(
  !app.slice(recognitionStart, recognitionEnd).includes("setViseme("),
  "STT người dùng không được ghi đè viseme của nhân vật"
);
const schedulerSource = functionBody(app, "scheduleTimedVisemes", "updateTimedViseme");
assert.doesNotMatch(schedulerSource, /setTimeout|setInterval/, "Scheduler không dùng timer theo viseme");
const stopAllSource = functionBody(app, "stopAll", "switchTab");
assert.match(
  stopAllSource,
  /nativeRequest\("interrupt"\)/,
  "Nút Stop phải dừng cả TTS của companion"
);
assert.match(app, /mouthAperture/, "Phải có khẩu độ miệng mềm");
assert.match(app, /mouthLayer/, "Phải tách lớp biến dạng môi");
assert.match(app, /mouthMask/, "Phải có mặt nạ feathered cho vùng môi");
assert.match(app, /createRadialGradient/, "Phải làm mềm biên vùng biến dạng");
assert.ok(!app.includes("cavityColor"), "Không được tô dải màu khoang miệng cố định");
assert.match(html, /id="masterImageButton"/, "Phải có nút tải ảnh master 8K");
assert.match(html, /id="runtimeWarning"/, "Phải cảnh báo khi người dùng mở file://");
assert.match(html, /id="chatMessages"/, "Phải có giao diện hội thoại AI");
assert.match(html, /id="characterSelect"/, "Phải cho phép chuyển nhân vật");
assert.ok(
  html.indexOf('id="avatarCanvas"') < html.indexOf('id="chatMessages"'),
  "Avatar phải nằm phía trên lịch sử chat"
);
assert.ok(
  html.indexOf('id="chatMessages"') < html.indexOf('class="control-panel"'),
  "Dock chat phải nằm cùng sân khấu, trước bảng cấu hình"
);
assert.match(html, /id="conversationDock"/, "Phải có dock hội thoại dưới Avatar");
assert.match(html, /id="liveTalkButton"/, "Phải có nút Chat live");
assert.match(html, /id="recordVoiceButton"/, "Phải có nút ghi âm trực tiếp");
assert.match(html, /id="recordedVoicePlayer"/, "Phải nghe lại được bản ghi cục bộ");
assert.match(app, /function toggleLiveTalk/, "Chat live phải bật/tắt microphone");
assert.match(app, /function startVoiceRecording/, "Phải có bộ ghi âm người dùng");
assert.match(app, /voiceRecorder = new MediaRecorder/, "Ghi âm phải dùng MediaRecorder của Edge");
assert.match(app, /seconds >= 300/, "Bản ghi phải có giới hạn thời lượng an toàn");
assert.match(app, /scheduleTextAlignedVisemes/, "Text phải được căn với lịch viseme tiếng Việt");
assert.match(app, /setConversationPhase/, "Chuyển động phải biết trạng thái hội thoại");
assert.match(app, /CYBERGIRL_TOKEN/, "API vòng lặp phải dùng mã phiên");
assert.match(app, /\/api\/hoi-thoai/, "GUI phải kết nối cổng hội thoại cục bộ");
assert.match(app, /voiceAutoSend/, "Phải hỗ trợ vòng hội thoại giọng nói");
assert.match(background, /connectNative/, "Service worker phải kết nối Native Messaging");
assert.match(background, /vn\.base27\.cybergirl/, "Native host phải có tên ổn định");
assert.match(app, /benchmark_tts/, "Dashboard phải benchmark TTS tiếng Việt");
assert.match(app, /scheduleTimedVisemes/, "TTS cục bộ phải cấp timing viseme");
assert.match(app, /isLikelySpeakerEcho/, "Full-duplex phải có echo-guard");
assert.match(app, /applyEmotion/, "Cảm xúc phải điều khiển trạng thái gương mặt");
assert.match(app, /MediaRecorder/, "Phải hỗ trợ xuất video WebM");
assert.match(html, /id="nativeVadStatus"/, "Phải hiển thị trạng thái Silero VAD");
assert.match(html, /id="nativeSttStatus"/, "Phải hiển thị trạng thái Whisper");
assert.match(html, /id="nativeLlmStatus"/, "Phải hiển thị trạng thái GGUF");
assert.match(html, /id="nativeTtsStatus"/, "Phải hiển thị trạng thái TTS");
assert.match(html, /id="memoryEnabled"/, "Phải có đồng ý bật bộ nhớ dài hạn");
assert.match(html, /id="emotionChip"/, "Phải hiển thị cảm xúc hiện tại");
assert.match(html, /id="recordWebmButton"/, "Phải có nút quay WebM");
assert.match(html, /value="openrouter"/, "Phải có nhà cung cấp OpenRouter");
assert.match(html, /id="openRouterReferer"/, "Phải cấu hình HTTP-Referer OpenRouter");
assert.match(html, /id="openRouterTitle"/, "Phải cấu hình tên ứng dụng OpenRouter");
assert.match(html, /id="openRouterZdr"/, "Phải có tùy chọn Zero Data Retention");
assert.match(app, /https:\/\/openrouter\.ai\/api\/v1/, "Phải có endpoint OpenRouter mặc định");
assert.match(app, /openai\/gpt-4o/, "Phải có model OpenRouter mặc định");
for (const source of [apiClient, companionEngines]) {
  assert.match(source, /X-OpenRouter-Title/, "Adapter phải dùng header OpenRouter hiện hành");
  assert.ok(!source.includes('"X-Title"'), "Không được gửi header X-Title cũ");
}
const securitySource = [
  html,
  app,
  background,
  apiClient,
  companionEngines,
  await readText("README.md")
].join("\n");
assert.ok(!securitySource.includes("sk-or-v1-"), "Không được đưa khóa OpenRouter vào mã nguồn");
assert.match(workflow, /cache-dependency-path: requirements-build\.txt/, "CI phải cache đúng tệp phụ thuộc");
assert.match(workflow, /cybergirl_companion\.spec/, "CI phải đóng gói Native Companion");
const escapedVersion = manifest.version.replaceAll(".", "\\.");
assert.match(
  workflow,
  new RegExp(`Cybergirl-Edge-v${escapedVersion}\\.zip`),
  "CI phải xuất gói Edge Extension đúng phiên bản"
);
assert.match(
  installer,
  new RegExp(`#define MyAppVersion "${escapedVersion}"`),
  "Bộ cài phải trùng phiên bản manifest"
);
assert.match(installer, /register-native-host\.ps1/, "Bộ cài phải đăng ký Native Messaging");

const characters = JSON.parse(await readText("characters.json"));
assert.ok(Object.keys(characters).length >= 3, "Cần tối thiểu ba nhân vật tiếng Việt");
for (const [id, character] of Object.entries(characters)) {
  assert.ok(character.label && character.system_prompt, `Nhân vật ${id} thiếu thông tin`);
  assert.equal(character.voice_language, "vi-VN", `Nhân vật ${id} phải dùng giọng vi-VN`);
  assert.ok(!/[\u3400-\u9fff]/u.test(character.system_prompt), `Prompt ${id} chưa Việt hóa`);
}

const [landingPage, preprint, pagesWorkflow, readme] = await Promise.all([
  readText("docs/index.html"),
  readText("PREPRINT.md"),
  readText(".github/workflows/pages.yml"),
  readText("README.md")
]);
assert.match(landingPage, /<title>Cybergirl 3\.5 — AI Companion tiếng Việt<\/title>/);
assert.match(landingPage, /name="description"/, "Landing page phải có mô tả SEO");
assert.match(landingPage, /application\/ld\+json/, "Landing page phải có structured data");
assert.match(landingPage, /prefers-reduced-motion/, "Landing page phải tôn trọng reduced motion");
assert.match(landingPage, /Local-first · Windows · MIT/, "Landing page phải nêu định vị sản phẩm");
assert.match(landingPage, /Motion Rig là biến dạng Canvas 2D/, "Landing page phải công bố giới hạn Motion Rig");
assert.ok(!/<script\s+src=/i.test(landingPage), "Landing page phải tự chứa, không tải script ngoài");
assert.match(preprint, /Technical preprint · Working paper · Chưa phản biện đồng cấp/);
assert.match(preprint, /not peer reviewed/, "Citation phải công bố trạng thái chưa phản biện");
assert.match(preprint, /@techreport\{ngo2026cybergirl/, "Preprint phải có BibTeX");
assert.match(pagesWorkflow, /actions\/deploy-pages@v4/, "Workflow phải deploy GitHub Pages");
assert.match(pagesWorkflow, /path: docs/, "GitHub Pages phải xuất bản thư mục docs");
assert.match(readme, /base27-cvnss\.github\.io\/Avatar\//, "README phải liên kết trực tiếp landing page");
assert.match(readme, /Preprint-Technical_Report/, "README phải có badge Preprint");
assert.match(readme, /Platform-Windows_10/, "README phải có badge Windows");
assert.match(readme, /License-MIT/, "README phải có badge MIT License");

console.log(`Cybergirl ${manifest.version}: PASS`);
console.log(`- ${ids.length} HTML ids; ${selectors.length} JS selectors`);
console.log(`- Runtime WebP 3840x2160; xuất master 7680x4320 cục bộ`);
console.log(`- ${faceMeshAssets.length} Face Mesh assets; ${wasmFiles.length} WASM modules hợp lệ`);
console.log("- Manifest V3 + Native Messaging; GUI Windows và khóa API chỉ ở RAM");
