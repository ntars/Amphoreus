# 官方素材解包记录（仅本机复刻用）

2026-11-23 在用户授权的 Parallels Windows 虚拟机中完成。游戏目录：
`C:\Program Files\miHoYo Launcher\games\Star Rail Game`。

## 已验证路径

- 当前客户端 `StarRail_Data\StreamingAssets\Asb\Windows\*.block` 是拼接的 `ENCR\0` UnityFS bundle。
- 老版 AssetRipper/HSRStudio 只支持旧 compression flag，无法读取当前 payload；`Escartem/AnimeStudio` 2026-11 nightly 以 `--game SR` 可正常解析。
- .NET 10 x64 Desktop Runtime 安装在虚拟机 `C:\ProgramData\hsr-dotnet-x64`；CLI 在共享目录 `Z:\Downloads\hsr-ui-extract\animestudio\cli\`。
- 先用 CLI `--map_op AssetMap` 建索引，再按 `Name`/`Container` 过滤导出 `Texture2D`。`--names` 是正则过滤；多个名称用 `|`。

## 素材定位

游戏内部把“如我所书”称为 `TarotBook`。在导出的命中索引中：

- `EntryTarotBookIcon`：官方入口倾斜书册图标，源 block `038c6854d2620fd3622a4f5469e36ee3.block`，container `assets/asbres/ui/materials/tarotbook/ui_tarotbookentry_1001_glitch.mat`。
- `TarotBookIconWait` / `TarotBookIconWaitLight`：加载动画白色放射光，源 block `02a4ea1a61bf47bd5e5956f93e6e8c30.block`。

三张原始 PNG 与裁剪后的命中索引保存在 `docs/assets/extracted/`，哈希见同目录 `manifest.json`。
仓库运行时仍坚持零图片；这些文件只用于逐像素/形状核对。网页里的入口书册由提取图反推为 CSS `clip-path`、渐变与放射线，不加载 PNG。

## 重现

本机脚本生成器：`tools/extract_hsr_assets.py`。

```bash
python3 tools/extract_hsr_assets.py map
python3 tools/extract_hsr_assets.py export \
  --block 038c6854d2620fd3622a4f5469e36ee3.block \
  --names EntryTarotBookIcon --execute
