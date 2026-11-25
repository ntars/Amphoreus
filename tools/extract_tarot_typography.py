#!/usr/bin/env python3
"""Extract TarotBook LocalizedText fields from the current HSR block.

The TarotBook text components are custom ``RPG.Client.LocalizedText``
MonoBehaviours. Unity's built-in ``Text`` reader therefore cannot expose their
font settings. This tool decodes the current block on macOS, validates the
serialized field layout against every readable component, and writes a compact
source file consumed by ``export_tarot_source.cjs``.

No screenshot or rendered pixel data is used.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import math
import struct
import sys
import tempfile
from pathlib import Path

try:
    import UnityPy
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit("缺少 UnityPy：请先安装 python3 -m pip install UnityPy") from exc

from hsr_oodle_extract import (
    Oodle,
    _iter_manifest_files,
    _safe_relative_path,
    load_crypto,
    parse_bundle,
)


LOCALIZED_TEXT_SCRIPT = 2163569534093517469
ALIGNMENTS = {
    0: "upper-left",
    1: "upper-center",
    2: "upper-right",
    3: "middle-left",
    4: "middle-center",
    5: "middle-right",
    6: "lower-left",
    7: "lower-center",
    8: "lower-right",
}


def _read_i32(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<i", raw, offset)[0]


def _read_f32(raw: bytes, offset: int) -> float:
    return struct.unpack_from("<f", raw, offset)[0]


def _read_string(raw: bytes, offset: int, length: int) -> str | None:
    if length < 1 or offset + length > len(raw):
        return None
    try:
        value = raw[offset : offset + length].decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not value or any((not char.isprintable()) and char not in "\n\r\t" for char in value):
        return None
    return value


def _find_localization_key(raw: bytes) -> tuple[str, int] | tuple[None, None]:
    # The readable components carry the string directly after the serialized
    # style block. Scan a narrow window so exact offsets can evolve without
    # treating arbitrary printable field bytes as a localization key.
    for offset in range(140, min(len(raw) - 4, 172)):
        length = _read_i32(raw, offset)
        if 1 <= length <= 120:
            value = _read_string(raw, offset + 4, length)
            if value:
                return value, offset
    return None, None


def _plausible_color(raw: bytes) -> dict | None:
    if len(raw) < 60:
        return None
    color = struct.unpack_from("<4f", raw, 44)
    if not all(math.isfinite(value) and -0.001 <= value <= 1.001 for value in color):
        return None
    return {
        "rgba": [round(value, 6) for value in color],
        "css": "rgba({}, {}, {}, {})".format(
            *(round(value * 255) if index < 3 else round(value, 6)
              for index, value in enumerate(color))
        ),
    }


def _parse_component(raw: bytes) -> dict:
    fields: dict = {
        "rawBytes": len(raw),
        "layout": "irregular",
    }
    if len(raw) < 144:
        return fields

    font_size = _read_i32(raw, 84)
    font_style = _read_i32(raw, 88)
    alignment = _read_i32(raw, 92)
    best_fit = _read_i32(raw, 96)
    min_size = _read_i32(raw, 100)
    max_size = _read_i32(raw, 104)
    line_spacing = _read_f32(raw, 140)
    color = _plausible_color(raw)
    key, key_offset = _find_localization_key(raw)
    canonical = (
        color is not None
        and 4 <= font_size <= 200
        and 0 <= font_style <= 3
        and alignment in ALIGNMENTS
        and best_fit in (0, 1)
        and 1 <= min_size <= 300
        and 1 <= max_size <= 300
        and math.isfinite(line_spacing)
        and 0.25 <= line_spacing <= 4
    )
    if canonical:
        fields["layout"] = "localized-text-v1"
    if color:
        fields["color"] = color
    fields.update(
        {
            "fontSize": font_size,
            "fontStyle": font_style,
            "alignment": alignment,
            "alignmentName": ALIGNMENTS.get(alignment, "unknown"),
            "bestFit": bool(best_fit) if best_fit in (0, 1) else None,
            "minSize": min_size,
            "maxSize": max_size,
            "lineSpacing": round(line_spacing, 6) if math.isfinite(line_spacing) else None,
        }
    )
    if key:
        fields["textKey"] = key
        fields["textKeyOffset"] = key_offset
    return fields


def _extract_block(block: Path, work: Path, oodle_lib: Path, anime_source: Path) -> dict:
    keys, tables = load_crypto(anime_source)
    oodle = Oodle(oodle_lib)
    source = block.read_bytes()
    cursor = 0
    bundles = 0
    while cursor < len(source):
        if source[cursor : cursor + 4] != b"ENCR":
            raise ValueError(f"0x{cursor:x} 处不是 ENCR")
        bundle_end, manifest = parse_bundle(source, cursor, oodle, keys, tables)
        bundle_dir = work / f"bundle-{bundles:04d}-0x{cursor:08x}"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        for relative_path, content, _flags in _iter_manifest_files(manifest):
            destination = bundle_dir / _safe_relative_path(relative_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        bundles += 1
        cursor = bundle_end
    return {"sourceBlock": str(block), "sourceBytes": len(source), "bundles": bundles}


def _component_name(objects: dict, mono) -> str:
    game_object = objects.get(mono.m_GameObject.m_PathID)
    if not game_object:
        return ""
    try:
        return game_object.read(check_read=False).m_Name
    except Exception:
        return ""


def _scan_extracted(root: Path) -> list[dict]:
    entries = []
    seen = set()
    for cab_path in sorted(root.rglob("CAB-*")):
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                env = UnityPy.load(str(cab_path))
        except Exception:
            continue
        objects = {obj.path_id: obj for obj in env.objects}
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                head = obj.parse_monobehaviour_head()
            except Exception:
                continue
            if head.m_Script.m_PathID != LOCALIZED_TEXT_SCRIPT:
                continue
            raw = obj.get_raw_data()
            parsed = _parse_component(raw)
            if parsed["layout"] != "localized-text-v1":
                continue
            name = _component_name(objects, head)
            if not name:
                continue
            entry = {
                "name": name,
                "cab": cab_path.parent.name,
                "pathId": str(obj.path_id),
                **parsed,
            }
            identity = (
                name,
                entry.get("textKey"),
                entry["fontSize"],
                tuple(entry["color"]["rgba"]),
                entry["lineSpacing"],
            )
            if identity in seen:
                continue
            seen.add(identity)
            entries.append(entry)
    entries.sort(key=lambda item: (item["name"], item.get("textKey", ""), item["pathId"]))
    return entries


def main() -> None:
    home = Path.home()
    extract_root = home / "Downloads/hsr-ui-extract"
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--block",
        type=Path,
        default=extract_root
        / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows/5320cb981bb270df4950407fb5853c71.block",
    )
    parser.add_argument(
        "--extracted",
        type=Path,
        help="reuse an already extracted block directory instead of decoding",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().with_name("tarot_typography.json"),
    )
    parser.add_argument(
        "--oodle-lib",
        type=Path,
        default=extract_root / "tools/libooz.dylib",
    )
    parser.add_argument(
        "--anime-studio-src",
        type=Path,
        default=extract_root / "AnimeStudio-src-35036",
    )
    parser.add_argument("--keep-work", action="store_true")
    args = parser.parse_args()

    if not args.extracted and not args.block.is_file():
        parser.error(f"block 不存在：{args.block}")

    if args.extracted:
        root = args.extracted
        extraction = {"sourceBlock": None, "extracted": str(root)}
        entries = _scan_extracted(root)
    else:
        temp_context = (
            contextlib.nullcontext(str(args.block.parent / ".tarot-typography-work"))
            if args.keep_work
            else tempfile.TemporaryDirectory(prefix="amphoreus-tarot-text-")
        )
        with temp_context as work_name:
            work = Path(work_name)
            extraction = _extract_block(
                args.block, work, args.oodle_lib, args.anime_studio_src
            )
            entries = _scan_extracted(work)

    digest = hashlib.sha256(args.block.read_bytes()).hexdigest() if args.block.is_file() else None
    result = {
        "generatedFrom": {
            "block": extraction["sourceBlock"],
            "blockSha256": digest,
            "localizedTextScript": str(LOCALIZED_TEXT_SCRIPT),
            "component": "RPG.Client.LocalizedText",
            "layoutValidation": "color,size,style,alignment,bestFit,minSize,maxSize,lineSpacing",
        },
        "extraction": extraction,
        "styles": entries,
    }
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.output} ({len(entries)} readable LocalizedText components)")
    for entry in entries:
        print(
            f"  {entry['name']:<20} {entry['fontSize']:>3}px "
            f"align={entry['alignmentName']:<10} line={entry['lineSpacing']:<6} "
            f"key={entry.get('textKey', '')!r}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"提取失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc
