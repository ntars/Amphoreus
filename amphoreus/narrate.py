"""叙事层：把结构化事件写成「如我所书」体的文本。

分工：
- 规则引擎（sim）决定「发生了什么」，本模块只决定「怎么讲」。
- 调不动模型就降级成模板文本，模拟绝不因此中断。

文风依据（不是自创）：
- 机器档案体：δ-me13.exe / 管理员批注.wav 里的 【指令】【结论】【管理员无应答】 句式。
- 英雄体：逐火者的命路.exe 的四行长句，庄重、带隐喻，句尾常落在「——」或一个意象上。
- 著者批注：昔涟的口吻，带♪，用人话点一句机器说不出的东西。
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Iterable

from . import canon
from .log import log


# ---------------------------------------------------------------------------
# 模型可用性探测与调用
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class NarratorConfig:
    enabled: bool = True
    endpoint: str = "http://127.0.0.1:11434"
    model: str = "qwen3.5:4b"
    timeout: float = 120.0
    max_per_day: int = 2
    think: bool = False


class Narrator:
    def __init__(self, cfg: NarratorConfig) -> None:
        self.cfg = cfg
        self._alive: bool | None = None
        # 本机请求必须绕开系统代理。开着 VPN/代理时，urllib 默认会把
        # 127.0.0.1:11434 也塞进代理，换来一个 404 —— 这是实测踩到的坑。
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    # -- 探测 -----------------------------------------------------------
    def probe(self) -> bool:
        if not self.cfg.enabled:
            self._alive = False
            return False
        try:
            req = urllib.request.Request(f"{self.cfg.endpoint}/api/tags")
            with self._opener.open(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            names = {m.get("name", "") for m in data.get("models", [])}
            self._alive = self.cfg.model in names
            if not self._alive:
                log.warn(
                    "narrator model missing",
                    "叙事模型不在本地列表里，将降级为模板文本",
                    want=self.cfg.model,
                    have=",".join(sorted(names)) or "-",
                )
            else:
                log.info("narrator ready", "叙事模型已就绪", model=self.cfg.model)
            return self._alive
        except (urllib.error.URLError, OSError, ValueError) as exc:
            self._alive = False
            log.warn("narrator offline", "连不上本地模型，先降级为模板文本", err=str(exc)[:120])
            return False

    @property
    def alive(self) -> bool:
        return bool(self._alive)

    # -- 生成 -----------------------------------------------------------
    def generate(self, prompt: str, max_tokens: int = 320, temperature: float = 0.9) -> str | None:
        """生成一段叙事。不合格时带着纠正提示重试一次，仍不合格才放弃。"""
        if not self._alive:
            return None
        text = self._once(prompt, max_tokens, temperature)
        if text is None:
            return None
        if text:
            return text
        # text == "" 表示格式不合格。带上一句具体纠正，再给模型一次机会。
        retry = f"{prompt}\n\n上一次的写法不合格。请重写，务必做到：{self._last_reason}。"
        text = self._once(retry, max_tokens, min(temperature, 0.75))
        if text:
            return text
        log.warn("narrate gave up", "两次都不合格，改用模板", reason=self._last_reason)
        return None

    _last_reason: str = ""

    def _once(self, prompt: str, max_tokens: int, temperature: float) -> str | None:
        """单次请求。返回文本表示通过，返回 "" 表示格式不合格，返回 None 表示调用失败。"""
        payload = {
            "model": self.cfg.model,
            "prompt": prompt,
            "stream": False,
            "think": self.cfg.think,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
                "top_p": 0.92,
                "repeat_penalty": 1.12,
                "stop": ["\n\n\n", "【完】"],
            },
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{self.cfg.endpoint}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with self._opener.open(req, timeout=self.cfg.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError) as exc:
            log.warn("narrate failed", "叙事生成失败，改用模板", err=str(exc)[:140])
            return None
        cleaned = _clean((data.get("response") or "").strip())
        if not cleaned:
            self._last_reason = "正文为空"
            return ""
        ok, why = _looks_valid(cleaned)
        if not ok:
            self._last_reason = why
            log.warn("narrate rejected", "叙事草稿不合格", reason=why, chars=len(cleaned))
            return ""
        if why:
            # 只是收尾不干净，补一个句号就够
            cleaned = cleaned.rstrip("，、；：") + "。"
        return cleaned


def _clean(text: str) -> str:
    """去掉模型常见的赘余：标题、引号包裹、自述、markdown 星号。"""
    text = text.strip()
    # 去掉整段被包在引号里的情况（开引号 → 闭引号的正确配对）
    pairs = {'"': '"', "'": "'", "「": "」", "“": "”", "『": "』"}
    for opener, closer in pairs.items():
        if len(text) > 1 and text.startswith(opener) and text.endswith(closer):
            text = text[1:-1].strip()
            break
    # 去掉开头的自我叙述
    text = re.sub(r"^(好的|当然|明白)[，,。！!].{0,20}?[：:]\s*", "", text)
    # 去掉 markdown 强调符号与残留的标题标记
    text = text.replace("**", "").replace("##", "")
    text = re.sub(r"^\s*#+\s*", "", text)
    # 折叠多余空行
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# 提示词
# ---------------------------------------------------------------------------
_BASE_STYLE = """你在为《如我所书·翁法罗斯》代笔。这是游戏《崩坏：星穹铁道》里那本记录翁法罗斯的书。

