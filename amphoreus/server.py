"""本地只读仪表盘服务。

设计取舍：
- 只读。所有写操作都在 engine 里，网页端不提供任何修改世界的入口。
  「无法操控，只能观看」是项目的前提，这里用架构而不是用自觉来保证。
- 直接读 SQLite。所以守护进程没在跑的时候，页面照样能打开、照样有内容。
- 不引第三方库。http.server 足够，且零依赖是这个项目的硬约束。
"""

from __future__ import annotations

import json
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import archive, canon
from .config import Config
from .db import Store
from .log import log
from .sim import calendar as cal


def _json_default(o: Any) -> Any:
    if isinstance(o, (set, tuple)):
        return list(o)
    return str(o)


# mimetypes.guess_type 第一次调用会去读系统的 mime.types，挂机进程不该依赖它
# （系统文件读不到时整条连接会断）。这里写死一张够用的表。
_MIME: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".txt": "text/plain; charset=utf-8",
}


def _mime_of(name: str) -> str:
    return _MIME.get(Path(name).suffix.lower(), "application/octet-stream")


class Handler(BaseHTTPRequestHandler):
    server_version = "Amphoreus/1.0"
    # 由 Server 注入
    store: Store
    web_dir: Path
    cfg: Config

    # -- 工具 -----------------------------------------------------------
    def _send(self, status: int, body: bytes, ctype: str, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, status: int, zh: str) -> None:
        self._json({"ok": False, "error": zh}, status)

    def log_message(self, fmt: str, *args: Any) -> None:  # 静音标准输出
        return

    # -- 路由 -----------------------------------------------------------
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            self._api(path, parse_qs(parsed.query))
            return
        self._static(path)

    do_HEAD = do_GET

    def _api(self, path: str, query: dict[str, list[str]]) -> None:
        try:
            if path == "/api/state":
                self._json(self._state())
            elif path == "/api/events":
                limit = _int(query, "limit", 60, 1, 400)
                self._json({"ok": True, "events": self._decorate_events(limit)})
            elif path == "/api/ledger":
                limit = _int(query, "limit", 12, 1, 60)
                chapter = _int(query, "chapter", 0, 0, 13)
                rows = (
                    self.store.ledger_volume(chapter) if chapter
                    else self.store.ledger(limit)
                )
                self._json({"ok": True, "volumes": rows})
            elif path == "/api/canon":
                self._json(self._canon())
            elif path == "/api/archive":
                self._json(self._archive())
            elif path == "/api/archive/volume":
                ch = _int(query, "chapter", 1, 1, 13)
                self._json({"ok": True, "volume": self._volume(ch)})
            elif path == "/api/warden":
                self._json({
                    "ok": True,
                    "lines": archive.WARDEN_LINES,
                    "mimi": archive.MIMI_TOPICS,
                    "hints": archive.WRITE_HINTS,
                })
            else:
                self._error(HTTPStatus.NOT_FOUND, "没有这个接口")
        except Exception as exc:  # 只读服务不该因为一条查询把整个进程搞挂
            log.error("api error", "接口出错", path=path, err=str(exc)[:160])
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "服务内部出错，已记入日志")

    # -- 数据装配 -------------------------------------------------------
    def _state(self) -> dict:
        meta = self.store.meta()
        tick = int(meta.get("tick") or 0)
        seed = int(meta.get("seed") or 0)
        m = cal.from_tick(tick, seed) if seed else cal.from_tick(0, 1)
        cities = {r["id"]: r for r in self.store.cities()}
        titans = {r["id"]: r for r in self.store.titans()}
        scions = {r["id"]: r for r in self.store.scions()}

        city_rows = []
        for c in canon.CITIES:
            row = cities.get(c["id"], {})
            tide = float(row.get("tide") or 0.0)
            city_rows.append({
                "id": c["id"],
                "zh": c["zh"],
                "epithet": c["epithet"],
                "name_zh": c["fallen"] if tide > 0.75 else c["flourish"],
                "titan": c["titan"],
                "titan_zh": canon.TITAN_BY_ID.get(c["titan"], {}).get("zh", ""),
                "pop": int(row.get("pop") or 0),
                "order": round(float(row.get("order_v") or 0), 3),
                "faith": round(float(row.get("faith") or 0), 3),
                "tide": round(tide, 3),
                "fallen": bool(row.get("fallen")),
                "mood": row.get("mood") or "如常",
                "map": c["map"],
                "landmarks": c["landmarks"],
                "blurb": c["blurb"],
            })

        titan_rows = []
        for t in canon.TITANS:
            row = titans.get(t["id"], {})
            titan_rows.append({
                "id": t["id"],
                "zh": t["zh"],
                "title_zh": t["title_zh"],
                "group": t["group"],
                "spark": t["spark"],
                "taken": bool(row.get("taken")),
                "imbalance": round(float(row.get("imbalance") or 0), 3),
                "mood": row.get("mood") or "沉睡",
            })

        scion_rows = []
        for s in canon.SCIONS:
            row = scions.get(s["id"], {})
            scion_rows.append({
                "id": s["id"],
                "zh": s["zh"],
                "full_zh": s["full_zh"],
                "epithet": s["epithet"],
                "final_epithet": s["final_epithet"],
                "chapter": s["chapter"],
                "spark": s["spark"],
                "drive": s["drive"],
                "path": s["path"],
                "path_gloss": s["path_gloss"],
                "prophecy": s["prophecy"],
                "note": s["note"],
                "city": s["city"],
                "city_zh": canon.CITY_BY_ID.get(s["city"] or "", {}).get("zh", ""),
                "state": row.get("state") or "在途",
                "progress": round(float(row.get("progress") or 0), 3),
                "burden": round(float(row.get("burden") or 0), 3),
                "alive": bool(row.get("alive", 1)),
            })

        counts = self.store.counts()
        return {
            "ok": True,
            "meta": {
                "seed": seed,
                "tick": tick,
                "cycle": int(meta.get("cycle") or 1),
                "black_tide": round(float(meta.get("black_tide") or 0), 4),
                "entropy": round(float(meta.get("entropy") or 0), 4),
                "equation": round(float(meta.get("equation") or 0), 4),
                "sparks": int(meta.get("sparks") or 0),
                "updated_at": meta.get("updated_at") or "",
                "epoch_zh": _epoch_of(float(meta.get("black_tide") or 0))["zh"],
                "epoch_note": _epoch_of(float(meta.get("black_tide") or 0))["note"],
                "stage_zh": _stage_of(float(meta.get("equation") or 0))["zh"],
                "stage_note": _stage_of(float(meta.get("equation") or 0))["note"],
                "stage_progress": _stage_of(float(meta.get("equation") or 0))["progress"],
            },
            "moment": m.to_dict(),
            "calendar_rules": cal.describe_rules(),
            "counts": counts,
            "cities": city_rows,
            "titans": titan_rows,
            "scions": scion_rows,
            "epochs": canon.EPOCHS,
            "pipeline": canon.PIPELINE,
            "months": canon.MONTHS,
            "periods": canon.PERIODS,
            "lock_speed": self.cfg.pace.lock_speed,
            "pacing": {
                "mode": self.cfg.pace.mode,
                "days_per_real_second": self.cfg.days_per_real_second(),
                "seconds_per_tick": round(
                    1.0 / max(1e-9, self.cfg.days_per_real_second() * cal.TICKS_PER_DAY), 1
                ),
            },
        }

    def _decorate_events(self, limit: int) -> list[dict]:
        meta = self.store.meta()
        seed = int(meta.get("seed") or 0)
        out = []
        for row in self.store.recent_events(limit):
            item = dict(row)
            if seed:
                item["when"] = cal.from_tick(int(row["tick"]), seed).full_zh
            subject = row.get("subject")
            item["subject_zh"] = (
                canon.SCION_BY_ID.get(subject, {}).get("zh")
                or canon.CITY_BY_ID.get(subject, {}).get("zh")
                or ""
            )
            item["place_zh"] = canon.CITY_BY_ID.get(row.get("place") or "", {}).get("zh", "")
            out.append(item)
        return out

    def _canon(self) -> dict:
        return {
            "ok": True,
            "sources": canon.SOURCES,
            "quotes": canon.QUOTES,
            "life_verse": canon.LIFE_VERSE,
            "institutions": canon.INSTITUTIONS,
            "legacy_signals": canon.LEGACY_SIGNALS,
            "sparks": list(canon.SPARKS.values()),
            "lore": canon.LORE,
            # δ-me13 的八阶段演算表。前端「δ-me13.exe」整页靠它渲染，
            # 漏给会让 use 到 undefined.map，整本书白屏。
            "pipeline": canon.PIPELINE,
            "epochs": canon.EPOCHS,
        }

    # -- 如我所书 -------------------------------------------------------
    def _archive(self) -> dict:
        meta = self.store.meta()
        written = self.store.write_counts()  # {chapter: 已写节数}
        return {
            "ok": True,
            "archives": archive.ARCHIVES,
            "dedication": archive.DEDICATION,
            "ui": archive.UI,
            "catalog": [
                {**v, "written": written.get(v["chapter"], 0)}
                for v in archive.catalog()
            ],
            "sparks": int(meta.get("sparks") or 0),
            "cycle": int(meta.get("cycle") or 1),
        }

    def _volume(self, chapter: int) -> dict:
        meta = self.store.meta()
        seed = int(meta.get("seed") or 0)
        vol = archive.VOLUME_BY_CHAPTER.get(chapter)
        if not vol:
            return {}
        s = canon.SCION_BY_ID.get(vol["scion"], {})
        rows = {int(r["section"]): r for r in self.store.ledger_volume(chapter)}
        sections = []
        for i, name in enumerate(vol["sections"], start=1):
            row = rows.get(i)
            sections.append({
                "idx": i,
                "roman": archive._roman(i),
                "zh": name,
                "written": row is not None,
                "body": row["body"] if row else "",
                "origin": row["origin"] if row else "",
                "when": cal.from_tick(int(row["tick"]), seed).full_zh if row and seed else "",
            })
        return {
            "chapter": chapter,
            "old": vol["old"],
            "new": vol["new"],
            "scion": s.get("zh", ""),
            "full_zh": s.get("full_zh", ""),
            "epithet": s.get("epithet", ""),
            "final_epithet": s.get("final_epithet", ""),
            "spark": s.get("spark", ""),
            "path": s.get("path", ""),
            "drive": s.get("drive", ""),
            "prophecy": s.get("prophecy", ""),
            "note": s.get("note", ""),
            "verse": canon.LIFE_VERSE.get(vol["scion"], []),
            "sections": sections,
            # 卷级已写节数，和 /api/archive 的 catalog[].written 同义，
            # 免得两个接口对同一件事给出不同口径。
            "written": sum(1 for x in sections if x["written"]),
            "unlocked": int(meta.get("sparks") or 0) >= chapter - 1,
        }

    # -- 静态文件 -------------------------------------------------------
    def _static(self, path: str) -> None:
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        # 书是独立入口。给它一个短路径，也便于直接收藏。
        if rel == "book":
            rel = "codex.html"
        hit = self.assets.get(rel)
        if hit is None:
            self._error(HTTPStatus.NOT_FOUND, "没有这个文件")
            return
        body, ctype = hit
        self._send(HTTPStatus.OK, body, ctype)


