# 事实基线

本文件记录 Amphoreus Web 复刻的只读数据来源与版本。所有值来自本机复制数据，不从截图推断。

## 游戏与工具

- 游戏名：崩坏：星穹铁道（`StarRail_Data/app.info`）
- Unity 版本：2019.4.34f1（手册已核实）
- 全局元数据：`global-metadata.dat`，106840192 bytes
- 全局元数据 SHA256：`315707b69ff5eb76773e5ba1c889082e36e06a3ea5aa601fe7eaf683630a4fc9`
- 元数据头：`4d48590000000000`（MHY，加密）
- Node：当前执行环境 Node 24.22.3（手册要求 ≥22）
- Python：3.15，UnityPy 1.25.4，Pillow 13，NumPy，lz4
- Oodle：外部 `unoodle` 解码器（不入库、不随仓库分发）
- 解包源码：AnimeStudio `AnimeStudio-src-35036`

## TarotBook 主 block

- 文件：`5320cb981bb270df4950407fb5853c71.block`
- 大小：5059874 bytes
- SHA256：`09580b3580917db448ac02759ac34d6bd99dae4290b8224c32e2ba4e71410224`
- 本地路径：`~/Downloads/hsr-ui-extract/StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows/`
- bundle 数：304，全部由 `tools/hsr_oodle_extract.py` 解析
- 读取方法：host Oodle + UnityPy；asb 为 ENCR/Mr0k，不能直接交给 UnityPy

## 资产索引

- 完整游戏副本：`~/Downloads/hsr-ui-extract/StarRailGame-full`（约 111 GB）
- 全资产索引：`~/Downloads/hsr-ui-extract/hsr_all_assets.sqlite3`（约 5.1 GB）
- TarotBook sprite 导出：`~/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/spriteoutput/ui/tarotbook`
- TarotBook 动画导出：`~/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/ui/animation/tarotbook`
- TarotBook 材质导出：`~/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/ui/materials/tarotbook`

## 官方本地化表（TextMap）

- 文件：`StarRail_Data/Persistent/DesignData/Windows/cn/2992a81e50e9f57b177c31317600ada3.bytes`
- 大小：56,511,712 bytes
- SHA256：`21188bb8e32f2108edd2264037113d7f90cd84e0ca888e4394df30fdd45cbf88`
- 记录形状：`<u8 len><UTF-8 text>0x03<4B LE TextID.hash>`，周围有可选 `0x01` 组标记与不透明尾部
- 提取：`python3 tools/extract_textmap.py` → `dump/_textmap.json`（只读源，不入库）
- 当前结果：373,873 个候选，373,708 个唯一 hash，165 个 32-bit 碰撞（保留首条并计数）
- 门禁：`tools/verify_textmap.mjs` 锁定 5 条 `UIText_TarotBook_StoryTemplatePage_*` 文本及章节 ID `1` / `1-1`

`TextID` 构造器已由 `GameAssembly.dll` 反汇编确认：UTF-16 码元，两个累加器都从
`0x1505` 开始，按 `h = h*33 ^ c` 更新，最终 `hash = h1 + h2*1566083941`（.NET
`string.GetHashCode()` 的 x86 变体）。TextMap 的 4 字节尾部与配置 blob 的章节行
共用同一 hash 空间；因此正文/词条解析使用配置行携带的 hash 反查 TextMap，
不再猜测哈希函数。

## 完整本机证据副本

- 用户已明确：完整游戏数据位于 `~/Downloads/hsr-ui-extract/StarRailGame-full/`，后续直接只读使用该目录，不再重复提取。
- IL2CPP 基线已由 `HSRGlobalMetadata` 从同一目录生成到 `out/il2cpp/dump.cs`（178 MB）；该目录被 `.gitignore` 排除，不进入仓库。dump 中存在 `RPG.Client.TarotBookWikiManager`，但不存在任务卡字符串要求的 `class TarotBookWikiDialog`，因此 `T1.2` 仍保持 blocked。
- 为便于后续只读复现，此前已把 `~/Downloads/hsr-ui-extract` 的全部 150,959 个条目（忽略 `.DS_Store`，约 191 GB）复制到 `~/Downloads/hsr-ui-extract-all`。
- 复核：源目录所有文件在副本中存在且字节数一致；15 个关键数据项额外做了 SHA-256 或目录文件清单比对，结果 0 差异。
- 副本仅用于本机取证，不进入仓库；项目运行和门禁仍以用户指定的原始完整目录为真相。

## 数据真相分层

1. `RectTransform` 的 anchor/pivot/size/position 来自原始 block 的 Unity 序列化对象。
2. `GameObject` 名称、层级、active 状态来自同一份序列化对象；某些 GO 的 typetree 被裁剪，需结合 split JSON 对账。
3. `~/Downloads/hsr-ui-extract/source-dump/probe-prefab-json/.../tarotbook` 的 951 个 JSON 提供父子关系证据，但不含几何字段，不能单独满足 dump schema。
4. 完整游戏截图只允许人工放在 `verify/shots/`，永不进入 `app/`，也不作为数据来源。

## 当前 M1–M3 状态

- `python3 tools/import_tarotbook.py` 从原始 block 直接反序列化 10 个 P0 状态的 RectTransform / GameObject / Image / Text / 布局组件；`node tools/check_dump.mjs dump/` 全绿。
- `python3 tools/build_sprites.py` 从 30 个 block 抽取 235 个 sprite 引用，字体 `RPG_CN.ttf` 已复制；`missing.json` 只剩 1 条无 sprite 的纯色 Graphic 记录。
- `node tools/build_layout.mjs dump app/data/states` 产出十态扁平布局；`tools/check_layout.mjs` 对十态通过，maxAabbErr=0px。
- 静态路径 A 无 `textQuads`，`check_dump.mjs` 仅告警；Unicode 文本使用源字体直接渲染，字形位置精度登记在 `docs/FIDELITY.md`。
- M4 runtime 已安装原生 ES Module 入口、舞台缩放、图片/文本/遮罩渲染；M5 动画、M6 材质近似与 M7 状态机已落地。
- 性能预算：本地 Chromium 1920×1080 冷缓存下 `tools/perf.mjs --state catalog` 实测约 55–56fps、DOM 1402、堆约 3–4MB；门禁阈值为 ≥50fps、DOM ≤6000。

