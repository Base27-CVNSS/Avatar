"""Cấu hình companion. Khóa API chỉ tồn tại trong RAM."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


NHA_CUNG_CAP = {
    "gguf",
    "openai",
    "gemini",
    "ollama",
    "openai-compatible",
}
TTS_ENGINE = {"windows-sapi", "piper", "edge"}


def thu_muc_du_lieu() -> Path:
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    else:
        root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    target = root / "Cybergirl" / "Companion"
    target.mkdir(parents=True, exist_ok=True)
    return target


@dataclass(slots=True)
class CauHinhCompanion:
    provider: str = "gguf"
    base_url: str = "http://127.0.0.1:27829/v1"
    model: str = "qwen3-4b-vi"
    gguf_path: str = ""
    llama_server_path: str = ""
    whisper_cli_path: str = ""
    whisper_model_path: str = ""
    silero_vad_path: str = ""
    tts_engine: str = "windows-sapi"
    tts_voice: str = ""
    piper_path: str = ""
    piper_model_path: str = ""
    character_id: str = "mai"
    auto_chat: bool = True
    auto_speak: bool = True
    memory_enabled: bool = False
    emotion_enabled: bool = True
    full_duplex: bool = True
    echo_guard: bool = True
    vad_threshold: float = 0.55
    silence_ms: int = 650
    threads: int = max(2, min((os.cpu_count() or 4) - 1, 8))

    def cap_nhat(self, payload: dict[str, Any]) -> None:
        string_fields = {
            "provider",
            "base_url",
            "model",
            "gguf_path",
            "llama_server_path",
            "whisper_cli_path",
            "whisper_model_path",
            "silero_vad_path",
            "tts_engine",
            "tts_voice",
            "piper_path",
            "piper_model_path",
            "character_id",
        }
        for field in string_fields:
            if field in payload:
                setattr(self, field, str(payload[field]).strip())
        for field in (
            "auto_chat",
            "auto_speak",
            "memory_enabled",
            "emotion_enabled",
            "full_duplex",
            "echo_guard",
        ):
            if field in payload:
                setattr(self, field, bool(payload[field]))
        if "vad_threshold" in payload:
            self.vad_threshold = max(0.2, min(float(payload["vad_threshold"]), 0.95))
        if "silence_ms" in payload:
            self.silence_ms = max(250, min(int(payload["silence_ms"]), 2_500))
        if "threads" in payload:
            self.threads = max(1, min(int(payload["threads"]), 32))
        if self.provider not in NHA_CUNG_CAP:
            raise ValueError("Nhà cung cấp AI không được hỗ trợ.")
        if self.tts_engine not in TTS_ENGINE:
            raise ValueError("Bộ đọc tiếng Việt không được hỗ trợ.")

    def cong_khai(self, api_keys: dict[str, str] | None = None) -> dict[str, Any]:
        result = asdict(self)
        result["api_key_present"] = bool((api_keys or {}).get(self.provider))
        return result


class KhoCauHinh:
    """Không bao giờ ghi api_key, openai_api_key hoặc gemini_api_key."""

    def __init__(self, path: Path | None = None):
        self.path = path or (thu_muc_du_lieu() / "cau-hinh-companion.json")

    def doc(self) -> CauHinhCompanion:
        config = CauHinhCompanion()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                config.cap_nhat(payload)
        except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
            pass
        return config

    def ghi(self, config: CauHinhCompanion) -> None:
        payload = config.cong_khai()
        payload.pop("api_key_present", None)
        for forbidden in ("api_key", "openai_api_key", "gemini_api_key"):
            payload.pop(forbidden, None)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temp.replace(self.path)
