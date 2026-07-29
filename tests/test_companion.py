from __future__ import annotations

import io
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from companion.config import CauHinhCompanion, KhoCauHinh
from companion.emotion import phan_tich_cam_xuc
from companion.engines import BoNao
from companion.memory import BoNhoDaiHan
from companion.native_host import NativeHost
from companion.phonemes import lap_lich_viseme
from companion.protocol import BoGhiBanTin, LoiGiaoThuc, doc_ban_tin


class ProtocolTests(unittest.TestCase):
    def test_round_trip_utf8(self):
        stream = io.BytesIO()
        BoGhiBanTin(stream).gui({"id": "1", "text": "Xin chào Việt Nam"})
        stream.seek(0)
        self.assertEqual(
            doc_ban_tin(stream),
            {"id": "1", "text": "Xin chào Việt Nam"},
        )

    def test_reject_large_message(self):
        stream = io.BytesIO(struct.pack("<I", 1_000_001))
        with self.assertRaises(LoiGiaoThuc):
            doc_ban_tin(stream)


class CompanionConfigTests(unittest.TestCase):
    def test_api_key_never_persisted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            store = KhoCauHinh(path)
            config = CauHinhCompanion()
            config.cap_nhat(
                {
                    "provider": "openai",
                    "base_url": "https://api.openai.com/v1",
                    "model": "gpt-5.6-sol",
                    "api_key": "khong-duoc-ghi",
                }
            )
            store.ghi(config)
            saved = path.read_text(encoding="utf-8")
            self.assertNotIn("khong-duoc-ghi", saved)
            self.assertNotIn("api_key", saved)

    def test_validate_provider(self):
        config = CauHinhCompanion()
        with self.assertRaises(ValueError):
            config.cap_nhat({"provider": "khong-hop-le"})

    def test_openrouter_attribution_validation(self):
        config = CauHinhCompanion()
        config.cap_nhat(
            {
                "provider": "openrouter",
                "base_url": "https://openrouter.ai/api/v1",
                "model": "openai/gpt-4o",
                "openrouter_referer": "https://github.com/Base27-CVNSS/Avatar",
                "openrouter_title": "Cybergirl",
                "openrouter_zdr": True,
            }
        )
        self.assertEqual(config.provider, "openrouter")
        self.assertTrue(config.openrouter_zdr)
        with self.assertRaises(ValueError):
            config.cap_nhat({"openrouter_title": "Cybergirl\r\nX-Fake: true"})

    def test_duplex_and_memory_flags(self):
        config = CauHinhCompanion()
        config.cap_nhat(
            {
                "memory_enabled": True,
                "full_duplex": True,
                "echo_guard": True,
                "character_id": "linh",
            }
        )
        self.assertTrue(config.memory_enabled)
        self.assertTrue(config.full_duplex)
        self.assertTrue(config.echo_guard)
        self.assertEqual(config.character_id, "linh")


class EmotionAndLipSyncTests(unittest.TestCase):
    def test_vietnamese_emotion_is_local_and_structured(self):
        emotion = phan_tich_cam_xuc("Tuyệt vời, mình rất vui và chúc mừng bạn!")
        self.assertEqual(emotion["name"], "vui")
        self.assertGreater(emotion["arousal"], 0.4)
        self.assertEqual(emotion["source"], "vietnamese-local")

    def test_phoneme_timeline_matches_audio_duration(self):
        timeline = lap_lich_viseme("Xin chào Việt Nam", 2.4)
        self.assertGreater(len(timeline), 8)
        end = timeline[-1]["at_ms"] + timeline[-1]["duration_ms"]
        self.assertAlmostEqual(end, 2400, delta=2)
        self.assertTrue(all("release_open" in item for item in timeline))

    def test_tone_marks_keep_vowel_visemes(self):
        timeline = lap_lich_viseme("má mạ ế ứ ở", 1.5)
        visemes = [item["viseme"] for item in timeline]
        self.assertGreaterEqual(visemes.count("wide"), 3)
        self.assertGreaterEqual(visemes.count("round"), 2)
        self.assertEqual(visemes[0], "closed")
        self.assertEqual(visemes[1], "wide")


class LongTermMemoryTests(unittest.TestCase):
    def test_recall_and_clear_local_sqlite(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = BoNhoDaiHan(Path(directory) / "memory.sqlite3")
            memory.ghi("mai", "user", "Tôi thích trồng cây sầu riêng.")
            memory.ghi("mai", "assistant", "Mình sẽ nhớ sở thích trồng sầu riêng.")
            recalled = memory.goi_lai("mai", "Cây sầu riêng của tôi", limit=2)
            self.assertEqual(len(recalled), 2)
            self.assertEqual(memory.thong_ke()["turns"], 2)
            self.assertEqual(memory.xoa("mai"), 2)
            memory.dong()


class NativeHostTests(unittest.TestCase):
    def test_status_does_not_leak_api_key(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.BytesIO()
            host = NativeHost(
                input_stream=io.BytesIO(),
                output_stream=output,
                config_path=Path(directory) / "config.json",
            )
            host.api_keys["openai"] = "bi-mat"
            status = host.dispatch("status", {})
            rendered = json.dumps(status, ensure_ascii=False)
            self.assertNotIn("bi-mat", rendered)
            self.assertTrue(status["privacy"]["native_channel"])
            self.assertTrue(status["privacy"]["memory_local_only"])
            self.assertIn("full_duplex", status["conversation"])
            host.close()

    def test_openrouter_native_adapter(self):
        config = CauHinhCompanion(
            provider="openrouter",
            base_url="https://openrouter.ai/api/v1",
            model="openai/gpt-4o",
            openrouter_zdr=True,
        )
        with patch(
            "companion.engines._yeu_cau_json",
            return_value={
                "choices": [{"message": {"content": "OpenRouter hoạt động."}}]
            },
        ) as request:
            answer = BoNao().tra_loi(
                config,
                "openrouter-test-key",
                "Xin chào",
                [],
                "Trả lời tiếng Việt.",
            )
        self.assertEqual(answer, "OpenRouter hoạt động.")
        url, payload, headers = request.call_args.args
        self.assertEqual(url, "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(headers["X-OpenRouter-Title"], "Cybergirl")
        self.assertEqual(headers["HTTP-Referer"], "https://github.com/Base27-CVNSS/Avatar")
        self.assertTrue(payload["provider"]["zdr"])

    def test_configure_returns_component_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            host = NativeHost(
                input_stream=io.BytesIO(),
                output_stream=io.BytesIO(),
                config_path=Path(directory) / "config.json",
            )
            status = host.dispatch(
                "configure",
                {
                    "provider": "gemini",
                    "base_url": "https://generativelanguage.googleapis.com/v1",
                    "model": "gemini-3.6-flash",
                    "api_key": "ram-only",
                },
            )
            self.assertEqual(status["config"]["provider"], "gemini")
            self.assertTrue(status["config"]["api_key_present"])
            self.assertIn("silero_vad", status["components"])
            host.close()


if __name__ == "__main__":
    unittest.main()