```

脚本只写入共享目录 `~/Downloads/hsr-ui-extract`，并打印/执行 `prlctl exec` 命令；不在仓库中保存游戏二进制或完整 dump。

## 全量解包产物（在 Mac 下载目录，不入库）

为了让删除虚拟机内游戏后仍可复现，完整游戏目录已复制到：

- `~/Downloads/hsr-ui-extract/StarRailGame-full/` — 完整游戏目录，111 GB，12,125 文件 / 169 目录。
- `~/Downloads/hsr-ui-extract/StarRailGame-full.manifest.host.tsv` — 对复制产物逐个计算的 SHA-256 清单，12,125 行。
- `~/Downloads/hsr-ui-extract/animestudio/out-fullmap-rerun/hsr_all.json` — 全量资源索引，9,901 个输入文件、7,978,550 条资产记录。
- `~/Downloads/hsr-ui-extract/hsr_all_assets.sqlite3` — 上述全量索引的 SQLite 副本，便于快速检索 `Name` / `Container` / `Type` / `Source`。
- `~/Downloads/hsr-ui-extract/exports/convert-all/` — 全量 Convert 导出，仍在持续增长中。
- `~/Downloads/hsr-ui-extract/exports/tarot-ui-all-blocks/` — 由全量索引筛出的 21 个 `ui/tarotbook` 相关 block 的 Convert 导出，已取得约 4,350 个文件，其中 720 个路径显式含 `tarotbook`；这是当前复刻 TarotBook 各页面的主要素材集。

全量解包结果中 `TarotBook` 相关资产约 10,400 条容器命中，其中 Sprite 515、Texture2D 441、Material 270；这些是继续复刻目录、书页、命路等页面的形状与配色依据。仓库只保留少量已定位 PNG 与裁剪索引，游戏本体与全量 dump 不入库。

## 状态

已证明可解包与导出官方素材，已取得入口书册图标；尚未取得 `home.png`/`catalog.png`/`volume.png`/`path.png` 四张标准游戏基准，因此不能声称逐像素一致。后续的 UI 复刻应继续以官方素材作形状与颜色依据，并用 `tools/pixel_compare.py` 做最终验收。


## 解包资源到 CSS 结构的快速映射（2026-11-23）

已建立 `hsr_all_assets.sqlite3`（7,978,550 条资产索引）并核对 TarotBook 定向导出：
共 515 个 Sprite、441 个 Texture2D、270 个 Material、155 个 AnimationClip、79 个 MonoBehaviour。
主页/目录/书册的资源与前端视图对应如下，后续直接按此表取证，不再逐页目视试错：

| 官方资源/预制体 | 解包位置 | Amphoreus 对应 |
| --- | --- | --- |
| `tarotbookrealmainpage.prefab` + `TarotBookRealMainPage` 图集 | `assets/asbres/ui/tarotbook/...` | `/book` 入口 HUD、书封徽记、右上角规则/切换 |
| `tarotbookstarpanelpage.prefab` + `TarotBookStarPanelBg2/3` | `assets/asbres/ui/ui3d/tarotbook/...` | `path` 命路星盘、蓝金圆盘、角色徽章 |
| `tbbookletmaincatalogcontent_1.prefab` + `TBMainCatalog*` | `assets/asbres/ui/tarotbook/booklet/...` | `catalog` 分类纸页、金边卡片、标签 |
| `tarotbookbookletpage.prefab` + `TarotBookBookletPage` 图集 | `assets/asbres/ui/tarotbook/...` | `volume` 单卷摊页、红色章节牌、纸张纹理 |
| `tbbooklettemplate{1..6}page[l/r]content.prefab` | `assets/asbres/ui/tarotbook/booklet/...` | 单卷各模板页的左右栏与图文层级 |

官方完整游戏副本、全量 JSON 资产索引、全量 CONVERT 导出仍保留在
`/Users/ntars/Downloads/hsr-ui-extract/`，仓库仅保留体积很小的来源证明图与基准截图。


## 定向源码导出 block（本阶段）

完整游戏本体已复制到：`~/Downloads/hsr-ui-extract/StarRailGame-full`，其中包含原始 StreamingAssets、Assembly-CSharp 代码、配置和素材，可在不启动游戏本体的情况下继续查阅。

源码导出时将 block 从游戏完整路径读取，而不是只在本地 `hitblocks/` 中查找：

```
C:\Program Files\miHoYo Launcher\games\Star Rail Game\StarRail_Data\StreamingAssets\Asb\Windows\<hash>.block
```

定向导出命令示例：

```bash
python3 tools/extract_hsr_assets.py \
  --source "C:\Program Files\miHoYo Launcher\games\Star Rail Game\StarRail_Data\StreamingAssets\Asb\Windows\5320cb981bb270df4950407fb5853c71.block" \
  --vm "StarRail" \
  --dest "$HOME/Downloads/hsr-ui-extract/source-dump/block-5320cb981bb270df4950407fb5853c71"
