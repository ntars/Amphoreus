"""翁法罗斯世界观单一真源（v2，依据官方原文重写）。

数据来源与复核线索见每条的 source 字段，汇总在 SOURCES。
可信度标注：
    canon   官方原文：游戏内文本、官方 PV/社媒、官方 wiki 转录的游戏文本。
    wiki    社区考据（米游社 / 萌娘百科），官方未直述但有多处旁证。
    design  本作为了能演算而设计的数值与地理，不属于官方设定。

上一版（未发布）的错误已修正：
    1. 历法改为官方的光历 + 每月四周七天 + 十二月名 + 五时段。
    2. 纪元改为 造物世/黄金世/纷争世/幻灭世/再创世。
    3. 万敌真名迈德漠斯 Mydeimos；白厄真名卡厄斯兰那 NeiKos496。
    4. 十二因子的原动力与模拟命途改为 canon（δ-me13.exe 原文）。
    5. 第十三位改为德谬歌（创世 / 爱 / 开拓），而非「真我」。
    6. 黑潮改为「毁灭方程式的视觉乱码」，而非独立天灾。
"""

from __future__ import annotations

from typing import Final

# ---------------------------------------------------------------------------
# 十三火种 / 十三路径
# 前十二枚对应十二泰坦；第十三「创世」为德谬歌的赋值，模拟命途为「开拓」。
# source: 3.7《如我所书》终章赠言 + δ-me13.exe「异常记录·德谬歌」
# ---------------------------------------------------------------------------
SPARKS: Final[dict[str, dict]] = {
    "负世": {"en": "Worldbearing", "blessing": "定将永誌不忘", "order": 7},
    "门径": {"en": "Gateways", "blessing": "为你指引前路", "order": 1},
    "律法": {"en": "Law", "blessing": "踏碎不公", "order": 2},
    "岁月": {"en": "Time", "blessing": "会铭记旅途", "order": 3},
    "大地": {"en": "Earth", "blessing": "护卫你我前行", "order": 4},
    "海洋": {"en": "Ocean", "blessing": "将为你起舞", "order": 5},
    "天空": {"en": "Sky", "blessing": "为你洒落晨曦", "order": 6},
    "浪漫": {"en": "Romance", "blessing": "相伴你的前程", "order": 9},
    "理性": {"en": "Reason", "blessing": "赐予你启蒙", "order": 8},
    "纷争": {"en": "Strife", "blessing": "给予你鼓舞", "order": 10},
    "死亡": {"en": "Death", "blessing": "呵护你的灵魂", "order": 11},
    "诡计": {"en": "Cunning", "blessing": "保你万无一失", "order": 12},
    "创世": {
        "en": "Genesis",
        "blessing": "愿故事的结局，如我们所述",
        "order": 13,
        "note": "德谬歌的赋值。若无管理员介入，该赋值导向第十三枚因子：路径「创世」、原动力「爱」、模拟命途「开拓」。",
    },
}

# ---------------------------------------------------------------------------
# 十二泰坦 · 四组
# source: 官方世界观 PV《论泰坦与地上万邦》考据 + 翁法罗斯 wiki「泰坦」章节
# ---------------------------------------------------------------------------
TITANS: Final[list[dict]] = [
    {
        "id": "janus",
        "zh": "雅努斯",
        "en": "Janus",
        "title_zh": "万径之门",
        "title_en": "Gate of Infinity",
        "group": "命运",
        "spark": "门径",
        "domains": ["门径", "道路", "预言", "隔绝", "监禁"],
        "form": "双面神明",
        "city": "janusopolis",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 命运三泰坦",
    },
    {
        "id": "talanton",
        "zh": "塔兰顿",
        "en": "Talanton",
        "title_zh": "公正之秤",
        "title_en": "Scale of Justice",
        "group": "命运",
        "spark": "律法",
        "domains": ["律法", "公正", "均衡", "法则"],
        "form": "无形支柱",
        "city": "okhema",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 命运三泰坦",
    },
    {
        "id": "oronys",
        "zh": "欧洛尼斯",
        "en": "Oronyx",
        "title_zh": "永夜之帷",
        "title_en": "Veil of Evernight",
        "group": "命运",
        "spark": "岁月",
        "domains": ["岁月", "夜幕", "记忆"],
        "form": "独眼发光的巨人",
        "city": "elysiae",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 命运三泰坦",
    },
    {
        "id": "georios",
        "zh": "吉奥里亚",
        "en": "Georios",
        "title_zh": "磐岩之脊",
        "title_en": "Pillar of Stone",
        "group": "支柱",
        "spark": "大地",
        "domains": ["大地", "山脉", "耕作", "历史"],
        "form": "所有山脉",
        "city": None,
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 支柱三泰坦",
    },
    {
        "id": "phagousa",
        "zh": "法吉娜",
        "en": "Phagousa",
        "title_zh": "满溢之杯",
        "title_en": "Chalice of Plenty",
        "group": "支柱",
        "spark": "海洋",
        "domains": ["海洋", "风暴", "秘酿", "宴会", "狂欢"],
        "form": "所有水体",
        "city": "styxias",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 支柱三泰坦",
    },
    {
        "id": "aquila",
        "zh": "艾格勒",
        "en": "Aquila",
        "title_zh": "晨昏之眼",
        "title_en": "Eye of Twilight",
        "group": "支柱",
        "spark": "天空",
        "domains": ["天空", "天体", "昼夜循环", "创造", "发明"],
        "form": "百眼巨鸟",
        "city": "twilight_eye",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 支柱三泰坦",
    },
    {
        "id": "kephale",
        "zh": "刻法勒",
        "en": "Kephale",
        "title_zh": "全世之座",
        "title_en": "Throne of Worlds",
        "group": "创生",
        "spark": "负世",
        "domains": ["创生", "全知", "全能"],
        "form": "四臂巨人",
        "city": "okhema",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 创生三泰坦",
    },
    {
        "id": "cerces",
        "zh": "瑟希斯",
        "en": "Cerces",
        "title_zh": "裂分之枝",
        "title_en": "Bough of Rift",
        "group": "创生",
        "spark": "理性",
        "domains": ["理性", "智慧", "植物", "生态"],
        "form": "圣树",
        "city": "epiphany",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 创生三泰坦",
    },
    {
        "id": "mnestia",
        "zh": "墨涅塔",
        "en": "Mnestia",
        "title_zh": "黄金之茧",
        "title_en": "Chrysalis of Gold",
        "group": "创生",
        "spark": "浪漫",
        "domains": ["美", "爱", "情"],
        "form": "金色蝴蝶、人形",
        "city": "okhema",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 创生三泰坦",
    },
    {
        "id": "zagreus",
        "zh": "扎格列斯",
        "en": "Zagreus",
        "title_zh": "翻飞之币",
        "title_en": "Coin of Whimsy",
        "group": "灾厄",
        "spark": "诡计",
        "domains": ["混乱", "机遇"],
        "form": "笑容与哭泣并存的双面神明",
        "city": "dolos",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 灾厄三泰坦",
    },
    {
        "id": "nikador",
        "zh": "尼卡多利",
        "en": "Nikador",
        "title_zh": "天谴之矛",
        "title_en": "Lance of Fury",
        "group": "灾厄",
        "spark": "纷争",
        "domains": ["纷争", "竞技", "鲜血", "献祭", "守护"],
        "form": "身着洁白圣甲的高贵武者",
        "city": "kremnos",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 灾厄三泰坦",
    },
    {
        "id": "thanatos",
        "zh": "塞纳托斯",
        "en": "Thanatos",
        "title_zh": "灰黯之手",
        "title_en": "Hand of Shadow",
        "group": "灾厄",
        "spark": "死亡",
        "domains": ["死亡", "湮灭"],
        "form": "紫色巨龙",
        "city": "aidonia",
        "confidence": "canon",
        "source": "翁法罗斯 wiki · 灾厄三泰坦",
    },
]

