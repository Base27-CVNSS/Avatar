from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from api_client import APIClient, CauHinhAPI
from cybergirl import DichVu, TrangThaiCybergirl
from voice_registry import LoiCauHinhNhanVat, VoiceRegistry


ROOT = Path(__file__).resolve().parents[1]


class RegistryTests(unittest.TestCase):
    def test_switch_and_public_list(self):
        registry = VoiceRegistry(ROOT / "characters.json")
        self.assertGreaterEqual(len(registry.public_list()), 3)
        self.assertTrue(registry.switch("linh"))
        self.assertEqual(registry.current()["id"], "linh")
        self.assertNotIn("system_prompt", registry.public_list()[0])

    def test_invalid_character_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "characters.json"
            path.write_text('{"loi": {"label": "Thiếu prompt"}}', encoding="utf-8")
            with self.assertRaises(LoiCauHinhNhanVat):
                VoiceRegistry(path)


class MockAIHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        size = int(self.headers["Content-Length"])
        payload = json.loads(self.rfile.read(size))
        if self.path == "/api/chat":
            result = {"message": {"content": "Kết nối Ollama thành công."}}
        elif self.path == "/responses":
            result = {"output_text": "Kết nối OpenAI thành công."}
        elif self.path == "/interactions":
            result = {"output_text": "Kết nối Gemini thành công."}
        elif self.path == "/chat/completions":
            result = {
                "choices": [{"message": {"content": "**Kết nối** API thành công."}}]
            }
        else:
            result = {
                "candidates": [
                    {"content": {"parts": [{"text": "Kết nối Gemini thành công."}]}}
                ]
            }
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class APIClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), MockAIHandler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        host, port = cls.server.server_address
        cls.base = f"http://{host}:{port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_ollama(self):
        client = APIClient(CauHinhAPI("ollama", self.base, "qwen3:4b"))
        self.assertEqual(
            client.chat("Xin chào", [], "Trả lời tiếng Việt."),
            "Kết nối Ollama thành công.",
        )

    def test_openai_compatible_cleans_markdown(self):
        client = APIClient(
            CauHinhAPI("openai-compatible", self.base, "qwen3:4b", "khoa")
        )
        self.assertEqual(
            client.chat("Xin chào", [], "Trả lời tiếng Việt."),
            "Kết nối API thành công.",
        )

    def test_gemini(self):
        client = APIClient(CauHinhAPI("gemini", self.base, "gemini-test", "khoa"))
        self.assertEqual(
            client.chat("Xin chào", [], "Trả lời tiếng Việt."),
            "Kết nối Gemini thành công.",
        )

    def test_openai_responses(self):
        client = APIClient(CauHinhAPI("openai", self.base, "gpt-test", "khoa"))
        self.assertEqual(
            client.chat("Xin chào", [], "Trả lời tiếng Việt."),
            "Kết nối OpenAI thành công.",
        )


class LocalServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp.name) / "cau-hinh.json"
        self.state = TrangThaiCybergirl(ROOT, self.config_path)
        self.service = DichVu(self.state, 32170)
        self.service.start()

    def tearDown(self):
        self.service.stop()
        self.temp.cleanup()

    def _request(self, path, token=None, method="GET", body=None):
        headers = {}
        if token:
            headers["X-Cybergirl-Token"] = token
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        request = urllib.request.Request(
            self.service.url + path, data=data, headers=headers, method=method
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, json.loads(response.read())

    def test_health_public_but_config_protected(self):
        status, payload = self._request("/api/suc-khoe")
        self.assertEqual(status, 200)
        self.assertEqual(payload["ngon_ngu"], "vi-VN")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self._request("/api/cau-hinh")
        self.assertEqual(caught.exception.code, 403)

    def test_api_key_is_not_persisted(self):
        status, payload = self._request(
            "/api/cau-hinh",
            self.state.token,
            "POST",
            {
                "provider": "openai-compatible",
                "base_url": "http://127.0.0.1:11434/v1",
                "model": "qwen3:4b",
                "api_key": "khong-duoc-ghi-xuong-dia",
                "active_character": "mai",
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["co_khoa_api"])
        saved = self.config_path.read_text(encoding="utf-8")
        self.assertNotIn("khong-duoc-ghi-xuong-dia", saved)
        self.assertNotIn("api_key", saved)


if __name__ == "__main__":
    unittest.main()
