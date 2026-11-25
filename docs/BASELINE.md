# 事实基线

本文件记录 Amphoreus Web 复刻的只读数据来源与版本。所有值来自本机复制数据，不从截图推断。

## 游戏与工具

- 游戏名：崩坏：星穹铁道（`StarRail_Data/app.info`）
- Unity 版本：2019.4.34f1（手册已核实）
- 全局元数据：`global-metadata.dat`，106840192 bytes
- 全局元数据 SHA256：`315707b69ff5eb76773e5ba1c889082e36e06a3ea5aa601fe7eaf683630a4fc9`
- 元数据头：`4d48590000000000`（MHY，加密）
- Node：当前执行环境 Node 22+
- Python：3.15，UnityPy 1.25.4，Pillow 13，NumPy，lz4
- Oodle：`~/Downloads/hsr-ui-extract/tools/libooz.dylib`
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

## 数据真相分层

1. `RectTransform` 的 anchor/pivot/size/position 来自原始 block 的 Unity 序列化对象。
2. `GameObject` 名称、层级、active 状态来自同一份序列化对象；某些 GO 的 typetree 被裁剪，需结合 split JSON 对账。
3. `~/Downloads/hsr-ui-extract/source-dump/probe-prefab-json/.../tarotbook` 的 951 个 JSON 提供父子关系证据，但不含几何字段，不能单独满足 dump schema。
4. 完整游戏截图只允许人工放在 `verify/shots/`，永不进入 `app/`，也不作为数据来源。

## 当前 M1 状态

- `dump/entrance.json` 已从原始主 block 生成，共 23 个节点，几何字段来自 block 中可读的 RectTransform。
- 该 dump 未达到手册 7.7 的 50 节点门槛，因此 `entrance` 当前状态为 **BLOCKED**，不得据此宣称 M1 通过或进入 M3。
- 其余 9 个 P0 状态尚无证据完整的 dump，状态为 **BLOCKED**。
- 2026-11-25 补核：`source-dump/probe-prefab-json/.../tarotbook` 950 份 JSON 与 `source-dump/tarot-main-json/.../tarotbook` 32 份 JSON 中，六个 RectTransform 几何关键字段出现次数均为 0；`tarot-prefabs`、`tarot-main-dump`、`tarot-main-dump2` 三个目录为空。
- 当前唯一可信的补齐方式是手册路径 B 的运行时对象树 dump；该步骤按手册 0.3 必须由人工在游戏内触发，模型不得假造。
- 禁止用截图或手调坐标补齐。
