#!/usr/bin/env python3
"""Export RectTransform/GameObject/Image/Text trees from copied HSR blocks.

This is the M1 path-A source importer. It reads only the local read-only
`~/Downloads/hsr-ui-extract` copy and writes normalized JSON into `dump/`.
No screenshot, VM, or pixel measurement is used.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import UnityPy

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
BLOCKS = EXTRACT / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows"
ANIME_SRC = EXTRACT / "AnimeStudio-src-35036"
OOZ = EXTRACT / "tools/libooz.dylib"
sys.path.insert(0, str(HERE))
from hsr_oodle_extract import Oodle, load_crypto, parse_bundle  # noqa: E402

STAGE_W = 1920
STAGE_H = 1080
ROUND = 4


def r(value) -> float:
    number = float(value or 0)
    if not math.isfinite(number):
        return 0.0
    return round(number, ROUND)


def vec2(value) -> list[float]:
    return [r(getattr(value, "x", 0)), r(getattr(value, "y", 0))]


def pptr(value) -> int | None:
    if value is None or getattr(value, "m_PathID", 0) == 0:
        return None
    return int(value.m_PathID)


def safe_get(obj, name, default=None):
    try:
        return getattr(obj, name, default)
    except Exception:
        return default


def read_object(reader):
    try:
        return reader.read(check_read=False)
    except Exception:
        return None


def load_block(path: Path) -> dict:
    """Load a copied ENCR game block into in-memory serialized files."""
    try:
        env = UnityPy.load(str(path))
        if len(env.objects):
            return {"env": env, "method": "unitypy-direct"}
    except Exception:
        pass
    keys, tables = load_crypto(ANIME_SRC)
    oodle = Oodle(OOZ)
    source = path.read_bytes()
    with tempfile.TemporaryDirectory(prefix="amph-m1-") as folder:
        root = Path(folder)
        cursor = 0
        while cursor < len(source):
            cursor, manifest = parse_bundle(source, cursor, oodle, keys, tables)
            for rel, content, _flags in manifest["files"]:
                if rel.endswith(".resS"):
                    continue
                target = root / Path(rel).name
                target.write_bytes(content)
        # A few structure-only CABs use stripped type trees and UnityPy cannot
        # parse them; load one file at a time and keep every readable object.
        env = UnityPy.load()
        for item in root.iterdir():
            try:
                env.load_file(item.read_bytes(), name=item.name)
            except Exception as exc:
                print(f"skip unreadable CAB {item.name}: {exc}", file=sys.stderr)
    return {"env": env, "method": "host-oodle-unitypy"}


def collect_assets(paths: list[Path]) -> tuple[dict, list[str]]:
    objects: dict[int, dict] = {}
    methods = []
    for path in paths:
        loaded = load_block(path)
        methods.append(f"{path.name}:{loaded['method']}")
        for reader in loaded["env"].objects:
            obj = read_object(reader)
            if obj is None:
                continue
            objects[int(reader.path_id)] = {
                "type": str(reader.type),
                "reader": reader,
                "data": obj,
                "source": path.name,
            }
    return objects, methods


def index_objects(objects: dict[int, dict]) -> dict[str, dict[int, int]]:
    go_by_transform: dict[int, int] = {}
    transform_by_go: dict[int, int] = {}
    for pid, entry in objects.items():
        if entry["type"] != "224":
            continue
        go = pptr(safe_get(entry["data"], "m_GameObject"))
        if go is not None:
            go_by_transform[pid] = go
            transform_by_go[go] = pid
    return {"goByTransform": go_by_transform, "transformByGo": transform_by_go}


def go_name(objects: dict[int, dict], go_id: int | None) -> str:
    if go_id is None:
        return ""
    entry = objects.get(go_id)
    if not entry:
        return ""
    return str(safe_get(entry["data"], "m_Name") or "")


def image_component(objects: dict[int, dict], pid: int) -> dict | None:
    entry = objects.get(pid)
    if not entry or entry["type"] != "114":
        return None
    data = entry["data"]
    # A Unity Image is a MonoBehaviour in these extracted UI bundles. The
    # m_Script PPtr is not stable, so identify it by serialized fields.
    sprite = safe_get(data, "m_Sprite")
    if sprite is None:
        return None
    sprite_id = pptr(sprite)
    sprite_entry = objects.get(sprite_id) if sprite_id else None
    sprite_obj = sprite_entry["data"] if sprite_entry else None
    texture_id = pptr(safe_get(sprite_obj, "m_Texture"))
    texture_entry = objects.get(texture_id) if texture_id else None
    color = safe_get(data, "m_Color")
    rect = safe_get(sprite_obj, "m_Rect")
    border = safe_get(sprite_obj, "m_Border")
    return {
        "type": "Image",
        "sprite": str(safe_get(sprite_obj, "m_Name") or ""),
        "spriteRect": [r(getattr(rect, x, 0)) for x in ("x", "y", "width", "height")] if rect else [0, 0, 0, 0],
        "border": [r(getattr(border, x, 0)) for x in ("x", "y", "z", "w")] if border else [0, 0, 0, 0],
        "texture": str(safe_get(texture_entry["data"] if texture_entry else None, "m_Name") or ""),
        "textureSize": [
            int(safe_get(texture_entry["data"] if texture_entry else None, "m_Width") or 0),
            int(safe_get(texture_entry["data"] if texture_entry else None, "m_Height") or 0),
        ],
        "imageType": str(safe_get(data, "m_Type") or "Simple"),
        "fillMethod": int(safe_get(data, "m_FillMethod") or 0),
        "fillAmount": r(safe_get(data, "m_FillAmount") or 0),
        "preserveAspect": bool(safe_get(data, "m_PreserveAspect") or False),
        "color": [
            r(getattr(color, "r", 1)), r(getattr(color, "g", 1)),
            r(getattr(color, "b", 1)), r(getattr(color, "a", 1)),
        ] if color else [1, 1, 1, 1],
        "material": "",
        "raycast": bool(safe_get(data, "m_RaycastTarget") or False),
    }


def text_component(objects: dict[int, dict], pid: int) -> dict | None:
    entry = objects.get(pid)
    if not entry or entry["type"] != "114":
        return None
    data = entry["data"]
    if safe_get(data, "m_text") is None:
        return None
    color = safe_get(data, "m_fontColor") or safe_get(data, "m_Color")
    return {
        "type": "Text",
        "text": str(safe_get(data, "m_text") or ""),
        "font": "",
        "fontSize": r(safe_get(data, "m_fontSize") or 0),
        "color": [
            r(getattr(color, "r", 1)), r(getattr(color, "g", 1)),
            r(getattr(color, "b", 1)), r(getattr(color, "a", 1)),
        ] if color else [1, 1, 1, 1],
        "alignment": str(safe_get(data, "m_alignment") or ""),
        "lineSpacing": r(safe_get(data, "m_lineSpacing") or 0),
        "charSpacing": r(safe_get(data, "m_characterSpacing") or 0),
        "textQuads": [],
        "source": "path-a-static-no-runtime-quads",
    }


def components_for(objects: dict[int, dict], go_id: int) -> list[dict]:
    out = []
    go = objects.get(go_id)
    if not go:
        return out
    data = go["data"]
    for component in safe_get(data, "m_Component") or []:
        pid = pptr(component)
        if pid is None:
            continue
        comp = image_component(objects, pid) or text_component(objects, pid)
        if comp:
            out.append(comp)
    return out


def build_tree(objects: dict[int, dict], root_transform: int, state: str, methods: list[str]) -> dict:
    index = index_objects(objects)
    cache: dict[int, dict] = {}
    visiting: set[int] = set()

    def node(transform_id: int, path: str, sibling: int) -> dict | None:
        if transform_id in cache:
            return dict(cache[transform_id])
        if transform_id in visiting:
            return None
        visiting.add(transform_id)
        entry = objects.get(transform_id)
        if not entry or entry["type"] != "224":
            visiting.discard(transform_id)
            return None
        data = entry["data"]
        go_id = index["goByTransform"].get(transform_id)
        name = go_name(objects, go_id) or "GameObject"
        full_path = f"{path}/{name}" if path else name
        rect = {
            "anchorMin": vec2(safe_get(data, "m_AnchorMin")),
            "anchorMax": vec2(safe_get(data, "m_AnchorMax")),
            "pivot": vec2(safe_get(data, "m_Pivot")),
            "sizeDelta": vec2(safe_get(data, "m_SizeDelta")),
            "anchoredPosition": vec2(safe_get(data, "m_AnchoredPosition")),
            "size": [
                r(safe_get(safe_get(data, "m_Rect"), "width")),
                r(safe_get(safe_get(data, "m_Rect"), "height")),
            ],
            "localScale": [
                r(safe_get(safe_get(data, "m_LocalScale"), "x")),
                r(safe_get(safe_get(data, "m_LocalScale"), "y")),
            ],
            "localEuler": [
                r(safe_get(safe_get(data, "m_LocalEulerAngles"), "x")),
                r(safe_get(safe_get(data, "m_LocalEulerAngles"), "y")),
                r(safe_get(safe_get(data, "m_LocalEulerAngles"), "z")),
            ],
        }
        result = {
            "name": name,
            "path": full_path,
            "sibling": sibling,
            "active": True,
            "rt": rect,
            "stage": {"aabb": [0, 0, 0, 0]},
            "components": components_for(objects, go_id) if go_id else [],
            "children": [],
        }
        for i, child in enumerate(safe_get(data, "m_Children") or []):
            child_node = node(pptr(child), full_path, i)
            if child_node:
                result["children"].append(child_node)
        visiting.discard(transform_id)
        cache[transform_id] = result
        return dict(result)

    root = node(root_transform, "", 0)
    if not root:
        raise ValueError(f"root transform {root_transform} not found")
    root["name"] = state
    root["path"] = state
    root["rt"]["size"] = [STAGE_W, STAGE_H]
    root["stage"]["aabb"] = [0, 0, STAGE_W, STAGE_H]
    return {
        "schema": 1,
        "state": state,
        "capturedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "static",
        "screen": {"w": STAGE_W, "h": STAGE_H},
        "canvas": {
            "name": "UIRoot", "renderMode": "ScreenSpaceCamera", "scaleFactor": 1,
            "refW": STAGE_W, "refH": STAGE_H, "match": 0.5,
            "scalerMode": "ScaleWithScreenSize",
        },
        "root": root,
        "provenance": {
            "methods": methods,
            "rootTransformPathId": root_transform,
            "note": "static prefab geometry; runtime textQuads require path B and are explicitly empty",
        },
    }


def count_nodes(node: dict) -> int:
    return 1 + sum(count_nodes(child) for child in node.get("children", []))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", default="entrance")
    parser.add_argument("--root-transform", type=int, required=True)
    parser.add_argument("--block", action="append", required=True, help="block filename(s) under Asb/Windows")
    args = parser.parse_args()
    paths = [BLOCKS / name for name in args.block]
    for path in paths:
        if not path.is_file():
            raise SystemExit(f"missing block: {path}")
    objects, methods = collect_assets(paths)
    dump = build_tree(objects, args.root_transform, args.state, methods)
    target = REPO / "dump" / f"{args.state}.json"
    target.write_text(json.dumps(dump, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "state": args.state, "file": str(target), "nodes": count_nodes(dump["root"]),
        "objects": len(objects), "methods": methods,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
