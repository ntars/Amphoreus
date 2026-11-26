# HANDOFF

## 当前

最新复核（2026-11-26）：官方 cn TextMap 已解析为 `dump/_textmap.json`（373,708 个唯一 hash / 165 个 32-bit 碰撞），`tools/verify_textmap.mjs` 已接入 `run_all.mjs`。`TextID` 哈希构造器由 `GameAssembly.dll` 反汇编确认（.NET `string.GetHashCode()` 的 x86 变体）；配置 blob 中 TarotBook 章节 ID 与该表同 hash 空间，反查可得到 `1`、`1-1` 等官方标签。

目录页真实入口已按 Lua 绑定修复并纳入导航门禁：`FunctionList/BtnWiki -> btn_wiki -> _on_btn_wiki_click -> Ui.TarotBook.Wiki.TarotBookWikiDialog`，`FunctionList/BtnMem -> btn_mem -> _on_btn_mem_click -> MimiButton:GetDefaultInteraction/TryPlayInteraction -> UI/TarotBook/TarotBookMimiTalkPage.prefab`。`probe_nav.mjs` 现在真实点击 `catalog BtnWiki -> wikiDialog` 与 `catalog BtnMem -> talk`；此前 `click:term` / `click:mimi` 不可达的问题不再由 bookletPage 凭空补按钮。

完整缓存 `/tmp/amphoreus-m1-v2` 中的 `CAB-3d60d57184d183dcb610869a0670f3ab` 可解析出四个 `SkeletonGraphic` 组件；`bookletPage` 的 dump 与编译状态现已保留精确 64-bit SkeletonDataAsset 指针（左页 `8451025478121060839`，右页 `-348631082036145761`），并由 `verify_states.mjs` 门禁锁定。重跑 `build_layout.mjs` 后全部门禁仍为 exit 0。

第二轮复核发现并修复两处真实渲染错误：编译状态原先只按节点自身 `active` 显示，导致源 prefab 中 inactive 父节点下的活动变体被渲染；现由 `build_layout.mjs` 传播有效 active。文本原先直接写在 `.art` 上，与 `app.css` 的 `.text` 规则不匹配；现 `app/js/text.js` 创建 `.text` 子元素。新增 `tools/diagnose_fidelity.mjs` 并检查十态有效可见性与绘制覆盖，已加入 `run_all.mjs`；全门禁 exit 0。

注意：如果只用不完整的 CAB 缓存重跑 `import_tarotbook.py`，脚本会跳过缺失 CAB 并保留旧 dump，可能产生旧版退化数据；必须用完整缓存重建，且随后复跑 `verify_states.mjs`。

M0–M7 的可验证静态/动画/交互链已落地：原始 block → 10 态 dump → 235 sprite + 字体 → 十态编译布局 → 原生 ES Module 运行时；动画编译为 `app/css/clips.css`（405 条规则 / 862,699 bytes），DOM 使用 `.n > .a > .art`，进度使用 `app/js/save.js`。`check_dump`、`build_layout`/`check_layout`、`verify_assets`、`verify_states`、`verify_clips`、`verify_animations`、`verify_materials`、`audit_no_screenshots` 全绿，十态 CDP 冒烟全绿。

## Spine 骨架运行时（2026-11-26）

## 交互可用性修复（2026-11-26）

- 入口按钮原本不可点击：`BtnEntrance1` 挂的是 `MonoInControlButton` + `IntroButton`，而 importer 只认 `AnimatorButton`。现已把 `MonoInControlButton` / `IntroButton` / `UINavigationButton` 一并解析为 `Button`（同一节点只产一条），entrance 命中节点 4→8。
- 新增 `tools/probe_nav.mjs` 并接入 `run_all.mjs`：真实点击 `entrance→catalog→bookletCover→bookletPage`，以及六个状态的 Escape 回退全部通过。
- `btn_wiki` / `btn_mem` 的真实入口在 catalog：已按 Lua binder 与 prefab 路径接入并验证；bookletPage 本身仍无 Wiki/Mimi 按钮，因此不伪造节点。

- 书页 Spine 运行时已修复：左页对齐官方 4.1.56 采样，右页按源网格采样锁定；`verify_spine_runtime.mjs`、`probe_spine.mjs` 均 PASS，且已纳入 `run_all.mjs`。`app/js/spine.js` 解析源曲线/骨权重/UV，`app/js/spine_render.js` 用 Canvas 2D 绘制源三角形网格；修复点是权重数组交错格式与 affine 平移项。右页 `StandbyR` 会在 0 时刻清空 attachment，因此不能当作初始姿态预应用。
- 仍需区分“骨架数学与绘制已验证”和 E3 人工视觉一致性；后者尚未签字，任务卡 `T1.2/T1.3/T1.5/T1.9` 也保留 blocked。

## 下一步

1. 人工 E3：`verify/shots/` 已保存十态、翻页与 `?fx=gl` / `?fx=css` 对照图，但截图只证明可观察，不证明与官方一致；浏览器/设备兼容与长时运行仍为人工项。
2. M6：Dissolve / OneChannel 仍为 C 级 CSS 近似；若要升 A 需 source-driven WebGL shader，不得凭截图调参。
3. M5：8 条定时路径仍为运行时预制体/数字路径证据缺口，保留在 `app/data/unbound.json`；比例 2.6% 已达门禁阈值。静态 dump 没有非空 Image 材质引用，M6 特效目前只登记源材质参数，不宣称节点级绑定覆盖。
4. M9：`BUILD_INFO.json` 与 `docs/REGRESSION.json` 已按当前生成产物重新同步，但 `REGRESSION.json` 不是门禁输入；发布包仍不得包含游戏素材。

