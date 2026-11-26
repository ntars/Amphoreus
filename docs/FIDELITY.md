# 保真度差异登记

## 路径 A 静态导出限制

- 静态 prefab dump 从原始 Unity block 获取 `RectTransform` / `GameObject` / `Image` / `Text` / 布局组件；运行时实例生成的节点不在 dump 中。
- `Text.textQuads` 在静态路径 A 为 0（手册 7.7 允许降级为 warn）。当前文本使用 `RPG_CN.ttf` 与源码中的 `fontSize` / `color` / 对齐文本直接渲染；逐字字形仍有 ±1px 漂移风险。书页正文在静态 prefab 中是 `DevUI_Page0`–`DevUI_Page7` 占位符，运行时叙事文本不在已解包源码中，故不自行编造。
- 部分受限 `Image` / `Graphic` 没有 sprite（纯色 fill 或运行时生成），保留其源码颜色，不伪造 sprite。
- 10 个 P0 状态均通过 `stage.aabb` ≥90% 门禁和 `check_layout` 1px 断言；AABB 由同一份 Unity `localPosition` 变换链生成，CSS 绝对盒使用源码导出的同一 AABB。
- 源码 sprite 与字体不入库；仓库保留 MIT 代码与原创文档。游戏素材只在 `~/Downloads/hsr-ui-extract` 与 gitignored `app/assets/`、`dump/` 中使用。
- M5 动画从源码采样编译为 405 条 CSS `@keyframes`（862,699 bytes < 2MB），运行时使用 `.n > .a > .art` 三层结构；浏览器 computed transform 5,640 帧最大误差 0.0742px。M6 材质以 CSS 近似实现，不能宣称 shader 级逐像素一致。


## 自动门禁新增登记（2026-11-26）

- M5：47 个动画 clip 全部从源 `.anim` 采样编译；其中 27/568 条路径无法绑定现有十个静态 prefab 根节点，8 条为定时路径（2.6%，≤3%）。集中在卡片符号、按钮状态与数字路径；未猜坐标，路径清单在 `app/data/unbound.json`。运行时只播放已绑定 clip。
- M6：34 个 TarotBook 材质 JSON 已生成参数表（`app/data/materials.json`），CSS 近似覆盖 Glitch / Scanline / UVMove / Glow / Ring / Flow / Dissolve / OneChannel；等级 B（参数轨迹可追溯，噪声纹理不同）。Dissolve / OneChannel 未使用 WebGL，等级 C 原因：P0 静态路径没有 shader 源码级重建，避免伪造噪声。
- M7：状态机按手册 13.1 的源码定义实现；按钮命中由 `Image.raycastTarget` / `Button` 组件生成，事件名从节点名映射，未映射到源码定义的行为不执行。
- M8：CDP 冒烟十态全绿；十态 `--strict` 活跃渲染 AABB 最大误差 0.06px，`offsetWidth/Height` 误差 0.00px。浏览器 CSS 动画采样 5,640 帧，最大误差 0.0742px。
- M7：localStorage 只保存 `unlocked` 与 `lastState`（加 `v/at`），不保存原作资源 ID 映射。
- M6 证据限制：十个静态 dump 的 99 个 `wikiDialog` Image/Graphic 组件中，带非空 material 引用的为 0；材质表本身来自源材质文件，但运行时 CSS 特效没有节点级材质绑定证据，因此不宣称 P0 材质特效已逐节点复刻。
- 十态的数据与静态布局可用，但“逐像素一模一样”尚未达到，不能宣称完成。

## Spine 骨架运行时（2026-11-26）

