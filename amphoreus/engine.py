"""演算引擎：把模拟内核、数据库、叙事层串成一个能挂机跑的循环。

职责边界：
- 它不决定「发生什么」（sim 决定），也不决定「怎么讲」（narrate 决定）。
- 它只负责：什么时候推进一拍、推进完怎么落盘、什么时候该写文章、进程怎么停。

断点重续的原则：
- 世界的因果只由 (seed, cycle, tick) 决定，所以只要 tick 落盘正确，重启后接着跑即可。
- 现实时间与世界时间的对应关系记在 meta.anchor_wall / anchor_tick 里。
  重启时按锚点推算「现在应该到哪一拍」，把停机期间的时间补算回来——挂机才成立。
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from . import archive, canon, narrate
from .config import Config
from .db import Store
from .log import log
from .sim import calendar as cal
from .sim import world as W


@dataclass(slots=True)
class TickResult:
    """一拍的结果，供调用方决定要不要写日志、要不要刷新界面。"""

    tick: int
    cycle: int
    beats: list[W.Beat]
    moment: cal.Moment


class Engine:
    def __init__(self, cfg: Config, store: Store) -> None:
        self.cfg = cfg
        self.store = store
        self.state = W.WorldState.fresh(cfg.world.seed or 1)
        self.narrator = narrate.Narrator(
            narrate.NarratorConfig(
                enabled=cfg.narrative.enabled,
                endpoint=cfg.narrative.endpoint,
                model=cfg.narrative.model,
                timeout=cfg.narrative.timeout,
                max_per_day=cfg.narrative.max_per_day,
                think=cfg.narrative.think,
            )
        )
        self._narrated_today = 0
        self._narrated_day = -1
        self._last_save = 0.0

    # ---------------- 生命周期 ----------------
    def boot(self) -> None:
        """从数据库恢复世界，或开一个新世界。"""
        meta = self.store.meta()
        seed = int(meta.get("seed") or 0)
        if not seed:
            seed = self.cfg.world.seed or _random_seed()
            self.store.save_meta({"seed": seed})
            log.info("world created", "新世界已建立", seed=seed)
        self.state = W.WorldState.fresh(seed, tick=int(meta.get("tick") or 0))
        self.state.cycle = int(meta.get("cycle") or 1)
        self.state.black_tide = float(meta.get("black_tide") or 0.66)
        self.state.entropy = float(meta.get("entropy") or 0.42)
        self.state.equation = float(meta.get("equation") or 0.0)
        self.state.sparks_taken = int(meta.get("sparks") or 0)
        self._restore_rows()

        # 锚点缺失说明是全新世界，或者从旧版本升级上来。
        if not meta.get("anchor_wall"):
            self.store.save_meta({"anchor_wall": time.time(), "anchor_tick": self.state.tick})

        tick = self.state.tick
        m = self.state.moment
        log.info(
            "world resumed",
            "世界已接续",
            seed=seed,
            tick=tick,
            cycle=self.state.cycle,
            when=m.full_zh,
            sparks=f"{self.state.sparks_taken}/12",
        )
        self.narrator.probe()

    def _restore_rows(self) -> None:
        for row in self.store.cities():
            city = self.state.cities.get(row["id"])
            if not city:
                continue
            city.pop = int(row["pop"])
            city.order_v = float(row["order_v"])
            city.faith = float(row["faith"])
            city.tide = float(row["tide"])
            city.fallen = bool(row["fallen"])
            city.mood = str(row["mood"])
        for row in self.store.titans():
            titan = self.state.titans.get(row["id"])
            if not titan:
                continue
            titan.taken = bool(row["taken"])
            titan.imbalance = float(row["imbalance"])
            titan.mood = str(row["mood"])
        for row in self.store.scions():
            scion = self.state.scions.get(row["id"])
            if not scion:
                continue
            scion.state = str(row["state"])
            scion.progress = float(row["progress"])
            scion.burden = float(row["burden"])
            scion.thought = str(row["thought"])
            scion.alive = bool(row["alive"])

    # ---------------- 推进 ----------------
    def step(self) -> TickResult:
        """推进一拍，并把结果落到数据库。"""
        st = self.state
        beats = W.advance(st)
        m = st.moment

        self.store.save_cities(_city_rows(st))
        self.store.save_titans(_titan_rows(st))
        self.store.save_scions(_scion_rows(st))
        self.store.save_meta({
            "tick": st.tick,
            "cycle": st.cycle,
            "black_tide": st.black_tide,
            "entropy": st.entropy,
            "equation": st.equation,
            "sparks": st.sparks_taken,
        })

        if beats:
            self.store.add_events([
                {
                    "tick": st.tick,
                    "cycle": st.cycle,
                    "kind": b.kind,
                    "subject": b.subject,
                    "place": b.place,
                    "severity": b.severity,
                    "text_zh": b.text_zh,
                }
                for b in beats
            ])

        if W.should_recreate(st):
            self._recreate()

        return TickResult(tick=st.tick, cycle=st.cycle, beats=beats, moment=m)

    def _recreate(self) -> None:
        """再创世：本轮归于灰烬，下一轮从头开始。"""
        st = self.state
        old_cycle = st.cycle
        W.retide_for_cycle(st)
        self.store.clear_world()
        self.store.save_meta({"cycle": st.cycle, "black_tide": st.black_tide,
                              "sparks": 0, "equation": 0.0})
        log.info(
            "cycle recreated",
            "再创世完成，演算进入下一轮",
            old_cycle=old_cycle,
            new_cycle=st.cycle,
        )
        body = narrate.fallback_chapter(
            st.moment.full_zh, "终卷", 1, [], st.black_tide, st.sparks_taken, recreate=True
        )
        self.store.add_ledger(
            tick=st.tick, cycle=st.cycle, chapter=13, section=1,
            title="再创世", body=body, origin="template",
        )

    # ---------------- 叙事 ----------------
    def narrate_pending(self, budget: int = 1) -> int:
        """给还没写成文的重大事件补上叙事。每世界日有上限，避免把机器跑满。"""
        if not self.narrator.alive:
            return 0
        day = self.state.tick // cal.TICKS_PER_DAY
        if day != self._narrated_day:
            self._narrated_day = day
            self._narrated_today = 0
        if self._narrated_today >= self.cfg.narrative.max_per_day:
            return 0

        done = 0
        for row in self.store.pending_narration(limit=budget * 4):
            if self._narrated_today >= self.cfg.narrative.max_per_day:
                break
            if int(row["severity"]) < 2:
                # 琐碎的日常不值得调用模型，用模板文本即可，但也要标记已处理。
                self.store.mark_narrated(
                    int(row["seq"]),
                    narrate.fallback_event(row["kind"], row["text_zh"], row["place"]),
                )
                continue
            m = cal.from_tick(int(row["tick"]), self.state.seed)
            prompt = narrate.event_prompt(
                m.full_zh, row["kind"], row["text_zh"], row["place"], row["subject"]
            )
            text = self.narrator.generate(prompt)
            if text is None:
                text = narrate.fallback_event(row["kind"], row["text_zh"], row["place"])
            self.store.mark_narrated(int(row["seq"]), text)
            self._narrated_today += 1
            done += 1
            if done >= budget:
                break
        return done

    def write_volume(self) -> bool:
        """写一节《如我所书》。

        按官方目录顺序填：先写当前能写的卷，五节填满再进下一卷。
        全书 13 卷 × 5 节 = 65 节，写完就停笔——书有尽头。
        """
        st = self.state
        target = self._next_slot()
        if target is None:
            return False
        chapter, section = target

        vol = archive.VOLUME_BY_CHAPTER[chapter]
        scion = canon.SCION_BY_ID.get(vol["scion"], {})
        facts = [row["text_zh"] for row in self.store.recent_events(limit=6)]
        m = st.moment
        prompt = narrate.chapter_prompt(
            m.full_zh, chapter, section, vol["new"], facts,
            st.black_tide, st.sparks_taken,
            section_name=archive.section_name(chapter, section),
            scion=scion,
        )
        body = self.narrator.generate(prompt, max_tokens=420) if self.narrator.alive else None
        origin = "llm"
        if body is None:
            origin = "template"
            body = narrate.fallback_chapter(
                m.full_zh, vol["new"], section, facts, st.black_tide, st.sparks_taken,
                section_name=archive.section_name(chapter, section),
            )
        self.store.add_ledger(
            tick=st.tick, cycle=st.cycle, chapter=chapter, section=section,
            title=vol["new"], body=body, origin=origin,
        )
        log.info("volume written", "卷册新增一节", chapter=chapter, section=section, origin=origin)
        return True

    def _next_slot(self) -> tuple[int, int] | None:
        """下一节该写哪一卷哪一节。按官方目录顺序，已解锁的卷才写。"""
        written = self.store.write_counts()
        unlocked_from = max(1, self.state.sparks_taken + 1)
        for chapter in archive.CATALOG_ORDER:
            if chapter > unlocked_from:
                continue
            done = written.get(chapter, 0)
            if done < 5:
                return chapter, done + 1
        return None

    # ---------------- 节奏 ----------------
    def sleep_seconds(self) -> float:
        """按配置换算下一拍该等多久。

        dprs 是「现实每秒推进多少世界日」。一拍只占 1/TICKS_PER_DAY 个世界日，
        所以每拍的现实秒数 = 1 / (dprs * TICKS_PER_DAY)。
        realtime 下 dprs = 1/86400，每拍即 4.8 小时，与世界时间严格 1:1。
        """
        dprs = self.cfg.days_per_real_second()
        if dprs <= 0:
            return 3600.0
        return max(0.02, 1.0 / (dprs * cal.TICKS_PER_DAY))

    def catch_up(self, max_ticks: int = 4000) -> int:
        """把停机期间欠下的拍数补算回来，让挂机连续。"""
        meta = self.store.meta()
        anchor_wall = float(meta.get("anchor_wall") or 0)
        anchor_tick = int(meta.get("anchor_tick") or 0)
        if not anchor_wall:
            return 0
        elapsed = time.time() - anchor_wall
        if elapsed <= 0:
            return 0
        due = int(elapsed * self.cfg.days_per_real_second() * cal.TICKS_PER_DAY)
        behind = anchor_tick + due - self.state.tick
        if behind <= 0:
            return 0
        n = min(behind, max_ticks)
        for _ in range(n):
            self.step()
        log.info(
            "catch up",
            "补算停机期间的演算",
            ticks=n,
            behind=behind,
            capped=behind > max_ticks,
        )
        # 锚点前移，避免下次重启重复补算。
        self.store.save_meta({"anchor_wall": time.time(), "anchor_tick": self.state.tick})
        return n


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------
def _random_seed() -> int:
    import secrets

    return secrets.randbelow(2_000_000_000) + 1


def _city_rows(st: W.WorldState) -> list[dict]:
    return [
        {
            "id": c.id,
            "pop": c.pop,
            "order_v": round(c.order_v, 4),
            "faith": round(c.faith, 4),
            "tide": round(c.tide, 4),
            "fallen": 1 if c.fallen else 0,
            "mood": c.mood,
        }
        for c in st.cities.values()
    ]


def _titan_rows(st: W.WorldState) -> list[dict]:
    return [
        {
            "id": t.id,
            "taken": 1 if t.taken else 0,
            "imbalance": round(t.imbalance, 4),
            "mood": t.mood,
        }
        for t in st.titans.values()
    ]


def _scion_rows(st: W.WorldState) -> list[dict]:
    return [
        {
            "id": s.id,
            "state": s.state,
            "progress": round(s.progress, 4),
            "burden": round(s.burden, 4),
            "thought": s.thought,
            "alive": 1 if s.alive else 0,
        }
        for s in st.scions.values()
    ]
