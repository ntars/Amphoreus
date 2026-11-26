[简体中文](README.md) | [English](README_EN.md)

# Amphoreus · 永恒之地翁法罗斯

**仓库描述**：`翁法罗斯：一个只可观看、由种子驱动的《崩坏：星穹铁道》世界模拟，附零图片的「如我所书」Web 复刻 | A watch-only, seed-driven simulation of the Honkai: Star Rail world, with a zero-image web recreation of the in-game Tarot Book.`

**话题标签**：`python` `simulation` `worldbuilding` `honkai-star-rail` `fan-project` `css-art` `zero-dependency` `sqlite` `deterministic` `procedural-generation` `narrative` `local-first` `web-ui` `vanilla-javascript` `creative-coding` `generative-art` `offline` `mit-license` `text-ui` `data-visualization`

![Status](https://img.shields.io/badge/status-开发中-orange?style=flat-square)
![Python](https://img.shields.io/badge/python-3.11%2B-3776ab?style=flat-square&logo=python&logoColor=white)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-2ea44f?style=flat-square)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

一个由种子驱动、只可观看的翁法罗斯世界模拟器，附一套零图片、纯 CSS 绘制的「如我所书」网页复刻。

[快速开始](#快速开始) · [核心特性](#核心特性) · [目录结构](#目录结构) · [已知问题与限制](#已知问题与限制) · [后续路线图](#后续路线图) · [许可证](#许可证)

---

## 项目简介

翁法罗斯是《崩坏：星穹铁道》里由「帝皇权杖 δ-me13」运行的模拟世界。本项目把它按公开设定重新实现了一遍：十二位泰坦、十三位黄金裔、十二枚火种、一座正在被黑潮吞掉的星球，全部由代码演算，而不是脚本预设。

项目包含两个部分：

1. **世界模拟器**：一个持续运行的世界状态机，按光历推进，人口、秩序、信仰、黑潮水位逐拍松弛演化，重大事件由种子决定。
2. **「如我所书」网页复刻**：把游戏内书册界面用纯 HTML + CSS 重建，运行时不加载任何位图或 SVG，所有图案由渐变、边框、`clip-path` 与时序变量绘制。

**核心思路**：世界状态即一组数，随机源由 `seed × 1000003 + cycle × 9176 + tick × 7919` 派生。同一种子必得同一段历史，换种子即换一个翁法罗斯。叙事层与规则层分离：规则引擎决定「发生了什么」，本地模型只决定「怎么讲」。

**适用场景**

- 想观察一个自洽世界如何在数天里缓慢演化，并生成一部可读的编年史。
- 想研究确定性模拟、程序化叙事，或纯 CSS 界面复刻的工程做法。
- 作为《崩坏：星穹铁道》玩家二创，用于阅读与展示。

**不适用场景**

- 想要可操作的游戏：本项目**不可操控**，没有战斗、抽卡、任务、存档或联网。
- 想要逐像素通过官方基准验收：当前缺少官方四张标准基准截图，不宣称逐像素一致。
- 想要嵌入生产系统：这是爱好者二创项目，不提供 API 稳定性承诺。

### 优势与局限

**优势**

| 优势 | 说明 | 验证方式 |
| --- | --- | --- |
| 零第三方依赖 | 运行时只用 Python 标准库 | 不装任何包也能启动 |
| 确定性因果 | 种子固定则历史固定 | 同一 `seed` 重复 `once 300` 结果一致 |
| 零图片界面 | `/book` 运行时不加载 PNG/SVG | `tools/selftest.py` 硬检查页面源文件 |
| 自证脚本齐全 | 语法、回归、HTTP 冒烟一键跑 | `python3 main.py check` |

**局限**

| 局限 | 影响范围 | 临时规避方式 |
| --- | --- | --- |
| 未拿到官方基准图 | 无法出具逐像素验收结论 | 只用结构与比例核对，明确标注未达像素级 |
| 复刻输入依赖解包素材 | 缺失素材时部分界面无法继续对齐 | 保留 `docs/assets/extracted/` 证据并登记差异 |
| 叙事依赖本地模型 | 无 Ollama 时文风降级为模板 | 连不上自动降级，模拟不中断 |

## 核心功能

- **世界推进**：执行 `python3 main.py start` 后按光历逐拍演化，每拍更新城邦指标、泰坦状态与火种进度。
- **确定性种子**：首次启动随机生成种子并写入 `config.toml`；填入固定 `seed` 即锁定该世界的因果。
- **事件判定**：每拍按概率判定夺火、城邦陷落、泰坦陨落与再创世；十二枚火种集齐后 δ-me13 推进一个阶段。
- **编年史生成**：「如我所书」按十三卷、每卷五节记录已发生的事，节名照官方原文录入。
- **网页复刻**：访问 `/` 看仪表盘，访问 `/book` 看只读书册；书封、目录、命路星图均由 CSS 绘制。
- **后台与自启**：`daemon` 后台挂机，`install` 注册 launchd 开机自启（macOS），`status` 查看进度。
- **自检回归**：`check` 在临时数据库与临时端口上跑语法、端到端回归与 HTTP 冒烟，不触碰真实世界。

## 核心特性

### 零依赖的确定性世界模拟

- **价值**：任何人克隆后无需安装依赖即可复现同一段历史，便于验证与二次创作。
- **实现方式**：`amphoreus/engine.py` 以种子派生随机源，指标向平衡点松弛而非随机加减；`amphoreus/db.py` 用标准库 `sqlite3` 持久化。
- **差异化**：不依赖 NumPy / Pandas 等科学计算栈，也不依赖游戏客户端。
- **证据**：`python3 main.py once 300` 在相同 `seed` 下输出一致；`main.py check` 全绿。

### 纯 CSS 的「如我所书」界面

- **价值**：避免用截图充当渲染源，放大不失真，且可在无网络环境打开。
- **实现方式**：`app/css/` 与页面内联样式用渐变、边框、伪元素与 `clip-path` 复原书册；关键帧时间点从解包动画曲线生成到 CSS 变量。
- **差异化**：不引入 React/Vue/Tailwind，不加载任何位图或外部资源。
- **证据**：`tools/selftest.py` 检查页面源文件无 `.png/.svg/.jpg/.webp/<img/url(`；`tools/audit_no_screenshots.mjs` 需 0 命中。

### 规则与叙事分离

- **价值**：模型不可用时世界照常演化，不会被叙事层阻塞。
- **实现方式**：`amphoreus/narrate.py` 默认接本地 Ollama（`qwen3.5:4b`），失败即降级为模板文本。
- **差异化**：模拟推进与文本生成解耦，叙事延迟不影响 tick。
- **证据**：断开 Ollama 后 `status` 仍持续推进。

## 设计细节与工程取舍

### 为什么用「松弛」而不是随机加减

- **场景**：长时间运行时，人口与黑潮若随机游走会归零或顶满。
- **处理方式**：各指标每拍朝平衡点按比例靠近，再叠加小幅扰动。
- **原因**：保证世界长期可运行，同时保留事件的不确定性。

### 为什么再创世不复位

- **场景**：十二枚火种集齐后进入下一轮。
- **处理方式**：`cycle + 1` 改变随机源，但保留种子。
- **原因**：让第二轮历史与第一轮不同，避免简单重放。

### 为什么界面坚持零图片

- **场景**：早期版本用截图或位图拼界面，放大模糊且违背复刻原则。
- **处理方式**：所有图形改为 CSS 几何与渐变，必要时用开发期脚本把官方素材描摹为路径数据。
- **原因**：运行时不依赖素材文件，同时保留可复核的形状来源。

## 技术栈与依赖清单

| 类别 | 技术或组件 | 版本约束 | 用途 |
| --- | --- | --- | --- |
| 运行时 | Python | 3.11+（推荐 3.13） | 世界模拟、HTTP 服务、CLI |
| 存储 | SQLite（标准库 `sqlite3`） | 随 Python | 世界状态与事件持久化 |
| 前端 | HTML / CSS / Vanilla JS | 无构建链 | 仪表盘与「如我所书」 |
| 校验 | Node.js 脚本（`tools/*.mjs`） | 开发期可选 | 几何、素材、截图与门禁校验 |
| 叙事（可选） | Ollama + `qwen3.5:4b` | 本地可用即可 | 文本生成，缺失时降级 |

运行时无第三方包；`tools/` 下的 Node 脚本只在开发期使用，不属于运行依赖。

## 安装

环境要求：Python 3.11+（推荐 3.13）；macOS / Linux / Windows 均可运行服务端，验证脚本需要 Node.js。

```bash
git clone https://github.com/ntars/Amphoreus.git
cd Amphoreus
python3 main.py check
```

预期输出（节选）：

```text
语法检查通过
回归用例全部通过
HTTP 冒烟通过
```

升级：`git pull`。卸载：删除目录即可；`python3 main.py uninstall` 可先移除 launchd 开机自启。


## 数据驱动复刻（M0–M9）

新的「如我所书」复刻位于 `app/`，由原始解包数据驱动，不再使用截图或手调 CSS：

```bash
# 生成/校验静态数据（源数据在 ~/Downloads/hsr-ui-extract，不入库）
python3 tools/import_tarotbook.py --cache /tmp/amphoreus-m1-v2 --out dump
python3 tools/build_sprites.py --cache /tmp/amphoreus-m1-v2 --dump dump --app app
python3 tools/extract_fonts.py --block /tmp/amph-font-block --dump dump --assets app/assets/fonts --quiet
/Applications/ChatGPT.app/Contents/Resources/node tools/build_layout.mjs dump app/data/states
/Applications/ChatGPT.app/Contents/Resources/node tools/build_clips.mjs app/data/anim
/Applications/ChatGPT.app/Contents/Resources/node tools/verify_materials.mjs
/Applications/ChatGPT.app/Contents/Resources/node tools/run_all.mjs
/Applications/ChatGPT.app/Contents/Resources/node tools/build.mjs --out /tmp/amph-dist-verify
/Applications/ChatGPT.app/Contents/Resources/node tools/perf.mjs --baseline docs/BASELINE.md

# 浏览器打开十个状态之一
python3 -m http.server 8080 --directory app
# http://127.0.0.1:8080/?state=wikiDialog
```

当前状态：M0–M9 的可验证 E1 门禁已覆盖 78 张任务卡（其中 4 张早期采集/签字卡仍为 `blocked`）：十态 AABB 最大约 0.03–0.06px、47 个 clip / 405 条 CSS 规则、8 个 TMP SDF 字体图集 / 376 字形（含显式绑定探针）、浏览器动画采样最大误差 0.0742px、catalog 约 55–56fps。逐像素人工 E3、shader 级材质与运行时预制体未绑定路径仍见 `docs/FIDELITY.md` 与 `docs/ACCEPTANCE.md`；不宣称逐像素一致或全部人工验收完成。仓库只提交 MIT 代码与原创文档；游戏素材与提取产物均不入库。

复跑动画验收时可依次执行 `node tools/build_clips.mjs --clip TarotBookWikiDialog_Normal_FadeIn`、`node tools/verify_clips.mjs --all`。单 clip 产物写入 `app/data/clips/`；全量样式表仅由 `node tools/build_clips.mjs --all --compile-css` 重建。`docs/REGRESSION.json` 已随当前产物更新，但不是门禁输入。

## 快速开始

启动世界并打开仪表盘：

```bash
python3 main.py start
```

然后在浏览器打开 <http://127.0.0.1:8760/>，书册在 <http://127.0.0.1:8760/book>。

常用命令：

| 命令 | 作用 |
| --- | --- |
| `python3 main.py start` | 前台运行，`Ctrl-C` 停止 |
| `python3 main.py daemon` | 后台挂机，关闭终端也继续 |
| `python3 main.py stop` | 停止后台进程 |
| `python3 main.py status` | 查看当前年份与火种进度 |
| `python3 main.py once 300` | 只推进 300 拍后退出，用于验证 |
| `python3 main.py reset` | 清空世界（需输入 `yes` 确认） |

## 配置说明

配置写在项目根目录 `config.toml`，首次启动自动生成。

| 键名 | 类型 | 默认值 | 必填 | 取值范围 | 作用 | 示例 |
| --- | --- | --- | --- | --- | --- | --- |
| `seed` | integer | 启动时随机 | 否 | 任意正整数 | 决定世界因果 | `20261125` |
| `pace.mode` | string | `1:1` | 否 | `1:1` / `accelerated` | 时间流速模式 | `accelerated` |
| `pace.world_days_per_real_second` | float | `1.0` | 否 | `>0` | 加速模式下每秒推进的世界日 | `2.0` |
| `pace.lock_speed` | boolean | `false` | 否 | `true` / `false` | 是否在网页放出调速控件 | `false` |
| `port` | integer | `8760` | 否 | `1024–65535` | HTTP 服务端口 | `8760` |
| `narrate.base_url` | string | `http://127.0.0.1:11434` | 否 | 合法 URL | 本地模型地址 | `http://127.0.0.1:11434` |
| `narrate.model` | string | `qwen3.5:4b` | 否 | 已安装模型名 | 叙事模型 | `qwen3.5:4b` |

配置优先级：`config.toml` > 内置默认值。热更新：修改后需 `python3 main.py stop && python3 main.py daemon` 重启生效。

## API 或模块说明

内置 HTTP 服务提供页面与只读接口，非稳定 API。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/` | GET | 世界仪表盘 |
| `/book` | GET | 「如我所书」只读书册 |
| `/api/status` | GET | 返回当前年份、拍数与火种进度 |

返回值示例：

```json
{"year": 42, "tick": 8064, "seeds": 3, "cycle": 1}
```

调用示例：

```bash
curl -s http://127.0.0.1:8760/api/status
```

错误码：服务未启动返回连接拒绝；路径不存在返回 `404`。无限流。

## 目录结构

```text
Amphoreus/
├── main.py              # CLI 入口：start/daemon/stop/status/check
├── amphoreus/           # 世界模拟包：engine、db、narrate、server、config
├── app/                 # 「如我所书」网页：HTML/CSS/JS，运行时零图片
├── tools/               # 开发期校验脚本：几何、素材、截图、像素比对
├── docs/                # 验收、决策、素材取证与阶段记录
├── data/                # 运行时数据库与日志（不入库）
├── dump/                # 解包 UI 快照（不入库）
└── config.toml          # 世界配置：种子、节奏、端口、叙事模型
```

## 性能表现

测试环境：Apple Silicon macOS，Python 3.13，空数据库冷启动。

测试方法：`python3 main.py once 3000` 计时。

| 指标 | 数值 | 对比基线 |
| --- | --- | --- |
| 3000 拍推进 | 约 1–2 秒 | 无外部基线，仅作回归参考 |
| 单页首屏 | 无外部请求，本地直出 | 相较加载位图版本无网络等待 |

瓶颈分析：主要耗时在 SQLite 事务与叙事请求；默认节奏下每秒一拍，性能不构成瓶颈。调优建议：批量写入时合并事务。

## 安全与隐私

数据收集与存储：不收集任何用户数据，世界状态只写入本地 `data/world.db`。

传输加密：默认仅监听 `127.0.0.1`，不对外暴露；如需远程访问请自行加反向代理与 TLS。

权限模型：本地单用户，无账号体系。

已知风险：若把端口暴露到公网，任何访问者都能读取世界状态；请勿直接绑定 `0.0.0.0`。

漏洞上报渠道：<ntars@qq.com>。

## 兼容性说明

| 维度 | 支持范围 | 验证状态 |
| --- | --- | --- |
| 操作系统 | macOS / Linux / Windows | macOS 已实测，其余按标准库跨平台推断 |
| 运行时 | Python 3.11+ | 3.13 已实测 |
| 浏览器 | 支持 CSS `clip-path` 与现代布局的版本 | Chrome / Safari 已实测 |
| 数据库 | SQLite 3 | 随 Python 内置 |

明确不支持：移动端触屏专门适配、IE、无 CSS 变量支持的旧浏览器。

## 已知问题与限制

**已知问题**

| 问题描述 | 影响范围 | 临时规避方案 | 跟踪链接 |
| --- | --- | --- | --- |
| 缺少官方基准截图 | 无法出具逐像素验收 | 仅做结构与比例核对 | [docs/FIDELITY.md](docs/FIDELITY.md) |
| 解包素材不随仓库分发 | 新环境无法复现全部对齐 | 按 `docs/ASSET_EXTRACTION.md` 自行解包 | [docs/ASSET_EXTRACTION.md](docs/ASSET_EXTRACTION.md) |

**当前限制**：世界不可交互，无存档与结局；书册只读。

**未实现功能**

| 功能 | 未实现原因 | 计划状态 |
| --- | --- | --- |
| 官方四张标准基准的逐像素比对 | 需使用者从游戏内逐帧截取 | 待外部输入 |
| 3D 书页与 Spine 翻页 | Web 无骨骼蒙皮与全局光照 | Spine 时长/元数据已从解包源验证；翻页仅以 CSS 3D 近似 |

## 更新日志

版本变更遵循语义化版本与 Keep a Changelog 结构。当前无正式版本号，按主干迭代；阶段记录见 `docs/ROLLOUT.md` 与 `docs/DECISIONS.json`。

## 后续路线图

> 下列内容为计划项，非交付承诺；实际范围以发布记录为准。

| 计划项 | 状态 | 目标版本 |
| --- | --- | --- |
| 补齐官方基准并完成逐像素审计 | 待外部输入 | 未定 |
| 扩展 P1 界面（口令、角色、卡牌） | 计划中 | 未定 |
| 拆出可复用的 CSS 复刻工具链 | 计划中 | 未定 |

## 参与贡献

- 开发环境搭建：安装 Python 3.11+，`python3 main.py check` 全绿即可开始。
- 分支模型：基于 `main` 切特性分支。
- 提交规范：Conventional Commits，中文描述改动本身。
- PR 要求：改动单一、`main.py check` 通过、涉及界面时附截图与差异说明。
- 行为准则：尊重原作版权，仅作玩家二创，不分发游戏原始素材。

## 许可证

Copyright © 2026 Amphoreus contributors. Licensed under MIT.

本项目采用 MIT 许可证，全文见 [LICENSE](./LICENSE)。仅作玩家二创，游戏名称、角色与素材版权归米哈游所有。