- `app/js/spine.js` 已用源 `.skel.asset` 数据实现本地 Spine 4.1 子集运行时：贝塞尔 LUT、首播 setup blend、骨骼世界矩阵、交错权重网格与源 atlas UV。`tools/verify_spine_runtime.mjs` 将左页 `UI_TaroBook_Page` 的 setup、`FadeIn@0`、`FadeIn@0.2` 顶点与 UV 对照官方 4.1.56 运行时采样，通过 2e-3 容差；右页 `UI_TaroBook_PageR` 的 `FadeInR@0`、`FadeInR@0.2` 顶点与源网格采样锁定在同一容差内，未声称右页经过官方运行时交叉验证。
- `app/js/spine_render.js` 用 Canvas 2D 绘制源三角形网格，affine 平移由 UV 起点反推，修复了此前贴图三角形不落在画布上的根因。`tools/probe_spine.mjs` 在 `bookletCover`、`bookletPage`、`talk` 三态确认 canvas 有实际绘制像素。
- 右页采样必须从 setup pose 直接应用 `FadeInR`；`StandbyR` 在 0 时刻含把 slot attachment 置空的 timeline，它不是可用的初始姿态，也不得被运行时无条件预应用。
- 这证明书页骨架网格和动画采样来自解包源码并能在浏览器中绘制；它不等同于 E3 人工逐帧观感签字，也不把官方运行时代码或截图纳入仓库。

## 按钮状态（2026-11-26）

- 命中热点根因修复：TarotBook CAB 的入口按钮挂的是 RPG 包装脚本 `MonoInControlButton` / `IntroButton` / `UINavigationButton`，不是 uGUI `Button` 或 `AnimatorButton`。`tools/import_tarotbook.py` 之前只把 `AnimatorButton` 当按钮，导致 `BtnEntrance1` 等节点没有命中矩形，页面能渲染但点不动。现在四类脚本统一产出单个 `Button` 组件；entrance 命中节点从 4 个恢复到 8 个。
- `tools/probe_nav.mjs` 以真实 DOM 点击验证 `entrance→catalog→bookletCover→bookletPage`，并验证 `bookletPage/bookletCover/catalog` 的 Escape 回退与 `talk`/`wikiDialog`/`mail`/`star`/`reward` 的 Escape 归位；该门禁已加入 `run_all.mjs`。
- `click:term` 与 `click:mimi` 仍为 BLOCKED：`bookletPage` 的静态 prefab 里没有 Term/Mimi 按钮节点，`TarotBookWikiDialog` 与 `TarotBookMimiTalkPage` 是独立 prefab，进入入口由运行时 Lua 逻辑驱动。未用节点名猜测硬连。

- `app/js/input.js` 只使用 dump 中已有 `Highlight` / `Press` / `Selected` / `Disable` 子树的贴图和颜色，并用 `pointerenter/pointerdown/pointerup` 切换；没有状态贴图的命中节点不伪造亮度变化。`content/text/<state>.json` 来自 dump 的 `Text.text`，缺正文仍标 TODO。
- `app/css/booklet3d.css` 按手册 13.4 的 CSS 3D 路径实现翻页，时长来自解包 Spine `FadeIn` / `FadeInR` 的 1.333333 秒。源骨骼网格现由本地 Spine 运行时逐帧绘制；左页已对官方采样交叉验证，右页由源数据采样锁定。CSS 3D 翻页仍只是触发/观感层，E3 人工逐帧签字未完成。
- 静态 dump 中的 `SkeletonGraphic` 现已记录 SkeletonDataAsset 指针；Spine 的 `.skel`、atlas 与纹理保留在仓库外，只作为解码证据，不入库。
- `app/data/fx_bindings.json` 包含 Dissolve / OneChannel 的 shader 映射和 GLSL 字符串；`app/js/glitch.js` + `app/js/fx.js` 已接入单一 WebGL 层；`?fx=gl&freeze=1` 冒烟在 wikiError/star 通过，E3 人工观感对照仍未勾。

## 材质近似表