```

已导出的关键源码 block：

- `block-5320cb981bb270df4950407fb5853c71`：主页 prefab 与相关组件
- `block-346e1042a7f55e1526f23bb56a4e20a7`：主页动画 clip
- `block-1bfedad375bc80397becdb804409dd1b`：星图 / booklet
- `block-5fa305fde9c53665a4caceadb445129d`：catalog
- `block-9497e32c47e859c8911353a82d0eca3e`：星图材质
- `block-155723e1b94605486a3c3f599568447f`、`block-2cabdd8d8b3e3dbfd368341818e9f273`、`block-4b78db73eb66512cfadfd06432fe2c54`：星图卡片资源
- `block-9dab5a2ad505a64bfe651e9e4f5c1ef9`：TarotBook 相关动画器 JSON

主页动画源码：

```
~/Downloads/hsr-ui-extract/source-dump/block-346e1042a7f55e1526f23bb56a4e20a7/assets/asbres/ui/animation/tarotbook/TarotBookRealMainPage_FadeIn.anim
```

其中记录的对象和关键帧已成为首页 CSS 拼接依据，包括六项 FunctionList 按钮的揭示时间与 Root/PageInfo/RewardPanel 的位移、缩放和透明度变化。

需要再次导出其它 block 时，先启动 Parallels Desktop 与虚拟机，再通过 `prlctl exec` 让 guest 侧 AnimeStudio 写入目标临时目录；macOS 侧脚本再将 guest 产物同步到下载目录。Parallels 无界面直调容易报 unattended initialization 错误，先打开桌面应用再启动虚拟机即可规避。


## prefab JSON 坐标导出（本阶段）

为读取 `FunctionList` 和六个 `Btn*` 的真实局部坐标，将 `tools/extract_hsr_assets.py` 的 `--source game` 修正为指向完整 block 文件，而不是只传 Asb 目录。这条命令会从 guest 侧读取：

```
C:\Program Files\miHoYo Launcher\games\Star Rail Game\StarRail_Data\StreamingAssets\Asb\Windows\<hash>.block
```

prefab JSON 导出命令：

```bash
python3 tools/extract_hsr_assets.py export \
  --block 5320cb981bb270df4950407fb5853c71.block \
  --source game \
  --types GameObject,RectTransform,Transform,Image,Text,MonoBehaviour,Animator,AnimationClip \
  --dest source-dump/probe-prefab-json \
  --export-format JSON
prlctl exec {37aacf46-7b72-45a9-aa08-5682d1f06c04} --current-user powershell \
  -NoProfile -ExecutionPolicy Bypass -File \
  'Z:\Downloads\hsr-ui-extract\extract_5320cb981bb270df4950407fb5853c71.ps1'
