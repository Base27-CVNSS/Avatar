"""Bộ nhớ hội thoại dài hạn SQLite, chỉ lưu cục bộ khi người dùng bật."""

from __future__ import annotations

import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .config import thu_muc_du_lieu


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[\wÀ-ỹ]{3,}", text.casefold(), flags=re.UNICODE)
        if token not in {"mình", "bạn", "được", "những", "không", "của", "với", "cho"}
    }


class BoNhoDaiHan:
    def __init__(self, path: Path | None = None):
        self.path = path or (thu_muc_du_lieu() / "bo-nho-hoi-thoai.sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.connection: sqlite3.Connection | None = sqlite3.connect(
            self.path, check_same_thread=False
        )
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                character_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL
            )
            """
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_turns_character ON turns(character_id, id)"
        )
        self.connection.commit()

    def ghi(self, character_id: str, role: str, content: str) -> None:
        if role not in {"user", "assistant"}:
            return
        clean = re.sub(r"\s+", " ", content).strip()[:4_000]
        if not clean:
            return
        with self.lock:
            self.connection.execute(
                "INSERT INTO turns(created_at, character_id, role, content) VALUES (?, ?, ?, ?)",
                (int(time.time()), character_id[:80] or "cybergirl", role, clean),
            )
            self.connection.commit()

    def goi_lai(
        self, character_id: str, query: str, limit: int = 8
    ) -> list[dict[str, str]]:
        """Kết hợp ký ức gần nhất và lượt liên quan theo từ khóa tiếng Việt."""

        with self.lock:
            rows = self.connection.execute(
                """
                SELECT id, role, content FROM turns
                WHERE character_id = ? ORDER BY id DESC LIMIT 240
                """,
                (character_id[:80] or "cybergirl",),
            ).fetchall()
        query_tokens = _tokens(query)
        ranked: list[tuple[float, int, str, str]] = []
        for position, (row_id, role, content) in enumerate(rows):
            overlap = len(query_tokens & _tokens(content))
            recency = max(0.0, 1.0 - position / 240)
            ranked.append((overlap * 3.0 + recency, row_id, role, content))
        selected = sorted(ranked, reverse=True)[: max(2, min(limit, 12))]
        return [
            {"role": role, "content": content}
            for _score, _row_id, role, content in sorted(selected, key=lambda item: item[1])
        ]

    def thong_ke(self) -> dict[str, Any]:
        with self.lock:
            count, latest = self.connection.execute(
                "SELECT COUNT(*), MAX(created_at) FROM turns"
            ).fetchone()
        return {
            "enabled_storage": True,
            "turns": int(count or 0),
            "latest_at": int(latest or 0),
            "path": str(self.path),
        }

    def xoa(self, character_id: str | None = None) -> int:
        with self.lock:
            if character_id:
                cursor = self.connection.execute(
                    "DELETE FROM turns WHERE character_id = ?", (character_id[:80],)
                )
            else:
                cursor = self.connection.execute("DELETE FROM turns")
            self.connection.commit()
            return max(cursor.rowcount, 0)

    def dong(self) -> None:
        with self.lock:
            if self.connection is not None:
                self.connection.close()
                self.connection = None