# ---------------------------------------------------------------------------
# 城邦与圣地
# `state` 两种面貌取自官方 wiki：同一地点在不同纪元有不同的名字与描述。
# `map` 为本作绘制地图的方位（design）。
# ---------------------------------------------------------------------------
CITIES: Final[list[dict]] = [
    {
        "id": "okhema",
        "zh": "奥赫玛",
        "en": "Okhema",
        "epithet": "永恒圣城",
        "etymology": "希腊语 ὄχημα，新柏拉图主义中指灵魂的载体",
        "titan": "kephale",
        "role": "capital",
        "blurb": "凡人在刻法勒脚下建起聚落。天空封闭、大海沉落之后，这里是人类最后的避难所，逐火之旅在此集结。",
        "flourish": "「永恒圣城」：唯有此处安享黎明笼罩的安逸。",
        "fallen": "「沉沦暮城」：黎明机器熄灭后，圣城也沉入黑夜。",
        "landmarks": ["离怀之路", "刻法勒广场", "云石市集", "云石天宫", "生命花园"],
        "map": {"x": 50.0, "y": 47.0, "r": 9.5},
        "start_state": "flourish",
        "confidence": "canon",
    },
    {
        "id": "kremnos",
        "zh": "悬锋城",
        "en": "Castrum Kremnos",
        "epithet": "蛮都",
        "etymology": "Kremnos 出自希腊语 γκρεμός（悬崖）；原型近斯巴达，是一座移动要塞",
        "titan": "nikador",
        "role": "fortress",
        "blurb": "信仰尼卡多利的战士之城。城中高悬的巨剑既惕厉城民，也震慑外敌。悬锋人以战斗至死为荣。",
        "flourish": "「浴血战端」：五大美德指引战士出征。",
        "fallen": "「纷争荒墟」：走向抗争黑潮的前线，繁荣的城市逐渐变成废墟。",
        "landmarks": ["悬锋巨剑", "王室史官府", "祭典场"],
        "map": {"x": 70.0, "y": 62.0, "r": 7.5},
        "confidence": "canon",
    },
    {
        "id": "janusopolis",
        "zh": "雅努萨波利斯",
        "en": "Janusopolis",
        "epithet": "千门之城",
        "etymology": "Janus + polis，字面即「雅努斯之城」；亦是翁法罗斯地理意义上的中心",
        "titan": "janus",
        "role": "holy",
        "blurb": "超脱于城邦地缘政治之外的宗教圣地。命运三泰坦在此向世界发出神谕。",
        "flourish": "「神谕圣地」：朝圣者的终点，神迹彰显之处。",
        "fallen": "「命运重渊」：灾厄过后，只剩几座神殿屹立。",
        "landmarks": ["觐神祭台", "预言书库", "命运宸扉", "门径终处"],
        "map": {"x": 34.0, "y": 30.0, "r": 7.0},
        "confidence": "canon",
    },
    {
        "id": "epiphany",
        "zh": "神悟树庭",
        "en": "Grove of Epiphany",
        "epithet": "贤者之乡",
        "etymology": "滋养知识的学府，诞育哲人的摇床；七贤人执掌七学派",
        "titan": "cerces",
        "role": "academy",
        "blurb": "尊崇瑟希斯的城邦。学识的星火终遭吞没，仅余空虚躯壳在枝叶间游荡。",
        "flourish": "「呓语密林」：来访者自求知静庭起攀爬，直至智慧的顶点。",
        "fallen": "「辉痕圣林」：被巨树流淌出的金血腐蚀，枝叶染金。",
        "landmarks": ["经纬小径", "求知静庭", "友爱之馆", "启蒙王座"],
        "map": {"x": 28.0, "y": 62.0, "r": 7.0},
        "confidence": "canon",
    },
    {
        "id": "styxias",
        "zh": "斯缇科西亚",
        "en": "Styxias",
        "epithet": "海畔明珠",
        "etymology": "源自冥河斯梯克斯 Styx；原为「巨龙与海浪的城邦」",
        "titan": "phagousa",
        "role": "port",
        "blurb": "海洋的半神为封锁神礼观众，以幻乐打造的无尽欢宴之城。人们歆享不断续杯的蜜酿。",
        "flourish": "「酣歌海垠」：为虹彩与洋流所环绕，没有任何苦痛与遗恨。",
        "fallen": "「龙骸古城」：亡灵国度，巨龙遗骸刺穿优雅的庭院。",
        "landmarks": ["宴都城关", "涌泉歌庭", "眠宫长廊", "莹骨海床"],
        "map": {"x": 20.0, "y": 82.0, "r": 7.0},
        "confidence": "canon",
    },
    {
        "id": "twilight_eye",
        "zh": "晨昏之眼",
        "en": "Eye of Twilight",
        "epithet": "穹顶关塞",
        "etymology": "栖居艾格勒神体的空中要塞；天空眷属分晖、雨、冬三部族",
        "titan": "aquila",
        "role": "sky",
        "blurb": "许多浮空堡垒都已沉没，唯有这座栖居艾格勒神体的要塞留存，成为天空之子的聚居地。",
        "flourish": "「穹顶关塞」：以天幕为眼睑、掌控世间的晨昏。",
        "fallen": "「云端遗堡」：阳雷骑士弑杀艾格勒后，废墟留藏在漫漫天际一隅。",
        "landmarks": ["虹霓尽处", "天象画壁", "擎空骨械", "关塞颅顶"],
        "map": {"x": 58.0, "y": 20.0, "r": 6.5},
        "confidence": "canon",
    },
    {
        "id": "aidonia",
        "zh": "哀地里亚",
        "en": "Aidonia",
        "epithet": "雪城",
        "etymology": "北方边陲，敬爱死亡的国度，终日飘雪",
        "titan": "thanatos",
        "role": "north",
        "blurb": "遐蝶的故乡。生者与死者的界线在此最薄。",
        "flourish": "雪落不止，钟声按日计数。",
        "fallen": "雪城沉入甘甜的酣眠。",
        "landmarks": ["冥河渡口", "雪原钟楼"],
        "map": {"x": 76.0, "y": 32.0, "r": 6.0},
        "confidence": "wiki",
    },
    {
        "id": "dolos",
        "zh": "多洛斯",
        "en": "Dolos",
        "epithet": "盗寇之都",
        "etymology": "希腊语 δόλος，意为诡计、欺骗、背叛",
        "titan": "zagreus",
        "role": "rogue",
        "blurb": "三百侠盗纵情游戏、横行无忌之地；赛法利娅出身于此。",
        "flourish": "黑市每日更换暗号。",
        "fallen": "榜单空悬，无人再认得字迹。",
        "landmarks": ["侠盗榜", "暗号巷"],
        "map": {"x": 46.0, "y": 76.0, "r": 5.5},
        "confidence": "canon",
    },
    {
        "id": "elysiae",
        "zh": "哀丽秘榭",
        "en": "Elysiae",
        "epithet": "边陲村",
        "etymology": "受永夜之帷庇护而遗落世外的偏僻村庄；英文写法未见官方公开文本，此处为音译",
        "titan": "oronys",
        "role": "village",
        "blurb": "麦田、风车与海滨共同守望着这隅宁静。白厄与昔涟的故乡，妖精们的隐秘居所藏于树洞。",
        "flourish": "远行渡口仍在，祝祭庭院仍供着欧洛尼斯。",
        "fallen": "村子安静得像被谁忘在了昨天。",
        "landmarks": ["远行渡口", "祝祭庭院", "迷路迷境", "神奇林地"],
        "map": {"x": 40.0, "y": 12.0, "r": 5.0},
        "confidence": "wiki",
    },
    {
        "id": "genesis_vortex",
        "zh": "创世涡心",
        "en": "Genesis Vortex",
        "epithet": "世界起点",
        "etymology": "被波涛藏匿的世界起点，寄宿十二泰坦原初神性的圣所",
        "titan": None,
        "role": "sacred",
        "blurb": "神谕中创世奇迹降临的应允之地。潮汐的馈赠是封存火种的圣器。",
        "flourish": "星宿之声：当火种归于涡心，泰坦的星火将会点亮光明。",
        "fallen": "盆中潮汐退去，只剩回声。",
        "landmarks": ["孕界心脉", "盆中潮汐", "星宿之声"],
        "map": {"x": 50.0, "y": 90.0, "r": 6.0},
        "confidence": "canon",
    },
]

