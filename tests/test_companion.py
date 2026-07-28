from __future__ import annotations

import io
import json
import struct
import tempfile
import unittest
from pathlib import Path

from companion.config import CauHinhCompanion, KhoCauHinh
from companion.native_host import NativeHost
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
            host.close()

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