| kind | 等级 | 差异 | 参数来源 |
|---|---|---|---|
| Glitch | B | 伪元素 RGB 分离/切片，非原 shader 的精确 UV 噪声 | `UI_TarotBook*Glitch*.json` |
| Scanline | B | 固定扫描线间距，未复刻材质纹理采样 | `UI_TarotBookMailDialog_1001_ScreenScan.json` / `UI_TarotBook_Error_1001_Scanline.json` |
| UVMove | B | `background-position` 近似 UV 平移，不涉及原贴图采样器 | `UI_TarotBook*UVMove*.json` |
| Glow / Ring / Flow | B | CSS 阴影/边框/渐变动画，光晕扩散与节奏近似 | `UI_TarotBook*Glow*.json` / `UI_TarotBook*Ring*.json` / `UI_TarotBook*Flow*.json` |
| Dissolve / OneChannel | C | 未用 WebGL；仅 CSS filter 近似，噪声/阈值不可追溯 | `UI_TarotBook*Dissolve*.json` / `UI_TarotBook*OneChannel*.json` |

## 交付

交付：2026-11-26 / Star Rail 2019.4.34f1 / dirty-worktree（未提交）
说明：可验证 E1 门禁全部通过；人工 E3（并排截图、真机/浏览器兼容）与三项需人工签字的数据采集任务仍未完成，故不宣称 M0–M10 完全交付。

## 本次续作补充（2026-11-26）

- `build_clips.mjs --clip` 现在只编译请求的单个 clip 到 `app/data/clips/<clip>.css`（90 条源路径、48 条 `@keyframes`），不会覆盖全量 `app/css/clips.css`；`--all` 也不会清空全量样式表。T5.3 与 T5.8 可按原验收命令连续复跑。
- 全量门禁 `tools/run_all.mjs`、发布包 `tools/build.mjs --out dist`、性能与视口矩阵均复跑通过；任务卡的 71 条可自动验收命令通过，早期 5 条采集/签字卡仍按证据不足保留。
- `docs/REGRESSION.json` 已按当前生成产物重新计算；它仍不是门禁输入，不能替代实际门禁输出。

## E3 截图复核后的运行时修正（2026-11-26）

- 已在 `verify/shots/` 以源码渲染十个状态，并保存 `bookletPage` 翻页和 `wikiError`/`star` 的 `?fx=gl` / `?fx=css` 对照图；截图仅用于人工查看，不进入 `app/`。
- 截图暴露两个真实渲染错误并按 Unity 语义修复：`app/js/image.js` 原先把带色 Sprite 的 `Graphic.color` 当作纯色矩形填充，现改为按源码 sprite 做亮度遮罩、颜色相乘与 alpha 处理；Unity `Mask(showMaskGraphic=false)` 原先把 mask 图本身画成实心矩形，现由 `app/js/mask.js` 只作为祖先裁剪、不产生自身可见图形。
- `app/js/text.js` 的无 quad 文本改用源码 `fontSize` 作为行高并禁用换行，减少运行时字形与相邻节点的重叠；静态路径仍无 `textQuads`，逐字位置不能宣称已验证。
- 视觉复核后 `bookletPage` 的大块紫色/蓝色遮挡已消失；`catalog` 的实心蓝色按钮底和白色大面积遮挡已消失，但页面布局仍与官方存在显著差距，未达到逐像素复刻。E3 的“符合官方”项仍保持未完成。
- 修正后 `tools/run_all.mjs` 全门禁、`wikiError`/`star` 的 WebGL 冒烟继续通过；这些门禁证明运行时无报错、几何与动画数据一致，不证明视觉已等同官方。

## 有效可见性与文本结构修正（2026-11-26）

