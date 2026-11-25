[简体中文](README.md) | [English](README_EN.md)

# Amphoreus

**Description**: `翁法罗斯：一个只可观看、由种子驱动的《崩坏：星穹铁道》世界模拟，附零图片的「如我所书」Web 复刻 | A watch-only, seed-driven simulation of the Honkai: Star Rail world, with a zero-image web recreation of the in-game Tarot Book.`

**Topics**: `python` `simulation` `worldbuilding` `honkai-star-rail` `fan-project` `css-art` `zero-dependency` `sqlite` `deterministic` `procedural-generation` `narrative` `local-first` `web-ui` `vanilla-javascript` `creative-coding` `generative-art` `offline` `mit-license` `text-ui` `data-visualization`

![Status](https://img.shields.io/badge/status-in%20development-orange?style=flat-square)
![Python](https://img.shields.io/badge/python-3.11%2B-3776ab?style=flat-square&logo=python&logoColor=white)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-2ea44f?style=flat-square)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

A seed-driven, watch-only Amphoreus world simulator with a zero-image, pure-CSS recreation of the in-game Tarot Book.

[Quick Start](#quick-start) · [Features](#key-features) · [Layout](#project-layout) · [Known Issues](#known-issues-and-limitations) · [Roadmap](#roadmap) · [License](#license)

---

## Introduction

Amphoreus is the simulated world run by the "Emperor's Scepter δ-me13" in *Honkai: Star Rail*. This project re-implements it from public lore: twelve Titans, thirteen Chrysos Heirs, twelve Kindling, and a planet being swallowed by the black tide — all computed by code rather than scripted in advance.

The project has two parts:

1. **World simulator** — a continuously running state machine that advances by light-calendar ticks. Population, order, faith, and black-tide level relax toward equilibrium each tick, while major events are decided by a seed.
2. **"As I Have Written" web recreation** — the in-game booklet UI rebuilt with plain HTML + CSS. No bitmaps or SVGs are loaded at runtime; every shape comes from gradients, borders, `clip-path`, and timing variables.

**Core idea**: the world state is just a set of numbers, and the random source is derived from `seed × 1000003 + cycle × 9176 + tick × 7919`. The same seed always yields the same history; a new seed yields a new Amphoreus. Narrative is separated from rules: the engine decides *what happened*, the local model only decides *how to tell it*.

**When it fits**

- You want to watch a self-consistent world evolve over days and produce a readable chronicle.
- You want to study deterministic simulation, procedural narrative, or pure-CSS UI recreation.
- You are a *Honkai: Star Rail* player looking for fan-made reading and display material.

**When it does not fit**

- You want a playable game: this project is **not interactive** — no combat, gacha, quests, saves, or networking.
- You need certified pixel-perfect acceptance: the four official baseline screenshots are still missing, so no pixel-level claim is made.
- You need it inside a production system: this is a fan project with no API stability guarantee.

### Strengths and Limits

**Strengths**

| Strength | Detail | Verification |
| --- | --- | --- |
| Zero third-party deps | Runtime uses only the Python standard library | Starts without installing any package |
| Deterministic causality | Fixed seed means fixed history | Repeated `once 300` with the same `seed` matches |
| Zero-image UI | `/book` loads no PNG/SVG at runtime | `tools/selftest.py` scans page sources |
| Self-verifying scripts | Syntax, regression, and HTTP smoke in one command | `python3 main.py check` |

**Limits**

| Limit | Scope | Workaround |
| --- | --- | --- |
| Official baselines missing | No pixel-level acceptance report | Compare structure and proportions only; label the gap |
| Recreation depends on extracted assets | Some screens cannot be fully aligned without them | Keep evidence under `docs/assets/extracted/` and log differences |
| Narrative needs a local model | Without Ollama the prose falls back to templates | Auto-degrades without stopping the simulation |

## Key Features

- **World tick** — `python3 main.py start` advances the world by the light calendar, updating city metrics, Titan states, and Kindling progress each tick.
- **Deterministic seed** — the first launch generates a seed into `config.toml`; pinning `seed` locks that world's causality.
- **Event resolution** — each tick rolls for Kindling seizure, city fall, Titan death, and re-creation; once all twelve Kindling are gathered, δ-me13 advances a stage.
- **Chronicle generation** — "As I Have Written" records events in thirteen volumes of five sections, with section titles taken from official text.
- **Web recreation** — `/` shows the dashboard, `/book` shows the read-only booklet; cover, catalog, and star map are all drawn in CSS.
- **Daemon and autostart** — `daemon` runs in the background, `install` registers launchd autostart on macOS, `status` reports progress.
- **Self-check** — `check` runs syntax, end-to-end regression, and HTTP smoke on a temporary database and port without touching the real world.

## Core Features

### Zero-dependency deterministic simulation

- **Value**: anyone can clone and reproduce the same history without installing dependencies.
- **Implementation**: `amphoreus/engine.py` derives the random source from the seed and relaxes metrics toward equilibrium; `amphoreus/db.py` persists state with the standard-library `sqlite3`.
- **Difference**: no NumPy/Pandas stack and no game client required.
- **Evidence**: `python3 main.py once 300` is reproducible under the same `seed`; `main.py check` passes.

### Pure-CSS "As I Have Written" UI

- **Value**: avoids screenshots as a render source, stays sharp when zoomed, and works offline.
- **Implementation**: `app/css/` and inline styles rebuild the booklet with gradients, borders, pseudo-elements, and `clip-path`; keyframe times are generated from extracted animation curves into CSS variables.
- **Difference**: no React/Vue/Tailwind and no bitmaps or external resources at runtime.
- **Evidence**: `tools/selftest.py` asserts page sources contain no `.png/.svg/.jpg/.webp/<img/url(`; `tools/audit_no_screenshots.mjs` must report 0 hits.

### Rules separated from narrative

- **Value**: the world keeps evolving when the model is unavailable.
- **Implementation**: `amphoreus/narrate.py` talks to a local Ollama (`qwen3.5:4b`) and falls back to templates on failure.
- **Difference**: simulation and text generation are decoupled, so narrative latency never blocks a tick.
- **Evidence**: `status` keeps advancing after Ollama is stopped.

## Design Details and Trade-offs

### Why "relaxation" instead of random add/subtract

- **Scenario**: over long runs, random walks would drive population to zero or the black tide to its cap.
- **Approach**: each metric moves proportionally toward equilibrium, then receives a small perturbation.
- **Reason**: keeps the world runnable indefinitely while preserving uncertainty.

### Why re-creation does not reset

- **Scenario**: the world enters a new round after twelve Kindling are gathered.
- **Approach**: `cycle + 1` changes the random source while the seed is kept.
- **Reason**: the second history differs from the first instead of replaying it.

### Why the UI insists on zero images

- **Scenario**: early versions stitched screenshots and bitmaps, which blurred when zoomed and violated the recreation rule.
- **Approach**: all graphics became CSS geometry and gradients; where needed, development scripts trace official assets into path data.
- **Reason**: the runtime depends on no asset files while the shape provenance stays auditable.

## Tech Stack and Dependencies

| Category | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Runtime | Python | 3.11+ (3.13 recommended) | Simulation, HTTP server, CLI |
| Storage | SQLite (`sqlite3`) | Bundled with Python | World state and events |
| Frontend | HTML / CSS / Vanilla JS | No build chain | Dashboard and booklet |
| Verification | Node.js scripts (`tools/*.mjs`) | Optional, dev-only | Geometry, asset, screenshot and gate checks |
| Narrative (optional) | Ollama + `qwen3.5:4b` | Any local install | Text generation with fallback |

No third-party runtime packages; Node scripts under `tools/` are development-only.

## Installation

Requirements: Python 3.11+ (3.13 recommended); the server runs on macOS/Linux/Windows; verification scripts need Node.js.

```bash
git clone https://github.com/ntars/Amphoreus.git
cd Amphoreus
python3 main.py check
```

Expected output (excerpt):

```text
syntax check passed
regression cases passed
HTTP smoke passed
```

Upgrade: `git pull`. Uninstall: delete the directory; run `python3 main.py uninstall` first to remove launchd autostart.

## Quick Start

Start the world and open the dashboard:

```bash
python3 main.py start
```

Then open <http://127.0.0.1:8760/>; the booklet is at <http://127.0.0.1:8760/book>.

Common commands:

| Command | Effect |
| --- | --- |
| `python3 main.py start` | Run in the foreground, `Ctrl-C` to stop |
| `python3 main.py daemon` | Run in the background after the terminal closes |
| `python3 main.py stop` | Stop the background process |
| `python3 main.py status` | Show the current year and Kindling progress |
| `python3 main.py once 300` | Advance 300 ticks then exit, for verification |
| `python3 main.py reset` | Wipe the world (type `yes` to confirm) |

## Configuration

Configuration lives in `config.toml` at the project root and is generated on first launch.

| Key | Type | Default | Required | Range | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- |
| `seed` | integer | random on start | No | any positive integer | Determines causality | `20261125` |
| `pace.mode` | string | `1:1` | No | `1:1` / `accelerated` | Time-flow mode | `accelerated` |
| `pace.world_days_per_real_second` | float | `1.0` | No | `>0` | World days per real second in accelerated mode | `2.0` |
| `pace.lock_speed` | boolean | `false` | No | `true` / `false` | Expose a speed control on the page | `false` |
| `port` | integer | `8760` | No | `1024–65535` | HTTP port | `8760` |
| `narrate.base_url` | string | `http://127.0.0.1:11434` | No | valid URL | Local model endpoint | `http://127.0.0.1:11434` |
| `narrate.model` | string | `qwen3.5:4b` | No | installed model name | Narrative model | `qwen3.5:4b` |

Precedence: `config.toml` over built-in defaults. Hot reload: restart with `python3 main.py stop && python3 main.py daemon`.

## API and Modules

The built-in HTTP server exposes pages and read-only endpoints; this is not a stable API.

| Path | Method | Purpose |
| --- | --- | --- |
| `/` | GET | World dashboard |
| `/book` | GET | Read-only "As I Have Written" booklet |
| `/api/status` | GET | Current year, tick, and Kindling progress |

Example response:

```json
{"year": 42, "tick": 8064, "seeds": 3, "cycle": 1}
```

Example call:

```bash
curl -s http://127.0.0.1:8760/api/status
```

Errors: connection refused when the server is down; `404` for unknown paths. No rate limits.

## Project Layout

```text
Amphoreus/
├── main.py              # CLI entry: start/daemon/stop/status/check
├── amphoreus/           # Simulation package: engine, db, narrate, server, config
├── app/                 # Booklet web UI: HTML/CSS/JS, zero images at runtime
├── tools/               # Dev-only checks: geometry, assets, screenshots, pixel diff
├── docs/                # Acceptance, decisions, asset evidence, rollout notes
├── data/                # Runtime database and logs (not tracked)
├── dump/                # Extracted UI snapshots (not tracked)
└── config.toml          # World config: seed, pace, port, narrative model
```

## Performance

Environment: Apple Silicon macOS, Python 3.13, cold start with an empty database.

Method: time `python3 main.py once 3000`.

| Metric | Value | Baseline |
| --- | --- | --- |
| 3000 ticks | about 1–2 s | No external baseline; regression reference only |
| First page load | No external requests, served locally | No network wait versus bitmap builds |

Bottleneck: SQLite transactions and narrative calls; at the default one tick per second, performance is not a bottleneck. Tuning: batch writes into fewer transactions.

## Security and Privacy

Data collection: none. World state is written only to the local `data/world.db`.

Transport: listens on `127.0.0.1` by default and is not exposed; add a reverse proxy and TLS for remote access.

Permission model: single local user, no accounts.

Known risk: exposing the port publicly lets anyone read the world state; do not bind `0.0.0.0` directly.

Reporting: <ntars@qq.com>.

## Compatibility

| Dimension | Supported | Verified |
| --- | --- | --- |
| OS | macOS / Linux / Windows | macOS tested; others assumed via the standard library |
| Runtime | Python 3.11+ | 3.13 tested |
| Browser | Versions with CSS `clip-path` and modern layout | Chrome / Safari tested |
| Database | SQLite 3 | Bundled with Python |

Not supported: dedicated mobile touch layout, IE, browsers without CSS variables.

## Known Issues and Limitations

**Known issues**

| Issue | Scope | Workaround | Tracker |
| --- | --- | --- | --- |
| Official baselines missing | No pixel-level acceptance | Compare structure and proportions | [docs/FIDELITY.md](docs/FIDELITY.md) |
| Extracted assets not shipped | A fresh checkout cannot reproduce every alignment | Extract locally per `docs/ASSET_EXTRACTION.md` | [docs/ASSET_EXTRACTION.md](docs/ASSET_EXTRACTION.md) |

**Current limitations**: the world is not interactive and has no saves or endings; the booklet is read-only.

**Unimplemented**

| Feature | Reason | Status |
| --- | --- | --- |
| Pixel diff against four official baselines | Requires in-game frame captures by the user | Awaiting external input |
| 3D page turn and Spine animation | No skeletal skinning or global illumination on the web | CSS 3D approximation only |

## Changelog

Versioning follows Semantic Versioning and Keep a Changelog. There is no formal release yet; the project iterates on `main`. See `docs/ROLLOUT.md` and `docs/DECISIONS.json` for stage records.

## Roadmap

> The following are plans, not delivery commitments; the actual scope follows release records.

| Item | Status | Target |
| --- | --- | --- |
| Add official baselines and finish pixel audit | Awaiting external input | TBD |
| Extend P1 screens (passphrase, characters, cards) | Planned | TBD |
| Extract a reusable CSS recreation toolkit | Planned | TBD |

## Contributing

- Setup: install Python 3.11+; a green `python3 main.py check` is enough to begin.
- Branching: feature branches off `main`.
- Commits: Conventional Commits with a descriptive subject.
- PRs: one change per PR, `main.py check` green, screenshots and diff notes for UI changes.
- Conduct: respect the original work; this is fan content and does not redistribute game assets.

## License

Copyright © 2026 Amphoreus contributors. Licensed under MIT.

Released under the MIT License; see [LICENSE](./LICENSE). Fan-made only — game names, characters, and assets remain the property of miHoYo.
