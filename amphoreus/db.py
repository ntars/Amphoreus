"""SQLite 存取层。

只负责「世界现在长什么样」与「发生过什么」，不含任何计算逻辑。

表说明（用大白话）：
- meta    一行，存种子、当前 tick、轮回数、节奏锚点。
- cities  每座城邦一行：人口、秩序、信仰、黑潮侵蚀、是否失守。
- titans  每位泰坦一行：火种是否已被夺、失衡程度。
- scions  每位黄金裔一行：状态、逐火进度、心事。
- events  流水账。narrative 为空表示还没写成文。
- ledger  如我所书：按卷归档的叙事段落。
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from . import canon

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    seed        INTEGER NOT NULL DEFAULT 0,
    tick        INTEGER NOT NULL DEFAULT 0,
    cycle       INTEGER NOT NULL DEFAULT 1,
    black_tide  REAL    NOT NULL DEFAULT 0.0,
    entropy     REAL    NOT NULL DEFAULT 0.0,
    equation    REAL    NOT NULL DEFAULT 0.0,
    sparks      INTEGER NOT NULL DEFAULT 0,
    anchor_wall REAL    NOT NULL DEFAULT 0.0,
    anchor_tick INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
    id      TEXT PRIMARY KEY,
    pop     INTEGER NOT NULL DEFAULT 0,
    order_v REAL    NOT NULL DEFAULT 0.7,
    faith   REAL    NOT NULL DEFAULT 0.7,
    tide    REAL    NOT NULL DEFAULT 0.0,
    fallen  INTEGER NOT NULL DEFAULT 0,
    mood    TEXT    NOT NULL DEFAULT '如常'
);

CREATE TABLE IF NOT EXISTS titans (
    id        TEXT PRIMARY KEY,
    taken     INTEGER NOT NULL DEFAULT 0,
    imbalance REAL    NOT NULL DEFAULT 0.0,
    mood      TEXT    NOT NULL DEFAULT '沉睡'
);

CREATE TABLE IF NOT EXISTS scions (
    id       TEXT PRIMARY KEY,
    state    TEXT    NOT NULL DEFAULT '在途',
    progress REAL    NOT NULL DEFAULT 0.0,
    burden   REAL    NOT NULL DEFAULT 0.0,
    thought  TEXT    NOT NULL DEFAULT '',
    alive    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS events (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    tick      INTEGER NOT NULL,
    cycle     INTEGER NOT NULL,
    kind      TEXT    NOT NULL,
    subject   TEXT,
    place     TEXT,
    severity  INTEGER NOT NULL DEFAULT 1,
    text_zh   TEXT    NOT NULL,
    narrative TEXT,
    narrated  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick DESC);
CREATE INDEX IF NOT EXISTS idx_events_pending ON events(narrated, seq);

CREATE TABLE IF NOT EXISTS ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tick       INTEGER NOT NULL,
    cycle      INTEGER NOT NULL,
    chapter    INTEGER NOT NULL DEFAULT 1,
    section    INTEGER NOT NULL DEFAULT 1,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    origin     TEXT    NOT NULL DEFAULT 'llm',
    created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_tick ON ledger(tick DESC);
"""

