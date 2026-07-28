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

const localAssets = [
  "vendor/face_mesh/face_mesh.binarypb",
  "vendor/face_mesh/face_mesh_solution_packed_assets.data",
  "vendor/face_mesh/face_mesh_solution_packed_assets_loader.js",
  "vendor/face_mesh/face_mesh_solution_simd_wasm_bin.js",
  "vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm",
  "vendor/face_mesh/face_mesh_solution_wasm_bin.js",
  "vendor/face_mesh/face_mesh_solution_wasm_bin.wasm"
];
for (const asset of localAssets) {
  assert.ok((await stat(path.join(root, asset))).size > 0, `Thiếu asset Face Mesh ${asset}`);
}

const wasmFiles = localAssets.filter((asset) => asset.endsWith(".wasm"));
await Promise.all(wasmFiles.map(async (asset) => {
  const binary = await readFile(path.join(root, asset));
  assert.ok(await WebAssembly.compile(binary), `WASM không hợp lệ: ${asset}`);
}));

const wasmLoaders = await Promise.all(
  localAssets.filter((asset) => asset.endsWith("_bin.js")).map(readText)
);
assert.ok(wasmLoaders.every((source) => !source.includes("new Function")), "CSP MV3 chặn new Function");

const runtimeSource = `${html}\n${app}\n${background}`;
for (const forbidden of ["fal.ai", "FAL_KEY", "/api/generate", "analytics"]) {
  assert.ok(!runtimeSource.includes(forbidden), `Phát hiện phụ thuộc ngoài ý muốn: ${forbidden}`);
}
assert.match(app, /imageRevision/, "Phải chống landmark cũ áp vào ảnh mới");
assert.match(app, /assessFaceGeometry/, "Phải kiểm tra tỷ lệ landmark trước khi vẽ");
assert.match(app, /1000 \/ 30/, "Phải giới hạn render để giảm tải CPU");
assert.match(html, /id="runtimeWarning"/, "Phải cảnh báo khi người dùng mở file://");

console.log(`Avatar VN ${manifest.version}: PASS`);
console.log(`- ${ids.length} HTML ids; ${selectors.length} JS selectors`);
console.log(`- ${localAssets.length} Face Mesh assets; ${wasmFiles.length} WASM modules hợp lệ`);
console.log("- Manifest V3 local-first; không host permission");
