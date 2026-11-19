"""光历：官方历法的实现。

官方规则（来源：翁法罗斯 wiki「历法」，转录自游戏文本与道具《翁法罗斯的历法》）：
- 纪年为「光历」，主线时间为光历 4931 年。
- 每月四周、每周七天，即每月 28 天。
- 十二月各有名，分属四季（命运季 / 支柱季 / 创生季 / 灾厄季），每月对应一位泰坦。
- 第十二月「机缘月」可能多出幽灵般的一日「闰日」：有则称「红月」，无则称「金月」。
- 一天分五个时段（门扉时 / 明晰时 / 践行时 / 离愁时 / 幕匿时），每时段再分五「刻」。

实现方式：
不把「天数」当作唯一真源，而是把 (年, 月, 日, 时段, 刻) 当作真源，
对外提供 tick 计数换算。这样红月闰日可以按世界种子确定性地插入，
而不会让「第 N 天」与「某年某月某日」对不上。
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from functools import lru_cache

from .. import canon

DAYS_PER_WEEK = 7
WEEKS_PER_MONTH = 4
DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH  # 28
MONTHS_PER_YEAR = 12
BASE_DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR  # 336
PERIODS_PER_DAY = len(canon.PERIODS)  # 5
TICKS_PER_DAY = PERIODS_PER_DAY  # 一个 tick = 一个时段

# 主线开始时为光历 4931 年。世界从这一年的门关月一日、门扉时初刻开始演算。
START_YEAR = 4931
START_MONTH = 1
START_DAY = 1


def is_red_moon(year: int, seed: int) -> bool:
    """机缘月是否多出闰日（红月）。由年份与种子确定，同一年永远同一结果。"""
    return random.Random(seed * 7_919 + year * 104_729).random() < 0.33


def days_in_year(year: int, seed: int) -> int:
    return BASE_DAYS_PER_YEAR + (1 if is_red_moon(year, seed) else 0)


def days_in_month(year: int, month: int, seed: int) -> int:
    if month == MONTHS_PER_YEAR:
        return DAYS_PER_MONTH + (1 if is_red_moon(year, seed) else 0)
    return DAYS_PER_MONTH


@dataclass(frozen=True, slots=True)
class Moment:
    """一个具体时刻。"""

    year: int
    month: int
    day: int          # 月内第几天，1 起
    period: int       # 0..4，对应 canon.PERIODS 下标
    ke: int           # 0..4，第几刻，0 为「初刻」
    tick: int         # 自演算起点起的时段总数

    # -- 展示 -----------------------------------------------------------
    @property
    def month_info(self) -> dict:
        return canon.MONTH_BY_IDX[self.month]

    @property
    def period_info(self) -> dict:
        return canon.PERIODS[self.period]

    @property
    def weekday(self) -> int:
        """周内第几天，1 起，7 为周日（休息日）。"""
        return (self.day - 1) % DAYS_PER_WEEK + 1

    @property
    def weekday_zh(self) -> str:
        names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
        # day=1 视为周一，与「第七天为休息日」对应
        return names[self.weekday % 7]

    @property
    def is_rest_day(self) -> bool:
        return self.weekday == DAYS_PER_WEEK

    @property
    def is_red_moon_month(self) -> bool:
        return self.month == MONTHS_PER_YEAR and self.day > DAYS_PER_MONTH

    @property
    def date_zh(self) -> str:
        return f"光历 {self.year} 年 {self.month_info['zh']} {self.day} 日"

    @property
    def time_zh(self) -> str:
        ke = "初刻" if self.ke == 0 else f"{['一', '二', '三', '四'][self.ke - 1]}刻"
        return f"{self.period_info['zh']}{ke}"

    @property
    def full_zh(self) -> str:
        return f"{self.date_zh} · {self.time_zh}"

    @property
    def season_zh(self) -> str:
        return self.month_info["season"]

    def to_dict(self) -> dict:
        return {
            "year": self.year,
            "month": self.month,
            "day": self.day,
            "period": self.period,
            "ke": self.ke,
            "tick": self.tick,
            "date_zh": self.date_zh,
            "time_zh": self.time_zh,
            "full_zh": self.full_zh,
            "month_zh": self.month_info["zh"],
            "month_titan": self.month_info["titan"],
            "season_zh": self.season_zh,
            "weekday_zh": self.weekday_zh,
            "is_rest_day": self.is_rest_day,
            "is_red_moon": self.is_red_moon_month,
        }


def _year_lengths(seed: int, upto_index: int) -> list[int]:
    """缓存每年的天数，用于 tick → 日历的反解。"""
    return [days_in_year(START_YEAR + i, seed) for i in range(upto_index + 1)]


@lru_cache(maxsize=64)
def _cumulative(seed: int, n_years: int) -> tuple[int, ...]:
    """前 n 年的累积天数（不含第 n 年）。"""
    acc = [0]
    total = 0
    for i in range(n_years):
        total += days_in_year(START_YEAR + i, seed)
        acc.append(total)
    return tuple(acc)


def from_tick(tick: int, seed: int) -> Moment:
    """把时段序号换算成具体时刻。"""
    tick = max(0, int(tick))
    day_index, period = divmod(tick, TICKS_PER_DAY)
    ke = 0  # 一个 tick 就是一个时段；「刻」是时段内部的细分，演算不细到这一层

    # 找到落在哪一年。先按需扩展累积表，避免演算跑过 400 年后静默错位。
    years = 400
    acc = _cumulative(seed, years)
    while day_index >= acc[-1]:
        years *= 2
        _cumulative.cache_clear()
        acc = _cumulative(seed, years)
    year_offset = 0
    while year_offset + 1 < len(acc) and day_index >= acc[year_offset + 1]:
        year_offset += 1
    year = START_YEAR + year_offset
    rest = day_index - acc[year_offset]

    month = 1
    while month <= MONTHS_PER_YEAR:
        dm = days_in_month(year, month, seed)
        if rest < dm:
            break
        rest -= dm
        month += 1
    if month > MONTHS_PER_YEAR:
        month = MONTHS_PER_YEAR
        rest = days_in_month(year, month, seed) - 1

    return Moment(year=year, month=month, day=rest + 1, period=period, ke=ke, tick=tick)


def ticks_per_year(year: int, seed: int) -> int:
    return days_in_year(year, seed) * TICKS_PER_DAY


def describe_rules() -> list[str]:
    """给界面用的历法说明，全部有官方出处。"""
    return [
        f"每月 {WEEKS_PER_MONTH} 周、每周 {DAYS_PER_WEEK} 天，故每月 {DAYS_PER_MONTH} 天；第七天为休息日。",
        f"一年 {MONTHS_PER_YEAR} 月，共 {BASE_DAYS_PER_YEAR} 天；机缘月若多出闰日，则为「红月」，全年 {BASE_DAYS_PER_YEAR + 1} 天。",
        f"一天分 {PERIODS_PER_DAY} 个时段，每时段五刻。本演算以一个时段为一拍。",
        "纪年为光历。星穹列车抵达时为光历 4931 年。",
    ]
