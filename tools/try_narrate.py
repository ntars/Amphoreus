"""叙事层实测：检查输出是否真的落在「如我所书」的文体里。

用法：python3 -m tools.try_narrate
只打印，不写数据库、不落盘。
"""

from __future__ import annotations

import sys
import time

sys.path.insert(0, ".")

from amphoreus import archive, canon
from amphoreus.narrate import (
    Narrator,
    NarratorConfig,
    chapter_prompt,
    event_prompt,
    fallback_event,
    fallback_place,
    place_prompt,
)

MOMENT = "光历 4931 年 门关月 1 日 · 门扉时初刻"


def show(label: str, prompt: str, n: Narrator, max_tokens: int = 320) -> None:
    if not prompt:
        print(f"\n[{label}] 提示词为空，跳过")
        return
    t0 = time.time()
    out = n.generate(prompt, max_tokens=max_tokens)
    dt = time.time() - t0
    print(f"\n{'=' * 70}\n[{label}]  {dt:.1f}s")
    if out is None:
        print("  !! 生成失败（None）")
        return
    body = out.replace("\n", "")
    print(f"  字数 {len(body)}")
    print("  " + out.replace("\n", "\n  "))


def main() -> int:
    cfg = NarratorConfig()
    n = Narrator(cfg)
    if not n.probe():
        print("模型不可用，叙事层将只走模板。")
        return 1

    show(
        "地方志 · 奥赫玛",
        place_prompt(
            "okhema",
            MOMENT,
            tide=0.31,
            mood="黎明将熄，众人仍在等一个说法",
            notes=[
                "云石天宫的灯比往年暗了一格",
                "离怀之路上的车辙新压过旧痕",
                "有人在刻法勒广场替陌生人补鞋，不收钱",
            ],
        ),
        n,
    )

    show(
        "编年史 · 夺火",
        event_prompt(
            MOMENT,
            "夺火",
            "阿格莱雅自墨涅塔处取走「浪漫」火种，金线自此缠上她的手腕，再未松开。",
            place="okhema",
            subject="aglaea",
        ),
        n,
    )

    # 降级模板也要看一眼
    print(f"\n{'=' * 70}\n[模板兜底]")
    print("  " + fallback_place("kremnos", "践行时", 0.82))
    print("  " + fallback_event("夺火", "白厄自扎格列斯处取走「负世」火种。", None))
    print("  " + fallback_event("失守", "城门破了。", "janusopolis"))

    # 校验所有提示词都能构造，不残留未替换字段
    print(f"\n{'=' * 70}\n[全量构造检查]")
    bad = 0
    for c in canon.CITIES:
        p = place_prompt(c["id"], MOMENT, 0.4, "静", ["a", "b"])
        if not p or "{" in p:
            print(f"  !! {c['id']} 构造异常")
            bad += 1
    # 卷册提示词：十三卷的第一节都要能构造出来
    for ch in archive.CATALOG_ORDER:
        v = archive.VOLUME_BY_CHAPTER[ch]
        p = chapter_prompt(
            MOMENT, ch, 1, v["new"], ["甲", "乙", "丙"], 0.5, 3,
            section_name=v["sections"][0],
            scion=canon.SCION_BY_ID.get(v["scion"]),
        )
        if not p or "{" in p:
            print(f"  !! 卷 {ch} 提示词异常")
            bad += 1
    print(f"  {len(canon.CITIES)} 座城邦 + {len(archive.CATALOG_ORDER)} 卷卷册，异常 {bad} 处")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
