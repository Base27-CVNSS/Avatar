import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (file) => readFile(path.join(root, file), "utf8");

const [manifestText, packageText, html, app, background] = await Promise.all([
  readText("manifest.json"),
  readText("package.json"),
  readText("index.html"),
  readText("app.js"),
  readText("background.js")
]);
const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);

assert.equal(manifest.manifest_version, 3, "Extension phải dùng Manifest V3");
assert.equal(manifest.version, packageJson.version, "Version manifest và package.json phải trùng");
assert.match(html, new RegExp(`Avatar VN v${manifest.version.replaceAll(".", "\\.")}`));
assert.deepEqual(manifest.permissions, ["storage"], "Không được tự ý mở rộng quyền extension");
assert.equal(manifest.host_permissions, undefined, "Extension local-first không cần host_permissions");
assert.match(manifest.content_security_policy.extension_pages, /wasm-unsafe-eval/);

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
assert.match(app, /compoundVisemes/, "Phải xử lý cụm âm tiếng Việt");
assert.match(app, /mouthAperture/, "Phải có khẩu độ miệng mềm");
assert.match(app, /mouthLayer/, "Phải tách lớp biến dạng môi");
assert.match(app, /mouthMask/, "Phải có mặt nạ feathered cho vùng môi");
assert.match(app, /createRadialGradient/, "Phải làm mềm biên vùng biến dạng");
assert.ok(!app.includes("cavityColor"), "Không được tô dải màu khoang miệng cố định");
assert.match(html, /id="masterImageButton"/, "Phải có nút tải ảnh master 8K");
assert.match(html, /id="runtimeWarning"/, "Phải cảnh báo khi người dùng mở file://");

console.log(`Avatar VN ${manifest.version}: PASS`);
console.log(`- ${ids.length} HTML ids; ${selectors.length} JS selectors`);
console.log(`- Runtime WebP 3840x2160; xuất master 7680x4320 cục bộ`);
console.log(`- ${faceMeshAssets.length} Face Mesh assets; ${wasmFiles.length} WASM modules hợp lệ`);
console.log("- Manifest V3 local-first; không host permission");
