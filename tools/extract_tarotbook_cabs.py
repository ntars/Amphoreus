#!/usr/bin/env python3
"""Extract the four blocks that contain the ten P0 TarotBook prefabs.

The HSR Asb container is ENCR/mr0k/Oodle. This script intentionally takes an
external Oodle decoder path instead of bundling a decoder whose license is not
part of this MIT repository. The output contains copied game data and must
stay outside the repository.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
BLOCKS = EXTRACT / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows"
ANIME_SRC = EXTRACT / "AnimeStudio-src-35036"
sys.path.insert(0, str(HERE))
from hsr_oodle_extract import _safe_relative_path, load_crypto, parse_bundle  # noqa: E402

BLOCK_NAMES = (
    "1bfedad375bc80397becdb804409dd1b.block",
    "5320cb981bb270df4950407fb5853c71.block",
    "5fa305fde9c53665a4caceadb445129d.block",
    "0c3c1fe882be95d337ffbb2c81fa43ac.block",
)


class ExternalOodle:
    def __init__(self, executable: Path):
        self.executable = executable

    def decompress(self, source: bytes, expected_size: int) -> bytes:
        with tempfile.TemporaryDirectory(prefix="amphoreus-unoodle-") as folder:
            source_path = Path(folder) / "input.bin"
            output_path = Path(folder) / "output.bin"
            source_path.write_bytes(source)
            result = subprocess.run(
                [
                    str(self.executable),
                    str(source_path),
                    "--length", str(expected_size),
                    "--output", str(output_path),
                ],
                capture_output=True,
                check=False,
            )
            if result.returncode or not output_path.is_file():
                detail = result.stderr.decode("utf-8", "replace")[-1200:]
                raise RuntimeError(f"Oodle decoder failed ({result.returncode}): {detail}")
            output = output_path.read_bytes()
            if len(output) != expected_size:
                raise RuntimeError(
                    f"Oodle decoder returned {len(output)} bytes, expected {expected_size}"
                )
            return output


def extract_block(block: Path, output_root: Path, oodle: ExternalOodle) -> dict:
    keys, tables = load_crypto(ANIME_SRC)
    source = block.read_bytes()
    block_dir = output_root / block.stem
    block_dir.mkdir(parents=True, exist_ok=True)
    cursor = 0
    bundles = []
    while cursor < len(source):
        end, manifest = parse_bundle(source, cursor, oodle, keys, tables)
        bundle_dir = block_dir / f"bundle-{len(bundles):04d}-0x{cursor:08x}"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for relative, content, flags in manifest["files"]:
            target = bundle_dir / _safe_relative_path(relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            files.append({"path": relative, "bytes": len(content), "flags": flags})
        bundles.append({
            "offset": cursor,
            "size": end - cursor,
            "blocks": manifest["blocks"],
            "files": files,
        })
        cursor = end
    report = {
        "sourceBlock": block.name,
        "sourceBytes": len(source),
        "decoder": "external-oodle",
        "bundles": bundles,
    }
    (block_dir / "manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {"block": block.name, "bundles": len(bundles), "bytes": len(source)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decoder", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--block", action="append", choices=BLOCK_NAMES)
    args = parser.parse_args()
    if not args.decoder.is_file():
        print(f"missing Oodle decoder: {args.decoder}", file=sys.stderr)
        return 2
    if not ANIME_SRC.is_dir():
        print(f"missing AnimeStudio source for ENCR key tables: {ANIME_SRC}", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    oodle = ExternalOodle(args.decoder)
    report = []
    for name in args.block or BLOCK_NAMES:
        block = BLOCKS / name
        if not block.is_file():
            print(f"missing copied game block: {block}", file=sys.stderr)
            return 2
        report.append(extract_block(block, args.out, oodle))
    (args.out / "index.json").write_text(
        json.dumps({"blocks": report}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"out": str(args.out), "blocks": report}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