## 已知坑

- 不要恢复旧 `web/codex*` 截图/CSS 手调实现；新实现全在 `app/`、`tools/`、`dump/`。
- 静态 prefab 的 `localPosition` 与 `anchoredPosition` 在 stretch 节点下不同源；当前 CSS 绝对盒直接使用源 `stage.aabb` 保证几何门禁一致，若改公式需重新验证十态。
- Oodle 解码必须用外部 `unoodle`，不要用 `libooz.dylib`；`catalog` 的 CAB 不在当前缓存中，已保留先前验证过的 dump 快照。
- 带色 Sprite 必须按 Unity 的乘法着色/亮度遮罩渲染；`Mask(showMaskGraphic=false)` 不能把 mask 图当可见背景，否则会出现源码不存在的色块。
- 截图复核发现布局虽过几何门禁，页面仍显著不像官方；不得因此调坐标猜布局，需回到原始 prefab / 组件证据定位缺失状态或渲染语义。
- `build_clips.mjs --clip` 只输出 `app/data/clips/<clip>.css`，不改 `app/css/clips.css`；`--all` 也不得清空全量样式表，只有 `--all --compile-css` 负责重建全量 CSS。
- 任务卡里 4 条早期采集/签字卡（`T1.2`、`T1.3`、`T1.5`、`T1.9`）仍与后续实现门禁冲突，不能通过修改验收脚本来伪造通过；当前可复跑的 72 条自动验收与全部门禁均通过。
- 不要为了“全绿”去修改任务卡验收命令；这 4 条是人工采集/签字证据缺口，保留未通过状态比伪造通过更诚实。

## 最新增量（2026-11-26）

- 修复 `build_sprites.py` 重跑后丢失 `sdfFonts` 的回归：脚本现在从 `dump/_fonts.json` 重建运行时所需的 SDF 字体表（含嵌套 metrics 与 `file` 路径），不再依赖手工恢复。重跑 `build_sprites.py` 后 `probe_text.mjs` 与 `run_all.mjs` 均 exit 0。
- `build_layout.mjs` 现把 SmoothMask 的反相字段作为 `smoothMaskReverse` 原样编译，`verify_masks.mjs` 对 7 个反相节点锁定该字段。浏览器遮罩层仍只呈现正向裁剪并标注 `data-reverse-mask=1`，不把 CSS 近似当作官方反相模板。

- 本地化字符串中的 `<ub>` 等内联标记现在由 `app/js/text.js` 以纯文本节点渲染，不再被浏览器当成 HTML；`verify_states.mjs` 已加入十态断言。
- 复跑 `tools/run_all.mjs`、`tools/verify_docs.mjs` 均 exit 0；行为修正未改变源数据、几何门禁或 MIT 边界。
- TMP SDF 字体证据已补齐：8 个字体、376 glyph/char、8 张 A8 图集及 SHA1 校验进入 `dump/_fonts.json` / `app/assets/fonts/`；`T1.8` 已按真实命令解锁。TMP `faceInfo` 已按序列化顺序从偏移 156 读取；但组件→图集绑定未定位，静态路径无 `textQuads`，运行时仍用源 TTF，逐字 quad 未接入；Spine 骨骼网格已可绘制并通过源采样交叉验证，但 E3 人工验收未完成。

- `build_fonts.mjs` 已把字体图集哈希、faceInfo 来源/数值和 char→glyph 一致性纳入门禁；仍不把 SDF 数据当作已绑定到运行时 Text 的证据。

## 完整本机证据副本（2026-11-26）

- 用户明确完整游戏数据在 `~/Downloads/hsr-ui-extract/StarRailGame-full/`，后续直接只读使用该目录，不再重复提取。`~/Downloads/hsr-ui-extract-all` 是此前建立的完整副本（150,959 条目、约 191 GB），逐文件字节数复核 0 差异。

- 修复单 clip 运行时 JSON 缺失 CSS channel 名的根因：`build_clips.mjs` 先应用 CSS 名称再写 `<clip>.json`；新增 `tools/probe_interaction.mjs` 并纳入 `run_all.mjs`，验证活动动画、命中导航、Escape 返回和无控制台异常。该探针不替代 E3 视觉签字。

- 新增 `tools/probe_delivery.mjs` 并纳入 `run_all.mjs`：十态直接打开、WebGL 降级提示、字体缺失提示均通过自动探针；不替代 E3 人工签字。

- 文本路 2 已接入并可独立验证：`probe_text.mjs` 校验 SDF quad 的源字体度量、bearing/advance、遮罩 UV；Text 的 `m_Font` 为空，未伪造组件→图集绑定，P0 仍使用 TTF 降级。
- 已从现有完整游戏目录生成 `out/il2cpp/dump.cs`（HSRGlobalMetadata，178 MB），但其中只有 `TarotBookWikiManager`，没有 `class TarotBookWikiDialog`；`T1.2` 不改为 done，`out/` 已加入忽略规则，避免生成源码入库。
