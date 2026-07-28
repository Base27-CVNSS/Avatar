"""Suy luận cảm xúc tiếng Việt nhẹ, cục bộ và có thể kiểm thử."""

from __future__ import annotations

import re
from typing import Any


TU_KHOA = {
    "vui": {
        "vui", "mừng", "tuyệt", "hay", "thích", "yêu", "hạnh phúc", "cười",
        "chúc mừng", "đáng yêu", "ổn rồi", "thành công",
    },
    "buồn": {
        "buồn", "khóc", "tiếc", "mất", "cô đơn", "thất vọng", "đau lòng",
        "không ổn", "mệt mỏi",
    },
    "quan_tâm": {
        "lo", "cẩn thận", "giúp", "hỗ trợ", "sức khỏe", "nguy hiểm", "ổn không",
        "hãy nghỉ", "đừng quên",
    },
    "ngạc_nhiên": {
        "wow", "ồ", "thật sao", "bất ngờ", "không ngờ", "tuyệt vời",
    },
    "căng_thẳng": {
        "tức", "giận", "bực", "khó chịu", "sai rồi", "khẩn cấp", "ngay lập tức",
    },
    "bình_tĩnh": {
        "bình tĩnh", "từ từ", "nhẹ nhàng", "thư giãn", "yên tâm", "không sao",
    },
}

THAM_SO = {
    "trung_tính": (0.0, 0.22, 0.0, 0.0, 1.0),
    "vui": (0.72, 0.58, 0.18, -0.08, 1.32),
    "buồn": (-0.68, 0.26, -0.14, 0.14, 0.72),
    "quan_tâm": (0.28, 0.38, 0.12, 0.02, 0.88),
    "ngạc_nhiên": (0.32, 0.86, 0.0, -0.12, 1.55),
    "căng_thẳng": (-0.72, 0.78, -0.2, -0.04, 1.42),
    "bình_tĩnh": (0.22, 0.16, 0.08, 0.08, 0.62),
}


def phan_tich_cam_xuc(text: str) -> dict[str, Any]:
    """Trả trạng thái mặt ổn định, không gọi LLM hoặc gửi dữ liệu ra mạng."""

    normalized = re.sub(r"\s+", " ", text.casefold()).strip()
    scores = {
        emotion: sum(1 for keyword in keywords if keyword in normalized)
        for emotion, keywords in TU_KHOA.items()
    }
    emotion = max(scores, key=scores.get) if any(scores.values()) else "trung_tính"
    hits = scores.get(emotion, 0)
    punctuation = min(text.count("!") * 0.08 + text.count("?") * 0.04, 0.24)
    intensity = min(1.0, 0.28 + hits * 0.18 + punctuation)
    valence, arousal, gaze_x, gaze_y, blink_factor = THAM_SO[emotion]
    return {
        "name": emotion,
        "intensity": round(intensity, 3),
        "valence": valence,
        "arousal": arousal,
        "gaze_x": gaze_x,
        "gaze_y": gaze_y,
        "head_energy": round(0.55 + arousal * 0.7, 3),
        "blink_factor": blink_factor,
        "source": "vietnamese-local",
    }
