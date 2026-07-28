"""Adapter Whisper, GGUF/API và TTS tiếng Việt cho companion."""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Any, Callable

from .config import CauHinhCompanion


class LoiEngine(RuntimeError):
    pass


def _yeu_cau_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": "Cybergirl-Companion/3.3",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read(4_000_000).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read(8_000).decode("utf-8", errors="replace")
        raise LoiEngine(f"API trả về HTTP {exc.code}: {detail[:500]}") from exc
    except urllib.error.URLError as exc:
        raise LoiEngine("Không kết nối được bộ não AI đã chọn.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LoiEngine("Bộ não AI trả về JSON không hợp lệ.") from exc


def _lam_sach(text: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"[*_#>`~]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:8_000]


class LlamaServer:
    def __init__(self):
        self.process: subprocess.Popen[str] | None = None
        self.signature = ""
        self.lock = threading.RLock()

    def _health(self, base_url: str) -> bool:
        try:
            with urllib.request.urlopen(
                base_url.removesuffix("/v1") + "/health", timeout=1.5
            ) as response:
                return response.status == 200
        except (OSError, urllib.error.URLError):
            return False

    def dam_bao(self, config: CauHinhCompanion) -> None:
        executable = Path(config.llama_server_path)
        model = Path(config.gguf_path)
        if not executable.is_file():
            raise LoiEngine("Chưa chọn llama-server.exe.")
        if not model.is_file() or model.suffix.lower() != ".gguf":
            raise LoiEngine("Chưa chọn mô hình LLM định dạng GGUF.")
        signature = f"{executable}|{model}|{config.threads}|{config.base_url}"
        with self.lock:
            if self.signature == signature and self._health(config.base_url):
                return
            self.dung()
            port = 27829
            match = re.search(r":(\d+)(?:/|$)", config.base_url)
            if match:
                port = int(match.group(1))
            flags = 0
            if os.name == "nt":
                flags = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
            self.process = subprocess.Popen(
                [
                    str(executable),
                    "-m",
                    str(model),
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                    "--ctx-size",
                    "4096",
                    "--threads",
                    str(config.threads),
                    "--jinja",
                    "--no-webui",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True,
                creationflags=flags,
            )
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise LoiEngine("llama-server dừng trước khi nạp xong mô hình GGUF.")
                if self._health(config.base_url):
                    self.signature = signature
                    return
                time.sleep(0.35)
            self.dung()
            raise LoiEngine("llama-server không sẵn sàng sau 45 giây.")

    def dung(self) -> None:
        with self.lock:
            if self.process and self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    self.process.kill()
            self.process = None
            self.signature = ""


class BoNao:
    def __init__(self):
        self.llama = LlamaServer()

    def tra_loi(
        self,
        config: CauHinhCompanion,
        api_key: str,
        message: str,
        history: list[dict[str, str]],
        system_prompt: str,
    ) -> str:
        safe_history = [
            {
                "role": item.get("role", "user"),
                "content": str(item.get("content", ""))[:4_000],
            }
            for item in history[-12:]
            if item.get("role") in {"user", "assistant"}
        ]
        if config.provider == "gguf":
            self.llama.dam_bao(config)
            provider = "openai-compatible"
        else:
            provider = config.provider

        if provider == "openai":
            if not api_key:
                raise LoiEngine("Cần nhập khóa OpenAI API cho phiên hiện tại.")
            data = _yeu_cau_json(
                config.base_url.rstrip("/") + "/responses",
                {
                    "model": config.model,
                    "instructions": system_prompt,
                    "input": [
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                    "store": False,
                },
                {"Authorization": f"Bearer {api_key}"},
            )
            answer = str(data.get("output_text", ""))
            if not answer:
                answer = " ".join(
                    str(part.get("text", ""))
                    for item in data.get("output", [])
                    for part in item.get("content", [])
                    if part.get("type") == "output_text"
                )
        elif provider == "gemini":
            if not api_key:
                raise LoiEngine("Cần nhập khóa Gemini API cho phiên hiện tại.")
            data = _yeu_cau_json(
                config.base_url.rstrip("/") + "/interactions",
                {
                    "model": config.model,
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
                {"x-goog-api-key": api_key},
            )
            answer = str(data.get("output_text", ""))
            if not answer:
                answer = str(data.get("text", ""))
        elif provider == "openrouter":
            if not api_key:
                raise LoiEngine("Cần nhập khóa OpenRouter mới cho phiên hiện tại.")
            headers = {
                "Authorization": f"Bearer {api_key}",
                "X-OpenRouter-Title": config.openrouter_title,
            }
            if config.openrouter_referer:
                headers["HTTP-Referer"] = config.openrouter_referer
            payload: dict[str, Any] = {
                "model": config.model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    *safe_history,
                    {"role": "user", "content": message},
                ],
                "temperature": 0.7,
                "max_tokens": 240,
            }
            if config.openrouter_zdr:
                payload["provider"] = {"zdr": True}
            data = _yeu_cau_json(
                config.base_url.rstrip("/") + "/chat/completions",
                payload,
                headers,
            )
            choices = data.get("choices") or []
            answer = (
                str(choices[0].get("message", {}).get("content", ""))
                if choices
                else ""
            )
        elif provider == "ollama":
            data = _yeu_cau_json(
                config.base_url.rstrip("/") + "/api/chat",
                {
                    "model": config.model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                    "options": {"temperature": 0.7, "num_predict": 240},
                },
            )
            answer = str(data.get("message", {}).get("content", ""))
        else:
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            data = _yeu_cau_json(
                config.base_url.rstrip("/") + "/chat/completions",
                {
                    "model": config.model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        *safe_history,
                        {"role": "user", "content": message},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 240,
                },
                headers,
            )
            choices = data.get("choices") or []
            answer = (
                str(choices[0].get("message", {}).get("content", ""))
                if choices
                else ""
            )
        answer = _lam_sach(answer)
        if not answer:
            raise LoiEngine("Bộ não AI không trả về nội dung.")
        return answer

    def dong(self) -> None:
        self.llama.dung()


class WhisperCLI:
    def phien_am(self, config: CauHinhCompanion, wav_path: Path) -> str:
        executable = Path(config.whisper_cli_path)
        model = Path(config.whisper_model_path)
        if not executable.is_file():
            raise LoiEngine("Chưa chọn whisper-cli.exe.")
        if not model.is_file():
            raise LoiEngine("Chưa chọn mô hình Whisper GGML.")
        with tempfile.TemporaryDirectory(prefix="cybergirl-stt-") as directory:
            prefix = Path(directory) / "ket-qua"
            flags = 0
            if os.name == "nt":
                flags = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
            result = subprocess.run(
                [
                    str(executable),
                    "-m",
                    str(model),
                    "-f",
                    str(wav_path),
                    "-l",
                    "vi",
                    "-t",
                    str(config.threads),
                    "-nt",
                    "-otxt",
                    "-of",
                    str(prefix),
                ],
                capture_output=True,
                text=True,
                timeout=180,
                creationflags=flags,
                check=False,
            )
            output = prefix.with_suffix(".txt")
            if result.returncode != 0 or not output.is_file():
                detail = (result.stderr or result.stdout)[-800:]
                raise LoiEngine(f"Whisper không phiên âm được: {detail}")
            text = _lam_sach(output.read_text(encoding="utf-8", errors="replace"))
            if not text:
                raise LoiEngine("Whisper không nhận được câu nói rõ ràng.")
            return text


def _thoi_luong_wav(path: Path) -> float:
    with wave.open(str(path), "rb") as reader:
        return reader.getnframes() / max(reader.getframerate(), 1)


class TiengNoi:
    def __init__(self):
        self._play_token = 0
        self._playing = False

    @property
    def dang_phat(self) -> bool:
        return self._playing

    def tong_hop(
        self, config: CauHinhCompanion, text: str, output: Path
    ) -> dict[str, Any]:
        started = time.perf_counter()
        if config.tts_engine == "edge":
            raise LoiEngine("Giọng Edge được phát trong extension, không tạo WAV cục bộ.")
        if config.tts_engine == "windows-sapi":
            if os.name != "nt":
                raise LoiEngine("Windows SAPI chỉ có trên Windows.")
            script = (
                "[Console]::InputEncoding=[Text.Encoding]::UTF8;"
                "Add-Type -AssemblyName System.Speech;"
                "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
                "if($args[1]){$s.SelectVoice($args[1])};"
                "$s.SetOutputToWaveFile($args[0]);"
                "$t=[Console]::In.ReadToEnd();$s.Speak($t);$s.Dispose()"
            )
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", script, str(output), config.tts_voice],
                input=text,
                text=True,
                encoding="utf-8",
                capture_output=True,
                timeout=120,
                creationflags=subprocess.CREATE_NO_WINDOW,  # type: ignore[attr-defined]
                check=False,
            )
        else:
            executable = Path(config.piper_path)
            model = Path(config.piper_model_path)
            if not executable.is_file() or not model.is_file():
                raise LoiEngine("Chưa chọn piper.exe và mô hình tiếng Việt ONNX.")
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # type: ignore[attr-defined]
            result = subprocess.run(
                [
                    str(executable),
                    "--model",
                    str(model),
                    "--output_file",
                    str(output),
                ],
                input=text,
                text=True,
                encoding="utf-8",
                capture_output=True,
                timeout=120,
                creationflags=flags,
                check=False,
            )
        if result.returncode != 0 or not output.is_file():
            raise LoiEngine(
                f"TTS không tạo được âm thanh: {(result.stderr or result.stdout)[-600:]}"
            )
        synthesis_seconds = time.perf_counter() - started
        duration_seconds = _thoi_luong_wav(output)
        return {
            "engine": config.tts_engine,
            "synthesis_ms": round(synthesis_seconds * 1000, 1),
            "audio_seconds": round(duration_seconds, 3),
            "rtf": round(synthesis_seconds / max(duration_seconds, 0.001), 3),
            "characters_per_second": round(len(text) / max(synthesis_seconds, 0.001), 1),
            "wav_path": str(output),
        }

    def phat(
        self,
        wav_path: Path,
        metadata: dict[str, Any],
        callback: Callable[[str, dict[str, Any]], None],
    ) -> None:
        if os.name != "nt":
            raise LoiEngine("Phát WAV cục bộ hiện hỗ trợ Windows.")
        import winsound

        self._play_token += 1
        token = self._play_token
        self._playing = True
        winsound.PlaySound(
            str(wav_path), winsound.SND_FILENAME | winsound.SND_ASYNC
        )
        callback("tts.started", metadata)

        def wait_end() -> None:
            time.sleep(float(metadata["audio_seconds"]))
            if token == self._play_token:
                self._playing = False
                callback("tts.ended", metadata)

        threading.Thread(target=wait_end, daemon=True).start()

    def dung(self) -> None:
        self._play_token += 1
        self._playing = False
        if os.name == "nt":
            import winsound

            winsound.PlaySound(None, winsound.SND_PURGE)

    def benchmark(
        self, config: CauHinhCompanion, text: str
    ) -> list[dict[str, Any]]:
        engines = ["windows-sapi", "piper"]
        results: list[dict[str, Any]] = []
        for engine in engines:
            values = config.cong_khai()
            values.pop("api_key_present", None)
            trial = CauHinhCompanion(**values)
            trial.tts_engine = engine
            with tempfile.TemporaryDirectory(prefix="cybergirl-tts-bench-") as directory:
                output = Path(directory) / f"{engine}.wav"
                try:
                    measurement = self.tong_hop(trial, text, output)
                    measurement["available"] = True
                    results.append(measurement)
                except (LoiEngine, OSError, subprocess.SubprocessError) as exc:
                    results.append(
                        {"engine": engine, "available": False, "error": str(exc)}
                    )
        available = sorted(
            (item for item in results if item.get("available")),
            key=lambda item: float(item["rtf"]),
        )
        if available:
            available[0]["recommended_for_speed"] = True
        return results
