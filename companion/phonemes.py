"""Lịch phoneme/viseme tiếng Việt theo thời lượng WAV và đồng cấu âm."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


NHOM = {
    "closed": {"b", "m", "p"},
    "bite": {"f", "ph", "v"},
    "round": {"o", "ô", "ơ", "u", "ư", "qu"},
    "wide": {"a", "ă", "â", "e", "ê"},
    "narrow": {"i", "y", "ch", "nh", "gi"},
    "tongue": {"l", "n", "t", "th", "đ", "r"},
}
DIGRAPHS = ("ngh", "ch", "gh", "gi", "kh", "ng", "nh", "ph", "qu", "th", "tr")


def _viseme(unit: str) -> tuple[str, float, float, float]:
    base = unicodedata.normalize("NFC", unit.casefold())
    for name, values in NHOM.items():
        if base in values:
            opening = {
                "closed": 0.01,
                "bite": 0.18,
                "round": 0.36,
                "wide": 0.46,
                "narrow": 0.24,
                "tongue": 0.26,
            }[name]
            width = {"round": 0.82, "wide": 1.16, "narrow": 0.92}.get(name, 1.0)
            weight = 1.2 if name in {"round", "wide", "narrow"} else 0.78
            return name, opening, width, weight
    if base.isspace() or re.fullmatch(r"[,.!?;:…-]", base):
        return "closed", 0.008, 1.0, 1.35
    return "neutral", 0.22, 1.0, 0.82


def _tach(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", text.casefold())
    units: list[str] = []
    index = 0
    while index < len(normalized):
        pair = next(
            (item for item in DIGRAPHS if normalized.startswith(item, index)), None
        )
        if pair:
            units.append(pair)
            index += len(pair)
        else:
            units.append(normalized[index])
            index += 1
    return units


def lap_lich_viseme(text: str, audio_seconds: float) -> list[dict[str, Any]]:
    raw = [_viseme(unit) for unit in _tach(text)]
    if not raw:
        raw = [("closed", 0.008, 1.0, 1.0)]
    total_ms = max(120.0, float(audio_seconds) * 1_000)
    total_weight = sum(item[3] for item in raw)
    cursor = 0.0
    timeline: list[dict[str, Any]] = []
    for index, (name, opening, width, weight) in enumerate(raw):
        duration = total_ms * weight / max(total_weight, 0.001)
        # Đồng cấu âm: môi bắt đầu tiến dần về hình kế tiếp trước khi âm hiện tại kết thúc.
        next_open = raw[index + 1][1] if index + 1 < len(raw) else 0.008
        timeline.append(
            {
                "at_ms": round(cursor, 1),
                "duration_ms": round(duration, 1),
                "viseme": name,
                "open": round(opening, 3),
                "width": round(width, 3),
                "release_open": round(opening * 0.62 + next_open * 0.38, 3),
            }
        )
        cursor += duration
    return timeline
