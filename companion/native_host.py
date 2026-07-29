"""Native host Cybergirl: Edge ↔ VAD ↔ Whisper ↔ LLM ↔ TTS streaming."""

from __future__ import annotations

import os
import queue
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path
from typing import Any

from . import PHIEN_BAN, TEN_NATIVE_HOST
from .audio import AudioPipeline, LoiAmThanh
from .config import CauHinhCompanion, KhoCauHinh
from .emotion import phan_tich_cam_xuc
from .engines import BoNao, LoiEngine, TiengNoi, WhisperCLI
from .memory import BoNhoDaiHan
from .phonemes import lap_lich_viseme
from .protocol import BoGhiBanTin, LoiGiaoThuc, doc_ban_tin
from .realtime import (
    BoDieuPhoiLuot,
    BoTachCauStreaming,
    LuotDaHuy,
    LuotHoiThoai,
    chon_cu_chi,
)
from .registry import danh_ba


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
        memory_path = (
            Path(config_path).with_name("bo-nho-hoi-thoai.sqlite3")
            if config_path
            else None
        )
        self.memory = BoNhoDaiHan(memory_path)
        self.api_keys: dict[str, str] = {}
        self.brain = BoNao()
        self.whisper = WhisperCLI()
        self.voice = TiengNoi()
        self.audio: AudioPipeline | None = None
        self.history: list[dict[str, str]] = []
        self.system_prompt = PROMPT_MAC_DINH
        self.closed = threading.Event()
        self.turns = BoDieuPhoiLuot()
        self.metrics: dict[str, Any] = {
            "turn_id": 0,
            "stt_ms": None,
            "llm_ttft_ms": None,
            "llm_total_ms": None,
            "first_audio_ms": None,
        }

    def _event(self, name: str, data: dict[str, Any]) -> None:
        self.output.gui({"event": name, "data": data})
        if name == "vad.speech_start":
            self._interrupt(
                "barge-in",
                {
                    "echo_guard": bool(data.get("echo_guard")),
                    "source": "silero-vad",
                },
            )

    def _interrupt(
        self, reason: str, extra: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        turn = self.turns.huy(reason)
        was_playing = self.voice.dang_phat
        self.voice.dung()
        result = {
            "interrupted": bool(turn or was_playing),
            "reason": reason,
            "turn_id": turn.turn_id if turn else self.turns.current_id,
            **(extra or {}),
        }
        if result["interrupted"]:
            self.output.gui({"event": "conversation.interrupted", "data": result})
        return result

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
                "tts_local": cfg.tts_engine in {"windows-sapi", "edge"}
                or (
                    Path(cfg.piper_path).is_file()
                    and Path(cfg.piper_model_path).is_file()
                ),
            },
            "conversation": {
                "short_term_turns": len(self.history),
                "memory_enabled": cfg.memory_enabled,
                "memory_turns": self.memory.thong_ke()["turns"],
                "full_duplex": cfg.full_duplex,
                "echo_guard": cfg.echo_guard,
                "emotion_enabled": cfg.emotion_enabled,
                "streaming_llm": True,
                "streaming_tts_sentences": True,
                "turn_cancellation": True,
                "performance_profile": cfg.performance_profile,
            },
            "realtime": {
                "active_turn_id": self.turns.current_id,
                "metrics": dict(self.metrics),
                "lip_sync_clock": "native-playback-wall-clock",
            },
            "privacy": {
                "image_sent": False,
                "api_keys_persisted": False,
                "native_channel": True,
                "memory_local_only": True,
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

    def _speak(
        self,
        payload: dict[str, Any],
        turn: LuotHoiThoai | None = None,
        *,
        stream_chunk: bool = False,
        sequence: int = 0,
    ) -> dict[str, Any]:
        text = str(payload.get("text", "")).strip()
        if not text:
            raise ValueError("Nội dung đọc không được để trống.")
        active_turn = turn or self.turns.bat_dau("speak")
        active_turn.kiem_tra()
        directory = Path(tempfile.mkdtemp(prefix="cybergirl-tts-"))
        wav_path = directory / f"tra-loi-{sequence:03d}.wav"
        try:
            metadata = self.voice.tong_hop(
                self.config, text, wav_path, active_turn.cancel
            )
            active_turn.kiem_tra()
        except Exception:
            try:
                wav_path.unlink(missing_ok=True)
                directory.rmdir()
            except OSError:
                pass
            if not stream_chunk:
                self.turns.ket_thuc(active_turn)
            raise
        metadata.update(
            {
                "text": text,
                "turn_id": active_turn.turn_id,
                "sequence": sequence,
                "stream_chunk": stream_chunk,
                "visemes": lap_lich_viseme(
                    text, float(metadata.get("audio_seconds", 0))
                ),
            }
        )

        def callback(name: str, data: dict[str, Any]) -> None:
            self._event(name, data)
            if name == "tts.ended" and not stream_chunk:
                self.turns.ket_thuc(active_turn)

        self.voice.phat(wav_path, metadata, callback)
        return metadata

    def _tts_stream_worker(
        self,
        turn: LuotHoiThoai,
        chunks: queue.Queue[str | None],
    ) -> None:
        sequence = 0
        first_audio_recorded = False
        try:
            self._event("tts.stream_started", {"turn_id": turn.turn_id})
            while True:
                turn.kiem_tra()
                sentence = chunks.get()
                if sentence is None:
                    break
                if not sentence.strip():
                    continue
                metadata = self._speak(
                    {"text": sentence},
                    turn,
                    stream_chunk=True,
                    sequence=sequence,
                )
                if not first_audio_recorded:
                    self.metrics["first_audio_ms"] = round(
                        (time.perf_counter() - turn.started_at) * 1000, 1
                    )
                    first_audio_recorded = True
                    self._event(
                        "pipeline.metrics",
                        {"turn_id": turn.turn_id, **self.metrics},
                    )
                while self.voice.dang_phat:
                    turn.kiem_tra()
                    time.sleep(0.02)
                sequence += 1
            turn.kiem_tra()
            self._event(
                "tts.stream_finished",
                {"turn_id": turn.turn_id, "chunks": sequence},
            )
        except LuotDaHuy:
            self.voice.dung()
        except Exception as exc:
            if self.turns.la_hien_tai(turn):
                self._event(
                    "pipeline.error",
                    {"error": str(exc), "turn_id": turn.turn_id, "stage": "tts"},
                )
        finally:
            self.turns.ket_thuc(turn)

    def _chat(
        self,
        payload: dict[str, Any],
        turn: LuotHoiThoai | None = None,
    ) -> dict[str, Any]:
        message = str(payload.get("message", "")).strip()
        if not message:
            raise ValueError("Tin nhắn không được để trống.")
        active_turn = turn or self.turns.bat_dau("chat")
        active_turn.kiem_tra()
        history = payload.get("history", self.history)
        if not isinstance(history, list):
            raise ValueError("Lịch sử hội thoại không hợp lệ.")
        remember = bool(payload.get("remember", True))
        memory_context: list[dict[str, str]] = []
        if self.config.memory_enabled and remember:
            memory_context = self.memory.goi_lai(
                self.config.character_id, message, limit=6
            )
        context = [*memory_context, *history[-8:]]
        should_speak = bool(payload.get("speak", self.config.auto_speak))
        local_stream = should_speak and self.config.tts_engine != "edge"
        tts_chunks: queue.Queue[str | None] | None = (
            queue.Queue() if local_stream else None
        )
        chunker = BoTachCauStreaming(min_chars=18, max_chars=96)
        if tts_chunks is not None:
            threading.Thread(
                target=self._tts_stream_worker,
                args=(active_turn, tts_chunks),
                daemon=True,
            ).start()

        self._event(
            "llm.thinking",
            {
                "provider": self.config.provider,
                "turn_id": active_turn.turn_id,
                "streaming": True,
            },
        )
        llm_started = time.perf_counter()

        def on_delta(delta: str) -> None:
            active_turn.kiem_tra()
            if active_turn.first_token_at is None:
                active_turn.first_token_at = time.perf_counter()
                self.metrics["llm_ttft_ms"] = round(
                    (active_turn.first_token_at - llm_started) * 1000, 1
                )
            self._event(
                "llm.delta",
                {"text": delta, "turn_id": active_turn.turn_id},
            )
            if tts_chunks is not None:
                for sentence in chunker.nap(delta):
                    tts_chunks.put(sentence)

        try:
            answer = self.brain.tra_loi(
                self.config,
                self.api_keys.get(self.config.provider, ""),
                message,
                context,
                str(payload.get("system_prompt", self.system_prompt))[:6_000],
                active_turn.cancel,
                on_delta,
            )
            active_turn.kiem_tra()
            self.metrics.update(
                {
                    "turn_id": active_turn.turn_id,
                    "llm_total_ms": round(
                        (time.perf_counter() - llm_started) * 1000, 1
                    ),
                }
            )
            if tts_chunks is not None:
                for sentence in chunker.ket_thuc():
                    tts_chunks.put(sentence)
                tts_chunks.put(None)
        except Exception:
            active_turn.cancel.set()
            if tts_chunks is not None:
                tts_chunks.put(None)
            self.turns.ket_thuc(active_turn)
            raise

        self.history.extend(
            [
                {"role": "user", "content": message},
                {"role": "assistant", "content": answer},
            ]
        )
        self.history = self.history[-24:]
        if self.config.memory_enabled and remember:
            self.memory.ghi(self.config.character_id, "user", message)
            self.memory.ghi(self.config.character_id, "assistant", answer)
        emotion = (
            phan_tich_cam_xuc(answer)
            if self.config.emotion_enabled
            else phan_tich_cam_xuc("")
        )
        gesture = chon_cu_chi(answer, str(emotion.get("name", "trung_tính")))
        self._event("emotion.changed", {**emotion, "turn_id": active_turn.turn_id})
        self._event(
            "gesture.changed",
            {
                "gesture_id": gesture,
                "turn_id": active_turn.turn_id,
                "duration_ms": 2600,
            },
        )
        self._event(
            "llm.answer",
            {
                "text": answer,
                "turn_id": active_turn.turn_id,
                "emotion": emotion,
                "gesture_id": gesture,
                "memory_recalled": len(memory_context),
            },
        )
        self._event(
            "pipeline.metrics",
            {"turn_id": active_turn.turn_id, **self.metrics},
        )
        if not local_stream:
            self.turns.ket_thuc(active_turn)
        return {
            "text": answer,
            "turn_id": active_turn.turn_id,
            "provider": self.config.provider,
            "emotion": emotion,
            "gesture_id": gesture,
            "memory_recalled": len(memory_context),
            "metrics": dict(self.metrics),
        }

    def _on_segment(self, wav_path: Path) -> None:
        turn = self.turns.bat_dau("voice")
        try:
            self.metrics = {
                "turn_id": turn.turn_id,
                "stt_ms": None,
                "llm_ttft_ms": None,
                "llm_total_ms": None,
                "first_audio_ms": None,
            }
            self._event("stt.started", {"turn_id": turn.turn_id})
            started = time.perf_counter()
            text = self.whisper.phien_am(self.config, wav_path, turn.cancel)
            turn.kiem_tra()
            self.metrics["stt_ms"] = round(
                (time.perf_counter() - started) * 1000, 1
            )
            self._event(
                "stt.final",
                {
                    "text": text,
                    "turn_id": turn.turn_id,
                    "stt_ms": self.metrics["stt_ms"],
                },
            )
            if self.config.auto_chat:
                self._chat({"message": text, "speak": True}, turn)
            else:
                self.turns.ket_thuc(turn)
        except LuotDaHuy:
            self.turns.ket_thuc(turn)
        except Exception as exc:
            self.turns.ket_thuc(turn)
            self._event(
                "pipeline.error",
                {"error": str(exc), "turn_id": turn.turn_id},
            )
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
            is_tts_playing=lambda: self.voice.dang_phat,
            full_duplex=self.config.full_duplex,
            echo_guard=self.config.echo_guard,
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
        if command in {"ping", "status", "health"}:
            return self._status()
        if command == "registry":
            return danh_ba()
        if command == "configure":
            return self._configure(payload)
        if command == "chat":
            return self._chat(payload)
        if command == "speak":
            return self._speak(payload)
        if command == "interrupt":
            return self._interrupt("user")
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
        if command == "memory_status":
            return {
                **self.memory.thong_ke(),
                "enabled": self.config.memory_enabled,
                "character_id": self.config.character_id,
            }
        if command == "clear_memory":
            character_only = bool(payload.get("character_only", False))
            deleted = self.memory.xoa(
                self.config.character_id if character_only else None
            )
            return {"cleared": True, "deleted_turns": deleted}
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
        except LuotDaHuy:
            self.output.gui(
                {
                    "id": request_id,
                    "ok": True,
                    "result": {"interrupted": True},
                }
            )
        except (ValueError, OSError, LoiEngine, LoiAmThanh, LoiGiaoThuc) as exc:
            self.output.gui({"id": request_id, "ok": False, "error": str(exc)})
        except Exception as exc:
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
        self.turns.huy("shutdown")
        if self.audio:
            self.audio.stop()
            self.audio = None
        self.voice.dung()
        self.brain.dong()
        self.memory.dong()


def main() -> int:
    NativeHost().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