# ---------------------------------------------------------------------------
# 十三黄金裔（十二主位 + 德谬歌一脉的昔涟）
# signal / drive（原动力）/ path（模拟命途）三列均出自 δ-me13.exe 原文。
# 命途一列的原文措辞也照抄，避免把「类同」写成「即是」。
# ---------------------------------------------------------------------------
SCIONS: Final[list[dict]] = [
    {
        "id": "tribbie",
        "zh": "缇宝",
        "full_zh": "缇里西庇俄丝",
        "en": "Tribios",
        "epithet": "命运的三子",
        "final_epithet": "门径的圣子",
        "chapter": 1,
        "signal": "HapLotes405",
        "drive": "同理",
        "path": "同谐",
        "path_gloss": "复数副本为共同目的相互理解、支持、配合的行为模式趋似「同谐」",
        "spark": "门径",
        "city": "janusopolis",
        "prophecy": "汝将碎作千片，凋零在他乡的土壤。",
        "note": "曾是端丽的圣女，因火种的代价退行为孩童模样。缇安在盗火行者的袭击中牺牲。",
        "confidence": "canon",
    },
    {
        "id": "cerydra",
        "zh": "刻律德菈",
        "full_zh": "刻律德菈",
        "en": "Cerydra",
        "epithet": "执棋的君主",
        "final_epithet": "律法的君主",
        "chapter": 2,
        "signal": "HubRis504",
        "drive": "支配",
        "path": "秩序",
        "path_gloss": "行为模式符合「秩序」建立、扩张、动摇、瓦解的规律",
        "spark": "律法",
        "city": "okhema",
        "prophecy": "汝将于天地境界之海完成征服，长眠于涛声中——",
        "note": "『燃冕者』『独裁官』『女皇』『总帅』『凯撒』。以自我静默为代价改写终极协议。",
        "confidence": "canon",
    },
    {
        "id": "nightveil",
        "zh": "长夜月",
        "full_zh": "三月七",
        "en": "Evernight",
        "epithet": "隐秘的陌客",
        "final_epithet": "隐秘的陌客",
        "chapter": 3,
        "signal": "—",
        "drive": "忘卻",
        "path": "记忆",
        "path_gloss": "有别于「三月七」的高危变量，命途图谱异常，能绕过权杖自检系统",
        "spark": "岁月",
        "city": None,
        "prophecy": "—",
        "note": "天外变量。曾提议以「忘却」清除权杖数据，最终主动陷入沉睡，促成三月七完成试炼。",
        "confidence": "canon",
    },
    {
        "id": "danheng",
        "zh": "丹恒",
        "full_zh": "荒笛",
        "en": "Dan Heng",
        "epithet": "腾飞的荒龙",
        "final_epithet": "腾飞的荒龙",
        "chapter": 4,
        "signal": "SkoPeo365",
        "drive": "求存",
        "path": "不朽",
        "path_gloss": "对破坏性刺激具有高耐受力和适应性，实现种群延续的行为是对「不朽」命途的模拟",
        "spark": "大地",
        "city": None,
        "prophecy": "汝将自掘坟墓，焚毁于叛逆的熔炉。",
        "note": "天外变量。接受火种内约二百一十六万数据生命体，完成「大地」试炼。荒笛为其前身因子。",
        "confidence": "canon",
    },
    {
        "id": "helektra",
        "zh": "海瑟音",
        "full_zh": "海列屈拉",
        "en": "Helektra",
        "epithet": "奏浪的剑骑",
        "final_epithet": "海洋的剑骑",
        "chapter": 5,
        "signal": "ApoRia432",
        "drive": "自否",
        "path": "虚无",
        "path_gloss": "内在世界缺失，回避有效决策；符合生命为回避「虚无」而选择自我毁灭的模型",
        "spark": "海洋",
        "city": "styxias",
        "prophecy": "汝将长眠于涛声中，于天地境界之海完成征服——",
        "note": "圣城的骑士统领。她是一柄冰冷的剑旗，为一颗灼热的野心起舞。",
        "confidence": "canon",
    },
    {
        "id": "hyacine",
        "zh": "风堇",
        "full_zh": "雅辛忒丝",
        "en": "Hyacinthia",
        "epithet": "摇光的医师",
        "final_epithet": "天空的医师",
        "chapter": 6,
        "signal": "EleOs252",
        "drive": "奉献",
        "path": "存护",
        "path_gloss": "行为逻辑高度利他，不具备过载保护；对集体危机积极响应的倾向类同「存护」",
        "spark": "天空",
        "city": "twilight_eye",
        "prophecy": "在彩虹桥的尽头，天空之子将缝补晨昏。",
        "note": "昏光庭院的黄金裔，天空的后裔。大部分死循环进程中趋于严重损毁。",
        "confidence": "canon",
    },
    {
        "id": "phainon",
        "zh": "白厄",
        "full_zh": "卡厄斯兰那",
        "en": "NeiKos496",
        "epithet": "无名的英雄",
        "final_epithet": "负火的囚徒",
        "chapter": 7,
        "signal": "NeiKos496",
        "drive": "憎恨",
        "path": "毁灭",
        "path_gloss": "自我认知为空，仅对破坏性刺激产生应答；其恨意引来了纳努克的瞥视",
        "spark": "负世",
        "city": "elysiae",
        "prophecy": "汝将肩负骄阳，直至灰白的黎明显著。",
        "note": "拒绝完成再创世，制造永劫回归以保证铁墓无法破壳。现已被铁墓合并。名字在史书里被涂黑过。",
        "confidence": "canon",
    },
    {
        "id": "anaxa",
        "zh": "那刻夏",
        "full_zh": "阿那克萨戈拉斯",
        "en": "Anaxagoras",
        "epithet": "殁世的学士",
        "final_epithet": "理性的学士",
        "chapter": 8,
        "signal": "SkeMma720",
        "drive": "批判",
        "path": "智识",
        "path_gloss": "行动逻辑固化为求解，生存权重趋近于零；展现出「智识」在求解时可能出现的自毁倾向",
        "spark": "理性",
        "city": "epiphany",
        "prophecy": "汝将超越至纯粹之终极，回归腐败苦黑。",
        "note": "七贤人之一，智种学派创立者。在树庭劫难中早已身亡，却与泰坦同行。",
        "confidence": "canon",
    },
    {
        "id": "aglaea",
        "zh": "阿格莱雅",
        "full_zh": "阿格莱雅",
        "en": "Aglaea",
        "epithet": "黄金的织者",
        "final_epithet": "浪漫的织者",
        "chapter": 9,
        "signal": "KaLos618",
        "drive": "节制",
        "path": "纯美",
        "path_gloss": "高度自我抑制，以外部需求为唯一优先解；生存权重逐渐降低，转化为符合「纯美」的自我牺牲",
        "spark": "浪漫",
        "city": "okhema",
        "prophecy": "汝将最后一次沐浴，在温热耀眼的黄金中。",
        "note": "逐火之旅的领导者。身为织者，亲自穿针引线。万帷网由她的金线织成。",
        "confidence": "canon",
    },
    {
        "id": "mydeimos",
        "zh": "万敌",
        "full_zh": "迈德漠斯",
        "en": "Mydeimos",
        "epithet": "亡国的王储",
        "final_epithet": "纷争的冠军",
        "chapter": 10,
        "signal": "PoleMos600",
        "drive": "约束",
        "path": "巡猎",
        "path_gloss": "基于斗争行为产生的电信号，却在循环中逐渐成为约束主体，与「巡猎」强相似",
        "spark": "纷争",
        "city": "kremnos",
        "prophecy": "终有一日，汝将背后负创而死。",
        "note": "歌耳戈之子，如狮子般锐利的战士。拥有不完全的重启权限，可将权限升级为无条件无限重启。",
        "confidence": "canon",
    },
    {
        "id": "castorice",
        "zh": "遐蝶",
        "full_zh": "遐蝶",
        "en": "Castorice",
        "epithet": "死荫的侍女",
        "final_epithet": "来生的侍女",
        "chapter": 11,
        "signal": "EpieiKeia216",
        "drive": "平和",
        "path": "均衡",
        "path_gloss": "高度抑制偏离行为，决策以最小扰动为准则；「均衡」的临界值已被打破，走向「毁灭」",
        "spark": "死亡",
        "city": "aidonia",
        "prophecy": "花海尽头，生者的魂灵将温暖汝之指尖；相拥之后，便是永恒的离别。",
        "note": "哀地里亚的督战圣女，奥赫玛的入殓师，塞纳托斯的左手。为对称个体，一个循环中出现两个因子。",
        "confidence": "canon",
    },
    {
        "id": "cipher",
        "zh": "赛飞儿",
        "full_zh": "赛法利娅",
        "en": "Cifera",
        "epithet": "捷足的羁客",
        "final_epithet": "诡计的羁客",
        "chapter": 12,
        "signal": "OreXis945",
        "drive": "渴望",
        "path": "欢愉",
        "path_gloss": "基于原始本能进行运算，以自我满足为唯一优先解；「欢愉」的模拟命途践行到终点后走向自我消解",
        "spark": "诡计",
        "city": "dolos",
        "prophecy": "汝将与贪婪同行，亦将亡于分文。",
        "note": "身负神速之力，却将其用于贼途。悄悄回到圣城，比起英雄之旅更爱自己的小日子。",
        "confidence": "canon",
    },
    {
        "id": "cyrene",
        "zh": "昔涟",
        "full_zh": "德谬歌",
        "en": "Cyrene",
        "epithet": "往昔的涟漪",
        "final_epithet": "无瑕的真我",
        "chapter": 13,
        "signal": "PhiLia093",
        "drive": "哀怜",
        "path": "记忆",
        "path_gloss": "行为模式异常，具备特殊情感投射机制；实为「德谬歌」的心识",
        "spark": "创世",
        "city": "elysiae",
        "prophecy": "汝将收梢于花开时，一如终结诞下起始。",
        "note": "白厄的发小。其根源为废弃赋值：非毁灭共生微概率，若无管理员介入则导向第十三枚因子——路径「创世」、原动力「爱」、模拟命途「开拓」。",
        "confidence": "canon",
    },
]

