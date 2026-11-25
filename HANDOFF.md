# HANDOFF

## 当前

M0 基础设施已落地：`tools/lib/gate.mjs`、`cdp.mjs`、`smoke.mjs`、四个门禁骨架、审计脚本、基线文档。
M1 已实现 host-side Oodle 解包与 UnityPy RectTransform 导出；`dump/entrance.json` 有 23 个节点，几何值来自原始 block。

## 下一步

1. **当前唯一可行解：按手册路径 B 补运行时对象树 dump。** 主 block 与两份 split JSON 已核对：`probe-prefab-json` 950 份 JSON、`tarot-main-json` 32 份 JSON，`m_AnchorMin/m_AnchorMax/m_Pivot/m_SizeDelta/m_AnchoredPosition/m_Rect` 出现次数均为 0；原始 block 的 type tree 被裁剪，UnityPy 只导出 23 个可达节点。
2. 路径 B 需要人工在游戏内进入 P0 状态并按 F8；模型不注入游戏、不进虚拟机。插件源码、命名规则与判据已在手册 7.3，本仓库只补了静态侧。
3. 10 个 dump 全绿后才启动 M2/M3/M4。

## 已知坑

- 主 block 有 304 个 bundle；其中部分 CAB typetree 被裁剪，UnityPy 会报错，必须逐文件加载并容忍。
- 原始 split JSON 不含几何字段，不能拿来“补 0”。
- 旧 `web/codex*` 是截图手调产物，按手册不复用。

## 未决

- 路径 B 的运行时 TMP quad dump 未启用；需要人工执行并产出 `dump/_raw/runtime/*.json`，之后可做 normalize。
- 手册 0.3 明确把“注入 dump / 点开每个界面按 F8”列为必须人工；这与用户“全自动、禁止虚拟机”的约束冲突，按手册保持 BLOCKED，不用截图或猜坐标替代。
- 游戏更新后 block 清单需重新冻结。
