"""叙事层实测：检查输出是否真的落在「如我所书」的文体里。

用法：python3 -m tools.try_narrate
只打印，不写数据库、不落盘。
"""

from __future__ import annotations

import sys
import time

sys.path.insert(0, ".")

from amphoreus import canon
from amphoreus.narrate import (
    Narrator,
    NarratorConfig,
    event_prompt,
    fallback_event,
    fallback_place,
    person_prompt,
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

    show(
        "列传 · 万敌",
        person_prompt("mydeimos", MOMENT, progress=0.62, burden=0.78, state="仍在数自己还剩几次重启"),
        n,
    )

    # 降级模板也要看一眼
    print(f"\n{'=' * 70}\n[模板兜底]")
    print("  " + fallback_place("kremnos", "践行时", 0.82))
    print("  " + fallback_event("夺火", "白厄自扎格列斯处取走「负世」火种。", None))
    print("  " + fallback_event("失守", "城门破了。", "janusopolis"))

    # 校验所有神话人物的 prompt 都能构造，不残留未替换字段
    print(f"\n{'=' * 70}\n[全量构造检查]")
    bad = 0
    for s in canon.SCIONS:
        p = person_prompt(s["id"], MOMENT, 0.5, 0.5, "在")
        if not p or "{" in p or "None" in p:
            print(f"  !! {s['id']} 构造异常")
            bad += 1
    for c in canon.CITIES:
        p = place_prompt(c["id"], MOMENT, 0.4, "静", ["a", "b"])
        if not p or "{" in p:
            print(f"  !! {c['id']} 构造异常")
            bad += 1
    print(f"  13 名黄金裔 + {len(canon.CITIES)} 座城邦，异常 {bad} 处")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