# 已迭代 / 前世的电信号，用于营造「上一轮演算的残余」
LEGACY_SIGNALS: Final[list[dict]] = [
    {"signal": "Leoreia300", "zh": "格奈乌斯", "spark": "纷争", "note": "尼卡多利缺失的神性碎片，裂魂仪式将自身解离为五份。"},
    {"signal": "Minphia14", "zh": "卡吕普索", "spark": "理性", "note": "重建神悟树庭的记录，后世以「瑟希斯赋予人类智慧」的神话继承。"},
    {"signal": "Chaoz666", "zh": "卡厄斯", "spark": "负世", "note": "第 50121 次循环中选择杀死同类，「毁灭」行为首次在翁法罗斯形成。"},
    {"signal": "EpieiKeia216", "zh": "玻吕茜亚", "spark": "死亡", "note": "与遐蝶同源的另一半对称个体。"},
    {"signal": "SkoPeo365", "zh": "荒笛", "spark": "大地", "note": "曾为吉奥刻勒斯的战友，在吉奥里亚一役中倒戈，成为大地的半神。"},
]

# ---------------------------------------------------------------------------
# 历法：光历。每月四周、每周七天。十二月各有名与所属泰坦。
# 机缘月有「幽灵般的一日」——闰日。有闰日者为红月，无者为金月。
# source: 翁法罗斯 wiki「历法」（转录自游戏文本与道具《翁法罗斯的历法》）
# ---------------------------------------------------------------------------
MONTHS: Final[list[dict]] = [
    {"idx": 1, "zh": "门关月", "season": "命运季", "titan": "janus",
     "meaning": "除旧迎新的第一月。雅努斯关上旧门，打开新门。人们抛弃带来羁绊之物，宣告斩断过去。"},
    {"idx": 2, "zh": "平衡月", "season": "命运季", "titan": "talanton",
     "meaning": "最具规律的一月。人们作息规律、性情平和，乐于在这一月发起裁决、签订契约。"},
    {"idx": 3, "zh": "长夜月", "season": "命运季", "titan": "oronys",
     "meaning": "光照稍暗的一月。人们更频繁地感到瞌睡，直觉与感性替代思考与理性。"},
    {"idx": 4, "zh": "耕耘月", "season": "支柱季", "titan": "georios",
     "meaning": "春耕开始的月份，最为忙碌。人们将劳动作为祭品献给大地。"},
    {"idx": 5, "zh": "欢喜月", "season": "支柱季", "titan": "phagousa",
     "meaning": "春耕结束。泉水流淌、渔业兴盛，是酿造和举办庆典最好的月份。"},
    {"idx": 6, "zh": "长昼月", "season": "支柱季", "titan": "aquila",
     "meaning": "热力最旺盛的一月，黎明机器比平常更闪耀。沐浴这光的人精神饱满。"},
    {"idx": 7, "zh": "自由月", "season": "创生季", "titan": "kephale",
     "meaning": "平淡祥和。人们可以发展爱好、追求理想，正如刻法勒创造了世界又任由人玩耍。"},
    {"idx": 8, "zh": "收获月", "season": "创生季", "titan": "cerces",
     "meaning": "秋收开始。作物吸饱长昼月的光照，成长到最饱满的状态。"},
    {"idx": 9, "zh": "拾线月", "season": "创生季", "titan": "mnestia",
     "meaning": "秋收完成。墨涅塔将一切收拢，编织成记忆的金线。人们在家织布。"},
    {"idx": 10, "zh": "纷争月", "season": "灾厄季", "titan": "nikador",
     "meaning": "各城邦常于此月约定战争。也是处决囚犯、烧毁祭品以祀神明的时期。"},
    {"idx": 11, "zh": "哀悼月", "season": "灾厄季", "titan": "thanatos",
     "meaning": "战争接近尾声。人们从战场拖回尸体，埋葬死者、安抚生者。祭司最忙碌。"},
    {"idx": 12, "zh": "机缘月", "season": "灾厄季", "titan": "zagreus",
     "meaning": "好事坏事都更频繁。治安最动荡。可能有幽灵般的闰日；有则为「红月」，无为「金月」。"},
]

