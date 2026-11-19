"""配置加载与默认配置生成。

设计原则：
- 只用标准库（tomllib 在 Python 3.11 起内置）。
- 首次运行时若 config.toml 不存在，自动写出一份带注释的默认配置。
- 默认节奏是「现实 1 秒 = 世界 1 秒」（1:1），并且网页端不提供调速入口。
  想改节奏的人自己编辑 config.toml 的 [pace] 段即可。
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.toml"
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"

# 默认配置文件内容。注释面向使用者，因此用中文。
DEFAULT_CONFIG = """\
# Amphoreus · 永恒之地翁法罗斯 —— 本地演算体配置
# 改完保存后重启进程生效：python3 main.py restart

[world]
# 演算种子。0 表示首次启动时随机生成，从此这个世界的因果就固定了。
seed = 0
# 首次启动时先回溯演算多少世界日，让世界一开场就有历史。（0 = 随机 300~900）
backfill_days = 0

[pace]
# 节奏模式：
#   "realtime"     现实时间与世界时间 1:1（默认）
#   "accelerated"  加速，速度由 world_days_per_real_second 决定
mode = "realtime"
# 仅 accelerated 模式生效：现实每过 1 秒，世界推进多少天。
world_days_per_real_second = 1.0
# true = 网页端不显示任何调速控件（默认）；false = 允许在网页上调倍速。
lock_speed = true
# 后台心跳间隔（秒）。这是进程醒来的频率，不是世界推进的速度。
heartbeat = 5

[narrative]
# 用本地 Ollama 把规则事件写成「如我所书」体文本。
enabled = true
endpoint = "http://127.0.0.1:11434"
model = "qwen3.5:4b"
# 单次请求超时（秒）。超时即降级为模板文本，模拟不会中断。
timeout = 120
# 每个世界日最多生成几段叙事。
max_per_day = 2
# 关闭思维链，否则小模型会把算力全花在思考上。
think = false

[web]
host = "127.0.0.1"
port = 8760

[log]
# DEBUG / INFO / WARN / ERROR
level = "INFO"
"""


@dataclass(slots=True)
class WorldCfg:
    seed: int = 0
    backfill_days: int = 0


@dataclass(slots=True)
class PaceCfg:
    mode: str = "realtime"
    world_days_per_real_second: float = 1.0
    lock_speed: bool = True
    heartbeat: float = 5.0


@dataclass(slots=True)
class NarrativeCfg:
    enabled: bool = True
    endpoint: str = "http://127.0.0.1:11434"
    model: str = "qwen3.5:4b"
    timeout: float = 120.0
    max_per_day: int = 2
    think: bool = False


@dataclass(slots=True)
class WebCfg:
    host: str = "127.0.0.1"
    port: int = 8760


@dataclass(slots=True)
class Config:
    world: WorldCfg = field(default_factory=WorldCfg)
    pace: PaceCfg = field(default_factory=PaceCfg)
    narrative: NarrativeCfg = field(default_factory=NarrativeCfg)
    web: WebCfg = field(default_factory=WebCfg)
    log_level: str = "INFO"

    @property
    def realtime(self) -> bool:
        return self.pace.mode != "accelerated"

    def days_per_real_second(self) -> float:
        """世界推进速率：现实每 1 秒推进的世界日数。"""
        if self.realtime:
            return 1.0 / 86400.0  # 1:1
        return max(0.0, float(self.pace.world_days_per_real_second))


def _pick(section: dict[str, Any], key: str, default: Any) -> Any:
    value = section.get(key, default)
    return default if value is None else value


def load(path: Path | None = None) -> Config:
    """读取配置；文件缺失时先写默认配置再读。"""
    path = path or CONFIG_PATH
    if not path.exists():
        path.write_text(DEFAULT_CONFIG, encoding="utf-8")

    with path.open("rb") as fh:
        raw = tomllib.load(fh)

    world = raw.get("world", {})
    pace = raw.get("pace", {})
    nar = raw.get("narrative", {})
    web = raw.get("web", {})
    log = raw.get("log", {})

    cfg = Config(
        world=WorldCfg(
            seed=int(_pick(world, "seed", 0)),
            backfill_days=int(_pick(world, "backfill_days", 0)),
        ),
        pace=PaceCfg(
            mode=str(_pick(pace, "mode", "realtime")),
            world_days_per_real_second=float(
                _pick(pace, "world_days_per_real_second", 1.0)
            ),
            lock_speed=bool(_pick(pace, "lock_speed", True)),
            heartbeat=float(_pick(pace, "heartbeat", 5.0)),
        ),
        narrative=NarrativeCfg(
            enabled=bool(_pick(nar, "enabled", True)),
            endpoint=str(_pick(nar, "endpoint", "http://127.0.0.1:11434")).rstrip("/"),
            model=str(_pick(nar, "model", "qwen3.5:4b")),
            timeout=float(_pick(nar, "timeout", 120)),
            max_per_day=int(_pick(nar, "max_per_day", 2)),
            think=bool(_pick(nar, "think", False)),
        ),
        web=WebCfg(
            host=str(_pick(web, "host", "127.0.0.1")),
            port=int(_pick(web, "port", 8760)),
        ),
        log_level=str(_pick(log, "level", "INFO")).upper(),
    )

    if cfg.pace.mode not in ("realtime", "accelerated"):
        cfg.pace.mode = "realtime"
    cfg.pace.heartbeat = max(1.0, cfg.pace.heartbeat)
    return cfg
