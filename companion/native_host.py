"""Native host Cybergirl: Edge ↔ VAD ↔ Whisper ↔ LLM ↔ TTS."""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import traceback
from pathlib import Path
from typing import Any

from . import PHIEN_BAN, TEN_NATIVE_HOST
from .audio import AudioPipeline, LoiAmThanh
from .config import CauHinhCompanion, KhoCauHinh
from .engines import BoNao, LoiEngine, TiengNoi, WhisperCLI
from .protocol import BoGhiBanTin, LoiGiaoThuc, doc_ban_tin


PROMPT_MAC_DINH = (
    "Bạn là Cybergirl, trợ lý đồng hành nói tiếng Việt tự nhiên. "
    "Trả lời ngắn gọn, ấm áp, không dùng markdown và giữ nguyên dấu tiếng Việt."
)


class NativeHost:
    def __init__(self, input_stream=None, output_stream=None, config_path=None):
        self.input = input_stream or sys.stdin.buffer
        self.output = BoGhiBanTin(output_stream or sys.stdout.buffer)
        self.store = KhoCauHinh(config_path)
        self.config = self.store.doc()
        self.api_keys: dict[str, str] = {}
        self.brain = BoNao()
        self.whisper = WhisperCLI()
        self.voice = TiengNoi()
        self.audio: AudioPipeline | None = None
        self.history: list[dict[str, str]] = []
        self.system_prompt = PROMPT_MAC_DINH
        self.closed = threading.Event()

    def _event(self, name: str, data: dict[str, Any]) -> None:
        self.output.gui({"event": name, "data": data})
        if name == "vad.speech_start":
            self.voice.dung()

    def _status(self) -> dict[str, Any]:
        cfg = self.config
        return {
            "host": TEN_NATIVE_HOST,
            "version": PHIEN_BAN,
            "language": "vi-VN",
            "listening": bool(self.audio),
            "config": cfg.cong_khai(self.api_keys),
            "components": {
                "silero_vad": Path(cfg.silero_vad_path).is_file(),
                "whisper_cli": Path(cfg.whisper_cli_path).is_file(),
                "whisper_model": Path(cfg.whisper_model_path).is_file(),
                "llama_server": Path(cfg.llama_server_path).is_file(),
                "gguf_model": Path(cfg.gguf_path).is_file(),
                "tts_local": cfg.tts_engine == "windows-sapi"
                or (
                    Path(cfg.piper_path).is_file()
                    and Path(cfg.piper_model_path).is_file()
                ),
            },
            "privacy": {
                "image_sent": False,
                "api_keys_persisted": False,
                "native_channel": True,
            },
        }

    def _configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.config.cap_nhat(payload)
        prompt = str(payload.get("system_prompt", "")).strip()
        if prompt:
            self.system_prompt = prompt[:6_000]
        api_key = str(payload.get("api_key", "")).strip()
        if api_key:
            self.api_keys[self.config.provider] = api_key
        self.store.ghi(self.config)
        return self._status()

    def _chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        message = str(payload.get("message", "")).strip()
        if not message:
            raise ValueError("Tin nhắn không được để trống.")
        history = payload.get("history", self.history)
        if not isinstance(history, list):
            raise ValueError("Lịch sử hội thoại không hợp lệ.")
        self._event("llm.thinking", {"provider": self.config.provider})
        answer = self.brain.tra_loi(
            self.config,
            self.api_keys.get(self.config.provider, ""),
            message,
            history,
            str(payload.get("system_prompt", self.system_prompt))[:6_000],
        )
        self.history.extend(
            [
                {"role": "user", "content": message},
                {"role": "assistant", "content": answer},
            ]
        )
        self.history = self.history[-24:]
        self._event("llm.answer", {"text": answer})
        should_speak = bool(payload.get("speak", self.config.auto_speak))
        if should_speak and self.config.tts_engine != "edge":
            self._speak({"text": answer})
        return {"text": answer, "provider": self.config.provider}

    def _speak(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("text", "")).strip()
        if not text:
            raise ValueError("Nội dung đọc không được để trống.")
        directory = Path(tempfile.mkdtemp(prefix="cybergirl-tts-"))
        wav_path = directory / "tra-loi.wav"
        metadata = self.voice.tong_hop(self.config, text, wav_path)
        metadata["text"] = text
        self.voice.phat(wav_path, metadata, self._event)
        return metadata

    def _on_segment(self, wav_path: Path) -> None:
        try:
            self._event("stt.started", {})
            text = self.whisper.phien_am(self.config, wav_path)
            self._event("stt.final", {"text": text})
            if self.config.auto_chat:
                self._chat({"message": text, "history": [], "speak": True})
        except Exception as exc:  # Event boundary: return a Vietnamese error.
            self._event("pipeline.error", {"error": str(exc)})
        finally:
            try:
                wav_path.unlink(missing_ok=True)
                wav_path.parent.rmdir()
            except OSError:
                pass

    def _start_listening(self) -> dict[str, Any]:
        if self.audio:
            return self._status()
        self.audio = AudioPipeline(
            self.config.silero_vad_path,
            self.config.vad_threshold,
            self.config.silence_ms,
            self._on_segment,
            self._event,
        )
        try:
            self.audio.start()
        except Exception:
            self.audio = None
            raise
        return self._status()

    def _stop_listening(self) -> dict[str, Any]:
        if self.audio:
            self.audio.stop()
            self.audio = None
        return self._status()

    def dispatch(self, command: str, payload: dict[str, Any]) -> Any:
        if command in {"ping", "status"}:
            return self._status()
        if command == "configure":
            return self._configure(payload)
        if command == "chat":
            return self._chat(payload)
        if command == "speak":
            return self._speak(payload)
        if command == "interrupt":
            self.voice.dung()
            self._event("conversation.interrupted", {})
            return {"interrupted": True}
        if command == "start_listening":
            return self._start_listening()
        if command == "stop_listening":
            return self._stop_listening()
        if command == "benchmark_tts":
            text = str(
                payload.get(
                    "text",
                    "Xin chào, đây là phép đo giọng tiếng Việt của Cybergirl.",
                )
            )[:1_000]
            return {"results": self.voice.benchmark(self.config, text)}
        if command == "clear_history":
            self.history.clear()
            return {"cleared": True}
        raise ValueError(f"Lệnh companion không được hỗ trợ: {command}")

    def _handle(self, message: dict[str, Any]) -> None:
        request_id = str(message.get("id", ""))
        try:
            command = str(message.get("type", "")).strip()
            payload = message.get("payload") or {}
            if not isinstance(payload, dict):
                raise ValueError("Payload phải là đối tượng JSON.")
            result = self.dispatch(command, payload)
            self.output.gui({"id": request_id, "ok": True, "result": result})
        except (ValueError, OSError, LoiEngine, LoiAmThanh, LoiGiaoThuc) as exc:
            self.output.gui({"id": request_id, "ok": False, "error": str(exc)})
        except Exception as exc:  # Không để traceback làm hỏng stdout Native Messaging.
            if os.environ.get("CYBERGIRL_DEBUG"):
                traceback.print_exc(file=sys.stderr)
            self.output.gui(
                {"id": request_id, "ok": False, "error": f"Lỗi companion: {exc}"}
            )

    def run(self) -> None:
        try:
            while not self.closed.is_set():
                message = doc_ban_tin(self.input)
                if message is None:
                    break
                threading.Thread(
                    target=self._handle, args=(message,), daemon=True
                ).start()
        finally:
            self.close()

    def close(self) -> None:
        self.closed.set()
        if self.audio:
            self.audio.stop()
            self.audio = None
        self.voice.dung()
        self.brain.dong()


def main() -> int:
    NativeHost().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
