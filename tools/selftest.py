"""端到端回归：从空世界跑到再创世，确认每条链路都通。

用法：python3 -m tools.selftest
会在临时目录建一个独立数据库，不碰 data/ 里的真实世界。
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, ".")

from amphoreus import canon
from amphoreus import config as C
from amphoreus.db import Store
from amphoreus.engine import Engine
from amphoreus.narrate import NarratorConfig, fallback_chapter, fallback_event, fallback_place
from amphoreus.sim import calendar as cal
from amphoreus.sim import world as W

OK, FAIL = "  ok  ", "  FAIL"
_fails: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    print(f"{OK if cond else FAIL}  {label}{'  ' + detail if detail else ''}")
    if not cond:
        _fails.append(label)


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="amphoreus-test-"))
    try:
        return _run(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _run(tmp: Path) -> int:
    cfg = C.load()
    cfg.world.seed = 20261119
    cfg.narrative.enabled = False  # 回归不依赖模型，保证可重复
    store = Store(tmp / "world.db")
    eng = Engine(cfg, store)
    eng.boot()

    # --- 1) 起手状态 ---
    st = eng.state
    check("起手落在幻灭世", 0.60 <= st.black_tide < 0.70, f"黑潮 {st.black_tide:.2f}")
    check("起手城邦数", len(st.cities) == len(canon.CITIES), f"{len(st.cities)}")
    check("起手人口非零", all(c.pop > 0 for c in st.cities.values() if c.id != "genesis_vortex"))
    check("十二泰坦未失", sum(1 for t in st.titans.values() if t.taken) == 0)
    check("一拍等于一日五分之一", abs(eng.sleep_seconds() - 4.8 * 3600) < 1)

    # --- 2) 推进到有火种归位 ---
    first_spark_tick = None
    recreate_tick = None
    for i in range(12000):
        r = eng.step()
        if first_spark_tick is None and st.sparks_taken >= 1:
            first_spark_tick = r.tick
        if st.cycle >= 2:
            recreate_tick = r.tick
            break

    check("出现首次夺火", first_spark_tick is not None, f"第 {first_spark_tick} 拍")
    check("发生再创世", recreate_tick is not None, f"第 {recreate_tick} 拍")
    check("再创世后火种归零", st.sparks_taken == 0 if recreate_tick else False)

    # --- 3) 数值没有退化 ---
    live = [c for c in st.cities.values() if c.id != "genesis_vortex"]
    check("城邦秩序未归零", all(c.order_v > 0.01 for c in live),
          f"最低 {min(c.order_v for c in live):.3f}")
    check("城邦信仰未归零", all(c.faith > 0.01 for c in live),
          f"最低 {min(c.faith for c in live):.3f}")
    check("黑潮未顶格", st.black_tide <= 0.985)

    # --- 4) 数据库一致性 ---
    meta = store.meta()
    check("数据库 tick 与内存一致", int(meta["tick"]) == st.tick)
    check("数据库轮次与内存一致", int(meta["cycle"]) == st.cycle)
    counts = store.counts()
    check("事件已落盘", counts["events"] > 100, f"{counts['events']} 条")
    check("卷册已落盘", counts["volumes"] >= 1, f"{counts['volumes']} 节")

    # --- 5) 断点续跑 ---
    tick_before = st.tick
    eng2 = Engine(cfg, store)
    eng2.boot()
    check("重启后 tick 接上", eng2.state.tick == tick_before, f"{eng2.state.tick}")
    check("重启后黑潮接上", abs(eng2.state.black_tide - st.black_tide) < 1e-6)
    eng2.step()
    check("重启后能继续推进", eng2.state.tick == tick_before + 1)

    # --- 6) 历法 ---
    m = cal.from_tick(0, 42)
    check("光历起点", m.full_zh.startswith("光历 4931 年 门关月 1 日"), m.full_zh)
    ys = cal.days_in_year(4931, 42)
    check("年长 336 或 337", ys in (336, 337), f"{ys} 天")
    m2 = cal.from_tick(ys * cal.TICKS_PER_DAY, 42)
    check("跨年正确", m2.year == 4932 and m2.month == 1 and m2.day == 1, m2.full_zh)
    m3 = cal.from_tick(336 * cal.TICKS_PER_DAY * 800, 42)
    check("远年不越界", m3.year >= 5700, m3.full_zh)

    # --- 7) 叙事降级模板 ---
    for c in canon.CITIES:
        t = fallback_place(c["id"], "明晰时", 0.9)
        if not t or "{" in t or "。。" in t:
            check(f"模板 {c['id']}", False, t[:40])
            break
    else:
        check("十处地方的模板都可用", True)

    for kind in ("黑潮", "失守", "夺火", "日常"):
        t = fallback_event(kind, "某事发生了。", "okhema")
        if not t or "{" in t:
            check(f"事件模板 {kind}", False)
            break
    else:
        check("事件模板都可用", True)

    ch = fallback_chapter("光历 4931 年 门关月 1 日", "缇宝", 1, ["某事。"], 0.7, 3)
    check("卷册模板可用", bool(ch) and "{" not in ch and "。。" not in ch)
    check("卷册模板不含阿拉伯数字", not any(ch.isdigit() for ch in ch.replace("·", "")))

    # --- 8) 黄金裔与泰坦的对应关系 ---
    # 第十三枚「创世」没有对应泰坦，这是官方设定（德谬歌的废弃赋值），
    # 它由 _advance_genesis 单独推进，所以这里只校验前十二位。
    orphan = []
    genesis = []
    for s in canon.SCIONS:
        titan = canon.titan_of_spark(s["spark"])
        if titan is None:
            genesis.append(s["zh"])
        elif titan["id"] not in {t["id"] for t in canon.TITANS}:
            orphan.append(s["zh"])
    check("十二位黄金裔都对应到泰坦", not orphan, ",".join(orphan))
    check("无泰坦的火种只有创世一枚", genesis == ["昔涟"], ",".join(genesis))
    check("泰坦数量为十二", len(canon.TITANS) == 12, f"{len(canon.TITANS)}")
    check("火种数量为十三", len(canon.SPARKS) == 13, f"{len(canon.SPARKS)}")

    # 昔涟的进度不应在十二枚归位之前前进
    st2 = W.WorldState.fresh(311, tick=0)
    for _ in range(500):
        W.advance(st2)
    if st2.sparks_taken < 12:
        check("十二枚未齐时昔涟未成形", st2.scions["cyrene"].progress == 0.0,
              f"进度 {st2.scions['cyrene'].progress:.3f}")

    _check_book(store)

    print()
    if _fails:
        print(f"失败 {len(_fails)} 项：" + "、".join(_fails))
        return 1
    print("全部通过。")
    return 0


def _check_book(store: Store) -> None:
    """契约检查：前端读的每个字段，接口必须真的给。

    之前漏给 pipeline 一个字段，整本「如我所书」直接白屏——
    单页出错不能靠肉眼发现，只能在这里钉死。
    """
    from amphoreus import archive

    check("十三卷目录齐全", len(archive.CATALOG_ORDER) == 13)
    for ch in archive.CATALOG_ORDER:
        vol = archive.VOLUME_BY_CHAPTER.get(ch)
        if not vol:
            check(f"卷 {ch} 存在", False)
            continue
        if len(vol["sections"]) != 5:
            check(f"卷 {ch} 五节", False, f"{len(vol['sections'])}")
        if not canon.LIFE_VERSE.get(vol["scion"]):
            check(f"卷 {ch} 有四行诗", False, vol["scion"])
    check("十三卷都是五节且各有诗", not [f for f in _fails if "五节" in f or "四行诗" in f])

    check("六件档案齐全", len(archive.ARCHIVES) == 6,
          ",".join(a["id"] for a in archive.ARCHIVES))
    check("管理员批注有原文", len(archive.WARDEN_LINES) >= 30,
          f"{len(archive.WARDEN_LINES)} 行")
    check("书写指引十一则", len(archive.WRITE_HINTS) == 11,
          f"{len(archive.WRITE_HINTS)} 则")

    # 演算表是 δ-me13 整页的数据源
    check("δ-me13 八阶段", len(canon.PIPELINE) == 8, f"{len(canon.PIPELINE)}")
    check("阶段进度单调不减",
          all(canon.PIPELINE[i]["progress"] <= canon.PIPELINE[i + 1]["progress"]
              for i in range(len(canon.PIPELINE) - 1)))

    # 卷级 written 与章节级 written 必须同口径
    for ch in (1, 13):
        vol = archive.VOLUME_BY_CHAPTER[ch]
        rows = store.ledger_volume(ch)
        check(f"卷 {ch} 已写节数与数据库一致",
              len(rows) == store.write_counts().get(ch, 0),
              f"库 {len(rows)} / 计 {store.write_counts().get(ch, 0)}")

    # 配色对比度：正文与次要文字都要过 WCAG AA 4.5:1
    def _lum(h: str) -> float:
        h = h.lstrip("#")
        out = 0.0
        for c, w in zip((0, 2, 4), (0.2126, 0.7152, 0.0722)):
            v = int(h[c:c + 2], 16) / 255
            v = v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
            out += w * v
        return out

    def _cr(a: str, b: str) -> float:
        la, lb = _lum(a), _lum(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

    panel = archive.UI["panel"]
    check("配色·正文 过 AA", _cr(archive.UI["text"], panel) >= 4.5,
          f"{_cr(archive.UI['text'], panel):.2f}:1")
    check("配色·强调金 过 AA", _cr(archive.UI["gold"], panel) >= 4.5,
          f"{_cr(archive.UI['gold'], panel):.2f}:1")
    check("配色·次要文字 过 AA", _cr(archive.UI["text_dim"], panel) >= 4.5,
          f"{_cr(archive.UI['text_dim'], panel):.2f}:1")

    # 卷册提示词必须比事件提示词短得多。
    # 长提示词下小模型会把整段堆成一句，实测成功率 0/3；
    # 这里钉住长度，免得以后又把规则加回去。
    from amphoreus.narrate import _BASE_STYLE, _CHAPTER_STYLE, chapter_prompt

    vol = archive.VOLUME_BY_CHAPTER[1]
    cp = chapter_prompt("光历 4931 年 门关月 1 日", 1, 1, vol["new"],
                        ["甲", "乙", "丙"], 0.5, 0,
                        section_name=vol["sections"][0],
                        scion=canon.SCION_BY_ID.get(vol["scion"]))
    check("卷册提示词比事件提示词短", len(_CHAPTER_STYLE) < len(_BASE_STYLE),
          f"卷册 {len(_CHAPTER_STYLE)} / 事件 {len(_BASE_STYLE)} 字符")
    check("卷册提示词整体不超过 600 字", len(cp) <= 600, f"{len(cp)} 字符")
    check("卷册提示词给了示范", "示范一" in cp and "示范二" in cp)
    check("卷册提示词给了可数上限", "二十字" in cp)


if __name__ == "__main__":
    raise SystemExit(main())