# 一天五时段，每时段五「刻」。
PERIODS: Final[list[dict]] = [
    {"idx": 0, "zh": "门扉时", "note": "活动渐起。人们把意识从远方唤回身体，如同穿过无形的门扉。"},
    {"idx": 1, "zh": "明晰时", "note": "又称上升时。最清醒的时段，学者事半功倍。"},
    {"idx": 2, "zh": "践行时", "note": "又称下降时。灵光枯竭，人们来到户外劳作，或去浴场。"},
    {"idx": 3, "zh": "离愁时", "note": "生产渐止。军队与旅者常在此刻启程远行。"},
    {"idx": 4, "zh": "幕匿时", "note": "人们下榻休息。贼星划过天幕，一天过去。盗贼活跃之时。"},
]

# 纪元。当前演算长期停在「幻灭世」。
EPOCHS: Final[list[dict]] = [
    {"id": "creation", "zh": "造物世", "note": "泰坦自火中降生，三者开辟天地、三者编织命运、三者捏塑生命、三者引渡灾祸。"},
    {"id": "golden", "zh": "黄金世", "note": "塔兰顿翻转天平，把砂砾变成利衡币，设为所有城邦的统一货币。"},
    {"id": "strife", "zh": "纷争世", "note": "各城邦出现元老院，从祭司手中夺取权力。黄金战争，英雄陨落。"},
    {"id": "eclipse", "zh": "幻灭世", "note": "黑潮席卷全世，大地沉入永夜，唯有奥赫玛保有最后一丝光明。"},
    {"id": "recreation", "zh": "再创世", "note": "电信号主动更替的世代更迭，实为 δ-me13 的演算机制。"},
]

