#!/usr/bin/env python3
"""Extract every sprite referenced by dump/*.json into app/assets/sprites."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import UnityPy
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
ASSET_DB = EXTRACT / "hsr_all_assets.sqlite3"


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "sprite"


def sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def walk(node):
    yield node
    for child in node.get("children", []):
        yield from walk(child)


def collect_references(dump_dir: Path) -> dict:
    refs: dict[int, dict] = {}
    for dump_file in sorted(dump_dir.glob("*.json")):
        if dump_file.name.startswith("_"):
            continue
        data = json.loads(dump_file.read_text(encoding="utf-8"))
        for node in walk(data["root"]):
            for component in node.get("components", []):
                if component.get("type") not in {"Image", "Graphic"}:
                    continue
                source = component.get("source", {})
                path_id = int(source.get("spritePathId") or 0)
                if path_id:
                    refs.setdefault(path_id, {
                        "name": component.get("sprite") or "",
                        "states": set(),
                    })["states"].add(data["state"])
                # Texture-mode SmoothMask stores the clipping sprite in the
                # MonoBehaviour, not in a sibling Image component.
                mask_source = component.get("smoothMask", {}).get("source", {})
                mask_id = int(mask_source.get("spritePathId") or 0)
                if mask_id:
                    refs.setdefault(mask_id, {
                        "name": component.get("smoothMask", {}).get("sprite") or "",
                        "states": set(),
                    })["states"].add(data["state"])
    return refs


def resolve_rows(path_ids: list[int]) -> dict[int, dict]:
    db = sqlite3.connect(f"file:{ASSET_DB}?mode=ro", uri=True)
    rows = {}
    try:
        cursor = db.cursor()
        for index in range(0, len(path_ids), 200):
            batch = path_ids[index:index + 200]
            placeholders = ",".join("?" for _ in batch)
            cursor.execute(
                f"select pathid,name,container,source_file from assets "
                f"where type='Sprite' and pathid in ({placeholders})",
                batch,
            )
            for path_id, name, container, source_file in cursor.fetchall():
                rows[int(path_id)] = {
                    "name": str(name or ""),
                    "container": str(container or ""),
                    "sourceFile": str(source_file or ""),
                }
    finally:
        db.close()
    return rows


def texture_by_path_id(objects) -> dict[int, object]:
    return {
        reader.path_id: reader
        for reader in objects
        if reader.type.name == "Texture2D"
    }


def atlas_crop(sprite, atlas_data, texture) -> tuple[Image.Image, dict]:
    atlas = texture.image.convert("RGBA")
    rect = atlas_data.textureRect
    width = max(1, int(round(rect.width)))
    height = max(1, int(round(rect.height)))
    left = max(0, int(round(rect.x)))
    bottom = max(0, int(round(rect.y)))
    right = min(atlas.width, left + width)
    top = min(atlas.height, bottom + height)
    crop = atlas.crop((left, atlas.height - top, right, atlas.height - bottom))
    if crop.width == 0 or crop.height == 0:
        raise RuntimeError(f"empty sprite crop {rect}")
    border = sprite.m_Border
    return crop, {
        "rect": [left, bottom, crop.width, crop.height],
        "border": [
            int(round(border.x)),
            int(round(border.y)),
            int(round(border.z)),
            int(round(border.w)),
        ],
        "texture": texture.m_Name,
        "textureSize": [texture.m_Width, texture.m_Height],
    }


def sprite_texture_and_crop(
    sprite, texture_readers, atlas_readers
) -> tuple[object, tuple[Image.Image, dict]]:
    direct_id = getattr(sprite.m_RD.texture, "m_PathID", 0)
    if direct_id and direct_id in texture_readers:
        texture = texture_readers[direct_id].read()
        return texture, atlas_crop(sprite, sprite.m_RD, texture)
    atlas_pptr = getattr(sprite, "m_SpriteAtlas", None)
    atlas_id = getattr(atlas_pptr, "m_PathID", 0)
    if atlas_id:
        # Packed sprites store textureRect in the atlas render data map.
        atlas_reader = atlas_readers.get(atlas_id)
        if atlas_reader is not None:
            atlas = atlas_reader.read()
            render_key = getattr(sprite, "m_RenderDataKey", None)
            for key, data in atlas.m_RenderDataMap:
                if key == render_key:
                    texture_id = data.texture.m_PathID
                    if texture_id not in texture_readers:
                        break
                    texture = texture_readers[texture_id].read()
                    return texture, atlas_crop(sprite, data, texture)
    raise RuntimeError(
        f"sprite {sprite.m_Name} has no Texture2D; "
        f"texturePathId={direct_id}, atlasPathId={atlas_id}"
    )


def export_sprite(sprite, texture) -> tuple[Image.Image, dict]:
    if texture is None:
        raise RuntimeError("sprite bundle has no Texture2D")
    atlas = texture.image.convert("RGBA")
    rect = sprite.m_RD.textureRect
    width = max(1, int(round(rect.width)))
    height = max(1, int(round(rect.height)))
    left = max(0, int(round(rect.x)))
    bottom = max(0, int(round(rect.y)))
    right = min(atlas.width, left + width)
    top = min(atlas.height, bottom + height)
    # Unity's texture rect origin is bottom-left; PIL uses top-left.
    crop = atlas.crop((left, atlas.height - top, right, atlas.height - bottom))
    if crop.width == 0 or crop.height == 0:
        raise RuntimeError(f"empty sprite crop {rect}")
    border = sprite.m_Border
    return crop, {
        "rect": [left, bottom, crop.width, crop.height],
        "border": [
            int(round(border.x)),
            int(round(border.y)),
            int(round(border.z)),
            int(round(border.w)),
        ],
        "texture": texture.m_Name,
        "textureSize": [texture.m_Width, texture.m_Height],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--dump", type=Path, default=REPO / "dump")
    parser.add_argument("--app", type=Path, default=REPO / "app")
    args = parser.parse_args()
    if not ASSET_DB.is_file():
        print(f"missing asset index: {ASSET_DB}", file=sys.stderr)
        return 2
    refs = collect_references(args.dump)
    rows = resolve_rows(sorted(refs))
    by_block: dict[str, set[int]] = defaultdict(set)
    missing_rows = []
    for path_id, ref in refs.items():
        row = rows.get(path_id)
        if not row:
            missing_rows.append({"pathId": path_id, "name": ref["name"]})
            continue
        by_block[row["sourceFile"]].add(path_id)

    sprite_dir = args.app / "assets" / "sprites"
    data_dir = args.app / "data"
    sprite_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    exported: dict[int, dict] = {}
    scan_report = []
    for block_name, wanted in sorted(by_block.items()):
        block_dir = args.cache / Path(block_name).stem
        if not block_dir.is_dir():
            print(f"missing extracted block directory: {block_dir}", file=sys.stderr)
            return 2
        remaining = set(wanted)
        cab_count = 0
        for cab in sorted(block_dir.rglob("CAB-*")):
            if cab.suffix == ".resS" or not remaining:
                continue
            cab_count += 1
            env = UnityPy.load(str(cab))
            candidates = [reader for reader in env.objects if reader.path_id in remaining]
            if not candidates:
                continue
            texture_readers = texture_by_path_id(env.objects)
            atlas_readers = {
                reader.path_id: reader
                for reader in env.objects
                if reader.type.name == "SpriteAtlas"
            }
            for reader in candidates:
                if reader.type.name != "Sprite":
                    continue
                sprite = reader.read()
                texture, (image, meta) = sprite_texture_and_crop(
                    sprite, texture_readers, atlas_readers
                )
                output = sprite_dir / f"{slug(sprite.m_Name)}-{abs(reader.path_id) & 0xffffffff:08x}.png"
                buffer = io.BytesIO()
                image.save(buffer, format="PNG", optimize=True)
                output.write_bytes(buffer.getvalue())
                exported[int(reader.path_id)] = {
                    "file": f"sprites/{output.name}",
                    "w": image.width,
                    "h": image.height,
                    "border": meta["border"],
                    "sha1": sha1(output),
                    "name": sprite.m_Name,
                    "texture": meta["texture"],
                    "textureSize": meta["textureSize"],
                    "rect": meta["rect"],
                    "sourceBlock": block_name,
                }
                remaining.discard(reader.path_id)
            del env
        scan_report.append({
            "block": block_name,
            "requested": len(wanted),
            "resolved": len(wanted) - len(remaining),
            "missing": sorted(remaining),
            "cabsScanned": cab_count,
        })

    assets = {
        "version": 1,
        "sprites": {},
        "spritePathIds": {},
        "fonts": {
            "RPG_CN": {
                "file": "fonts/RPG_CN.ttf",
                "family": "RPG_CN",
                "source": "~/Downloads/hsr-ui-extract/fonts/RPG_CN.ttf",
            },
        },
    }
    used_keys: dict[str, int] = {}
    for path_id, entry in exported.items():
        base = entry["name"] or f"sprite-{path_id}"
        key = base
        if key in used_keys and used_keys[key] != path_id:
            key = f"{base}#{path_id}"
        used_keys[key] = path_id
        assets["sprites"][key] = {
            "file": entry["file"],
            "w": entry["w"],
            "h": entry["h"],
            "border": entry["border"],
            "sha1": entry["sha1"],
            "texture": entry["texture"],
            "textureSize": entry["textureSize"],
            "rect": entry["rect"],
            "sourceBlock": entry["sourceBlock"],
        }
        assets["spritePathIds"][str(path_id)] = key

    font_source = EXTRACT / "fonts" / "RPG_CN.ttf"
    if font_source.is_file():
        font_dir = args.app / "assets" / "fonts"
        font_dir.mkdir(parents=True, exist_ok=True)
        font_target = font_dir / "RPG_CN.ttf"
        font_target.write_bytes(font_source.read_bytes())
        assets["fonts"]["RPG_CN"]["sha1"] = sha1(font_target)

    # Source TMP glyph tables are exported separately by extract_fonts.py.
    # Keep them addressable by the runtime SDF renderer without claiming a
    # Text component -> atlas binding: only nodes with an explicit sdfFont
    # use this table; the default remains the source TTF fallback.
    sdf_dump = args.dump / "_fonts.json"
    if sdf_dump.is_file():
        sdf_data = json.loads(sdf_dump.read_text(encoding="utf-8"))
        sdf_fonts = sdf_data.get("fonts", sdf_data) if isinstance(sdf_data, dict) else sdf_data
        if isinstance(sdf_fonts, list):
            sdf_fonts = {font["name"]: font for font in sdf_fonts}
        # text.js consumes the nested metrics shape and the runtime asset path.
        assets["sdfFonts"] = {
            name: {
                **font,
                "file": font.get("file") or font.get("atlasFile"),
                "metrics": font.get("metrics") or {
                    key: font[key]
                    for key in ("pointSize", "lineHeight", "ascent")
                    if key in font
                },
            }
            for name, font in sdf_fonts.items()
        }

    missing = [
        {"pathId": item["pathId"], "name": item["name"], "reason": "asset-db"}
        for item in missing_rows
    ]
    for item in scan_report:
        for path_id in item["missing"]:
            missing.append({
                "pathId": path_id,
                "name": refs[path_id]["name"],
                "reason": f"not found in {item['block']}",
            })
    (data_dir / "assets.json").write_text(
        json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (data_dir / "missing.json").write_text(
        json.dumps({"sprites": missing}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.dump / "_sprites.json").write_text(
        json.dumps(exported, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (data_dir / "manifest.json").write_text(
        json.dumps({
            "version": 1,
            "sprites": len(assets["sprites"]),
            "spriteRefs": len(refs),
            "missing": len(missing),
            "blocks": scan_report,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "sprites": len(assets["sprites"]),
        "spriteRefs": len(refs),
        "missing": len(missing),
        "out": str(sprite_dir),
    }, ensure_ascii=False, indent=2))
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
