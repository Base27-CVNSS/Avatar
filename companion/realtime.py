"""Điều phối lượt hội thoại, tách câu streaming và cử chỉ ngữ nghĩa."""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field


class LuotDaHuy(RuntimeError):
    """Báo hiệu kết quả của lượt cũ phải bị loại bỏ ngay."""


@dataclass(slots=True)
class LuotHoiThoai:
    turn_id: int
    reason: str
    cancel: threading.Event = field(default_factory=threading.Event)
    done: threading.Event = field(default_factory=threading.Event)
    started_at: float = field(default_factory=time.perf_counter)
    first_token_at: float | None = None

    def kiem_tra(self) -> None:
        if self.cancel.is_set():
            raise LuotDaHuy(f"Lượt {self.turn_id} đã bị hủy.")


class BoDieuPhoiLuot:
    """Chỉ cho phép một lượt có quyền phát sự kiện/âm thanh tại một thời điểm."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sequence = 0
        self._current: LuotHoiThoai | None = None

    def bat_dau(self, reason: str) -> LuotHoiThoai:
        with self._lock:
            if self._current:
                self._current.cancel.set()
            self._sequence += 1
            self._current = LuotHoiThoai(self._sequence, reason)
            return self._current

    def huy(self, reason: str = "interrupt") -> LuotHoiThoai | None:
        del reason
        with self._lock:
            current = self._current
            if current and not current.done.is_set():
                current.cancel.set()
                return current
            return None

    def ket_thuc(self, turn: LuotHoiThoai) -> None:
        with self._lock:
            turn.done.set()
            if self._current is turn:
                self._current = None

    def la_hien_tai(self, turn: LuotHoiThoai) -> bool:
        with self._lock:
            return self._current is turn and not turn.cancel.is_set() and not turn.done.is_set()

    @property
    def current_id(self) -> int:
        with self._lock:
            return self._current.turn_id if self._current else 0


class BoTachCauStreaming:
    """Gom token thành đoạn TTS ngắn mà không cắt giữa từ tiếng Việt."""

    _BOUNDARY = re.compile(r'(?<=[.!?…])(?:["”’]\s*|\s+)')

    def __init__(self, min_chars: int = 18, max_chars: int = 96) -> None:
        self.min_chars = max(8, min_chars)
        self.max_chars = max(self.min_chars + 8, max_chars)
        self._buffer = ""

    @staticmethod
    def _lam_sach(text: str) -> str:
        text = re.sub(r"[*_#>`~]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def nap(self, delta: str) -> list[str]:
        self._buffer += str(delta or "")
        ready: list[str] = []
        while self._buffer:
            boundary = self._BOUNDARY.search(self._buffer)
            if boundary and boundary.end() >= self.min_chars:
                ready.append(self._lam_sach(self._buffer[: boundary.end()]))
                self._buffer = self._buffer[boundary.end() :]
                continue
            if len(self._buffer) >= self.max_chars:
                cut = self._buffer.rfind(" ", self.min_chars, self.max_chars + 1)
                if cut < self.min_chars:
                    cut = self.max_chars
                ready.append(self._lam_sach(self._buffer[:cut]))
                self._buffer = self._buffer[cut:].lstrip()
                continue
            break
        return [item for item in ready if item]

    def ket_thuc(self) -> list[str]:
        tail = self._lam_sach(self._buffer)
        self._buffer = ""
        return [tail] if tail else []


def chon_cu_chi(text: str, emotion: str = "trung_tính") -> str:
    """LLM chỉ cấp ý nghĩa; animation engine quyết định chuyển động cụ thể."""

    value = str(text or "").casefold()
    if any(word in value for word in ("bên phải", "phía phải", "chỗ này", "vị trí này")):
        return "point_right"
    if any(word in value for word in ("bên trái", "phía trái")):
        return "point_left"
    if any(word in value for word in ("xin chào", "chào bạn", "rất vui", "chúc mừng")):
        return "welcome"
    if any(word in value for word in ("hãy xem", "giải thích", "ví dụ", "thứ nhất", "thứ hai")):
        return "explain"
    if emotion in {"quan_tâm", "buồn", "bình_tĩnh"}:
        return "listen"
    if emotion in {"vui", "ngạc_nhiên"}:
        return "open_hands"
    return "idle"