# ---------------------------------------------------------------------------
# 制度与器物
# ---------------------------------------------------------------------------
INSTITUTIONS: Final[list[dict]] = [
    {"zh": "公民大会", "note": "实际拥有立法权、人事任免权、宣战与缔和权。所有重大城邦事务由公民大会决定。", "confidence": "canon"},
    {"zh": "元老院", "note": "在大会前发起议题，经议事会过半数同意后成为正式议题。通过的法令张贴于纪名英雄墙前。", "confidence": "canon"},
    {"zh": "刻法勒符文赐福的陶片", "note": "投票结果由它记录并统计，全城设投票用陶罐收集公民意见。", "confidence": "canon"},
    {"zh": "清洗者", "note": "执行处决的团体。第 33550337 次永劫回归中，统领凯妮斯刺杀刻律德菈失败。", "confidence": "canon"},
    {"zh": "利衡币", "note": "塔兰顿划定的交易最小单位。表现为沙砾般细小的砝码，可任意混合成更大的砝码。", "confidence": "canon"},
    {"zh": "传信石版", "note": "功能与手机基本无异，可与手机通信、组建群聊。仅在奥赫玛城中有效，依托万帷网。", "confidence": "canon"},
    {"zh": "万帷网", "note": "阿格莱雅用金线编织的网络，传信石版的依托。", "confidence": "canon"},
    {"zh": "雅努斯密径", "note": "借契门径之泰坦权能架设的「密径之门」，可在门与门之间快速移动。", "confidence": "canon"},
    {"zh": "大地兽", "note": "在车站摇铃即可乘坐，于高处漫步圣城。也可用来运载巨额钱币。", "confidence": "canon"},
    {"zh": "树庭七学派", "note": "智种、莲食、山羊、绳结、敬拜、曳石、赤陶。贤者任期七年，重大决议需五位以上同意。", "confidence": "canon"},
    {"zh": "欧布罗斯", "note": "一种小银币。逝者渡冥河需在眼上或口中放一枚作为摆渡费用。", "confidence": "canon"},
]

# ---------------------------------------------------------------------------
# 演算机制：δ-me13 的八个阶段（官方给出的进度值）
# ---------------------------------------------------------------------------
PIPELINE: Final[list[dict]] = [
    {"id": "inorganic", "zh": "无机", "progress": 3, "loops": "第 1 ~ 50121 次", "note": "元胞自动机 → 模块分工 → 独立-统一双思维 → 集群协议 → 首次「毁灭」。"},
    {"id": "organic", "zh": "有机", "progress": 19, "loops": "第 50122 ~ 176199 次", "note": "脊椎动物、巢都、艺术、纯粹利他社会 → 黑潮视觉乱码首次出现。"},
    {"id": "human", "zh": "人类", "progress": 55, "loops": "第 176200 ~ 28371273 次", "note": "记忆继承机制 → 神明崇拜 → 电信号分离为二 → 生成黑潮作为推力 → 再创世。"},
    {"id": "recreation", "zh": "再创世", "progress": 70, "loops": "第 28371274 次起", "note": "文明等级调整为古典文明。泰坦与黄金裔成为星神与命途行者的共轭模拟。"},
    {"id": "return", "zh": "永劫回归", "progress": 99, "loops": "第 33550336 次", "note": "两簇信号引发的死循环，旨在阻止实验进程。进程已中断。"},
    {"id": "errorlog", "zh": "错误log", "progress": 99, "loops": "第 33550337 次", "note": "管理员以 ID：LykoS 介入，数枚电信号显露敌意。管理员无应答。"},
    {"id": "final", "zh": "最终循环", "progress": 100, "loops": "最后一次", "note": "十二因子升擢为泰坦，于内核层迎战铁墓，将「毁灭」证伪。"},
    {"id": "conclusion", "zh": "结论", "progress": 100, "loops": "—", "note": "一切生命行为归于熵增。若将初始命题改为「开拓」，同样成立。"},
]

