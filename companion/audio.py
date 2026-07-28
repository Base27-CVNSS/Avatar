"""Thu microphone 16 kHz, cắt câu bằng Silero VAD và ghi WAV cho Whisper."""

from __future__ import annotations

import collections
import math
import queue
import tempfile
import threading
import time
import wave
from pathlib import Path
from typing import Any, Callable


class LoiAmThanh(RuntimeError):
    pass


class SileroVAD:
    SAMPLE_RATE = 16_000
    WINDOW = 512

    def __init__(self, model_path: str):
        try:
            import numpy as np
            import onnxruntime as ort
        except ImportError as exc:
            raise LoiAmThanh("Companion thiếu NumPy hoặc ONNX Runtime.") from exc
        path = Path(model_path)
        if not path.is_file():
            raise LoiAmThanh("Chưa có mô hình silero_vad.onnx.")
        self.np = np
        self.session = ort.InferenceSession(
            str(path), providers=["CPUExecutionProvider"]
        )
        self.input_names = {item.name for item in self.session.get_inputs()}
        self.state = np.zeros((2, 1, 128), dtype=np.float32)

    def reset(self) -> None:
        self.state.fill(0)

    def probability(self, samples: Any) -> float:
        audio = self.np.asarray(samples, dtype=self.np.float32).reshape(1, -1)
        feed: dict[str, Any] = {}
        audio_name = "input" if "input" in self.input_names else next(iter(self.input_names))
        feed[audio_name] = audio
        if "state" in self.input_names:
            feed["state"] = self.state
        if "sr" in self.input_names:
            feed["sr"] = self.np.asarray(self.SAMPLE_RATE, dtype=self.np.int64)
        outputs = self.session.run(None, feed)
        if len(outputs) > 1 and getattr(outputs[1], "shape", None) == self.state.shape:
            self.state = outputs[1]
        return float(self.np.asarray(outputs[0]).reshape(-1)[0])


class AudioPipeline:
    def __init__(
        self,
        model_path: str,
        threshold: float,
        silence_ms: int,
        on_segment: Callable[[Path], None],
        on_event: Callable[[str, dict[str, Any]], None],
        is_tts_playing: Callable[[], bool] | None = None,
        full_duplex: bool = True,
        echo_guard: bool = True,
    ):
        try:
            import sounddevice as sd
        except ImportError as exc:
            raise LoiAmThanh("Companion thiếu thư viện sounddevice.") from exc
        self.sd = sd
        self.vad = SileroVAD(model_path)
        self.threshold = threshold
        self.silence_windows = max(4, math.ceil(silence_ms / 32))
        self.on_segment = on_segment
        self.on_event = on_event
        self.is_tts_playing = is_tts_playing or (lambda: False)
        self.full_duplex = full_duplex
        self.echo_guard = echo_guard
        self.queue: queue.Queue[Any] = queue.Queue(maxsize=128)
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.stream: Any = None

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()

        def callback(indata, _frames, _time_info, status) -> None:
            if status:
                self.on_event("audio.warning", {"detail": str(status)})
            try:
                self.queue.put_nowait(indata[:, 0].copy())
            except queue.Full:
                self.on_event("audio.warning", {"detail": "Bộ đệm microphone bị đầy."})

        self.stream = self.sd.InputStream(
            samplerate=16_000,
            channels=1,
            dtype="float32",
            blocksize=512,
            callback=callback,
        )
        self.stream.start()
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()
        self.on_event("listening.started", {"sample_rate": 16_000})

    def stop(self) -> None:
        self.stop_event.set()
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        self.thread = None
        self.on_event("listening.stopped", {})

    def _save_wav(self, chunks: list[Any]) -> Path:
        import numpy as np

        audio = np.concatenate(chunks)
        pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        directory = Path(tempfile.mkdtemp(prefix="cybergirl-vad-"))
        path = directory / "cau-noi.wav"
        with wave.open(str(path), "wb") as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(16_000)
            writer.writeframes(pcm)
        return path

    def _worker(self) -> None:
        pre_roll: collections.deque[Any] = collections.deque(maxlen=10)
        speech: list[Any] = []
        active = False
        voiced = 0
        silent = 0
        started_at = 0.0
        last_level_emit = 0.0
        last_echo_emit = 0.0
        while not self.stop_event.is_set():
            try:
                chunk = self.queue.get(timeout=0.2)
            except queue.Empty:
                continue
            rms = float((chunk * chunk).mean() ** 0.5)
            probability = self.vad.probability(chunk)
            now = time.monotonic()
            tts_playing = bool(self.is_tts_playing())
            if now - last_level_emit >= 0.08:
                self.on_event(
                    "audio.level",
                    {
                        "rms": round(rms, 5),
                        "speech_probability": round(probability, 4),
                        "tts_playing": tts_playing,
                    },
                )
                last_level_emit = now
            if tts_playing and not self.full_duplex:
                pre_roll.clear()
                speech = []
                active = False
                voiced = 0
                silent = 0
                continue
            if not active:
                pre_roll.append(chunk)
                effective_threshold = self.threshold
                required_windows = 2
                if tts_playing and self.echo_guard:
                    effective_threshold = max(0.78, self.threshold + 0.18)
                    required_windows = 4
                    if (
                        probability >= self.threshold
                        and probability < effective_threshold
                        and now - last_echo_emit >= 1.0
                    ):
                        self.on_event(
                            "audio.echo_suppressed",
                            {
                                "speech_probability": round(probability, 4),
                                "threshold": round(effective_threshold, 3),
                            },
                        )
                        last_echo_emit = now
                voiced = voiced + 1 if probability >= effective_threshold else 0
                if voiced >= required_windows:
                    active = True
                    speech = list(pre_roll)
                    silent = 0
                    started_at = now
                    self.on_event(
                        "vad.speech_start",
                        {
                            "probability": probability,
                            "barge_in": tts_playing,
                            "echo_guard": self.echo_guard,
                        },
                    )
                continue

            speech.append(chunk)
            silent = silent + 1 if probability < self.threshold else 0
            too_long = now - started_at >= 25
            if silent >= self.silence_windows or too_long:
                if len(speech) >= 10:
                    path = self._save_wav(speech)
                    self.on_event(
                        "vad.speech_end",
                        {"duration_ms": round(len(speech) * 32, 1)},
                    )
                    threading.Thread(
                        target=self.on_segment, args=(path,), daemon=True
                    ).start()
                active = False
                speech = []
                pre_roll.clear()
                voiced = 0
                silent = 0
                self.vad.reset()