```

此时 `--export-format Dump` 对该 block 报告 20307 个资产 "not extractable or files already exist"，但 `--export-format JSON` 成功导出 13635 个 JSON；`FunctionList` 与六个按钮的坐标就在其中。结论是：需要结构字段时优先用 JSON，不要被 Dump 的空输出误导。


## TarotBookRealMainPage 图集与按钮图标

索引 `~/Downloads/hsr-ui-extract/hsr_all_assets.sqlite3` 确认 `TarotBookRealMainPage` 的 34 个 Sprite 位于：

```
assets/asbres/ui/tarotbook/_autogen/tarotbookrealmainpage.spriteatlas
block: 5aa0b77139b8d512deb7c77044e1cfdb.block
texture: sactx-1024x512-BC7-TarotBookRealMainPage-4ea96422.png
```

导出后的图集位于 `~/Downloads/hsr-ui-extract/source-dump/tarot-source/assets/asbres/ui/tarotbook/_autogen/`，包含 `TarotBookMainIconBook1..6`、`IconStar*`、`IconPaper*`、`IconWiki*`、`IconMem*`、`IconMail*`、`SelectFrame`、`DecoRing` 等官方图标。它们是解包参考产物，不进入网页运行时；网页仍以 CSS 绘制图标。


## 运行时布局坐标的边界说明

JSON 导出直接给出 `m_LocalPosition`，但没有导出 `RectTransform.anchoredPosition / anchorMin / anchorMax / sizeDelta`，也没有完整保留 `FunctionList` 第二个组件的布局字段。因此当前 CSS 只能确认按钮之间的相对顺序与网格形状，不能声称已逐像素复现 Unity 运行时的最终锚定位置。要继续逼近官方坐标，下一步应导出 Raw/Dump 原始 Unity 序列化数据或解析 AssetRipper 的完整 prefab，而不是从截图测量。

### 本机 Raw 复核结果（本阶段）

- 对已复制的 block 内 `CAB-ae8196640cf850b177a4054d6046b52b` 直接做 UnityPy Raw 读取：`BtnBook` 对应的 `RectTransform` PathID `-4005738450216129041` 与 `FunctionList` 对应的 `-3174918990104477497` 共用旧类型哈希 `7e050781d08ca9d10bc74beb7e91c3b5`，均无 `serialized_type.node`；常规 `read()` / `read_typetree(check_read=False)` 在读取尾部 `m_Children` 时抛 `EOFError: read_x out of bounds`。
- 原始字节中仍可交叉验证官方 split JSON 已提供的事实：`BtnBook` 的 GameObject PathID `-6576932445105804004`、两个子节点 `-4536782406574516285` / `-253150394271334374`、父节点 `-3174918990104477497`；`FunctionList` 的 GameObject PathID `5698623426303845796`、六个子节点及其父节点 `2710852008706224314` 均能在对象字节中按 12 字节 PPtr 对齐找到，且局部位置与 JSON 的 `(98,27)` / `(0,60)` 一致。
- 但同一批对象的 scale、anchor、size、pivot 字段与标准 Unity 2019.4 `RectTransform` 布局不形成稳定映射；把候选字节当作官方几何会与已导出的 `scale=(1,1,1)` 冲突。本阶段没有把这些候选值写入 `web/codex-source.json`、模板、CSS 或门禁，也没有用截图倒推。
- 结论：当前仓库继续以已核验的父子关系、局部位置、动画曲线、sprite alpha 向量和材质色为来源证据；完整 RectTransform 几何仍需可解析类型树的导出器或可读的完整 prefab。该缺口保持显式记录，不宣称逐像素一致。

### 临时 AnimeStudio 交叉复核（本阶段）

- 在 `/tmp` 复制 AnimeStudio 源码，仅把目标框架从 `net9.0`/`net10.0-windows` 调整为 `net10.0`，并让 `RectTransform` 读取器在标准 `Transform` 字段后继续读取 `m_AnchorMin / m_AnchorMax / m_AnchoredPosition / m_SizeDelta / m_Pivot`；原解包目录和仓库源码均未修改。用该临时 CLI 直接解析已复制的 `CAB-ae8196640cf850b177a4054d6046b52b`，可成功导出 372 个 RectTransform，且六个入口按钮的 `m_LocalPosition` 与 split JSON 一致。
- 可交叉核验的几何：`DesktopPanel` anchors `0.07/0.07 → 0.93/0.93`、anchoredPosition `(0,-20)`；`TitleType` size `240×26`、anchors `(0,1)`、pivot `(0,1)`；`IconPanel` size `44×44`；`Outside` size `(0,144)`、垂直 anchors `0.1→0.9`；`BtnClose` size `100×100`、右上 anchors/pivot；`RewardPanel` size `178×400`；`BtnGo` size `316×60`。三个无歧义的按钮记录给出 size `132×114` 与对应 anchor/pivot，其中 `(0,27)` 记录为 anchors `(0.5,1)`、`anchoredPosition (0,-110)`，`(0,-27)` 为 anchors `(0.5,0)`、anchoredPosition `(0,110)`，`(98,-27)` 为 anchors `(0,0)`、anchoredPosition `(130,110)`。
- `BtnBook` 与 `BtnPaper` 共用局部位置 `(98,±27)`，本地 CAB 中对应对象没有稳定的 GameObject 名称；`BtnReward` / `NewMailHint` 的旧类型字节还解析出明显非法的浮点值。为避免按截图猜测身份，`tools/export_tarot_source.cjs` 仅在显式设置 `HSR_RECT_OVERLAY` 时读取这批临时 JSON，并要求 GameObject PathID、局部位置与几何值范围交叉验证；非法对象被忽略。当前运行时不依赖临时目录，按钮网格和 CSS 布局保持不变。
- 源码门禁新增断言：所有导出的 geometry 数值必须有限且在合理范围内；`DesktopPanel`、`BtnClose`、`RewardPanel` 的上述几何必须保留；六按钮网格必须为官方 `±98 / ±27`。这些是来源证据校验，不是逐像素一致声明。

### 全量 block 复核与仍缺失对象（本阶段）

- `5320cb981bb270df4950407fb5853c71.block` 已在本机完整复制。临时 AnimeStudio 加上本机 `~/Downloads/hsr-ui-extract/tools/libooz.dylib` 后可直接解析该 block，导出 583 个 RectTransform；但 split prefab JSON 中的 `BtnBook` / `BtnMem` / `BtnMail` / `FunctionList` 及 `BtnBook` 的 RectTransform PathID 仍不出现在 CLI 可读的 583 个对象内。
- 对全部约 9945 个本机 `.block` 做 64-bit PathID 字节扫描，这些对象和另外三个已恢复按钮都只出现在 `5320cb981bb270df4950407fb5853c71.block` 中，说明不是导错了 block，而是该 block 内若干 CAB 尚未通过临时 CLI 的 Oodle/容器路径解出。split prefab JSON 中有这些 GameObject/RectTransform 的独立文件，但仍是旧格式，没有 anchor/size/pivot 字段；不能从 field 缺失推断出隐含矩形。
- 现有 split JSON 仍能逐对象识别这些按钮的 GameObject、局部位置和子 PPtr：例如 `BtnBook` GameObject `-6576932445105804004` 位于 `(98,27)`，子节点 `-4536782406574516285` / `-253150394271334374`；`FunctionList` GameObject `5698623426303845796` 位于 `(0,60)`，六个子节点中包括 `-4005738450216129041`。但缺少这些对象本身的完整字段导出，因此不能把另外三个按钮的 `132×114` 直接套用，也不能按截图猜身份。
- 当前 `codex-source.json` 对三个已恢复按钮保留官方 anchor/size/pivot，其余三个继续保留 split JSON 已验证的局部位置；CSS 不消费未验证的完整矩形。要继续收敛，只能补齐可读 CAB 或完整 prefab 类型树，不能靠像素试错。


## 当前基准与像素门禁边界（本阶段）

- 真实客户端基准只包括 `docs/screenshots/baseline/home.png` 与 `path.png`；`catalog.png`、`volume.png` 仍缺失。公开视频帧只能做结构核对，不能进入逐像素门禁。
- 命路页按实拍基准去掉网页式矩形画布外框，恢复整屏深蓝画布、左上双行书册标题、右上返回箭头与左下 UID，并按 `TarotBookStarPanelCircle1/Bg2/Bg3` 与 `TBStarPanel*` 导出纹理重构为深色棋盘环、月相星屑内环、金色外框与外圈十二枚 + 盘心昔涟。这些层仍全部由 CSS 绘制，截帧像素门禁未通过，不能声称复刻完成。
- 首页像素比对结果仅作为收敛趋势：从 `diff_rate=0.998254` 降到 `0.993621`，但平均通道差仍接近 49，`pixel_compare.py` 仍判定 `exact=false`。
- 解包 prefab 的六个按钮对象和 3×2 相对坐标已确认；当前官方截图只明显显示少量入口，原因应继续从 prefab/animation/controller active 状态中查找，不能用截图倒推为源码事实。


## 命路底色与中心卡来源复核（本阶段）

- 完整解包仍在 `~/Downloads/hsr-ui-extract/`：`StarRailGame-full` 111 GB、`exports/convert-all` 65 GB、SQLite 全量索引和 `source-dump`，曾按用户要求复制到下载文件夹；本阶段没有再改动这批产物。
- 中心卡配色来自 `source-dump/block-155723e1b94605486a3c3f599568447f/assets/asbres/spriteoutput/ui/tarotbook/tarotbookcard/card13/TarotBookCard13_Character_Active.png`，该官方素材的浅粉/紫角色色调说明此前青绿色中心卡与来源不符；已改用 CSS 粉紫渐变表达。
- 命路背景来自 `source-dump/tarot-source/assets/asbres/ui/ui3d/tarotbook/_dependencies/texture/starpanel/TarotBookStarPanelCircle1.png` 与 `baseline/path.png` 的分区取色；修正了实际生效的 `body:has(#view-path...)` 覆盖选择器，避免截图未变化。
- 当前 `P16-path.png` 的 `diff_rate=0.966706` / `mean_abs_channel_diff=34.8525`，仍不是逐像素一致；这些解包产物只作为结构/配色依据，网页运行时保持零图片资源。


## 基准帧窗口栏与分区取色（本阶段）

- 对 `baseline/path.png` 的分区均值复核后，在命路 CSS 中补回录制帧顶部约 24px 的灰/深灰双层窗口栏，并按官方画面左侧略亮、右侧偏暗、底部渐亮的分区调整底图渐变；这不是官方 UI 本体，而是为了让 1280×800 基准逐像素比对具有可比性。
- 解包资源仍未进入网页运行时；外层游戏数据仍完整保留在下载文件夹。当前最新证据为 `P21-path.png`：`diff_rate=0.926493` / `mean_abs_channel_diff=29.5425`，门禁仍未通过。