def _int(q: dict[str, list[str]], key: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(q.get(key, [default])[0])))
    except (TypeError, ValueError):
        return default


def _epoch_of(tide: float) -> dict:
    if tide < 0.35:
        return canon.EPOCHS[1]
    if tide < 0.60:
        return canon.EPOCHS[2]
    return canon.EPOCHS[3]


def _stage_of(equation: float) -> dict:
    idx = 0
    for i, stage in enumerate(canon.PIPELINE):
        if equation * 100 >= stage["progress"] - 1e-9:
            idx = i
    return canon.PIPELINE[idx]


class Server:
    """把 HTTP 服务包成可 start/stop 的对象，方便挂在守护进程里。"""

    def __init__(self, cfg: Config, store: Store, web_dir: Path) -> None:
        # 静态资源在建服务时一次性读进内存。
        # 理由不是性能，是可靠性：挂机进程跑久了，随时可能因为外部环境变化
        # 读不到磁盘（权限、卷卸载、沙箱令牌失效）。而 web/ 下就这几个小文件，
        # 总共几十 KB，常驻内存换来「页面永远打得开」是划算的。
        assets: dict[str, tuple[bytes, str]] = {}
        for f in sorted(web_dir.glob("*")):
            if f.is_file():
                try:
                    assets[f.name] = (f.read_bytes(), _mime_of(f.name))
                except OSError as exc:
                    log.warn("asset skipped", "静态文件读取失败", file=f.name, err=str(exc)[:80])

        handler = type("BoundHandler", (Handler,), {})
        handler.store = store
        handler.web_dir = web_dir
        handler.cfg = cfg
        handler.assets = assets
        self._httpd = ThreadingHTTPServer((cfg.web.host, cfg.web.port), handler)
        self._httpd.daemon_threads = True
        self._thread: threading.Thread | None = None
        self.cfg = cfg
        self.assets = assets

    @property
    def url(self) -> str:
        return f"http://{self.cfg.web.host}:{self.cfg.web.port}/"

    def start(self, background: bool = True) -> None:
        if background:
            self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
            self._thread.start()
        else:
            self._httpd.serve_forever()
        log.info("web up", "仪表盘已就绪", url=self.url)

    def stop(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
