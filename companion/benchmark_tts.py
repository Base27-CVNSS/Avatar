"""Chạy benchmark TTS tiếng Việt và xuất JSON có thể kiểm chứng."""

from __future__ import annotations

import argparse
import json

from .config import KhoCauHinh
from .engines import TiengNoi


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark TTS tiếng Việt Cybergirl")
    parser.add_argument(
        "--text",
        default="Xin chào, đây là phép đo giọng tiếng Việt của Cybergirl.",
    )
    args = parser.parse_args()
    config = KhoCauHinh().doc()
    results = TiengNoi().benchmark(config, args.text)
    print(json.dumps({"language": "vi-VN", "results": results}, ensure_ascii=False, indent=2))
    return 0 if any(item.get("available") for item in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())

