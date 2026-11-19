"""演算世界状态与推进规则。

核心因果链（全部对应官方设定）：
    黑潮（毁灭方程式的视觉乱码）扩张
        → 城邦侵蚀、失序、失守
        → 泰坦失衡
        → 黄金裔逐火（夺取火种、成为半神）
        → 火种集齐触发「再创世」
        → 再创世即演算更替，同时推进「毁灭方程式」求解进度
        → 方程式算满则铁墓破壳（本作给出这一终局的可观测形态）

没有人能插手：每个 tick 的结果只由「世界种子 + 当前 tick」决定，
可复现、可断点续跑。
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .. import canon
from . import calendar as cal


@dataclass(slots=True)
class CityState:
    id: str
    pop: int
    order_v: float      # 秩序
    faith: float        # 对泰坦的信仰
    tide: float         # 黑潮侵蚀度
    fallen: bool = False
    mood: str = "如常"

    @property
    def exposure(self) -> float:
        """被黑潮伤害的直观程度，给界面用。"""
        return min(1.0, self.tide * 0.75 + (1 - self.order_v) * 0.25)


@dataclass(slots=True)
class TitanState:
    id: str
    taken: bool = False
    imbalance: float = 0.0
    mood: str = "沉睡"


@dataclass(slots=True)
class ScionState:
    id: str
    state: str = "在途"
    progress: float = 0.0
    burden: float = 0.0
    thought: str = ""
    alive: bool = True


@dataclass(slots=True)
class WorldState:
    seed: int
    tick: int = 0
    cycle: int = 1
    black_tide: float = 0.02
    entropy: float = 0.10
    equation: float = 0.0
    sparks_taken: int = 0
    cities: dict[str, CityState] = field(default_factory=dict)
    titans: dict[str, TitanState] = field(default_factory=dict)
    scions: dict[str, ScionState] = field(default_factory=dict)

    # -- 派生 -----------------------------------------------------------
    @property
    def moment(self) -> cal.Moment:
        return cal.from_tick(self.tick, self.seed)

    @property
    def epoch(self) -> dict:
        """当前纪元。黑潮越重越靠后。"""
        if self.black_tide < 0.35:
            return canon.EPOCHS[1]   # 黄金世
        if self.black_tide < 0.60:
            return canon.EPOCHS[2]   # 纷争世
        return canon.EPOCHS[3]       # 幻灭世

    @property
    def pipeline_stage(self) -> dict:
        """当前演算阶段。由方程式进度决定，对应 δ-me13 的八阶段。"""
        idx = 0
        for i, stage in enumerate(canon.PIPELINE):
            if self.equation * 100 >= stage["progress"] - 1e-9:
                idx = i
        return canon.PIPELINE[idx]

    # -- 构造 -----------------------------------------------------------
    @classmethod
    def fresh(cls, seed: int, tick: int = 0) -> "WorldState":
        """按官方时点起手：光历 4931 年门关月，世界已入幻灭世。"""
        st = cls(seed=seed, tick=tick, black_tide=0.66, entropy=0.42)
        for city in canon.CITIES:
            st.cities[city["id"]] = CityState(
                id=city["id"],
                pop=_INIT_POP.get(city["id"], 50_000),
                order_v=_INIT_ORDER.get(city["id"], 0.72),
                faith=_INIT_FAITH.get(city["id"], 0.75),
                tide=_INIT_TIDE.get(city["id"], 0.03),
            )
        for titan in canon.TITANS:
            st.titans[titan["id"]] = TitanState(id=titan["id"])
        for scion in canon.SCIONS:
            st.scions[scion["id"]] = ScionState(id=scion["id"])
        return st

    # -- 随机源 ---------------------------------------------------------
    def tick_rng(self) -> random.Random:
        return random.Random(self.seed * 1_000_003 + self.cycle * 9176 + self.tick * 7919)


# 各城邦的起手数值由 canon 统一持有（数据库建库也要用同一份），此处只做别名。
# **初始状态按官方「列车抵达时已入幻灭世」设定**：大部分城邦已半毁，
# 唯有奥赫玛因黎明机器保持低侵蚀。具体数字是本作设定（design）；
# 「哪些城已成废墟」的定性判断来自官方 wiki 的双面貌命名。
_INIT_POP = canon.INIT_POP
_INIT_ORDER = canon.INIT_ORDER
_INIT_FAITH = canon.INIT_FAITH
_INIT_TIDE = canon.INIT_TIDE

# 城邦对黑潮的敏感度（design）：边陲与战争之城先坏；圣城因黎明机器最耐。
_SENS = {
    "okhema": 0.30, "janusopolis": 1.05, "kremnos": 1.55, "epiphany": 0.95,
    "styxias": 1.15, "aidonia": 1.35, "dolos": 1.20, "elysiae": 1.10,
    "twilight_eye": 1.25, "genesis_vortex": 0.0,
}

# 庇护系数（design）：奥赫玛庇护全境，越靠近中心越受荫。
_SHELTER = {
    "okhema": 1.0, "janusopolis": 0.60, "kremnos": 0.15, "epiphany": 0.55,
    "styxias": 0.45, "aidonia": 0.12, "dolos": 0.10, "elysiae": 0.55,
    "twilight_eye": 0.50, "genesis_vortex": 0.0,
}


@dataclass(slots=True)
class Beat:
    """一拍里发生的一件事。"""

    kind: str
    text_zh: str
    subject: str | None = None
    place: str | None = None
    severity: int = 1


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def advance(st: WorldState) -> list[Beat]:
    """推进一拍（一个时段），返回这段时间里发生的事。

    所有指标都用「向平衡点松弛」的写法，而不是单向累加。
    这样任何一项都不会退化成 0 或 1，世界也不会几拍就烧穿。
    """
    st.tick += 1
    rng = st.tick_rng()
    beats: list[Beat] = []
    moment = st.moment

    live_titans = [t for t in st.titans.values() if not t.taken]
    mean_imb = (sum(t.imbalance for t in live_titans) / len(live_titans)) if live_titans else 1.0

    # --- 1) 黑潮本体：趋近 0.985 的渐近线，越到后期越慢 ---
    pressure = 1.0 + st.entropy * 1.6 + mean_imb * 1.0 + (st.cycle - 1) * 0.12
    st.black_tide = _clamp(
        st.black_tide + 0.000045 * pressure * (0.985 - st.black_tide), 0.0, 0.985
    )

    # 潮涌：偶发的成段抬升，让历史有起伏而不是一条平滑曲线。
    if rng.random() < 0.005:
        surge = rng.uniform(0.0015, 0.008)
        st.black_tide = _clamp(st.black_tide + surge, 0.0, 0.985)
        beats.append(Beat(
            kind="黑潮",
            text_zh=f"黑潮在{moment.season_zh}的{_period_word(moment.period)}忽然抬升，"
                    f"这一拍多漫出 {surge * 100:.1f} 个百分点。",
            place="全境",
            severity=3,
        ))

    # --- 2) 城邦 ---
    for cid, city in st.cities.items():
        if cid == "genesis_vortex":
            continue
        if city.fallen:
            city.pop = max(0, int(city.pop * 0.9997))
            city.tide = _clamp(city.tide * 0.99995, 0.0, 1.15)
            continue

        sens = _SENS.get(cid, 1.0)
        shelter = _SHELTER.get(cid, 0.5)
        # 侵蚀的平衡点：黑潮越重、城越不设防，平衡点越高。
        tide_target = _clamp(st.black_tide * sens * (1.0 - shelter * 0.48), 0.0, 1.10)
        # 信仰与秩序能拖慢侵蚀，但拖不住趋势。
        resist = 1.0 - city.faith * 0.20 - city.order_v * 0.08
        city.tide = _clamp(
            city.tide + (tide_target - city.tide) * 0.0014 * max(0.45, resist), 0.0, 1.10
        )

        # 秩序与信仰也向各自的平衡点松弛，并留下限，避免归零。
        order_target = _clamp(1.0 - city.tide * 0.68 - (1 - city.faith) * 0.18, 0.06, 1.0)
        faith_target = _clamp(0.95 - city.tide * 0.52, 0.05, 1.0)
        city.order_v = _clamp(city.order_v + (order_target - city.order_v) * 0.0018, 0.0, 1.0)
        city.faith = _clamp(city.faith + (faith_target - city.faith) * 0.0012, 0.0, 1.0)

        if city.tide > 0.55:
            city.pop = int(city.pop * (1 - (city.tide - 0.55) * 0.00035))

        if city.tide > 0.97 and rng.random() < 0.0025:
            city.fallen = True
            beats.append(Beat(
                kind="失守",
                text_zh=f"{canon.CITY_BY_ID[cid]['zh']}{canon.CITY_BY_ID[cid]['fallen']}",
                subject=cid, place=cid, severity=5,
            ))
        city.mood = _city_mood(city)

    # --- 3) 泰坦：失衡缓慢累积。夺火之后安眠。 ---
    for tid, titan in st.titans.items():
        if titan.taken:
            titan.imbalance = _clamp(titan.imbalance * 0.995, 0.0, 1.0)
            titan.mood = "安眠"
            continue
        local = 0.0
        for pc in canon.cities_of_titan(tid):
            cs = st.cities.get(pc["id"])
            if cs:
                local = max(local, cs.tide)
        titan.imbalance = _clamp(
            titan.imbalance + 0.000026 + local * 0.000070 + st.black_tide * 0.000045,
            0.0, 1.0,
        )
        titan.mood = _titan_mood(titan.imbalance)

    # --- 4) 黄金裔逐火 ---
    beats.extend(_advance_scions(st, rng))

    # --- 5) 熵与方程式 ---
    # 熵缓慢上升；方程式向「已夺火种数」决定的平衡点松弛。
    # 12 枚归位后，目标值逼近临界，才会引发再创世。
    st.entropy = _clamp(st.entropy + 0.000008 + st.black_tide * 0.000012, 0.0, 1.0)
    eq_target = (min(st.sparks_taken, 12) / 12.0) * 0.97
    st.equation = _clamp(
        st.equation + (eq_target - st.equation) * 0.0009 + st.entropy * 0.000008,
        0.0, 1.0,
    )

    # --- 6) 时段专属的日常 ---
    beats.extend(_period_beats(st, rng, moment))

    return beats


def _period_word(period: int) -> str:
    return canon.PERIODS[period]["zh"]


def _advance_scions(st: WorldState, rng: random.Random) -> list[Beat]:
    beats: list[Beat] = []
    for scion in canon.SCIONS:
        ss = st.scions[scion["id"]]
        if not ss.alive:
            continue
        titan = _titan_by_spark(scion["spark"])
        if titan is None:
            # 第十三枚「创世」没有对应泰坦。它是德谬歌的废弃赋值，
            # 昔涟本人就是那枚火种——不从别人心口取，而是等自己成形。
            beats.extend(_advance_genesis(st, scion, ss, rng))
            continue
        ts = st.titans[titan["id"]]
        if ts.taken:
            if ss.state != "半神":
                ss.state = "半神"
                ss.progress = 1.0
            continue

        city = st.cities.get(scion["city"] or "")
        faith = city.faith if city else 0.55
        # 火种试炼：进展随「信仰 + 黑潮逼出的紧迫」上升，被泰坦的失衡拖住。
        resistance = 0.00016 * (1.0 + ts.imbalance * 1.4)
        drive = 0.00030 + faith * 0.00026 + st.black_tide * 0.00014 + rng.uniform(0.0, 0.00014)
        ss.progress = _clamp(ss.progress + drive - resistance)
        ss.burden = _clamp(ss.burden + 0.00010 + ts.imbalance * 0.00014)

        if ss.progress >= 1.0 and rng.random() < 0.025:
            ts.taken = True
            ts.imbalance = 0.0
            st.sparks_taken += 1
            ss.state = "半神"
            ss.progress = 1.0
            beats.append(Beat(
                kind="夺火",
                text_zh=(
                    f"「{scion['spark']}」火种归位。{scion['zh']}自"
                    f"{titan['zh']}的心口取出它，第 {st.sparks_taken} 枚。"
                ),
                subject=scion["id"], place=scion["city"], severity=5,
            ))
    return beats


def _advance_genesis(
    st: WorldState, scion: dict, ss: ScionState, rng: random.Random
) -> list[Beat]:
    """第十三枚火种：不是被夺来的，是被想起来的。

    官方设定里「创世」是废弃赋值，若无管理员介入则导向第十三枚因子。
    因此它的进度只在其余十二枚归位后才开始走——前面那一整轮演算，
    都是为了让这一枚成立。
    """
    if st.sparks_taken < 12:
        if ss.progress > 0.0:
            ss.progress = 0.0  # 十二枚未齐，它还不成立
        ss.state = "未成形"
        return []

    ss.state = "将成"
    for p in canon.PIPELINE:
        if st.equation * 100 >= p["progress"] - 1e-9:
            ss.state = "将成" if p["progress"] < 99 else "已成形"
    ss.progress = _clamp(st.equation)
    ss.burden = _clamp(ss.burden + 0.00008)

    # 方程式算尽的那一刻，第十三枚随之成立。
    if st.equation >= 0.92 and rng.random() < 0.02:
        ss.progress = 1.0
        ss.state = "半神"
        return [Beat(
            kind="夺火",
            text_zh=(
                f"「创世」火种成立了。它不是从谁的心口取出来的，"
                f"是{scion['zh']}想起来自己就是那一枚。"
            ),
            subject=scion["id"], place=scion["city"], severity=5,
        )]
    return []


_TITAN_OF_SPARK = {t["spark"]: t for t in canon.TITANS}


def _titan_by_spark(spark: str) -> dict | None:
    return _TITAN_OF_SPARK.get(spark)


# 按时段区分的日常。每个时段的活计不一样，这样时间轴不会一天重复五遍。
_PERIOD_AMBIENT: dict[int, dict[str, list[str]]] = {
    0: {  # 门扉时
        "okhema": ["云石市集支起第一排棚子，打水的人排到刻法勒广场边。", "有信徒在阶前祷告，祷词念到一半就忘了下一句。"],
        "kremnos": ["号角吹第一遍，兵营的铁门齐声拉开。", "新兵在悬锋巨剑下排队领刀，无人说话。"],
        "epiphany": ["树庭的抄写员借着晨光校对昨日的手稿，错字被刀片刮掉。"],
        "styxias": ["港口的潮水退到第三道石阶，渔人把网摊开晒。"],
        "janusopolis": ["朝圣者在拜谒步道上等开门，有人已经等了三天。"],
        "elysiae": ["风车先转起来，麦浪从远行渡口一路推到村口。"],
        "dolos": ["暗号换了，摊主互相使眼色确认。", "有人在侠盗榜前站了一夜，为了抢第一行。"],
        "twilight_eye": ["天象画壁上浮出一层薄雾，晖之民说今天不适合起飞。"],
        "aidonia": ["钟楼敲第一组钟，雪地上没有脚印。"],
    },
    1: {  # 明晰时
        "okhema": ["云石天宫的辩论从浴池里开始，一直吵到流憩大厅。", "半神议院开前庭会，元老们把同一句话说了三种说法。"],
        "epiphany": ["启蒙王座下面有人在推演一个无解的式子，粉笔断了三次。", "友爱之馆里两派学徒为一句注释吵到午间。"],
        "janusopolis": ["预言书库录下今日的仪式，抄本第七行留白。"],
        "kremnos": ["操演场上刀盾相击，教习只说了一个字：轻。"],
        "twilight_eye": ["雨之民在关塞悬廊试雷，回声闷在骨械里。"],
        "styxias": ["涌泉歌庭的乐声渐高，有人开始在池边睡去。"],
        "aidonia": ["祭司抄写亡者名录，笔尖结了薄冰。"],
        "dolos": ["黑市最热闹的时候，没人承认自己来买东西。"],
        "elysiae": ["孩子在迷路迷境的树洞口放了一小把麦子。"],
    },
    2: {  # 践行时
        "okhema": ["哈托努斯铁匠铺的火升到最旺，锤声盖过了市集的叫卖。", "黎明池换水，热气把整条廊道糊成一片白。"],
        "kremnos": ["战士在城墙上练投矛，落点比昨日远了半步。", "祭典场在搭台子，木料是从旧王宫拆下来的。"],
        "epiphany": ["学徒被赶去照料奇兽，回来时袖口全是绒毛。", "药圃的花开了，莲食学派记下第一笔花期。"],
        "styxias": ["有人在莹骨海床上唱歌，声音顺着海流散得很远。", "眠宫长廊的落地窗全开，风把酒香推出去。"],
        "aidonia": ["雪停了一阵，又下起来。", "渡口的船没有来，摆渡人也不在。"],
        "janusopolis": ["门径终处传来一声轻响，像有门被推开又关上。"],
        "dolos": ["有人把一袋利衡币倒进河里，说这样更容易数。"],
        "twilight_eye": ["晖、雨、冬三族在关塞垂井口对峙，谁也没先动。"],
        "elysiae": ["祝祭庭院里有人在听欧洛尼斯的低语，什么也没听见。"],
    },
    3: {  # 离愁时
        "okhema": ["离怀之路又聚了些要走的人，守卫照例不拦。", "云石餐厅把最后一锅汤分完，厨子自己没吃上。"],
        "kremnos": ["一支小队在此时出城，没让家属送到门口。"],
        "styxias": ["宴都城关的乐声慢下来，宾客开始互相道别又都不肯走。"],
        "epiphany": ["树庭的灯还亮着，有人在抄最后一页。"],
        "dolos": ["暗号巷里换第二批人，第一批揣着钱离开了。"],
        "janusopolis": ["朝圣者里有人决定留下，把行囊放在阶上。"],
        "aidonia": ["钟楼敲晚间钟，数到十一就停了。"],
        "twilight_eye": ["飞空艇陆续归巢，虹霓尽处的光暗下去。"],
        "elysiae": ["远行渡口的栈桥上有人站了很久，最后没有上船。"],
    },
    4: {  # 幕匿时
        "okhema": ["万帷网的低鸣变轻，传信石版只剩零星几块还亮着。", "黎明机器把影子拉得很短，街上看不见人。"],
        "kremnos": ["城头只剩下哨，火盆里添了最后一次柴。"],
        "epiphany": ["有人偷偷爬上献身拱心，被金蝶挡了回来。"],
        "styxias": ["池水凉了，最后一个客人在池边睡着。"],
        "dolos": ["贼星划过，赌徒们抬头看了一眼，继续押注。"],
        "aidonia": ["雪把钟声吞了大半，只余闷响。"],
        "janusopolis": ["命运宸扉自己开了一条缝，又合上。"],
        "twilight_eye": ["关塞颅顶上有人守着天幕，替所有人睁着眼。"],
        "elysiae": ["迷路迷境的灯亮起来，只有孩子看得见。"],
    },
}

_OMENS = [
    "晨昏之眼在天顶睁开了一线，这一段的白日比往常长出半刻。",
    "夜里的星辰错了一格位置。观星者记下来，又划掉了。",
    "有人听见大门在远处开合，但这一段并没有人进出。",
    "海面浮起一层金粉，捞起来是盐。",
    "一整片林子在同一时刻转向了同一个方向。",
    "贼星发了红光。老人说这是红月将至的征兆，计划会受挫。",
    "传信石版同时收到一条空讯息，发件人不存在。",
]


def _period_beats(st: WorldState, rng: random.Random, m: cal.Moment) -> list[Beat]:
    beats: list[Beat] = []
    # 每个时段固定一件日常，偶尔两件。
    picks = 1 + (1 if rng.random() < 0.22 else 0)
    living = [c for c in st.cities.values() if not c.fallen and c.id != "genesis_vortex"]
    pool_for_period = _PERIOD_AMBIENT.get(m.period, {})

    for _ in range(picks):
        if not living:
            break
        city = rng.choice(living)
        pool = pool_for_period.get(city.id)
        if not pool:
            continue
        beats.append(Beat(kind="日常", text_zh=rng.choice(pool), place=city.id, severity=1))

    # 异象
    if rng.random() < 0.020:
        beats.append(Beat(kind="异象", text_zh=rng.choice(_OMENS), place="全境", severity=2))

    # 休息日：每周第七天，全城停工。
    if m.is_rest_day and m.period == 0:
        beats.append(Beat(
            kind="历法",
            text_zh="今日是本周第七日，休息日。刻法勒将这日定为欧洛尼斯昏睡之时，市集不开，学堂停讲。",
            place="全境", severity=1,
        ))

    # 月首与季首
    if m.day == 1 and m.period == 0:
        mi = m.month_info
        beats.append(Beat(
            kind="历法",
            text_zh=f"{mi['zh']}到了。{mi['meaning']}",
            place="全境", severity=2,
        ))

    # 红月闰日
    if m.is_red_moon_month and m.period == 0:
        beats.append(Beat(
            kind="历法",
            text_zh="机缘月多出了幽灵般的一日。这一年是「红月」——赌徒与窃贼把它当作自己的幸运日，暗杀与阴谋往往随之而来。",
            place="dolos", severity=3,
        ))

    return beats


_MOOD_RULES = ((0.85, "崩解"), (0.65, "惶惶"), (0.45, "戒备"), (0.25, "不安"), (0.10, "如常"))


def _city_mood(city: CityState) -> str:
    stress = city.tide * 0.7 + (1 - city.order_v) * 0.4 + (1 - city.faith) * 0.3
    for threshold, label in _MOOD_RULES:
        if stress >= threshold:
            return label
    return "安宁"


_TITAN_MOOD = ((0.80, "狂乱"), (0.60, "震怒"), (0.40, "不宁"), (0.20, "辗转"), (0.05, "低语"))


def _titan_mood(imbalance: float) -> str:
    for threshold, label in _TITAN_MOOD:
        if imbalance >= threshold:
            return label
    return "沉睡"


def should_recreate(st: WorldState) -> bool:
    """再创世条件：十二枚火种集齐，且方程式算到临界。

    第十三枚「创世」不参与判定——它本就是被这一轮演算催生出来的东西，
    而且官方设定里它导向的是「开拓」，不是「毁灭」的证伪。
    """
    return st.sparks_taken >= 12 and st.equation >= 0.92


def retide_for_cycle(st: WorldState) -> None:
    """一次再创世之后的世界重置。火种归零，城邦从废墟重立。"""
    st.cycle += 1
    st.black_tide = 0.02
    st.entropy = _clamp(0.10 + st.cycle * 0.01)
    st.sparks_taken = 0
    for city in st.cities.values():
        city.tide = _INIT_TIDE.get(city.id, 0.03)
        city.order_v = _INIT_ORDER.get(city.id, 0.72)
        city.faith = _INIT_FAITH.get(city.id, 0.75)
        city.fallen = False
        city.pop = _INIT_POP.get(city.id, 50_000)
        city.mood = "如常"
    for titan in st.titans.values():
        titan.taken = False
        titan.imbalance = 0.0
        titan.mood = "沉睡"
    for scion in st.scions.values():
        scion.state = "在途"
        scion.progress = 0.0
        scion.burden = 0.0
        scion.thought = ""
