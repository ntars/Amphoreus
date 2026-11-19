"""双语日志。

约定：
- 落盘日志一行包含英文与中文两段，便于检索与复核。
- 终端输出只用中文，符合“面向使用者的提示一律中文”的规范。

用法：
    from .log import log
    log.info("world tick ok", "世界推进完成", day=12)
"""

from __future__ import annotations

import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

_LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}
_LOCK = threading.Lock()


class Logger:
    def __init__(self) -> None:
        self._file: Path | None = None
        self._threshold = 20

    def setup(self, log_dir: Path, level: str = "INFO") -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self._file = log_dir / "amphoreus.log"
        self._threshold = _LEVELS.get(level.upper(), 20)

    def _write(self, level: str, en: str, zh: str, extra: dict[str, Any]) -> None:
        if _LEVELS.get(level, 20) < self._threshold:
            return
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tail = " ".join(f"{k}={v}" for k, v in extra.items())
        line_en = f"{stamp} | {level:<5} | {en}"
        if tail:
            line_en += f" | {tail}"
        line_zh = f"{stamp} | {level:<5} | {zh}"
        if tail:
            line_zh += f" | {tail}"
        with _LOCK:
            if self._file is not None:
                try:
                    with self._file.open("a", encoding="utf-8") as fh:
                        fh.write(line_en + "\n")
                        fh.write(line_zh + "\n")
                except OSError:
                    pass
            print(line_zh, file=sys.stderr, flush=True)

    def debug(self, en: str, zh: str, **extra: Any) -> None:
        self._write("DEBUG", en, zh, extra)

    def info(self, en: str, zh: str, **extra: Any) -> None:
        self._write("INFO", en, zh, extra)

    def warn(self, en: str, zh: str, **extra: Any) -> None:
        self._write("WARN", en, zh, extra)

    def error(self, en: str, zh: str, **extra: Any) -> None:
        self._write("ERROR", en, zh, extra)


log = Logger()