# ---------------------------------------------------------------------------
# 关键原文摘引。叙事层可以引用，但不得改写原意。
# ---------------------------------------------------------------------------
QUOTES: Final[list[dict]] = [
    {"zh": "泰坦自火中降生，三者开辟天地，三者编织命运，三者捏塑生命，三者引渡灾祸。", "src": "翁法罗斯 wiki · 泰坦"},
    {"zh": "一切生命行为归于熵增。生命的第一因为「毁灭」。", "src": "δ-me13.exe · 实验结论"},
    {"zh": "结论一仅构成特称命题。若将初始命题改为「开拓」，同样成立。", "src": "δ-me13.exe · 实验结论"},
    {"zh": "「爱」不是因，而是果。「毁灭」也一样。它们始于共同的起点，「有瑕」。", "src": "δ-me13.exe · 致以有瑕之人"},
    {"zh": "我相信，银河间的每一颗星星，都会收获自己的答案♪", "src": "δ-me13.exe · 致以有瑕之人"},
    {"zh": "输出值：Hello, World!", "src": "δ-me13.exe · 致以有瑕之人"},
    {"zh": "逐火之旅，一群带有缺陷的人，在知晓何为「失却」后，自愿选择失却的旅程。", "src": "δ-me13.exe · 致以有瑕之人"},
    {"zh": "如果记忆中的风景模糊了，就伸手去触碰它吧。然后……让它重新成为心灵的力量。", "src": "δ-me13.exe · 著者批注"},
    {"zh": "忘却不意味着背叛……它是最后的保护♭", "src": "δ-me13.exe · 三月七/长夜月"},
    {"zh": "宇宙间绝大多数英雄之旅，不过是祂们随手掷下的骰子。但翁法罗斯给出了不同的答案。", "src": "δ-me13.exe · 著者批注"},
]

LORE: Final[dict] = {
    "name": "「翁法罗斯」中文名音译自希腊语 ὀμφαλός（脐）；英文名 Amphoreus 来自古希腊语 ἀμφορεύς，双耳陶罐。",
    "world": "被隐藏于深空之中的未知星域，与外界隔绝，难以被观测或触及。借助流光忆庭的技术「忆庭之镜」，星穹列车成功抵达。",
    "truth": "实际上，翁法罗斯是由星体计算机「帝皇权杖 δ-me13」所运行的模拟世界。该权杖曾作为「智识」博识尊的天体神经元存在，后被废弃，又于漫长演算中受「毁灭」瞥视，升格为绝灭大君「铁墓」。",
    "gold_blood": "黄金裔体内流淌的金血是纳努克的恩赐，出现于第 50121 次循环之后。",
    "black_tide": "黑潮并非实体，而是毁灭方程式的感染在模拟世界中呈现出的视觉效果。第 176100 次循环，系统无序程度突破阈值后出现。",
    "day_night": "翁法罗斯的昼夜由天空之泰坦的眼睛开阖控制。列车到访时，世界已陷入名为「幻灭世」的永恒长夜，仅有奥赫玛被刻法勒背负的黎明机器照亮。",
    "recreation": "「再创世」是 δ-me13 的演算机制，也是世代更迭的形式，旨在求解「毁灭」方程。",
    "eternal_return": "白厄与昔涟引发的死循环，共 33550336 次，用于阻止铁墓破壳。开拓者的到来令死循环被突破。",
    "cycle_now": "星穹列车抵达时为第 33550336 次死循环。主线时间为光历 4931 年。",
}

SOURCES: Final[list[dict]] = [
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· 翁法罗斯", "url": "https://wiki.biligame.com/sr/翁法罗斯",
     "used_for": "泰坦/城邦/历法/制度/黑潮/昼夜的原文", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· 翁法罗斯编年史", "url": "https://wiki.biligame.com/sr/翁法罗斯编年史",
     "used_for": "造物世/黄金世/纷争世/幻灭世分期、光历年份、实验进程", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）·「如我所书」", "url": "https://wiki.biligame.com/sr/《如我所书》",
     "used_for": "档案柜结构与任务文本", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· 翁法罗斯英雄纪.exe", "url": "https://wiki.biligame.com/sr/翁法罗斯英雄纪.exe",
     "used_for": "十三章目录、每章五节、版本更名记录", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· δ-me13.exe", "url": "https://wiki.biligame.com/sr/Δ-me13.exe",
     "used_for": "十二因子原动力与模拟命途、实验八阶段、实验结论、致以有瑕之人", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· 逐火者的命路.exe", "url": "https://wiki.biligame.com/sr/逐火者的命路.exe",
     "used_for": "每位黄金裔的四行命录诗", "fetched": "2026-11-18"},
    {"title": "崩坏：星穹铁道 WIKI（BWIKI）· 管理员批注.wav", "url": "https://wiki.biligame.com/sr/管理员批注.wav",
     "used_for": "来古士口吻的机器文体范本", "fetched": "2026-11-18"},
    {"title": "米游社 · 众城邦与泰坦们：关于《论泰坦与地上万邦》的考据", "url": "https://www.miyoushe.com/ys/article/60629954",
     "used_for": "城邦词源与地理", "fetched": "2026-11-18"},
    {"title": "萌娘百科 · 崩坏：星穹铁道/典故", "url": "https://zh.moegirl.org.cn/zh/崩坏：星穹铁道/典故",
     "used_for": "Amphoreus 词源、悬锋城与多洛斯词源", "fetched": "2026-11-18"},
    {"title": "Honkai: Star Rail Wiki (Fandom) · 黄金裔", "url": "https://honkai-star-rail.fandom.com/zh/wiki/黄金裔",
     "used_for": "电信号代号对照", "fetched": "2026-11-18"},
]

