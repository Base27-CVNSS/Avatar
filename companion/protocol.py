"""Giao thức Native Messaging: JSON có tiền tố độ dài little-endian 32 bit."""

from __future__ import annotations

import json
import struct
import threading
from typing import Any, BinaryIO


GIOI_HAN_BAN_TIN = 1_000_000


class LoiGiaoThuc(RuntimeError):
    pass


def _doc_du(stream: BinaryIO, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            raise EOFError("Luồng Native Messaging đã đóng giữa bản tin.")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def doc_ban_tin(stream: BinaryIO) -> dict[str, Any] | None:
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise LoiGiaoThuc("Tiêu đề Native Messaging không đủ bốn byte.")
    (size,) = struct.unpack("<I", header)
    if size <= 0 or size > GIOI_HAN_BAN_TIN:
        raise LoiGiaoThuc(f"Bản tin có kích thước không hợp lệ: {size} byte.")
    try:
        message = json.loads(_doc_du(stream, size).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LoiGiaoThuc("Bản tin Native Messaging không phải JSON UTF-8.") from exc
    if not isinstance(message, dict):
        raise LoiGiaoThuc("Bản tin Native Messaging phải là một đối tượng JSON.")
    return message


class BoGhiBanTin:
    def __init__(self, stream: BinaryIO):
        self.stream = stream
        self.lock = threading.Lock()

    def gui(self, message: dict[str, Any]) -> None:
        payload = json.dumps(
            message, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        if len(payload) > GIOI_HAN_BAN_TIN:
            raise LoiGiaoThuc("Bản tin trả về vượt giới hạn một MB.")
        with self.lock:
            self.stream.write(struct.pack("<I", len(payload)))
            self.stream.write(payload)
            self.stream.flush()