- `build_layout.mjs` 现在按 Unity 层级传播有效 `active`：源 prefab 中 inactive 父节点下的变体不再被错误渲染。该修正覆盖按钮的 Selected/Disable 等状态子树，几何门禁仍以源 `stage.aabb` 为准并全部通过。
- `app/js/text.js` 现在把文本写入 `.art > .text`，与 `app/css/app.css` 的文本规则一致；不再把文本样式直接套在通用 `.art` 容器上。
- `tools/diagnose_fidelity.mjs` 以只读 CDP 文本报告检查十态有效可见性、文字/图片绘制与缺图；不截图、不把截图作为数据源。零尺度节点和被祖先 mask 裁掉的子节点按源码条件排除。该门禁已并入 `tools/run_all.mjs`。
- 这些修正只解决源码语义与 DOM 结构错误；页面整体与官方逐像素一致仍需 E3 人工签字，当前不宣称完成。


## 本地化富文本安全渲染（2026-11-26）

- 源码本地化字符串包含内联标签（如 `δ-me<ub>13</ub>.exe`）。`app/js/text.js` 现在以 `document.createTextNode` 渲染原文，不把标签解释为 HTML，避免注入并保留源码字面文本。
- `tools/verify_states.mjs` 增加十态断言：`.text` 内不得出现子元素；有内联标签的源字符串必须仍以纯文本节点显示。全门禁 exit 0。


## TMP SDF 字体证据（2026-11-26）

- `tools/extract_fonts.py` 从解包字体 bundle 的 Texture2D alpha 通道导出 8 张 `RPG_CN_SDF_TarotBook_*_Atlas.png`，并从 TMP 1.1.0 序列化布局（glyph 偏移 216、glyph 步长 48、character 步长 16）导出 376 条 glyph 与 376 条字符映射，生成 `dump/_fonts.json`。
- 字体图集使用源 Texture2D 的 A8 通道；此前误把全零的 RGB 通道作为灰度图会导致 SDF 全黑，现已修正。每张图的 SHA1 与 dump 元数据由 `tools/build_fonts.mjs` 验证。
- 当前静态路径没有 `textQuads`，运行时仍使用源 `RPG_CN.ttf` 直接渲染；SDF 字形数据已具备，但尚未加入逐字 quad 渲染，不能据此宣称文本逐像素一致。
- TMP `faceInfo` 已按序列化顺序 `(ascentLine, lineHeight, pointSize)` 从偏移 156 读取：`ascentLine=85.89`、`lineHeight=64.82`、`pointSize=52`（8 个字体一致）；`_fonts.json` 的 `metricsProvenance` 与 `source.faceInfoOffset` 记录字段来源。组件→图集绑定仍未从 Text 组件中定位，因此这些 SDF 数据不能作为当前逐像素文本证据。

## SDF 字体证据的运行时边界（2026-11-26）

- 8 张 SDF 图集和字形表已作为 `app/data/assets.json.sdfFonts` 保留，但没有源码依据把任一具体 Text 组件绑定到某个字号图集；`assets.json.fonts` 仍只有源 `RPG_CN.ttf`。这是为了避免把“字号 330”误当作组件字体引用。恢复逐字 SDF 渲染前必须先在 Unity 组件序列化数据中定位 `m_FontAsset` 引用并提交门禁断言。
- `tools/build_sprites.py` 已能从 `dump/_fonts.json` 可重复生成 `assets.json.sdfFonts`，包括 `metrics` 与图集路径；显式 `sdfFont` 的路径 2 渲染由 `probe_text.mjs` 锁定，重跑资产构建不会再静默丢失字体表。

## 字体门禁补强（2026-11-26）

- `tools/build_fonts.mjs` 现已拒绝缺少或错误的 `faceInfoOffset`、缺失图集 SHA1/尺寸、无效 faceInfo 或 char→glyph 断链的 dump；8 个 TMP 字体均通过。字体证据与渲染证据仍分开：这不能替代组件→图集绑定或逐字 quad。

## 字体提取告警（2026-11-26）