严格的文体要求：
1. 全中文。第三人称。不用「我」「你」称呼读者。
2. 句子偏长、庄重，多用逗号分层，句尾常落在一个意象上。像碑文，也像史官的笔。
3. 每句话都必须以句号、逗号或破折号收尾，不许出现一逗到底、通篇无标点的长串。
4. 不解释设定的来龙去脉，只写当下发生的事和它留下的痕迹。
5. 不要写「在这个世界里」「玩家」「任务」这类出戏的词。
6. 不要出现英文、阿拉伯数字和 emoji。数字一律用汉字。
7. 绝对不要把百分比、进度、负荷、计数、参数这类演算内部读数写进正文。
   它们是算出来的，不是那个世界里的人会说的话。只能写成可感的处境。
8. 时间只用给你的那个说法，不要自己改写、不要重复。
9. 不许发明新的地名、人名、组织名、器物名。只能用上面给你的，以及原本就有的。
   可以写光、尘、风、声音、手上的痕，这些不需要名字。
10. 只输出正文，不写标题、不加引号、不写任何说明。控制在 120 到 220 字。
"""

_PLACE_STYLE = """写一段「地方志」式的段落：先写这个地方此刻的样子，再写这里的人此刻在做什么，最后落一笔不变的东西（比如某盏灯、某句话、某块碑）。
"""

_EVENT_STYLE = """写一段「编年史」式的段落：写清发生了什么，谁在场，事后留下了什么。
"""

# 卷册专用：短提示 + 两个完整示范。
#
# 这条是实测换来的。原来给 _BASE_STYLE 那十条规则，再叠标题、卷名、时间、
# 黑潮、三条事实、一段示范，提示词近九百字。qwen3.5:4b 直接执行不了，
# 连试三次都把 36~46 个汉字堆成一句、一个标点不留，成功率 0/3。
# 换成下面这套（少了六条规则、多了第二个示范），同样是这个模型，3/3 通过，
# 最长句 10~11 字，正好落在官方原文的句长区间（官方最长 17 字）。
# 小模型对「示范」的服从度远高于对「规则」的服从度。
_CHAPTER_STYLE = """你在为《如我所书》代笔。这本书用史官的笔法记翁法罗斯。
铁律：
每句不超过二十字，句末用句号。全用汉字，不写阿拉伯数字。
只写正文，不写标题，不解释设定，不写百分比或进度。
不要出现「玩家」「任务」这类词。

示范一：
光历四千九百三十年，黑潮又近了一里。城中无人提起此事。只有守门人换了更早的班。他说风里有咸味。