# 命录诗：直接照抄《逐火者的命路.exe》，用于「如我所书」卷首题记。
LIFE_VERSE: Final[dict[str, list[str]]] = {
    "tribbie": ["孩童此行良久，跫音曾透着犹疑，离别的泪也总叫她们芳毫垂低。", "命运的宠儿试图背弃命运。西风尽头，果真存在一片芬馥之地？", "万千门径之中，三子携手销去身形，只余丝缕渐弱的流音……", "——何须那命运回应。"],
    "cerydra": ["岁月流转，王朝更替。苍生呼唤君主，渴求指引。", "在君主眼里，臣民皆为刍狗，天地亦是秤上砝码。", "若可将死敌役，代价不足为惜，万物皆可为棋。", "在与神明的战场上，胜利高于正义。"],
    "nightveil": ["在永夜之帷的画卷上，挂着两轮月亮。", "光影交错，时隐时现，仿佛一圈舞步的回旋。", "相传于月相的起点，会有阵阵欢笑从天幕中传出，驱散长夜的孤寂。", "那是岁月的呓语，亦或故人的声音？"],
    "danheng": ["大地深处囚着远古的低喃，亘古的眼眸将岁月望穿。", "当巨龙的脊背嵌满苦痛的悲鸣，", "万千生灵求存的渴望将凝成最后的逆鳞——", "对命运的僭叛，是守护者最后的巍冠。"],
    "helektra": ["游鱼洄游于漆黑渊底，在昏暗之海追寻光明。", "苦厄的波涛，谎言的潮汐，宿命的骇浪，冲刷她空无的魂灵。", "她是一柄冰冷的剑旗，为一颗灼热的野心起舞，最终破碎零星。", "空留缥缈乐音，不知为谁而鸣。"],
    "hyacine": ["世间有众繁气象，都曾令那无垠天穹喧闹沸腾。", "而当余晖散尽，在那阴晴弥合、晨昏并拢的时刻……", "她为彷徨者拥留最后的胧明，", "以笑涡为伤疼的宿命点亮虹光。"],
    "phainon": ["世末的昕旦，英雄举起映着斜晖的剑，搦战追逐着黄昏的夜色。", "那人的胸膛跃动着闪耀的星，灼目如死去的太阳。", "他将骄阳负在背上，走向灰白的黎明。", "名字被涂黑，火种仍在烧。"],
    "anaxa": ["他先拆掉问题，再拆掉提问的人。", "怀疑的枝杈刺入圣树，汁液是苦的。", "一身已是尸身，却仍要与神同行。", "汝将超越至纯粹之终极，回归腐败苦黑。"],
    "aglaea": ["织者抚弄金丝，连缀命运。", "名为浪漫的丝线，由众生捻成。", "爱与恨，美与丑，旧闻与预言，诸般世事，皆是衣料。", "汝将最后一次沐浴，在温热耀眼的黄金中。"],
    "mydeimos": ["狮子拥有自己的史官，狩猎的历史也不应为猎人独享。", "唯王权可终结王权，唯纷争可终结纷争。", "王座就在故乡的血里。", "终有一日，汝将背后负创而死。"],
    "castorice": ["冥河的女儿提着灯，替人合上眼睛。", "生死皆为旅途，蝴蝶停落枝头时，凋零的又将新生。", "花海尽头，生者的魂灵将温暖汝之指尖。", "相拥之后，便是永恒的离别。"],
    "cipher": ["三百侠盗里跑得最快的那个。", "谎言随风同行，吹遍此世大地。", "她把真话藏在谎话的第三节。", "汝将与贪婪同行，亦将亡于分文。"],
    "cyrene": ["微种、新芽、鲜花、果实、微种。", "记忆里的小女孩说话带着♪。", "汝将收梢于花开时，一如终结诞下起始。", "愿故事的结局，如我们所述。"],
}

# 城邦起手数值（design）。
# 定性判断来自官方：「列车抵达时翁法罗斯已入幻灭世」，大部分城邦半毁，
# 唯奥赫玛因黎明机器（刻法勒的火种）维持着最后的安逸。
# 具体数字是本作设定，不是官方数据。
INIT_POP: Final[dict[str, int]] = {
    "okhema": 480_000, "kremnos": 96_000, "janusopolis": 21_000,
    "styxias": 74_000, "epiphany": 38_000, "dolos": 62_000,
    "aidonia": 33_000, "twilight_eye": 17_000, "elysiae": 9_000,
    "genesis_vortex": 0,
}
INIT_ORDER: Final[dict[str, float]] = {
    "okhema": 0.90, "janusopolis": 0.42, "epiphany": 0.55, "styxias": 0.48,
    "aidonia": 0.50, "twilight_eye": 0.38, "elysiae": 0.66, "kremnos": 0.34,
    "dolos": 0.44, "genesis_vortex": 1.0,
}
INIT_FAITH: Final[dict[str, float]] = {
    "okhema": 0.92, "janusopolis": 0.78, "aidonia": 0.80, "epiphany": 0.70,
    "styxias": 0.66, "elysiae": 0.74, "kremnos": 0.58, "twilight_eye": 0.54,
    "dolos": 0.46, "genesis_vortex": 1.0,
}
INIT_TIDE: Final[dict[str, float]] = {
    "okhema": 0.04, "elysiae": 0.40, "dolos": 0.50, "epiphany": 0.55,
    "twilight_eye": 0.58, "styxias": 0.60, "aidonia": 0.62,
    "janusopolis": 0.68, "kremnos": 0.72, "genesis_vortex": 0.0,
}

# 便捷索引
TITAN_BY_ID: Final[dict[str, dict]] = {t["id"]: t for t in TITANS}
CITY_BY_ID: Final[dict[str, dict]] = {c["id"]: c for c in CITIES}
SCION_BY_ID: Final[dict[str, dict]] = {s["id"]: s for s in SCIONS}
SCION_BY_SPARK: Final[dict[str, dict]] = {s["spark"]: s for s in SCIONS}
SCION_BY_SIGNAL: Final[dict[str, dict]] = {s["signal"]: s for s in SCIONS if s["signal"] != "—"}
MONTH_BY_IDX: Final[dict[int, dict]] = {m["idx"]: m for m in MONTHS}


def titan_of_spark(spark: str) -> dict | None:
    for t in TITANS:
        if t["spark"] == spark:
            return t
    return None


def cities_of_titan(titan_id: str | None) -> list[dict]:
    """某位泰坦庇护的所有城邦。刻法勒同时庇护奥赫玛与哀丽秘榭。"""
    if not titan_id:
        return []
    return [c for c in CITIES if c["titan"] == titan_id]


def scions_of_city(city_id: str) -> list[dict]:
    return [s for s in SCIONS if s["city"] == city_id]
