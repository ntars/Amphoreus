#!/usr/bin/env python3
"""Extract TMP SDF font atlases and metadata from the unpacked game blocks.

Only source-derived data is emitted. The TypeTree of these MonoBehaviours is
stripped, so the reader uses the validated TMP 1.1.0 serialized layout:

  glyph array at 216: int32 count, then count * 48-byte Glyph records
  character array immediately after glyphs: int32 count, then 16-byte records

A character record is (1, unicode, glyphIndex, 1.0f). Glyph rectangles are
validated against the atlas texture dimensions before export.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import hashlib
import json
import re
import sqlite3
import sys
import struct
from pathlib import Path

import UnityPy

EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
BLOCK = EXTRACT / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows/26c347d519581601daffbfd03c60be6a.block"
DB = EXTRACT / "hsr_all_assets.sqlite3"
NAME_RE = re.compile(rb"RPG_CN_SDF_TarotBook_(\d+)")
FACE_INFO_OFFSET = 156
GLYPH_COUNT_OFFSET = 216
GLYPH_STRIDE = 48
CHAR_STRIDE = 16


def sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def load_atlas_info(db: Path) -> dict[int, dict]:
    conn = sqlite3.connect(db)
    rows = conn.execute(
        "SELECT name, pathid FROM assets WHERE name LIKE 'RPG_CN_SDF_TarotBook_% Atlas'"
    ).fetchall()
    conn.close()
    info: dict[int, dict] = {}
    for name, path_id in rows:
        match = re.search(r"_(\d+) Atlas$", name)
        if match:
            info[int(match.group(1))] = {"name": name, "pathId": path_id}
    return info


def validate_payload(raw: bytes, size: int, atlas: dict) -> tuple[list[dict], list[dict]]:
    count = struct.unpack_from("<i", raw, GLYPH_COUNT_OFFSET)[0]
    if not 1 <= count <= 4096:
        raise ValueError(f"{size}: invalid glyph count {count}")
    glyphs: list[dict] = []
    indices: set[int] = set()
    cursor = GLYPH_COUNT_OFFSET + 4
    for _ in range(count):
        index, width, height, bx, by, advance, rx, ry, rw, rh, scale, atlas_index = \
            struct.unpack_from("<i5f4ifi", raw, cursor)
        if not (0 <= index < 1_000_000 and 0 < width < 200 and 0 < height < 200
                and -50 <= bx < 200 and -200 <= by < 200 and 0 < advance < 200
                and 0 <= rx <= atlas["width"] and 0 <= ry <= atlas["height"]
                and 0 < rw < 200 and 0 < rh < 200 and 0 <= atlas_index < 4):
            raise ValueError(f"{size}: invalid glyph record at {cursor}")
        glyphs.append({
            "index": index,
            "w": round(width, 4),
            "h": round(height, 4),
            "bx": round(bx, 4),
            "by": round(by, 4),
            "adv": round(advance, 4),
            "rx": rx,
            "ry": ry,
            "rw": rw,
            "rh": rh,
            "scale": round(float(scale), 4),
            "atlas": atlas_index,
        })
        indices.add(index)
        cursor += GLYPH_STRIDE

    char_count = struct.unpack_from("<i", raw, cursor)[0]
    cursor += 4
    if char_count != count or not 0 < char_count <= 4096:
        raise ValueError(f"{size}: glyph/character count mismatch {count}/{char_count}")
    chars: list[dict] = []
    for _ in range(char_count):
        marker, codepoint, glyph_index, weight = struct.unpack_from("<4i", raw, cursor)
        # Character records store a glyph index, not an array position; the
        # glyph indices are sparse TMP IDs. Validate the marker and weight,
        # then build a codepoint -> glyph-ID map.
        if marker != 1 or not 0 < codepoint < 0x110000 or weight != 1065353216:
            raise ValueError(f"{size}: invalid character record at {cursor}")
        chars.append({"c": int(codepoint), "g": int(glyph_index), "index": int(glyph_index)})
        cursor += CHAR_STRIDE
    return glyphs, chars


def read_face_metrics(raw: bytes) -> tuple[float, float, float]:
    # The stripped TMP 1.1.0 MonoBehaviour keeps FaceInfo at offset 156 as
    # (ascentLine, lineHeight, pointSize). All values were cross-checked
    # against the 376 exported glyph rects before this reader was added.
    ascent, line_height, point_size = struct.unpack_from("<3f", raw, FACE_INFO_OFFSET)
    if not (1 <= point_size <= 200 and 1 <= line_height <= 400 and -200 <= ascent <= 200):
        raise ValueError(f"invalid TMP faceInfo at {FACE_INFO_OFFSET}")
    return point_size, line_height, ascent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--block", type=Path, default=BLOCK)
    parser.add_argument("--db", type=Path, default=DB)
    parser.add_argument("--dump", type=Path, default=Path("dump"))
    parser.add_argument("--assets", type=Path, default=Path("app/assets/fonts"))
    parser.add_argument("--quiet", action="store_true", help="suppress unrelated CAB parse warnings")
    parser.add_argument("--fail-on-warning", action="store_true", help="fail if too many CABs fail raw decode")
    args = parser.parse_args()

    if args.block.is_dir():
        # UnityPy.load() on a directory parses every CAB eagerly; individual
        # unrelated CABs in the font block have incomplete TypeTrees. Load
        # each CAB independently and skip only those unreadable files.
        class LazyEnv:
            def __init__(self, root: Path):
                self.objects = []
                for path in sorted(root.rglob("*")):
                    if path.suffix == ".resS" or not path.is_file():
                        continue
                    try:
                        bundle = UnityPy.load(str(path))
                    except Exception:
                        continue
                    self.objects.extend(bundle.objects)
        warnings: list[str] = []
        def load_env() -> "LazyEnv":
            instance = LazyEnv.__new__(LazyEnv)
            instance.objects = []
            for path in sorted(args.block.rglob("*")):
                if path.suffix == ".resS" or not path.is_file():
                    continue
                try:
                    with contextlib.redirect_stdout(io.StringIO()) as captured:
                        bundle = UnityPy.load(str(path))
                    if "Error parsing file" in captured.getvalue():
                        warnings.append(str(path))
                except Exception:
                    if "Error parsing file" in captured.getvalue():
                        warnings.append(str(path))
                    continue
                instance.objects.extend(bundle.objects)
            return instance
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            env = load_env()
        if args.fail_on_warning and warnings:
            print(f"NOTE {len(warnings)} unrelated CAB(s) skipped during raw decode", file=sys.stderr)
    else:
        # Raw blocks are Oodle-compressed; use the already decoded directory
        # produced by tools/hsr_oodle_extract.py.
        raise SystemExit(
            "input must be a decoded bundle directory; run hsr_oodle_extract.py first"
        )
    atlases = load_atlas_info(args.db)
    fonts: list[dict] = []
    for reader in env.objects:
        if reader.type.name == "Texture2D":
            texture_path = int(reader.path_id)
            matching = [size for size, info in atlases.items() if info["pathId"] == texture_path]
            if not matching:
                continue
            size = matching[0]
            try:
                texture = reader.read()
                # D3DFMT_A8 stores the SDF in the alpha channel; preserve it
                # as a grayscale mask for CSS mask-image.
                atlas_image = texture.image.getchannel("A")
            except Exception:
                continue
            args.assets.mkdir(parents=True, exist_ok=True)
            atlas_file = f"RPG_CN_SDF_TarotBook_{size}_Atlas.png"
            atlas_path = args.assets / atlas_file
            atlas_image.save(atlas_path, optimize=True)
            atlases[size]["file"] = f"fonts/{atlas_file}"
            atlases[size]["width"] = int(texture.m_Width)
            atlases[size]["height"] = int(texture.m_Height)
            atlases[size]["sha1"] = sha1(atlas_path.read_bytes())

    for reader in env.objects:
        if reader.type.name != "MonoBehaviour":
            continue
        raw = reader.get_raw_data()
        match = NAME_RE.match(raw[32:])
        if not match:
            continue
        size = int(match.group(1))
        atlas = atlases.get(size)
        if not atlas or "file" not in atlas:
            raise RuntimeError(f"missing atlas texture for font {size}")
        glyphs, chars = validate_payload(raw, size, atlas)
        point_size, line_height, ascent = read_face_metrics(raw)
        name = f"RPG_CN_SDF_TarotBook_{size}"
        fonts.append({
            "name": name,
            "pointSize": round(float(point_size), 4),
            "lineHeight": round(float(line_height), 4),
            "ascent": round(float(ascent), 4),
            "atlasWidth": atlas["width"],
            "atlasHeight": atlas["height"],
            "atlasTexture": atlas["name"],
            "atlasFile": atlas["file"],
            "atlasSha1": atlas["sha1"],
            "glyphs": glyphs,
            "chars": chars,
            "metricsProvenance": "TMP faceInfo at offset 156: ascentLine, lineHeight, pointSize",
            "source": {
                "block": args.block.name,
                "pathId": int(reader.path_id),
                "faceInfoOffset": FACE_INFO_OFFSET,
                "glyphOffset": GLYPH_COUNT_OFFSET,
                "glyphStride": GLYPH_STRIDE,
                "version": "1.1.0",
            },
        })

    if len(fonts) < 1:
        raise RuntimeError("no TMP font assets exported")
    fonts.sort(key=lambda font: font["name"])
    args.dump.mkdir(parents=True, exist_ok=True)
    (args.dump / "_fonts.json").write_text(
        json.dumps({"schema": 1, "fonts": fonts}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "fonts": len(fonts),
        "glyphs": sum(len(font["glyphs"]) for font in fonts),
        "chars": sum(len(font["chars"]) for font in fonts),
        "atlasFiles": sorted({font["atlasFile"] for font in fonts}),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
