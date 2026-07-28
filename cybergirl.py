"""Cybergirl 3.2 — GUI Windows dùng nhân Microsoft Edge.

Ứng dụng đóng gói thành một tệp EXE bằng PyInstaller. Khi chạy, chương trình:

1. Mở một dịch vụ vòng lặp chỉ trên ``127.0.0.1``.
2. Phục vụ giao diện Face Mesh/Web Speech/Native Companion đã nhúng trong gói.
3. Mở Microsoft Edge ở chế độ cửa sổ ứng dụng.
4. Làm cổng nối tới GGUF, Ollama, OpenAI, Gemini hoặc API tương thích.

Ảnh, landmark, microphone và hoạt ảnh khuôn mặt được xử lý trong Edge. Lõi
Python chỉ nhận văn bản hội thoại; khóa API chỉ giữ trong RAM của phiên chạy.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import secrets
import subprocess
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from api_client import APIClient, CauHinhAPI, LoiAPI
from voice_registry import LoiCauHinhNhanVat, VoiceRegistry


PHIEN_BAN = "3.2.0"
CONG_MAC_DINH = 27827
GIOI_HAN_JSON = 1_000_000


def thu_muc_tai_nguyen() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


def thu_muc_du_lieu() -> Path:
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    else:
        root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    target = root / "Cybergirl"
    target.mkdir(parents=True, exist_ok=True)
    return target


class KhoCauHinh:
    """Chỉ lưu endpoint/mô hình; tuyệt đối không ghi khóa API."""

    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict[str, Any]:
        defaults = {
            "provider": "gguf",
            "base_url": "http://127.0.0.1:27829/v1",
            "model": "qwen3-4b-vi",
            "active_character": "mai",
            "openrouter_referer": "https://github.com/Base27-CVNSS/Avatar",
            "openrouter_title": "Cybergirl",
            "openrouter_zdr": False,
        }
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                defaults.update(
                    {
                        key: value[key]
                        for key in (
                            "provider",
                            "base_url",
                            "model",
                            "active_character",
                            "openrouter_referer",
                            "openrouter_title",
                        )
                        if isinstance(value.get(key), str) and value[key].strip()
                    }
                )
                if isinstance(value.get("openrouter_zdr"), bool):
                    defaults["openrouter_zdr"] = value["openrouter_zdr"]
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass
        return defaults

    def save(self, config: dict[str, Any]) -> None:
        safe: dict[str, Any] = {
            key: str(config[key])
            for key in (
                "provider",
                "base_url",
                "model",
                "active_character",
                "openrouter_referer",
                "openrouter_title",
            )
            if config.get(key)
        }
        safe["openrouter_zdr"] = bool(config.get("openrouter_zdr", False))
        temp = self.path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(safe, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temp.replace(self.path)


class TrangThaiCybergirl:
    def __init__(self, assets: Path, config_path: Path | None = None):
        self.assets = assets
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.config_store = KhoCauHinh(
            config_path or (thu_muc_du_lieu() / "cau-hinh.json")
        )
        self.saved = self.config_store.load()
        self.api_key = os.environ.get("CYBERGIRL_API_KEY", "")
        self.registry = VoiceRegistry(assets / "characters.json")
        self.registry.switch(self.saved.get("active_character", "mai"))
        self.base_url = ""

    def public_config(self) -> dict[str, Any]:
        with self.lock:
            return {
                "phien_ban": PHIEN_BAN,
                "provider": self.saved["provider"],
                "base_url": self.saved["base_url"],
                "model": self.saved["model"],
                "active_character": self.registry.active,
                "openrouter_referer": self.saved["openrouter_referer"],
                "openrouter_title": self.saved["openrouter_title"],
                "openrouter_zdr": bool(self.saved["openrouter_zdr"]),
                "characters": self.registry.public_list(),
                "co_khoa_api": bool(self.api_key),
                "che_do": "GUI Windows + Microsoft Edge",
            }

    def update_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        provider = str(payload.get("provider", self.saved["provider"])).strip()
        base_url = str(payload.get("base_url", self.saved["base_url"])).strip()
        model = str(payload.get("model", self.saved["model"])).strip()
        openrouter_referer = str(
            payload.get("openrouter_referer", self.saved["openrouter_referer"])
        ).strip()
        openrouter_title = str(
            payload.get("openrouter_title", self.saved["openrouter_title"])
        ).strip()
        openrouter_zdr = bool(
            payload.get("openrouter_zdr", self.saved["openrouter_zdr"])
        )
        api_key = str(payload.get("api_key", "")).strip()
        character = str(
            payload.get("active_character", self.registry.active)
        ).strip()

        validated = CauHinhAPI(
            provider=provider,
            base_url=base_url,
            model=model,
            api_key=api_key or self.api_key,
            openrouter_referer=openrouter_referer,
            openrouter_title=openrouter_title,
            openrouter_zdr=openrouter_zdr,
        ).validated()
        if not self.registry.switch(character):
            raise LoiAPI("Nhân vật được chọn không tồn tại.")
        with self.lock:
            old_provider = self.saved["provider"]
            self.saved.update(
                {
                    "provider": validated.provider,
                    "base_url": validated.base_url,
                    "model": validated.model,
                    "active_character": self.registry.active,
                    "openrouter_referer": validated.openrouter_referer,
                    "openrouter_title": validated.openrouter_title,
                    "openrouter_zdr": validated.openrouter_zdr,
                }
            )
            if api_key:
                self.api_key = api_key
            elif provider != old_provider:
                self.api_key = ""
            self.config_store.save(self.saved)
        return self.public_config()

    def api_client(self) -> APIClient:
        with self.lock:
            return APIClient(
                CauHinhAPI(
                    provider=self.saved["provider"],
                    base_url=self.saved["base_url"],
                    model=self.saved["model"],
                    api_key=self.api_key,
                    openrouter_referer=self.saved["openrouter_referer"],
                    openrouter_title=self.saved["openrouter_title"],
                    openrouter_zdr=bool(self.saved["openrouter_zdr"]),
                )
            )


def tao_handler(state: TrangThaiCybergirl):
    class CybergirlHandler(SimpleHTTPRequestHandler):
        server_version = f"Cybergirl/{PHIEN_BAN}"

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(state.assets), **kwargs)

        def log_message(self, format_string: str, *args) -> None:
            if getattr(self.server, "ghi_nhat_ky", None):
                self.server.ghi_nhat_ky(format_string % args)  # type: ignore[attr-defined]

        def end_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; "
                "script-src 'self' 'wasm-unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' blob: data:; media-src 'self' blob:; "
                "connect-src 'self'; worker-src 'self' blob:; "
                "object-src 'none'; frame-ancestors 'none'",
            )
            super().end_headers()

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            token = self.headers.get("X-Cybergirl-Token", "")
            if not secrets.compare_digest(token, state.token):
                self._json(HTTPStatus.FORBIDDEN, {"ok": False, "loi": "Phiên không hợp lệ."})
                return False
            origin = self.headers.get("Origin")
            if origin and origin.rstrip("/") != state.base_url:
                self._json(
                    HTTPStatus.FORBIDDEN,
                    {"ok": False, "loi": "Nguồn gửi yêu cầu không hợp lệ."},
                )
                return False
            return True

        def _body(self) -> dict[str, Any]:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise LoiAPI("Kích thước yêu cầu không hợp lệ.") from exc
            if length <= 0 or length > GIOI_HAN_JSON:
                raise LoiAPI("Yêu cầu rỗng hoặc vượt quá một MB.")
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise LoiAPI("Nội dung yêu cầu không phải JSON hợp lệ.") from exc
            if not isinstance(payload, dict):
                raise LoiAPI("Nội dung yêu cầu phải là một đối tượng JSON.")
            return payload

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/suc-khoe":
                self._json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "san_pham": "Cybergirl",
                        "phien_ban": PHIEN_BAN,
                        "ngon_ngu": "vi-VN",
                    },
                )
                return
            if path == "/api/cau-hinh":
                if self._authorized():
                    self._json(HTTPStatus.OK, {"ok": True, **state.public_config()})
                return
            if path in {"/", "/index.html"}:
                source = (state.assets / "index.html").read_text(encoding="utf-8")
                source = source.replace(
                    '<meta name="cybergirl-token" content="">',
                    f'<meta name="cybergirl-token" content="{state.token}">',
                    1,
                )
                body = source.encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self) -> None:
            if not self._authorized():
                return
            path = urlparse(self.path).path
            try:
                payload = self._body()
                if path == "/api/cau-hinh":
                    result = state.update_config(payload)
                    self._json(HTTPStatus.OK, {"ok": True, **result})
                    return
                if path == "/api/nhan-vat/chuyen":
                    name = str(payload.get("name", ""))
                    if not state.registry.switch(name):
                        raise LoiAPI("Nhân vật được chọn không tồn tại.")
                    state.saved["active_character"] = name
                    state.config_store.save(state.saved)
                    self._json(
                        HTTPStatus.OK,
                        {"ok": True, "active_character": state.registry.active},
                    )
                    return
                if path == "/api/kiem-tra":
                    state.update_config(payload)
                    answer = state.api_client().test_connection()
                    self._json(HTTPStatus.OK, {"ok": True, "tra_loi": answer})
                    return
                if path == "/api/hoi-thoai":
                    message = str(payload.get("message", ""))
                    history = payload.get("history", [])
                    if not isinstance(history, list):
                        raise LoiAPI("Lịch sử hội thoại không hợp lệ.")
                    answer = state.api_client().chat(
                        message,
                        history,
                        state.registry.current_prompt(),
                    )
                    self._json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "tra_loi": answer,
                            "nhan_vat": state.registry.current()["label"],
                        },
                    )
                    return
                if path == "/api/nhip":
                    self._json(HTTPStatus.OK, {"ok": True})
                    return
                self._json(
                    HTTPStatus.NOT_FOUND,
                    {"ok": False, "loi": "Không tìm thấy chức năng API."},
                )
            except (LoiAPI, LoiCauHinhNhanVat) as exc:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "loi": str(exc)})
            except Exception:
                self._json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"ok": False, "loi": "Cybergirl gặp lỗi nội bộ."},
                )

    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("image/webp", ".webp")
    return CybergirlHandler


def mo_microsoft_edge(url: str) -> bool:
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("PROGRAMFILES(X86)", ""))
            / "Microsoft/Edge/Application/msedge.exe",
            Path(os.environ.get("PROGRAMFILES", ""))
            / "Microsoft/Edge/Application/msedge.exe",
            Path(os.environ.get("LOCALAPPDATA", ""))
            / "Microsoft/Edge/Application/msedge.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                subprocess.Popen(
                    [str(candidate), f"--app={url}", "--start-maximized"],
                    close_fds=True,
                )
                return True
    return webbrowser.open(url, new=1)


class DichVu:
    def __init__(self, state: TrangThaiCybergirl, preferred_port: int = CONG_MAC_DINH):
        self.state = state
        self.httpd: ThreadingHTTPServer | None = None
        for port in range(preferred_port, preferred_port + 12):
            try:
                self.httpd = ThreadingHTTPServer(
                    ("127.0.0.1", port), tao_handler(state)
                )
                break
            except OSError:
                continue
        if not self.httpd:
            raise OSError("Không tìm được cổng vòng lặp trống cho Cybergirl.")
        host, port = self.httpd.server_address
        self.url = f"http://{host}:{port}"
        state.base_url = self.url

    def start(self, logger=None) -> None:
        if logger:
            self.httpd.ghi_nhat_ky = logger  # type: ignore[attr-defined]
        threading.Thread(
            target=self.httpd.serve_forever,
            name="cybergirl-http",
            daemon=True,
        ).start()

    def stop(self) -> None:
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()


def chay_gui(service: DichVu) -> None:
    import tkinter as tk
    from tkinter import messagebox, ttk

    root = tk.Tk()
    root.title(f"Cybergirl {PHIEN_BAN} · Bảng điều khiển")
    root.geometry("620x430")
    root.minsize(560, 390)
    root.configure(bg="#130b14")

    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")

    container = ttk.Frame(root, padding=24)
    container.pack(fill="both", expand=True)
    ttk.Label(
        container,
        text="CYBERGIRL",
        font=("Segoe UI", 20, "bold"),
        foreground="#d92978",
    ).pack(anchor="w")
    ttk.Label(
        container,
        text="Trợ lý ảo tiếng Việt dùng Microsoft Edge",
        font=("Segoe UI", 11),
    ).pack(anchor="w", pady=(2, 18))

    status = tk.StringVar(value=f"Đang chạy an toàn tại {service.url}")
    ttk.Label(container, textvariable=status, font=("Segoe UI", 10)).pack(
        anchor="w", pady=(0, 16)
    )

    info = (
        "• Không cần cài Python, Node hoặc CUDA sau khi đóng gói.\n"
        "• Face Mesh, ảnh, microphone và khẩu hình chạy trong Edge.\n"
        "• Ollama/API chỉ nhận văn bản hội thoại, không nhận ảnh.\n"
        "• Khóa API chỉ giữ trong bộ nhớ và bị xóa khi thoát."
    )
    ttk.Label(container, text=info, justify="left", font=("Segoe UI", 10)).pack(
        anchor="w", pady=(0, 20)
    )

    log_frame = ttk.LabelFrame(container, text="Nhật ký ngắn", padding=10)
    log_frame.pack(fill="both", expand=True)
    log_text = tk.Text(
        log_frame,
        height=6,
        state="disabled",
        bg="#1c1320",
        fg="#f5eaf0",
        insertbackground="#ffffff",
        relief="flat",
        font=("Consolas", 9),
    )
    log_text.pack(fill="both", expand=True)

    def log(message: str) -> None:
        log_text.configure(state="normal")
        log_text.insert("end", f"{message}\n")
        log_text.see("end")
        log_text.configure(state="disabled")

    service.httpd.ghi_nhat_ky = log  # type: ignore[attr-defined]

    buttons = ttk.Frame(container)
    buttons.pack(fill="x", pady=(18, 0))

    def open_app() -> None:
        if mo_microsoft_edge(service.url):
            status.set("Đã mở Cybergirl trong Microsoft Edge")
            log("Đã yêu cầu Microsoft Edge mở giao diện Cybergirl.")
        else:
            messagebox.showerror(
                "Không mở được Edge",
                f"Hãy mở Microsoft Edge và truy cập {service.url}",
            )

    ttk.Button(buttons, text="Mở Cybergirl trong Edge", command=open_app).pack(
        side="left"
    )
    ttk.Button(buttons, text="Thoát", command=lambda: close()).pack(side="right")

    def close() -> None:
        service.stop()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", close)
    root.after(350, open_app)
    root.mainloop()


def self_test(assets: Path) -> int:
    required = [
        "index.html",
        "styles.css",
        "app.js",
        "characters.json",
        "assets/default-avatar.webp",
        "vendor/face_mesh/face_mesh.js",
        "vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm",
    ]
    missing = [name for name in required if not (assets / name).is_file()]
    if missing:
        print("Thiếu tài nguyên:", ", ".join(missing))
        return 1
    state = TrangThaiCybergirl(
        assets, config_path=assets / ".cybergirl-self-test.json"
    )
    print(
        json.dumps(
            {
                "ok": True,
                "phien_ban": PHIEN_BAN,
                "nhan_vat": len(state.registry.public_list()),
                "provider": state.public_config()["provider"],
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Cybergirl GUI cho Windows")
    parser.add_argument("--chi-may-chu", action="store_true")
    parser.add_argument("--khong-mo-edge", action="store_true")
    parser.add_argument("--tu-kiem-tra", action="store_true")
    parser.add_argument("--cong", type=int, default=CONG_MAC_DINH)
    args = parser.parse_args()
    assets = thu_muc_tai_nguyen()
    if args.tu_kiem_tra:
        return self_test(assets)
    try:
        state = TrangThaiCybergirl(assets)
        service = DichVu(state, args.cong)
        service.start()
    except (OSError, LoiCauHinhNhanVat) as exc:
        print(f"Không thể khởi động Cybergirl: {exc}", file=sys.stderr)
        return 1

    if args.chi_may_chu:
        print(service.url, flush=True)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            service.stop()
        return 0
    if args.khong_mo_edge:
        print(service.url)
        service.stop()
        return 0
    chay_gui(service)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
