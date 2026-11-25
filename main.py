#!/usr/bin/env python3
"""Amphoreus 入口。

用法：
    python3 main.py start        前台运行（Ctrl-C 退出）
    python3 main.py daemon       后台挂机，可关终端
    python3 main.py stop         停掉后台进程
    python3 main.py status       看现在跑到哪儿了
    python3 main.py reset        清空这个世界（会二次确认）
    python3 main.py install      装成开机自启（launchd）
    python3 main.py uninstall    卸掉开机自启
    python3 main.py once N       只推进 N 拍然后退出，用于验证
    python3 main.py check        回归自检 + 服务冒烟，不碰真实世界

设计上只做调度，不碰模拟与叙事。
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from amphoreus import config as C  # noqa: E402
from amphoreus.db import Store  # noqa: E402
from amphoreus.engine import Engine  # noqa: E402
from amphoreus.log import log  # noqa: E402
from amphoreus.server import Server  # noqa: E402
from amphoreus.sim import calendar as cal  # noqa: E402

DATA = ROOT / "data"
DB = DATA / "world.db"
PID = DATA / "amphoreus.pid"
LOGDIR = ROOT / "logs"
PLIST = Path.home() / "Library" / "LaunchAgents" / "cn.amphoreus.world.plist"


def _boot():
    cfg = C.load()
    log.setup(LOGDIR, cfg.log_level)
    store = Store(DB)
    engine = Engine(cfg, store)
    engine.boot()
    return cfg, store, engine


# ---------------------------------------------------------------------------
# 前台 / 后台主循环
# ---------------------------------------------------------------------------
def run_forever(quiet: bool = False) -> int:
    cfg, store, engine = _boot()
    engine.catch_up()
    server = Server(cfg, store, C.WEB_DIR)

    stop = {"flag": False}

    def _sig(_sig, _frm):
        stop["flag"] = True

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    try:
        server.start(background=True)
    except OSError as exc:
        log.error("web bind failed", "端口被占用，仪表盘没起来", port=cfg.web.port, err=str(exc)[:120])

    print()
    print(f"  翁法罗斯已在运行   {server.url}")
    print(f"  种子 {engine.state.seed} · 一拍 = 一个时段")
    print("  Ctrl-C 停止（后台运行请用 python3 main.py daemon）")
    print()

    wait = engine.sleep_seconds()
    last_volume = time.time()
    while not stop["flag"]:
        r = engine.step()
        if r.beats:
            log.info(
                "tick",
                "发生了一件事",
                tick=r.tick,
                when=r.moment.full_zh,
                n=len(r.beats),
                first=r.beats[0].kind,
            )
        # 叙事与卷册不该每拍都写，按世界日与进度节流。
        engine.narrate_pending()
        if time.time() - last_volume > 600:
            engine.write_volume()
            last_volume = time.time()

        # 每拍都要重新算：提速时等待会变，不能缓存。
        wait = engine.sleep_seconds()
        slept = 0.0
        while slept < wait and not stop["flag"]:
            time.sleep(min(0.5, wait - slept))
            slept += 0.5

    log.info("shutdown", "演算已停止")
    try:
        server.stop()
    except Exception:
        pass
    return 0


def do_daemon() -> int:
    if PID.exists():
        pid = int(PID.read_text().strip() or 0)
        if pid and _alive(pid):
            print(f"已经在后台跑了（PID {pid}）。要重启用 stop 再 daemon。")
            return 1
    DATA.mkdir(parents=True, exist_ok=True)
    LOGDIR.mkdir(parents=True, exist_ok=True)
    out = (LOGDIR / "daemon.out").open("ab")
    p = subprocess.Popen(
        [sys.executable, str(ROOT / "main.py"), "start"],
        stdout=out, stderr=out, stdin=subprocess.DEVNULL,
        start_new_session=True, cwd=str(ROOT),
    )
    PID.write_text(str(p.pid))
    print(f"已在后台启动（PID {p.pid}）。")
    print(f"日志：{LOGDIR / 'amphoreus.log'}")
    print("看世界：python3 main.py status")
    return 0


def do_stop() -> int:
    if not PID.exists():
        print("没有正在跑的后台进程。")
        return 0
    pid = int(PID.read_text().strip() or 0)
    if not (pid and _alive(pid)):
        PID.unlink(missing_ok=True)
        print("进程已经不在了，清掉了残留的 pid 文件。")
        return 0
    os.kill(pid, signal.SIGTERM)
    for _ in range(30):
        if not _alive(pid):
            break
        time.sleep(0.2)
    if _alive(pid):
        os.kill(pid, signal.SIGKILL)
        print("进程没响应，已强制结束。")
    PID.unlink(missing_ok=True)
    print("已停止。")
    return 0


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def do_status() -> int:
    if not DB.exists():
        print("还没有世界。先跑一次 python3 main.py start。")
        return 1
    cfg = C.load()
    store = Store(DB)
    meta = store.meta()
    seed = int(meta.get("seed") or 0)
    tick = int(meta.get("tick") or 0)
    m = cal.from_tick(tick, seed or 1)
    counts = store.counts()
    running = PID.exists() and _alive(int(PID.read_text().strip() or 0))
    secs = 1.0 / max(1e-9, cfg.days_per_real_second() * cal.TICKS_PER_DAY)

    print()
    print(f"  状态　　{'运行中' if running else '未运行'}")
    print(f"  世界　　{m.full_zh}")
    print(f"  轮次　　第 {meta.get('cycle') or 1} 次演算")
    print(f"  黑潮　　{float(meta.get('black_tide') or 0) * 100:.1f}%")
    print(f"  火种　　{int(meta.get('sparks') or 0)} / 12")
    print(f"  方程式　{float(meta.get('equation') or 0) * 100:.1f}%")
    print(f"  节奏　　一拍 ≈ 现实 {secs / 3600:.1f} 小时（{cfg.pace.mode}）")
    print(f"  记录　　{counts['events']} 条事件 · {counts['volumes']} 节卷册")
    print(f"  看世界　http://{cfg.web.host}:{cfg.web.port}/")
    print()
    return 0


def do_once(n: int) -> int:
    cfg, store, engine = _boot()
    for _ in range(max(1, n)):
        engine.step()
    engine.narrate_pending(budget=2)
    m = engine.state.moment
    print(f"推进 {n} 拍 -> {m.full_zh}")
    print(f"黑潮 {engine.state.black_tide * 100:.1f}% · 火种 {engine.state.sparks_taken}/12"
          f" · 方程式 {engine.state.equation * 100:.1f}%")
    return 0


def do_check() -> int:
    """一条命令验证：语法、源码链、端到端回归、真实 HTTP 冒烟、运行时零图片。"""
    import json
    import tempfile
    import urllib.request

    rc = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", str(ROOT / "amphoreus"),
         str(ROOT / "tools"), str(ROOT / "main.py")],
        cwd=str(ROOT),
    ).returncode
    if rc:
        return rc
    if shutil.which("node"):
        source_check = ROOT / "tools" / "verify_tarot_source.cjs"
        rc = subprocess.run(["node", str(source_check)], cwd=str(ROOT)).returncode
        if rc:
            print("TarotBook 源码链检查失败。")
            return rc
        print("TarotBook 源码链检查通过。")
    rc = subprocess.run([sys.executable, "-m", "tools.selftest"], cwd=str(ROOT)).returncode
    if rc:
        return rc

    # 用随机高端口和临时数据库，避免碰真实世界或占用默认端口。
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    cfg = C.load()
    cfg.web.port = port
    with tempfile.TemporaryDirectory(prefix="amphoreus-http-") as td:
        store = Store(Path(td) / "world.db")
        srv = Server(cfg, store, C.WEB_DIR)
        try:
            srv.start(background=True)
            paths = (
                "/", "/book", "/style.css", "/app.js", "/codex.css", "/codex.js",
                "/codex-source.js", "/codex-art.js", "/codex-portraits.js",
                "/api/state", "/api/events", "/api/ledger", "/api/canon",
                "/api/archive", "/api/archive/volume?chapter=13", "/api/warden",
            )
            for path in paths:
                with urllib.request.urlopen(f"http://{cfg.web.host}:{port}{path}", timeout=5) as r:
                    body = r.read()
                    if r.status != 200 or not body:
                        raise RuntimeError(f"HTTP {path} 返回异常")
                    if path.startswith("/api/"):
                        json.loads(body)
        except Exception as exc:
            print(f"服务冒烟失败：{exc}")
            return 1
        finally:
            srv.stop()
    print("服务冒烟通过。")
    if shutil.which("node"):
        runtime_check = ROOT / "tools" / "runtime_no_images.cjs"
        env = os.environ.copy()
        env["AMPHOREUS_URL"] = f"http://{cfg.web.host}:{port}/book"
        # 上面的临时服务已停止；复用同端口启动只用于浏览器检查，仍不碰真实世界。
        with tempfile.TemporaryDirectory(prefix="amphoreus-runtime-") as td:
            runtime_store = Store(Path(td) / "world.db")
            runtime_srv = Server(cfg, runtime_store, C.WEB_DIR)
            try:
                runtime_srv.start(background=True)
                rc = subprocess.run(["node", str(runtime_check)], cwd=str(ROOT), env=env).returncode
            finally:
                runtime_srv.stop()
        if rc:
            print("运行时零图片检查失败。")
            return rc
        print("运行时零图片检查通过。")
    return 0


def do_reset() -> int:
    if not DB.exists():
        print("没有可重置的世界。")
        return 0
    print("这会清空当前世界的全部状态与记录，且不可恢复。")
    ans = input("确认请输入 yes：").strip().lower()
    if ans != "yes":
        print("已取消。")
        return 1
    DB.unlink()
    for suffix in ("-wal", "-shm"):
        p = Path(str(DB) + suffix)
        p.unlink(missing_ok=True)
    print("世界已清空。下一步 start 会开一个新的。")
    return 0


PLIST_TMPL = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>cn.amphoreus.world</string>
  <key>ProgramArguments</key>
  <array>
    <string>{python}</string>
    <string>{main}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>{root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>{root}/logs/launchd.out</string>
  <key>StandardErrorPath</key><string>{root}/logs/launchd.err</string>
</dict>
</plist>
"""


