"""Registry model/giọng để hot-swap mà không khóa cứng một nhà cung cấp."""

from __future__ import annotations

from typing import Any


MODEL_PROFILES: list[dict[str, Any]] = [
    {
        "id": "demo",
        "label": "Demo cục bộ · chạy ngay",
        "provider": "demo",
        "base_url": "http://127.0.0.1:27827",
        "model": "cybergirl-demo-vi",
        "offline": True,
    },
    {
        "id": "gguf-cpu",
        "label": "GGUF cục bộ · CPU 16 GB",
        "provider": "gguf",
        "base_url": "http://127.0.0.1:27829/v1",
        "model": "cybergirl-local",
        "offline": True,
    },
    {
        "id": "ollama-qwen",
        "label": "Ollama · Qwen3 4B",
        "provider": "ollama",
        "base_url": "http://127.0.0.1:11434",
        "model": "qwen3:4b",
        "offline": True,
    },
    {
        "id": "openai",
        "label": "OpenAI Responses API",
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-5.6-sol",
        "offline": False,
    },
    {
        "id": "gemini",
        "label": "Google Gemini Interactions API",
        "provider": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1",
        "model": "gemini-3.6-flash",
        "offline": False,
    },
    {
        "id": "openrouter-gpt4o",
        "label": "OpenRouter · OpenAI GPT-4o",
        "provider": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-4o",
        "offline": False,
    },
]


def danh_ba() -> dict[str, Any]:
    return {
        "models": MODEL_PROFILES,
        "voices": [
            {"id": "windows-sapi", "label": "Windows SAPI", "local": True},
            {"id": "piper", "label": "Piper/VITS ONNX", "local": True},
            {"id": "edge", "label": "Microsoft Edge Web Speech", "local": False},
        ],
    }