示范二：
火种离开了泰坦的心口。取火的人手上多了一道金痕。那道痕不会褪。它比誓言留得久。
"""

# 阿拉伯数字与演算内部读数的拦截规则。实测这两个是模型最容易犯的。
_ARABIC = re.compile(r"[0-9０-９]")
_META_WORDS = re.compile(
    r"(进度|百分比|百分之|负荷|数值|参数|指数|概率|阈值|完成度|计数|占比|%|％)"
)
_END_PUNCT = "。！？…—」』"


def _looks_valid(text: str) -> tuple[bool, str]:
    """对生成结果做硬校验，不合格就降级到模板。返回 (是否合格, 原因)。"""
    body = text.replace("\n", "").strip()
    # 下限 50 字：短提示词下模型给出的合格卷册约 66~87 字，
    # 原先的 60 会把正例卡在边界。
    if len(body) < 50:
        return False, "过短"
    if len(body) > 320:
        return False, "过长"
    if _ARABIC.search(body):
        return False, "含阿拉伯数字"
    if _META_WORDS.search(body):
        return False, "泄漏演算读数"
    if re.search(r"[A-Za-z]{3,}", body):
        return False, "含英文"
    # 病句的判据是「最长一段没有标点的连续汉字」，不是整体比例。
    # 整体比例会被长段落稀释，抓不住一逗到底的开头。
    # 实测合格段落的最长连续汉字在 20 字上下，取 32 留出庄重长句的余量。
    runs = re.findall(r"[\u4e00-\u9fff]+", body)
    if runs and max(len(r) for r in runs) > 32:
        return False, "一逗到底"
    if not any(body.endswith(p) or body[-1] in _END_PUNCT for p in _END_PUNCT):
        # 结尾没有收束，补一个句号总比留着半句好
        return True, "结尾缺句号"
    return True, ""


_DIGITS = "〇一二三四五六七八九"


def _zh_number(n: int) -> str:
    """把年份这类整数写成汉字，避免正文里出现阿拉伯数字。"""
    return zh_number(n)


def zh_number(n: int) -> str:
    """整数转汉字。供 engine 等模块复用，不以下划线开头。"""
    if n < 0:
        return str(n)
    if n < 10:
        return _DIGITS[n]
    if n < 20:
        return "十" + (_DIGITS[n % 10] if n % 10 else "")
    if n < 100:
        return _DIGITS[n // 10] + "十" + (_DIGITS[n % 10] if n % 10 else "")
    if n < 1000:
        head = _DIGITS[n // 100] + "百"
        rest = n % 100
        if not rest:
            return head
        if rest < 10:
            return head + "零" + _DIGITS[rest]
        return head + _zh_number(rest)
    if n < 10000:
        head = _DIGITS[n // 1000] + "千"
        rest = n % 1000
        if not rest:
            return head
        if rest < 100:
            return head + "零" + _zh_number(rest)
        return head + _zh_number(rest)
    return str(n)


def _localize_digits(text: str) -> str:
    """把时间串里的数字换成汉字，并收掉数字与汉字之间的空格。

    「光历 4931 年 门关月 1 日 · 门扉时初刻」
    →「光历四千九百三十一年门关月一日 · 门扉时初刻」
    中文年月日之间不加空格，否则正文里会留下「五 日」这种空隙。
    """
    text = re.sub(r"\d+", lambda m: _zh_number(int(m.group())), text)
    text = text.replace(" · ", "·")
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.replace("·", " · ")


def _time_line(moment_zh: str) -> str:
    return f"时间是{_localize_digits(moment_zh)}。"


def _degree(v: float, low: str, mid: str, high: str) -> str:
    """把 0–1 的读数翻成可感的处境，绝不把数字交给模型。"""
    if v < 0.34:
        return low
    if v < 0.67:
        return mid
    return high


def place_prompt(city_id: str, moment_zh: str, tide: float, mood: str, notes: Iterable[str]) -> str:
    city = canon.CITY_BY_ID.get(city_id)
    if not city:
        return ""
    name = city["zh"]
    state = city["fallen"] if tide > 0.75 else city["flourish"]
    note_block = "；".join(list(notes)[:4])
    return (
        f"{_BASE_STYLE}\n{_PLACE_STYLE}\n"
        f"要写的地方：{name}（{city['epithet']}）。\n"
        f"此刻的称呼是{state}\n"
        f"{city['blurb']}\n"
        f"{_time_line(moment_zh)}城中气象是「{mood}」。\n"
        f"可以借用这些细节：{note_block}\n"
        f"请直接写正文。"
    )


def event_prompt(moment_zh: str, kind: str, text_zh: str, place: str | None, subject: str | None) -> str:
    who = ""
    if subject:
        scion = canon.SCION_BY_ID.get(subject)
        if scion:
            who = f"\n涉及的人物：{scion['zh']}（{scion['epithet']}，逐猎「{scion['spark']}」火种）。"
        else:
            who = f"\n涉及的对象：{canon.CITY_BY_ID.get(subject, {}).get('zh', subject)}。"
    where = ""
    if place and place in canon.CITY_BY_ID:
        where = f"\n发生地点：{canon.CITY_BY_ID[place]['zh']}。"
    return (
        f"{_BASE_STYLE}\n{_EVENT_STYLE}\n"
        f"{_time_line(moment_zh)}{who}{where}\n"
        f"事实：{text_zh}\n"
        f"请直接写正文。"
    )


def chapter_prompt(
    moment_zh: str, chapter: int, section: int, chapter_zh: str,
    facts: Iterable[str], tide: float, sparks: int,
    section_name: str = "", scion: dict | None = None,
) -> str:
    """卷册一节的提示词。

    刻意写得短。同一件事用长提示词做过三次全失败，短提示词三次全过。
    判据和过程写在 _CHAPTER_STYLE 上方。
    """
    fact_block = "".join(f"- {f}\n" for f in list(facts)[:3])
    tide_word = _degree(tide, "尚在低洼里积着", "已漫过城墙的一半", "几乎触到城中最高的塔")
    who = f"这一节写{scion['zh']}。" if scion else ""
    sec = section_name or f"第{zh_number(section)}节"
    return (
        f"{_CHAPTER_STYLE}\n"
        f"现在写《{chapter_zh}》里的《{sec}》。\n"
        f"{who}{_time_line(moment_zh)}黑潮{tide_word}，十二火种只余{_spark_word(sparks)}。\n"
        f"要记三件事：\n{fact_block}"
        f"照上面两个示范的句长写，四到六句。直接写正文。"
    )


def epigraph_prompt(spark: str) -> str:
    """给每一卷写一句题记（对应官方「汝将……」的神谕句式）。"""
    s = canon.SCION_BY_SPARK.get(spark)
    if not s:
        return ""
    return (
        "用《崩坏：星穹铁道》翁法罗斯的神谕口吻，写一句预言。"
        f"对象是{s['zh']}，她逐猎「{s['spark']}」火种，命途「{s['path']}」，原动力「{s['drive']}」。\n"
        "句式仿照「汝将……」，一句即可，不超过 30 字，不带引号，不加解释。"
    )


# ---------------------------------------------------------------------------
# 降级模板：模型不可用时的兜底，也要能读
# ---------------------------------------------------------------------------
_FALLBACK_PLACE = {
    "fallen": "{name}已经没有可守的东西了。{state}风从断墙过去，带起一点灰，落在原来摆摊的位置上。",
    "default": "{name}的{period}照旧开始。{state}有人在做事，有人只是站着，看着同一片天色变了一点。",
}

_FALLBACK_EVENT = {
    "黑潮": "黑潮又往前挪了一寸。没有人看见它挪，只是回过头时，地上的线比昨日近了些。",
    "失守": "{name}的城门自内里坍下。最后一面旗没有倒，是被吞掉的。",
    "夺火": "火种离开泰坦的心口时，没有声音。只有取出它的人，手指上多了一道洗不掉的金痕。",
    "日常": "{text}",
    "异象": "{text}",
    "历法": "{text}",
}

_FALLBACK_PERSON = "{name}还差一点。{state}那点差距说不清是力气还是别的什么，只是每天都在那里。"

# canon 里 flourish / fallen 的格式是「名号」：解释。叙事里只用名号，整句塞进去会重影。
_STATE_NAME = re.compile(r"「([^」]+)」")


def _state_phrase(raw: str) -> str:
    """把「「纷争荒墟」：……的整句」压成一个带句号的短句。"""
    m = _STATE_NAME.search(raw or "")
    if m:
        return f"如今的名字是{m.group(1)}。"
    return (raw or "").rstrip("。") + "。" if raw else ""


def fallback_event(kind: str, text_zh: str, place: str | None) -> str:
    tpl = _FALLBACK_EVENT.get(kind)
    if kind == "失守" and place:
        name = canon.CITY_BY_ID.get(place, {}).get("zh", "")
        return tpl.format(name=name) if tpl else text_zh
    if tpl and "{" in tpl:
        return tpl.format(text=text_zh)
    return tpl or text_zh


def fallback_place(city_id: str, period_zh: str, tide: float) -> str:
    city = canon.CITY_BY_ID.get(city_id)
    if not city:
        return ""
    name = city["zh"]
    if tide > 0.75:
        return _FALLBACK_PLACE["fallen"].format(name=name, state=_state_phrase(city["fallen"]))
    return _FALLBACK_PLACE["default"].format(
        name=name, period=period_zh, state=_state_phrase(city["flourish"])
    )


def _spark_word(n: int) -> str:
    """火种计数的读法。零枚读作「一枚未归」，比「〇枚」自然。"""
    if n <= 0:
        return "一枚未得"
    if n >= 12:
        return "十二枚，齐了"
    return f"{zh_number(n)}枚"


def fallback_chapter(
    moment_zh: str, chapter_zh: str, section: int, facts: Iterable[str],
    tide: float, sparks: int, recreate: bool = False, section_name: str = "",
) -> str:
    """卷册的兜底文本。不是地方志，而是「史官按日摘记」的笔法。"""
    items = [str(f).strip("。") for f in list(facts)[:4] if str(f).strip()]
    body = "。".join(items) + "。" if items else "这一节无事可记。"
    head = (
        f"{_localize_digits(moment_zh)}，黑潮"
        f"{'已到城中最高的塔下' if tide > 0.8 else '仍在往前' if tide > 0.5 else '尚在高处'}，"
        f"十二火种已归位{_spark_word(sparks)}。"
    )
    if recreate:
        return head + "旧的账已经算完了。这一页起，谁也不记得上一页写过什么。"
    title = f"《{chapter_zh}》第{zh_number(section)}节"
    if section_name:
        title += f"《{section_name}》"
    return (
        f"{head}{body}"
        f"记在{title}的名下。"
        f"写过的事不会再改，没写的事也不必补。"
    )
