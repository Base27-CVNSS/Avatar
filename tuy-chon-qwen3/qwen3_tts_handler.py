"""Bộ nối Qwen3-TTS thử nghiệm; không nằm trong bản EXE Cybergirl."""

from __future__ import annotations

import logging
from threading import Event

import numpy as np
import torch
from scipy.signal import resample_poly

from baseHandler import BaseHandler

logger = logging.getLogger(__name__)
TARGET_SR = 16_000


class Qwen3TTSHandler(BaseHandler):
    def setup(
        self,
        should_listen: Event,
        model_name: str = "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        device: str = "auto",
        torch_dtype: str = "float16",
        ref_audio: str = "voices/default.wav",
        ref_text: str = "",
        language: str = "Auto",
        blocksize: int = 512,
        registry=None,
    ):
        self.should_listen = should_listen
        self.device = (
            "cuda" if device == "auto" and torch.cuda.is_available() else device
        )
        if self.device == "auto":
            self.device = "cpu"
        self.blocksize = max(128, int(blocksize))
        self.language = language
        self.ref_audio = ref_audio
        self.ref_text = ref_text
        self.registry = registry

        from qwen_tts import Qwen3TTSModel

        dtype = getattr(torch, torch_dtype)
        self.model = Qwen3TTSModel.from_pretrained(
            model_name,
            device_map=self.device,
            dtype=dtype,
        )
        logger.info("Đã nạp Qwen3-TTS %s trên %s", model_name, self.device)

    def _current_ref(self) -> str:
        if self.registry is not None:
            selected = self.registry.current_ref_audio()
            if selected:
                return selected
        return self.ref_audio

    def _synth(self, text: str):
        with torch.no_grad():
            wavs, sr = self.model.generate_voice_clone(
                text=text,
                language=self.language,
                ref_audio=self._current_ref(),
                ref_text=self.ref_text or None,
                x_vector_only_mode=not bool(self.ref_text),
            )
        return np.asarray(wavs[0], dtype=np.float32).squeeze(), int(sr)

    @staticmethod
    def _to_16k_int16(wav: np.ndarray, sample_rate: int) -> np.ndarray:
        if sample_rate != TARGET_SR:
            divisor = np.gcd(sample_rate, TARGET_SR)
            wav = resample_poly(
                wav, TARGET_SR // divisor, sample_rate // divisor
            )
        wav = np.nan_to_num(wav, nan=0.0, posinf=1.0, neginf=-1.0)
        return (np.clip(wav, -1.0, 1.0) * 32_767).astype(np.int16)

    def process(self, llm_sentence):
        if isinstance(llm_sentence, tuple):
            llm_sentence = llm_sentence[0]
        text = str(llm_sentence or "").strip()
        if not text.strip(" 。，！？.,!?…~"):
            self.should_listen.set()
            return
        try:
            wav, sample_rate = self._synth(text)
            audio = self._to_16k_int16(wav, sample_rate)
            pad = (-len(audio)) % self.blocksize
            if pad:
                audio = np.pad(audio, (0, pad))
            for index in range(0, len(audio), self.blocksize):
                yield audio[index : index + self.blocksize].tobytes()
        except Exception:
            logger.exception("Qwen3-TTS không tổng hợp được câu.")
        finally:
            self.should_listen.set()

    def cleanup(self):
        if hasattr(self, "model"):
            del self.model
        if self.device == "cuda":
            torch.cuda.empty_cache()

