"""Bộ kết nối API cho Cybergirl, chỉ dùng thư viện chuẩn Python."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class LoiAPI(RuntimeError):
    """Lỗi có thể hiển thị trực tiếp bằng tiếng Việt."""


@dataclass(slots=True)
class CauHinhAPI:
    provider: str = "ollama"
    base_url: str = "http://127.0.0.1:11434"
    model: str = "qwen3:4b"
    api_key: str = ""
    timeout_seconds: int = 90

    def validated(self) -> "CauHinhAPI":
        if self.provider not in {"gguf", "ollama", "openai", "openai-compatible", "gemini"}:
            raise LoiAPI("Nhà cung cấp AI không được hỗ trợ.")
        parsed = urllib.parse.urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise LoiAPI("Địa chỉ API phải bắt đầu bằng http:// hoặc https://.")
        if not self.model.strip():
            raise LoiAPI("Tên mô hình không được để trống.")
        self.base_url = self.base_url.rstrip("/")
        self.model = self.model.strip()
        self.timeout_seconds = max(5, min(int(self.timeout_seconds), 300))
        return self


def _clean_text(value: str) -> str:
    value = re.sub(r"```[\s\S]*?```", " ", value)
    value = re.sub(r"[*_#>`~]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:4_000]


class APIClient:
    def __init__(self, config: CauHinhAPI):
        self.config = config.validated()

    def _request(
        self, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None
    ) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": "Cybergirl/3.0",
            **(headers or {}),
        }
        request = urllib.request.Request(
            url, data=body, headers=request_headers, method="POST"
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.config.timeout_seconds
            ) as response:
                raw = response.read(2_000_000)
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read(8_000).decode("utf-8", errors="replace")
            raise LoiAPI(
                f"API trả về lỗi HTTP {exc.code}: {detail[:500]}"
            ) from exc
        except urllib.error.URLError as exc:
            raise LoiAPI(
                "Không kết nối được API. Hãy kiểm tra địa chỉ, Internet hoặc Ollama."
            ) from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise LoiAPI("API trả về dữ liệu không phải JSON hợp lệ.") from exc

    def chat(
        self, message: str, history: list[dict[str, str]], system_prompt: str
    ) -> str:
        message = message.strip()
        if not message:
            raise LoiAPI("Tin nhắn không được để trống.")
        safe_history = [
            {
                "role": item.get("role", "user"),
                "content": str(item.get("content", ""))[:4_000],
            }
            for item in history[-12:]
            if item.get("role") in {"user", "assistant"}
            and str(item.get("content", "")).strip()
        ]

        if self.config.provider == "ollama":
            data = self._request(
                f"{self.config.base_url}/api/chat",
                {
                    "model": self.config.model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                    "options": {"temperature": 0.7, "num_predict": 180},
                },
            )
            answer = data.get("message", {}).get("content", "")
        elif self.config.provider == "openai":
            if not self.config.api_key:
                raise LoiAPI("Cần nhập khóa OpenAI API.")
            data = self._request(
                f"{self.config.base_url}/responses",
                {
                    "model": self.config.model,
                    "instructions": system_prompt,
                    "input": [
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                    "store": False,
                },
                {"Authorization": f"Bearer {self.config.api_key}"},
            )
            answer = str(data.get("output_text", ""))
            if not answer:
                answer = " ".join(
                    str(part.get("text", ""))
                    for item in data.get("output", [])
                    for part in item.get("content", [])
                    if part.get("type") == "output_text"
                )
        elif self.config.provider == "gemini":
            if not self.config.api_key:
                raise LoiAPI("Cần nhập khóa API Gemini.")
            data = self._request(
                f"{self.config.base_url}/interactions",
                {
                    "model": self.config.model,
                    "system_instruction": system_prompt,
                    "input": "\n".join(
                        [
                            *[
                            f"{'Cybergirl' if item['role'] == 'assistant' else 'Người dùng'}: {item['content']}"
                            for item in safe_history
                            ],
                            f"Người dùng: {message}",
                        ]
                    ),
                    "store": False,
                    "generation_config": {"thinking_level": "low"},
                },
                {"x-goog-api-key": self.config.api_key},
            )
            answer = str(data.get("output_text", "") or data.get("text", ""))
        else:
            headers = {}
            if self.config.api_key:
                headers["Authorization"] = f"Bearer {self.config.api_key}"
            base_url = self.config.base_url
            data = self._request(
                f"{base_url}/chat/completions",
                {
                    "model": self.config.model,
                    "stream": False,
                    "temperature": 0.7,
                    "max_tokens": 240,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                },
                headers,
            )
            choices = data.get("choices") or []
            answer = (
                choices[0].get("message", {}).get("content", "")
                if choices
                else ""
            )

        answer = _clean_text(str(answer))
        if not answer:
            raise LoiAPI("API không trả về nội dung.")
        return answer

    def test_connection(self) -> str:
        return self.chat(
            "Chỉ trả lời đúng một câu: Kết nối thành công.",
            [],
            "Trả lời ngắn gọn bằng tiếng Việt, không dùng markdown.",
        )
