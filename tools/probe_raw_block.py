#!/usr/bin/env python3
"""Inventory raw RectTransform/GameObject records in copied HSR UI blocks."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import UnityPy

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
BLOCKS = EXTRACT / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows"
sys.path.insert(0, str(HERE))
from hsr_oodle_extract import Oodle, load_crypto, parse_bundle  # noqa: E402
from lib.unityraw import BadLayout, parse_game_object, parse_rect_transform  # noqa: E402


def load_cabs(path: Path):
    keys, tables = load_crypto(EXTRACT / "AnimeStudio-src-35036")
    oodle = Oodle(EXTRACT / "tools/libooz.dylib")
    source = path.read_bytes()
    cursor = 0
    while cursor < len(source):
        cursor, manifest = parse_bundle(source, cursor, oodle, keys, tables)
        for rel, content, _flags in manifest["files"]:
            if rel.endswith(".resS"):
                continue
            yield rel, content


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("block", nargs="+")
    parser.add_argument("--out", default="dump/_trace/raw_probe.json")
    args = parser.parse_args()
    report = {"blocks": {}, "rects": [], "gameObjects": [], "errors": []}
    for name in args.block:
        path = BLOCKS / name
        counts = Counter()
        for cab_name, content in load_cabs(path):
            try:
                env = UnityPy.load()
                env.load_file(content, name=cab_name)
            except Exception as exc:
                report["errors"].append({"block": name, "cab": cab_name, "stage": "load", "error": str(exc)})
                continue
            # Do not reuse a single UnityPy Environment: object byte offsets can
            # be rewritten when shared assets are merged. Each CAB is reopened
            # from its own immutable bytes.
            for assets in env.files.values():
                blob = content
                for path_id, reader in assets.objects.items():
                    counts[str(reader.type)] += 1
                    data = blob[reader.byte_start:reader.byte_start + reader.byte_size]
                    if str(reader.type) == "224":
                        try:
                            rect = parse_rect_transform(data)
                            rect["pathId"] = path_id
                            rect["cab"] = cab_name
                            report["rects"].append(rect)
                        except BadLayout as exc:
                            report["errors"].append({
                                "block": name, "cab": cab_name, "pathId": path_id,
                                "type": "RectTransform", "error": str(exc),
                            })
                    elif str(reader.type) == "1":
                        try:
                            go = parse_game_object(data)
                            go["pathId"] = path_id
                            go["cab"] = cab_name
                            report["gameObjects"].append(go)
                        except BadLayout as exc:
                            report["errors"].append({
                                "block": name, "cab": cab_name, "pathId": path_id,
                                "type": "GameObject", "error": str(exc),
                            })
        report["blocks"][name] = dict(counts)
    target = REPO / args.out
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "rects": len(report["rects"]),
        "gameObjects": len(report["gameObjects"]),
        "errors": len(report["errors"]),
        "out": str(target),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