- 解包字体 bundle 中 19 个与本任务无关的 CAB 具有不完整 TypeTree，UnityPy 解析时会打印告警；`tools/extract_fonts.py` 默认静默并在 `--fail-on-warning` 模式汇总为 `NOTE`。这些 CAB 被跳过，目标 8 个 TMP  MonoBehavior 与 8 张 Texture2D 仍全部导出，不能据此宣称整块无损解析。

## 构建可重复性（2026-11-26）

- `tools/build.mjs` 的 `manifest.generatedAt` 固定为 `1980-01-01T00:00:00.000Z`，避免两次同输入构建的清单仅因时间戳漂移；连续两次构建到不同目录后 `diff -qr` 结果为 0。
- 此结论只覆盖静态发布包内容一致性，不覆盖 E3 视觉一致性。

## 视口门禁（2026-11-26）

- `tools/smoke_matrix.mjs` 已加入 `tools/run_all.mjs`，自动覆盖 1920×1080@1、1280×720@1、2560×1440@1、1707×960@1.5；4/4 通过只说明舞台适配、无缺图，不代表 E3 视觉一致。

## 未解证据卡（2026-11-26）

- 当前 `tasks.json` 中 `T1.2`、`T1.3`、`T1.5`、`T1.9` 仍为 `blocked`；这些是早期人工采集/签字或外部环境证据，不能通过修改验收命令伪造为通过。`T1.8` 已由真实 SDF 字体 dump 与图集哈希解锁。
- 即使 74/78 任务卡和全部自动门禁通过，E3 视觉一致性仍未人工签字，项目状态只能按手册 17.15 标为实验性/可用验证版，不能标完全 DONE。

## 动画运行时修复与探针（2026-11-26）

- 新探针发现 `build_clips.mjs` 原先先写单 clip JSON、后生成 CSS channel 名，导致运行时读取的 `app/data/anim/<clip>.json` 缺少 `transformCssName` 等字段；页面因此只有 `data-clip` 标记而无真实 `getAnimations()`。已改为先编译 CSS 名称再写运行时 clip 文件，并全量重建 47 个 clip。
- `tools/probe_interaction.mjs` 现在验证：entrance 有已挂载 clip 且至少一个活动 CSS animation，catalog 命中节点点击能切换状态，Escape 返回 catalog，控制台无异常。当前结果 `clips=27, activeAnimations=26, nav=bookletCover, esc=catalog`。
- 该探针只证明动画与交互在 DOM 中实际发生，不证明动画曲线逐像素等同官方；E3 观感签字仍未完成。

## 交付探针（2026-11-26）

- `tools/probe_delivery.mjs` 验证十态均可由 `?state=` 直接打开、WebGL 不可用时出现可读中文降级提示、字体缺失时出现 `data-missing-font`；当前结果 `states=10/10, webglFallback, fontFallback`。
- 这些是 M9「状态可枚举」「降级可见」的自动化证据，不代表 E3 人工视觉验收或真实 GPU 材质一致性。

## 文本 SDF 路 2 与绑定边界（2026-11-26）

- `app/js/text.js` 已实现手册 10.5 的路 2：按 TMP `FaceInfo` 的 `pointSize/lineHeight/ascent` 缩放，逐字从 `_fonts.json` 取 `bearing/advance/atlas rect`，用 alpha 图集作 `mask-image`，不依赖截图或逐像素试错。
- `tools/probe_text.mjs` 独立验证 `RPG_CN_SDF_TarotBook_300` 的“之”字形：1 个 SDF quad、字体来源、宽高、bearing、遮罩尺寸与位置均与图集记录一致；无显式 `sdfFont` 的节点必须落到源 `RPG_CN.ttf`。
- 绑定边界：目标 Text 原始序列化的 `m_Font` 为空，且目标 CAB 中没有 8 个 SDF 资产路径指针。因此生产状态不会按字符覆盖率猜图集；只有 dump 明确给出 `sdfFont` 时才启用 SDF。当前 P0 文本仍是 TTF 降级，不能宣称 SDF 文本逐像素完成。
