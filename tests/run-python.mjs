import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32"
  ? [["python", []], ["py", ["-3"]]]
  : [["python3", []], ["python", []]];

for (const [command, prefix] of candidates) {
  const version = spawnSync(command, [...prefix, "--version"], { encoding: "utf8" });
  if (version.status !== 0) continue;
  const result = spawnSync(
    command,
    [...prefix, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}

console.error("Không tìm thấy Python để chạy kiểm thử lõi Cybergirl.");
process.exit(1);
