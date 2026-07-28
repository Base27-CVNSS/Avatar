"""Quản lý nhân vật Cybergirl.

Mô-đun này kế thừa ý tưởng chuyển nhân vật nóng từ mã gốc của người dùng,
nhưng bỏ máy chủ HTTP riêng. Cybergirl dùng một máy chủ vòng lặp duy nhất
trong ``cybergirl.py`` để phục vụ GUI Edge và API hội thoại.
"""

from __future__ import annotations

import json
import threading
from copy import deepcopy
from pathlib import Path
from typing import Callable


TRUONG_BAT_BUOC = ("label", "system_prompt")


class LoiCauHinhNhanVat(ValueError):
    """Cấu hình nhân vật không hợp lệ."""


class VoiceRegistry:
    """Kho nhân vật an toàn luồng, hỗ trợ đổi và nạp lại không khởi động lại."""

    def __init__(self, config_path: str | Path = "characters.json"):
        self._lock = threading.RLock()
        self.config_path = Path(config_path)
        self.characters = self._read_validated()
        self.active = next(iter(self.characters))
        self._on_switch: list[Callable[[str], None]] = []

    def _read_validated(self) -> dict[str, dict]:
        try:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise LoiCauHinhNhanVat(
                f"Không tìm thấy tệp nhân vật: {self.config_path}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise LoiCauHinhNhanVat(
                f"Tệp nhân vật sai JSON tại dòng {exc.lineno}, cột {exc.colno}."
            ) from exc

        if not isinstance(raw, dict) or not raw:
            raise LoiCauHinhNhanVat("Cần ít nhất một nhân vật.")

        validated: dict[str, dict] = {}
        for key, value in raw.items():
            if not isinstance(key, str) or not key.strip():
                raise LoiCauHinhNhanVat("Mã nhân vật phải là chuỗi không rỗng.")
            if not isinstance(value, dict):
                raise LoiCauHinhNhanVat(f"Nhân vật {key!r} phải là một đối tượng JSON.")
            missing = [field for field in TRUONG_BAT_BUOC if not value.get(field)]
            if missing:
                raise LoiCauHinhNhanVat(
                    f"Nhân vật {key!r} thiếu trường: {', '.join(missing)}."
                )
            prompt = str(value["system_prompt"]).strip()
            if len(prompt) > 4_000:
                raise LoiCauHinhNhanVat(
                    f"Prompt của nhân vật {key!r} vượt quá 4.000 ký tự."
                )
            validated[key] = {
                "label": str(value["label"]).strip(),
                "system_prompt": prompt,
                "llm_model": str(value.get("llm_model", "")).strip(),
                "voice_language": str(value.get("voice_language", "vi-VN")).strip()
                or "vi-VN",
                **(
                    {"ref_audio": str(value["ref_audio"]).strip()}
                    if value.get("ref_audio")
                    else {}
                ),
            }
        return validated

    def current(self) -> dict:
        with self._lock:
            return {"id": self.active, **deepcopy(self.characters[self.active])}

    def current_prompt(self) -> str:
        return self.current()["system_prompt"]

    def current_model(self) -> str:
        return self.current().get("llm_model", "")

    def current_ref_audio(self) -> str | None:
        return self.current().get("ref_audio")

    def public_list(self) -> list[dict]:
        """Danh sách an toàn gửi cho GUI; không phát tán system prompt."""
        with self._lock:
            return [
                {
                    "id": key,
                    "label": value["label"],
                    "llm_model": value.get("llm_model", ""),
                    "voice_language": value.get("voice_language", "vi-VN"),
                }
                for key, value in self.characters.items()
            ]

    def register_callback(self, fn: Callable[[str], None]) -> None:
        self._on_switch.append(fn)

    def switch(self, name: str) -> bool:
        with self._lock:
            if name not in self.characters:
                return False
            changed = name != self.active
            self.active = name
        if changed:
            for fn in tuple(self._on_switch):
                fn(name)
        return True

    def reload_config(self) -> None:
        characters = self._read_validated()
        with self._lock:
            self.characters = characters
            if self.active not in self.characters:
                self.active = next(iter(self.characters))

