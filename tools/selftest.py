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

    # 用户明确要求运行时零图片：检查实际资源引用，不把说明性注释算作加载。
    import re

    def strip_comments(src: str, name: str) -> str:
        if name.endswith('.css') or name.endswith('.js'):
            return re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        if name.endswith('.html'):
            return re.sub(r'<!--.*?-->', '', src, flags=re.S)
        return src

    web_dir = Path(__file__).resolve().parent.parent / "web"
    codex_sources = ["codex.html", "codex.css", "codex.js", "codex-art.js", "codex-portraits.js"]
    image_tokens = ('.svg', '.png', '.jpg', '.jpeg', '.webp', '<img')
    font_url = re.compile(
        r'url\s*\(\s*["\']?[^)"\']+\.(?:ttf|otf|woff2?)(?:[?#][^)"\']*)?["\']?\s*\)',
        re.I,
    )
    html_patterns = (
        re.compile(r'<img\b', re.I),
        re.compile(r'<image\b', re.I),
        re.compile(r'<(?:link|script|source|iframe)[^>]+(?:src|href)\s*=\s*["\'][^"\']+\.(?:svg|png|jpe?g|webp)\b', re.I),
        re.compile(r'url\s*\(', re.I),
    )
    offenders = []
    for name in codex_sources:
        src = strip_comments((web_dir / name).read_text(encoding="utf-8"), name)
        hits = [t for t in image_tokens if t in src.lower()]
        # 官方字体是本项目唯一允许的外部二进制资源；其他 url() 仍按图片拦截。
        if re.search(r'url\s*\(', font_url.sub('', src), re.I):
            hits.append('url(')
        if name.endswith('.html'):
            hits += [p.pattern for p in html_patterns if p.search(src)]
        if hits:
            offenders.append(name + ':' + ','.join(hits))
    check("如我所书界面零图片资源", not offenders, "; ".join(offenders))

    art_src = (web_dir / "codex-art.js").read_text(encoding="utf-8")
    portrait_src = (web_dir / "codex-portraits.js").read_text(encoding="utf-8")
    check("如我所书运行时零图片检查脚本存在",
          (Path(__file__).resolve().parent / "runtime_no_images.cjs").is_file()
          and "Network.requestWillBeSent" in
          (Path(__file__).resolve().parent / "runtime_no_images.cjs").read_text(encoding="utf-8"))
    source_gate = Path(__file__).resolve().parent / "verify_tarot_source.cjs"
    main_src = (Path(__file__).resolve().parent.parent / "main.py").read_text(encoding="utf-8")
    check("如我所书源码门禁纳入一键全链",
          source_gate.is_file()
          and "spriteRoles" in source_gate.read_text(encoding="utf-8")
          and '"verify_tarot_source.cjs"' in main_src
          and "TarotBook 源码链检查通过" in main_src)
    check("如我所书角色剪影由 CSS path 绘制而非加载图片",
          all(token in art_src for token in (
              "function portraitDetail", "PORTRAIT_PATHS", "clip-path:path(",
              '<span class="portrait-wash"',
          )) and 'const PORTRAIT_PATHS' in portrait_src
          and '<script src="/codex-portraits.js"></script>' in (web_dir / "codex.html").read_text(encoding="utf-8"))
    check("如我所书书写场景补八芒星与角色塔罗线稿",
          all(token in art_src for token in (
              "function writingCardPortrait", "PORTRAIT_PATHS", "clip-path:path(",
          )) and all(token in (web_dir / "codex.html").read_text(encoding="utf-8") for token in (
              'class="cover-aurora-star"', 'id="open-card-portrait"',
              'id="floating-card-portrait"',
              'class="cover-flare left"', 'class="cover-flare right"',
              'class="cover-shard s1"',
          )) and all(token in (web_dir / "codex.css").read_text(encoding="utf-8") for token in (
              '.cover-aurora-star {',
              '.open-card-portrait, .floating-card-portrait {',
          )))

    css_src = (web_dir / "codex.css").read_text(encoding="utf-8")
    html_src = (web_dir / "codex.html").read_text(encoding="utf-8")
    check("如我所书书页按官方模板参数排版",
          all(token in css_src for token in (
              "width: 50%", "min-height: 50em", "height: 50px",
              "color: #6b5f4a", "line-height: 18px",
              "border-color: #a18454", "background-color: #a18454",
              "color: #e0d6ca", "#b49a5b", "#9b7943", "#ece5db",
              "#c39a86",
              "display: inline-block", "vertical-align: middle",
          )) and all(token in html_src for token in (
              'class="aivw-page aivw-lpage"', 'class="aivw-page aivw-rpage"',
              'class="aivw-top-deco"', 'class="aivw-content"',
              'class="catalog-views"', 'data-view="heroes"', 'data-view="paths"',
          )))
    js_src = (web_dir / "codex.js").read_text(encoding="utf-8")
    check("如我所书目录保留英雄纪与命路双视图",
          all(token in js_src for token in (
              "$('#catalog-paths')", "$('.catalog-view')", "showCatalogView",
          )))
    check("如我所书启动辅助函数与首页画布适配保持模块级",
          '<div class="home-stage">' in html_src
          and all(token in css_src for token in (
              "transform-origin: 0 0;",
              "width: min(100vw, 177.7778vh);",
              "height: min(100vh, 56.25vw);",
              "scale: min(calc(100vw / 1280px), calc(100vh / 720px));",
          ))
          and all(token in js_src for token in (
              "let signLongPress = {};",
              "let pageFramePattern = {};",
              "function applyChapterSprites(",
              "function showSourceError(",
          ))
          and js_src.index("function applyChapterSprites(")
          < js_src.index("function openCatalog()")
          and js_src.index("function showSourceError(")
          < js_src.index("async function boot()"))
    check("如我所书书页按官方素材补全书脊阴影与标题装饰",
          all(token in css_src for token in (
              ".aivw-lpage::before", ".aivw-rpage::before",
              "repeating-linear-gradient(90deg, #c39a86 0 12px, transparent 12px 18px)",
              ".aivw-title-deco",
          )) and 'class="aivw-title-deco aivw-title-deco-right"' in html_src)
    check("如我所书命路页保留纯 CSS 星图与缩放控件",
          all(token in css_src for token in (
              ".path-starmap", ".starmap-disc", ".disc-spokes", ".starmap-zoom",
          )) and all(token in html_src for token in (
              'class="starmap-disc"', 'id="starmap-zoom-in"', 'id="starmap-zoom-out"',
          )) and "$('#starmap-zoom-in')" in js_src)
    check("如我所书命路详情按公开帧排为左卡右诗",
          all(token in html_src for token in (
              'class="path-detail"', 'id="lightbox-poem"', 'id="lightbox-meta"',
          )) and all(token in css_src for token in (
              ".path-detail-card", ".path-detail-copy", ".path-detail-rule",
          )) and "$('#lightbox-poem')" in js_src)
    check("如我所书展开书页补齐金边、羽毛书签与选择态文案",
          all(token in html_src for token in (
              'class="open-binding left"', 'class="open-binding right"',
              'class="open-feather"', '那逐火的人们……', '逐火者的命路',
              'class="open-card-ornament"', 'class="floating-card-ornament"',
              'class="open-card-figure" aria-hidden="true"><i></i></span>',
              'class="floating-card-figure" aria-hidden="true"><i></i></span>',
          )) and all(token in css_src for token in (
              ".open-binding", ".open-feather", 'content: "如我所书"',
              ".open-card-ornament::before, .open-card-ornament::after",
              ".open-card-figure::before", ".open-card-figure::after",
              ".open-card-figure i::before", ".open-card-figure i::after",
              ".floating-card-ornament::before, .floating-card-ornament::after",
              ".floating-card-figure::before", ".floating-card-figure::after",
              ".floating-card-figure i::before", ".floating-card-figure i::after",
          )))
    check("如我所书单卷页保留录屏中的居中纸幅与阅读背景",
          all(token in css_src for token in (
              'body:has(#view-volume:not(.hidden)) .book',
              'body:has(#view-volume:not(.hidden)) .volume-stage',
              'width: 1410px;',
              'width: 1180px;',
              'body:has(#view-volume:not(.hidden)) .volume-wings',
              'body:has(#view-volume:not(.hidden)) .volume-foot::before',
              'body:has(#view-volume:not(.hidden)) .book-foot',
              'body:has(#view-volume:not(.hidden)) .book { max-width: none; }',
          )) and all(token in html_src for token in (
              'class="volume-stage"', 'id="volume-tabs"',
          )) and 'volume-tab' in js_src)
    check("如我所书书写态确认按钮与提示条脱离书页、落在右页和书下方",
          all(token in css_src for token in (
              '.open-confirm {\n  position: fixed; z-index: 4; left: calc(50% + 298px); top: 804px;',
              '.cover-hint {\n  position: fixed; z-index: 5; left: 50%; top: 886px;',
              'body:has(#cover-open.chosen:not(.hidden)) .cover-hint { opacity: 1; }',
              'body:has(#cover-open.choosing:not(.hidden)) .cover-hint { opacity: 0; }',
          )) and '<button type="button" class="open-confirm" id="open-confirm">' in html_src
          and '<p class="cover-hint">' in html_src)
    check("如我所书命路详情按公开帧恢复暗底塔罗卡",
          all(token in css_src for token in (
              'aspect-ratio: 2 / 4.05;',
              '.path-detail-card::before',
              '.path-detail-card::after',
              '.path-detail-card .css-path-art::before',
              '.path-detail-card .css-path-art::after',
              'grid-template-columns: 268px minmax(0, 1fr);',
              'radial-gradient(ellipse 70% 56% at 50% 82%, rgba(88,66,29,.42), transparent 68%),',
              'repeating-conic-gradient(from 12deg at 38% 13%, rgba(196,152,52,.9) 0 6deg, transparent 6deg 30deg),',
          )) and 'id="lightbox-art"' in html_src)
    check("如我所书命路画布按公开帧补外框、星屑和放大圆盘",
          all(token in css_src for token in (
              'radial-gradient(circle at 10% 14%, rgba(222,235,255,.8) 0 1px, transparent 2px)',
              'width: min(620px, 78vh, 92vw); aspect-ratio: 1; height: auto;',
              'body:has(#view-path:not(.hidden)) .path-starmap {',
              '.path-uid {',
              'body:has(#view-path:not(.hidden)) #view-path .spread-head .back {',
              '.disc-spokes {',
           )) and 'class="path-starmap"' in html_src
           and all(token in js_src for token in (
               'const radius = discSize * 0.475 * zoom;',
               'const angle = -90 + i * 360 / 12;',
               'window.addEventListener(\'resize\', applyZoom);',
           )))
    check("如我所书命路按实帧保留录制窗口栏与分区底色",
          all(token in css_src for token in (
              'linear-gradient(180deg, #3b3b3c 0 18px, #1e1e1f 18px 24px, transparent 24px)',
              'linear-gradient(90deg, rgba(90,118,163,.12), transparent 30%, transparent 72%, rgba(12,22,40,.1))',
              'linear-gradient(0deg, rgba(98,130,181,.6), transparent 10%)',
          )))
    check("如我所书中心昔涟卡按 Card13 官方素材使用粉紫配色",
          "cyrene:   { face: '◡', hair: '✿', mark: ' cyrene',  hue: '#c78fcb', tint: '#ffe0ef', shade: '#694a89' }" in art_src
          and "radial-gradient(ellipse at 52% 44%, rgba(255,221,238,.96)" in css_src)
    check("如我所书命路星盘改为分段浅蓝旋涡与弧形金线",
          all(token in css_src for token in (
              '.disc-segments {', '.disc-swirl {', '.starmap-links .link {',
              'repeating-conic-gradient(from 6deg, rgba(202,220,246,.62)',
              'border: 1px solid rgba(222,195,120,.62)',
          )) and all(token in html_src for token in (
              '<span class="disc-segments"></span>',
              '<span class="disc-swirl"></span>',
              'class="starmap-links"',
          )))
    check("如我所书单卷页按公开帧放大纸幅并重排图文",
          all(token in css_src for token in (
              'transform: translateX(-50%);',
              'width: 1410px;',
              'height: 532px;',
              'width: 1180px;',
              '.aivw-lpage .aivw-content',
              '.aivw-rpage .aivw-content',
              '.paper .hero-art { width: 100%; height: 300px;',
              '.paper .hero-art .css-hero-art.city-sketch',
              '.paper .hero-art .city-skyline',
              '.paper .hero-art .city-tower.t3',
              '.paper .hero-art .city-bridge',
              'linear-gradient(180deg, #37342e 0%, #2b2823 58%, #211e1a 100%)',
              '.volume-tabs {',
              '.volume-tab.active {',
          )) and 'class="volume-stage"' in html_src)
    check("如我所书目录卡按角色色系分层绘制",
          all(token in (web_dir / "codex-art.js").read_text(encoding="utf-8") for token in (
              "--portrait-hue:", "--portrait-tint:", "--portrait-shade:",
              'class="portrait-edge"',
          )) and all(token in css_src for token in (
              ".hero-card .portrait-ink {",
              ".hero-card .portrait-wash {",
              ".hero-card .portrait-edge {",
          )))
    check("如我所书单卷插画改为纯 CSS 城市素描而非人物符号",
          'city-sketch' in (web_dir / "codex-art.js").read_text(encoding="utf-8")
          and '<span class="city-skyline"></span>' in (web_dir / "codex-art.js").read_text(encoding="utf-8"))
    check("如我所书书写纸页补齐藤纹双线框、柱饰和底饰",
          all(token in html_src for token in (
              'class="open-frame"', 'class="open-flourish top"',
              'class="open-flourish bottom"', 'class="open-pillar left"',
              'class="open-pillar right"', 'class="open-base"',
          )) and all(token in css_src for token in (
              ".open-frame::before, .open-frame::after", ".open-flourish",
              ".open-pillar::before, .open-pillar::after", ".open-base",
          )))
    check("如我所书书写背景用柔和光幕与远山替换硬条纹",
          all(token in css_src for token in (
              'radial-gradient(ellipse at 18% 42%, rgba(128,96,218,.28), transparent 32%)',
              'radial-gradient(ellipse at 84% 36%, rgba(88,126,224,.24), transparent 30%)',
              'bottom: 25%; height: 26%; left: -4%; right: -4%;',
          )) and 'repeating-linear-gradient(90deg, rgba(147,120,228,.1)' not in css_src)
    check("如我所书书写页移动端覆盖桌面右移避免出屏",
          all(token in css_src for token in (
              '.cover-open { width: 94vw; height: 380px; margin-left: 0; }',
              '.cover-hint { left: 50%; }',
              '.floating-card { left: 22%; top: 74%; width: 130px; height: 180px; }',
          )))
    check("如我所书书写页按公开帧右移书册并归位漂浮卡",
          all(token in css_src for token in (
              'margin-left: 0; margin-top: 0;',
              'position: fixed; z-index: 3; left: calc(50% - 460px); top: 580px;',
          )) and 'id="floating-card"' in html_src)
    check("如我所书入口按解包主页动画还原六项功能按钮与揭示时序",
          all(token in js_src for token in (
              'tarotButtonSources', 'tarotIconTimings', 'tarotHomeGeometry',
              'tarotSubtitleTiming', 'tarotCatalogTiming', 'tarotBookletTiming',
              '--catalog-${key}-delay', '--booklet-${key}-delay',
              '--source-title-delay', '--source-title-duration',
              "['entry', coverTiming?.root]", "['entry-title', coverTiming?.pageInfo]",
              "['star', starTiming?.star]", "['story-flash', storyStarTiming]",
              "['booklet-btn', bookletBtnTiming]",
              '--icon-drift', '--icon-duration',
              '--source-origin-x', '--source-origin-y', '--source-book-y',
              '--source-title-x', '--source-title-y', '--source-subtitle-x', '--source-subtitle-y',
              '--source-close-y', '--source-reward-y', '--source-go-y',
              "BtnBook", "BtnStar", "BtnPaper", "BtnWiki", "BtnMem", "BtnMail",
          )) and all(token in css_src for token in (
              'tarotButtonReveal', 'tarotIconEff', '--reveal-delay', '--reveal-duration',
              '0% { opacity: 0; }', '100% { opacity: 1; }', '44.37%', '--source-x', '--source-y',
              '--icon-drift', '--icon-duration',
              '--source-title-delay', '--source-title-duration', '--source-close-y',
              'tarotCatalogEnter', 'tarotBookletPageEnter',
              'tarotEntryBookRise', 'tarotStoryStarFlash',
              'tarotStarPanelReveal', 'tarotStarPanelRotate', 'tarotStoryStarReveal', '--path-index',
              '--story-delay', '--story-duration',
              '--scene-sky', '--scene-skyCloud', '--scene-stone', '--scene-glow',
          )))
    check("如我所书界面按游戏帧保留双行标题与书写故事入口",
          "cover: '书写故事'" in js_src and all(token in css_src for token in (
              'height: 52px;', 'top: 52px; left: 0; right: 0; z-index: 19;', '.chrome-mark::before',
              'body:has(#cover-open:not(.hidden)) .book-cover',
              'body:has(#view-cover:not(.hidden)) .archive-tabs,\nbody:has(#view-catalog:not(.hidden)) .archive-tabs,\nbody:has(#view-path:not(.hidden)) .archive-tabs,\nbody:has(#view-home:not(.hidden)) .archive-tabs { display: none; }',
              '.cover-menu.hidden', '.open-r::after',
          )))

    source_json = (web_dir / "codex-source.json").read_text(encoding="utf-8")
    ui_layer_keys = (
        "rewardButtonBgRing", "diamondPattern", "titleDecoItem", "buttonDecoItem",
        "storyBgOutline", "storyFinishIcon", "storyHintIcon", "storyLeftDeco",
        "storyRightDeco", "chartCataTabBg", "chartTabBg", "roundBrownDecoL",
        "roundBrownDecoR", "energyOrb", "mainSwitchIcon", "mainMailIcon",
        "mimiBookDeco2", "mimiBookDeco5", "mimiTalkDeco", "mimiTalkPanelBg",
        "nextPageBg", "openBookCardBg", "rewardDecoRect", "rewardDecoRect2",
        "rewardDecoRect3", "signLightStar",
    )
    check("如我所书 TarotBook UI 主 atlas 二十六组轮廓已桥接并消费",
          all(f'"{key}": "polygon(' in source_json for key in ui_layer_keys)
          and all('var(--ui-layer-' + "".join(
                    "-" + ch.lower() if ch.isupper() else ch for ch in key) in css_src
                  for key in ui_layer_keys)
          and "function tarotUiLayerVectors()" in (web_dir / "codex-source.js.template").read_text(encoding="utf-8")
          and "--ui-layer-${key}" in js_src
          and all(token in html_src + js_src for token in (
              "catalog-tab-cata-bg", "catalog-card-source-page",
              "reward-source-ring", "home-glyph-mail-sprite",
              "mimi-panel-source-bg", "volume-next-source",
              "open-source-card-bg", "sign-longpress-light-star",
          )))

    # 官方逐像素验收需要真实游戏内截图。缺失时只提示取证边界；
    # 不能把公开页素材、当前实现截图或自身比较当作“与官方一致”的证据。
    baseline_dir = Path(__file__).resolve().parent.parent / "docs/screenshots/baseline"
    # 关键路径与界面自检必须始终全绿；“基准缺失”由 pixel_compare.py 单独拦截。
    # 若把它计入自身回归，会把“无法验收”误报成“项目有回归缺陷”。
    # 这里只保留文档化的取证边界，不阻断运行。
    required_baselines = ("home.png", "catalog.png", "volume.png", "path.png")
    readme = baseline_dir / "README.txt"
    self_fixture = readme.is_file() and "must not be\nused as official baselines" in readme.read_text(encoding="utf-8").lower()
    missing = [name for name in required_baselines
               if not (baseline_dir / name).is_file() or self_fixture]
    print(f"  note  官方逐帧基准{'缺失 ' + ','.join(missing) if missing else '已就位'}"
          "（逐像素验收由 tools/pixel_compare.py 拦截）")

if __name__ == "__main__":
    raise SystemExit(main())