MIGRATIONS: dict[str, dict[str, str]] = {
    "meta": {
        "anchor_wall": "ALTER TABLE meta ADD COLUMN anchor_wall REAL NOT NULL DEFAULT 0.0",
        "anchor_tick": "ALTER TABLE meta ADD COLUMN anchor_tick INTEGER NOT NULL DEFAULT 0",
        "sparks": "ALTER TABLE meta ADD COLUMN sparks INTEGER NOT NULL DEFAULT 0",
    },
    "ledger": {
        "chapter": "ALTER TABLE ledger ADD COLUMN chapter INTEGER NOT NULL DEFAULT 1",
        "section": "ALTER TABLE ledger ADD COLUMN section INTEGER NOT NULL DEFAULT 1",
    },
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class Store:
    """线程安全的极简存取器。写操作用一把锁串行化，读操作各自开连接。"""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._conn() as conn:
            conn.executescript(SCHEMA)
            self._migrate(conn)
        self._bootstrap()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        """给旧库补列，避免升级后炸掉。"""
        for table, cols in MIGRATIONS.items():
            have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for col, sql in cols.items():
                if col not in have:
                    conn.execute(sql)

    def _bootstrap(self) -> None:
        with self._lock, self._conn() as conn:
            if conn.execute("SELECT 1 FROM meta WHERE id = 1").fetchone() is None:
                stamp = _now()
                conn.execute(
                    "INSERT INTO meta (id, created_at, updated_at) VALUES (1, ?, ?)",
                    (stamp, stamp),
                )
            # 城邦的初始数值取自 canon 的起手设定，不能留数据库默认值 0。
            # 否则首次 boot 时人口会被 0 覆盖，界面上一座城邦都「没人」。
            for city in canon.CITIES:
                conn.execute(
                    "INSERT OR IGNORE INTO cities (id, pop, order_v, faith, tide)"
                    " VALUES (?,?,?,?,?)",
                    (
                        city["id"],
                        canon.INIT_POP.get(city["id"], 50_000),
                        canon.INIT_ORDER.get(city["id"], 0.72),
                        canon.INIT_FAITH.get(city["id"], 0.75),
                        canon.INIT_TIDE.get(city["id"], 0.03),
                    ),
                )
            for titan in canon.TITANS:
                conn.execute(
                    "INSERT OR IGNORE INTO titans (id) VALUES (?)", (titan["id"],)
                )
            for scion in canon.SCIONS:
                conn.execute(
                    "INSERT OR IGNORE INTO scions (id) VALUES (?)", (scion["id"],)
                )

    # ---------------- 读 ----------------
    def meta(self) -> dict:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM meta WHERE id = 1").fetchone()
            return dict(row) if row else {}

    def cities(self) -> list[dict]:
        with self._conn() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM cities")]

    def titans(self) -> list[dict]:
        with self._conn() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM titans")]

    def scions(self) -> list[dict]:
        with self._conn() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM scions")]

    def recent_events(self, limit: int = 80) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM events ORDER BY seq DESC LIMIT ?", (limit,)
            )
            return [dict(r) for r in rows]

    def events_between(self, tick_from: int, tick_to: int, limit: int = 400) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM events WHERE tick >= ? AND tick <= ? ORDER BY seq LIMIT ?",
                (tick_from, tick_to, limit),
            )
            return [dict(r) for r in rows]

    def pending_narration(self, limit: int = 6) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM events WHERE narrated = 0 ORDER BY seq LIMIT ?", (limit,)
            )
            return [dict(r) for r in rows]

    def ledger(self, limit: int = 24) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,)
            )
            return [dict(r) for r in rows]

    def ledger_volume(self, chapter: int) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM ledger WHERE chapter = ? ORDER BY section, id", (chapter,)
            )
            return [dict(r) for r in rows]

    def write_counts(self) -> dict[int, int]:
        """每卷已写了几节。界面据此点亮目录。"""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT chapter, COUNT(DISTINCT section) n FROM ledger GROUP BY chapter"
            )
            return {int(r["chapter"]): int(r["n"]) for r in rows}

    def counts(self) -> dict:
        with self._conn() as conn:
            return {
                "events": conn.execute("SELECT COUNT(*) n FROM events").fetchone()["n"],
                "volumes": conn.execute("SELECT COUNT(*) n FROM ledger").fetchone()["n"],
                "pending": conn.execute(
                    "SELECT COUNT(*) n FROM events WHERE narrated = 0"
                ).fetchone()["n"],
            }

    # ---------------- 写 ----------------
    def save_meta(self, fields: dict[str, Any]) -> None:
        if not fields:
            return
        fields = dict(fields)
        fields["updated_at"] = _now()
        keys = ", ".join(f"{k} = ?" for k in fields)
        with self._lock, self._conn() as conn:
            conn.execute(f"UPDATE meta SET {keys} WHERE id = 1", tuple(fields.values()))

    def save_cities(self, rows: Iterable[dict]) -> None:
        with self._lock, self._conn() as conn:
            conn.executemany(
                "UPDATE cities SET pop=?, order_v=?, faith=?, tide=?, fallen=?, mood=?"
                " WHERE id=?",
                [
                    (r["pop"], r["order_v"], r["faith"], r["tide"],
                     r["fallen"], r["mood"], r["id"])
                    for r in rows
                ],
            )

    def save_titans(self, rows: Iterable[dict]) -> None:
        with self._lock, self._conn() as conn:
            conn.executemany(
                "UPDATE titans SET taken=?, imbalance=?, mood=? WHERE id=?",
                [(r["taken"], r["imbalance"], r["mood"], r["id"]) for r in rows],
            )

    def save_scions(self, rows: Iterable[dict]) -> None:
        with self._lock, self._conn() as conn:
            conn.executemany(
                "UPDATE scions SET state=?, progress=?, burden=?, thought=?, alive=?"
                " WHERE id=?",
                [
                    (r["state"], r["progress"], r["burden"], r["thought"],
                     r["alive"], r["id"])
                    for r in rows
                ],
            )

    def add_events(self, events: list[dict]) -> int:
        if not events:
            return 0
        stamp = _now()
        with self._lock, self._conn() as conn:
            conn.executemany(
                "INSERT INTO events (tick, cycle, kind, subject, place, severity,"
                " text_zh, narrative, narrated, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                [
                    (
                        e["tick"], e["cycle"], e["kind"], e.get("subject"),
                        e.get("place"), int(e.get("severity", 1)), e["text_zh"],
                        e.get("narrative"), 1 if e.get("narrative") else 0, stamp,
                    )
                    for e in events
                ],
            )
        return len(events)

    def mark_narrated(self, seq: int, narrative: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                "UPDATE events SET narrative = ?, narrated = 1 WHERE seq = ?",
                (narrative, seq),
            )

    def add_ledger(
        self, tick: int, cycle: int, chapter: int, section: int,
        title: str, body: str, origin: str,
    ) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                "INSERT INTO ledger (tick, cycle, chapter, section, title, body,"
                " origin, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (tick, cycle, chapter, section, title, body, origin, _now()),
            )

    def last_ledger_section(self, chapter: int) -> int:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT MAX(section) s FROM ledger WHERE chapter = ?", (chapter,)
            ).fetchone()
            return int(row["s"] or 0)

    def clear_world(self) -> None:
        """清空世界状态（保留事件与如我所书）。再创世时用。"""
        with self._lock, self._conn() as conn:
            conn.execute(
                "UPDATE titans SET taken = 0, imbalance = 0.0, mood = '沉睡'"
            )
            conn.execute(
                "UPDATE scions SET state = '在途', progress = 0.0, burden = 0.0,"
                " thought = '', alive = 1"
            )