def do_install() -> int:
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    LOGDIR.mkdir(parents=True, exist_ok=True)
    PLIST.write_text(
        PLIST_TMPL.format(python=sys.executable, main=ROOT / "main.py", root=ROOT),
        encoding="utf-8",
    )
    subprocess.run(["launchctl", "unload", str(PLIST)], capture_output=True)
    r = subprocess.run(["launchctl", "load", str(PLIST)], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"装失败了：{r.stderr.strip()}")
        return 1
    print(f"已设为开机自启：{PLIST}")
    print("现在它已经在跑。想停掉用 python3 main.py uninstall。")
    return 0


def do_uninstall() -> int:
    if PLIST.exists():
        subprocess.run(["launchctl", "unload", str(PLIST)], capture_output=True)
        PLIST.unlink()
        print("已取消开机自启。")
    else:
        print("本来就没装。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        prog="main.py", description="翁法罗斯 · 永恒之地的本地演算"
    )
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("start", help="前台运行")
    sub.add_parser("daemon", help="后台挂机")
    sub.add_parser("stop", help="停止后台进程")
    sub.add_parser("status", help="查看当前进度")
    sub.add_parser("reset", help="清空世界")
    sub.add_parser("install", help="设为开机自启")
    sub.add_parser("uninstall", help="取消开机自启")
    p_once = sub.add_parser("once", help="只推进若干拍")
    p_once.add_argument("n", type=int, nargs="?", default=1)
    sub.add_parser("check", help="回归自检 + 服务冒烟（不碰真实世界）")

    args = ap.parse_args()
    cmd = args.cmd or "start"

    if cmd == "start":
        return run_forever()
    if cmd == "daemon":
        return do_daemon()
    if cmd == "stop":
        return do_stop()
    if cmd == "status":
        return do_status()
    if cmd == "reset":
        return do_reset()
    if cmd == "install":
        return do_install()
    if cmd == "uninstall":
        return do_uninstall()
    if cmd == "once":
        return do_once(args.n)
    if cmd == "check":
        return do_check()
    ap.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
