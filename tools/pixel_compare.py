#!/usr/bin/env python3
"""逐像素比对「如我所书」当前截图和官方基准截图。

用法：
    python3 tools/pixel_compare.py baseline/home.png current/home.png \
        --report docs/screenshots/pixel-report.json \
        --heatmap docs/screenshots/pixel-diff.png

基准由使用者从官方客户端/官方录屏逐帧截取后放入仓库的参考目录。
没有基准时本工具只报告缺失，不会伪造“通过”。
"""
from __future__ import annotations

import argparse
import json
import struct
import zlib
from pathlib import Path


def read_png(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f"not PNG: {path}")
    pos = 8
    width = height = 0
    bit_depth = color_type = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        pos += 12 + length
        if typ == b'IHDR':
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
            if bit_depth != 8 or interlace or color_type not in (2, 6):
                raise ValueError(f"unsupported PNG {path}: depth={bit_depth} color={color_type} interlace={interlace}")
        elif typ == b'IDAT':
            idat.extend(chunk)
        elif typ == b'IEND':
            break
    raw = zlib.decompress(bytes(idat))
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    out = bytearray(height * stride)
    prev = bytearray(stride)
    off = 0
    for y in range(height):
        filt = raw[off]; off += 1
        line = bytearray(raw[off:off+stride]); off += stride
        for i in range(stride):
            a = line[i-channels] if i >= channels else 0
            b = prev[i]
            c = prev[i-channels] if i >= channels else 0
            if filt == 1: line[i] = (line[i] + a) & 255
            elif filt == 2: line[i] = (line[i] + b) & 255
            elif filt == 3: line[i] = (line[i] + ((a + b) // 2)) & 255
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
            elif filt != 0:
                raise ValueError(f"unsupported PNG filter {filt}")
        out[y*stride:(y+1)*stride] = line
        prev = line
    return width, height, bytes(out)


def write_png(path: Path, width: int, height: int, pixels: bytes, channels: int = 3) -> None:
    def chunk(typ: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + typ + data + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    raw = bytearray()
    stride = width * channels
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y*stride:(y+1)*stride])
    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2 if channels == 3 else 6, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def compare(base: Path, current: Path, threshold: int, report: Path | None, heatmap: Path | None) -> int:
    bw, bh, bp = read_png(base)
    cw, ch, cp = read_png(current)
    if (bw, bh) != (cw, ch):
        print(f"尺寸不同：基准 {bw}x{bh}，当前 {cw}x{ch}")
        return 2
    total = bw * bh
    changed = 0
    abs_sum = 0
    heat = bytearray(bw * bh * 3)
    for i in range(total):
        k = i * 4 if len(bp) // total == 4 else i * 3
        j = i * 4 if len(cp) // total == 4 else i * 3
        d0, d1, d2 = abs(bp[k]-cp[j]), abs(bp[k+1]-cp[j+1]), abs(bp[k+2]-cp[j+2])
        d = max(d0, d1, d2)
        abs_sum += d0 + d1 + d2
        if d > threshold:
            changed += 1
            heat[i*3:i*3+3] = bytes((255, min(255, d*3), 0))
        else:
            v = 20 if d else 8
            heat[i*3:i*3+3] = bytes((v, v, v))
    diff_rate = changed / total
    mean_abs = abs_sum / (total * 3)
    result = {
        "baseline": str(base), "current": str(current),
        "size": [bw, bh], "threshold": threshold,
        "changed_pixels": changed, "total_pixels": total,
        "diff_rate": round(diff_rate, 6),
        "mean_abs_channel_diff": round(mean_abs, 4),
        "exact": diff_rate == 0,
    }
    if report:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if heatmap:
        write_png(heatmap, bw, bh, bytes(heat))
    print(json.dumps(result, ensure_ascii=False))
    return 0 if diff_rate == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("baseline", type=Path)
    ap.add_argument("current", type=Path)
    ap.add_argument("--threshold", type=int, default=2)
    ap.add_argument("--report", type=Path)
    ap.add_argument("--heatmap", type=Path)
    ap.add_argument("--allow-self-comparison", action="store_true",
                    help="explicitly allow comparing a current screenshot with itself (sanity test only)")
    args = ap.parse_args()
    if not args.baseline.exists():
        print(f"缺少官方基准截图：{args.baseline}")
        print("请先把游戏内对应页面的逐帧截图放到该路径；未比对前不能声称逐像素一致。")
        return 3
    if not args.current.exists():
        print(f"缺少当前截图：{args.current}")
        return 3
    if args.baseline.resolve() == args.current.resolve():
        if not args.allow_self_comparison:
            print("基准与当前截图是同一文件；请提供游戏内基准，或使用 --allow-self-comparison 做比较器自检。")
            return 3
        print("自检模式：同一文件比较只能证明比较器可用，不能证明与官方一致。")
    readme = args.baseline.parent / "README.txt"
    if readme.is_file() and "must not be\nused as official baselines" in readme.read_text(encoding="utf-8").lower():
        print(f"拒绝基准：{args.baseline.parent} 的 README 标记目录内容不是官方截图。")
        return 3
    return compare(args.baseline, args.current, args.threshold, args.report, args.heatmap)


if __name__ == "__main__":
    raise SystemExit(main())
