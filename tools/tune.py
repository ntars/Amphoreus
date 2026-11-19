"""参数标定脚本（开发用，不参与运行）。

目的：确认在若干 tick 之后，世界能走完「黑潮扩散 → 逐火 → 再创世」一整轮，
且不让某座城邦的数值卡在 0 或 1 这种退化状态。

用法：python3 tools/tune.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from amphoreus.sim import world as W  # noqa: E402
from amphoreus.sim.world import WorldState  # noqa: E402

TOTAL = 6000


def run(seed: int = 20261118) -> None:
    st = WorldState.fresh(seed=seed)
    sparks_at: list[int] = []
    recre_at: list[int] = []
    fallen_at: dict[str, int] = {}

    for _ in range(TOTAL):
        W.advance(st)
        now = st.sparks_taken
        if now > len(sparks_at):
            sparks_at.append(st.tick)
        for cid, c in st.cities.items():
            if c.fallen and cid not in fallen_at:
                fallen_at[cid] = st.tick
        if W.should_recreate(st):
            recre_at.append(st.tick)
            W.retide_for_cycle(st)

    m = st.moment
    print(f"种子 {seed}，推进 {TOTAL} 拍")
    print(f"结束于 {m.full_zh}（tick={st.tick}, cycle={st.cycle}）")
    print(f"黑潮 {st.black_tide:.3f} | 熵 {st.entropy:.3f} | 方程 {st.equation:.3f}")
    print(f"火种 {st.sparks_taken}/12 | 纪元 {st.epoch['zh']} | 阶段 {st.pipeline_stage['zh']}")
    print()
    print("夺火时点：", sparks_at or "—")
    print("再创世时点：", recre_at or "—")
    print("失守时点：", {k: v for k, v in fallen_at.items()} or "—")
    print()
    print("城邦终态：")
    for cid, c in st.cities.items():
        flag = "✗失守" if c.fallen else " "
        print(
            f"  {cid:16} tide={c.tide:.3f} order={c.order_v:.3f} "
            f"faith={c.faith:.3f} pop={c.pop:>8} {flag} {c.mood}"
        )
    print()
    print("泰坦终态：")
    for tid, t in st.titans.items():
        print(f"  {tid:14} taken={'是' if t.taken else '否'} imbalance={t.imbalance:.3f} {t.mood}")


if __name__ == "__main__":
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 20261118)
