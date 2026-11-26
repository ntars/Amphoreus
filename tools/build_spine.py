#!/usr/bin/env python3
"""Build a minimal source-derived Spine 4.1 runtime dataset.

Only the binary features used by the two TarotBook page skeletons are
implemented. Unsupported features fail closed instead of guessing a pose.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
DEFAULT_SOURCE = EXTRACT / "exports/convert-all/assets/asbres/ui/spine/spine_tarobook/page"

SKELETONS = {
    "8451025478121060839": {
        "name": "UI_TaroBook_Page",
        "asset": "UI_TaroBook_Page.skel.asset",
        "atlas": "UI_TaroBook_Page.atlas.asset",
        "texture": "UI_TaroBook_Page.png",
    },
    "-348631082036145761": {
        "name": "UI_TaroBook_PageR",
        "asset": "UI_TaroBook_PageR.skel.asset",
        "atlas": "UI_TaroBook_PageR.atlas.asset",
        "texture": "UI_TaroBook_PageR.png",
    },
}

ATTACHMENT_REGION = 0
ATTACHMENT_BOUNDING_BOX = 1
ATTACHMENT_MESH = 2
ATTACHMENT_LINKED_MESH = 3
ATTACHMENT_PATH = 4
ATTACHMENT_POINT = 5
ATTACHMENT_CLIPPING = 6

BONE_ROTATE = 0
BONE_TRANSLATE = 1
BONE_TRANSLATE_X = 2
BONE_TRANSLATE_Y = 3
BONE_SCALE = 4
BONE_SCALE_X = 5
BONE_SCALE_Y = 6
BONE_SHEAR = 7
BONE_SHEAR_X = 8
BONE_SHEAR_Y = 9

SLOT_ATTACHMENT = 0

CURVE_LINEAR = 0
CURVE_STEPPED = 1
CURVE_BEZIER = 2


class Unsupported(Exception):
    pass


class BinaryInput:
    def __init__(self, data: bytes):
        self.data = data
        self.index = 0
        self.strings: list[str] = []

    def take(self, size: int) -> bytes:
        end = self.index + size
        if end > len(self.data):
            raise Unsupported(f"truncated Spine binary at {self.index}")
        value = self.data[self.index:end]
        self.index = end
        return value

    def byte(self) -> int:
        return struct.unpack(">b", self.take(1))[0]

    def unsigned_byte(self) -> int:
        return struct.unpack(">B", self.take(1))[0]

    def boolean(self) -> bool:
        return self.byte() != 0

    def int32(self) -> int:
        # Spine binary fixed-width numbers are network byte order.
        return struct.unpack(">i", self.take(4))[0]

    def float32(self) -> float:
        return struct.unpack(">f", self.take(4))[0]

    def int(self, optimize_positive: bool = True) -> int:
        result = 0
        shift = 0
        while True:
            value = self.unsigned_byte()
            result |= (value & 0x7F) << shift
            if not value & 0x80:
                break
            shift += 7
            if shift > 28:
                raise Unsupported("variable-length integer is too large")
        if optimize_positive:
            return result
        return (result >> 1) ^ -(result & 1)

    def string(self) -> str | None:
        byte_count = self.int(True)
        if byte_count == 0:
            return None
        if byte_count == 1:
            return ""
        return self.take(byte_count - 1).decode("utf-8")

    def string_ref(self) -> str | None:
        index = self.int(True)
        if index == 0:
            return None
        if index > len(self.strings):
            raise Unsupported(f"invalid Spine string reference {index}")
        return self.strings[index - 1]

    def float_array(self, count: int) -> list[float]:
        return [self.float32() for _ in range(count)]

    def short_array(self) -> list[int]:
        count = self.int(True)
        if count % 2:
            raise Unsupported("odd short array length")
        return list(struct.unpack(f">{count}h", self.take(count * 2)))


def read_vertices(source: BinaryInput, vertex_count: int) -> tuple[list[float], list[int] | None]:
    if not source.boolean():
        return source.float_array(vertex_count * 2), None
    bones: list[int] = []
    weights: list[int] = []
    vertices: list[float] = []
    for _ in range(vertex_count):
        bone_count = source.int(True)
        bones.append(bone_count)
        weights.append(bone_count)
        for _ in range(bone_count):
            bones.append(source.int(True))
            vertices.extend(source.float_array(3))
    return vertices, bones, weights


def parse_atlas(path: Path) -> dict:
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) < 2:
        raise Unsupported(f"invalid atlas: {path}")
    texture = lines[0]
    size = None
    regions = []
    current = None
    for line in lines[1:]:
        if line.startswith("size:"):
            width, height = line.split(":", 1)[1].split(",")
            size = [int(width), int(height)]
        elif line.startswith("bounds:"):
            if current is None:
                raise Unsupported("bounds without atlas region")
            x, y, width, height = (int(value) for value in line.split(":", 1)[1].split(","))
            current["bounds"] = [x, y, width, height]
        elif ":" not in line:
            current = {"name": line}
            regions.append(current)
    if size is None or not regions:
        raise Unsupported(f"atlas metadata missing in {path}")
    return {"texture": texture, "size": size, "regions": regions}


def parse_attachment(
    source: BinaryInput,
    slot_index: int,
    attachment_name: str,
    nonessential: bool,
) -> dict | None:
    name = source.string_ref() or attachment_name
    kind = source.byte()
    if kind == ATTACHMENT_REGION:
        raise Unsupported("region attachments are not used by page skeletons")
    if kind == ATTACHMENT_BOUNDING_BOX:
        raise Unsupported("bounding-box attachments are not used by page skeletons")
    if kind == ATTACHMENT_LINKED_MESH:
        raise Unsupported("linked meshes are not used by page skeletons")
    if kind == ATTACHMENT_PATH:
        raise Unsupported("path attachments are not used by page skeletons")
    if kind == ATTACHMENT_POINT:
        raise Unsupported("point attachments are not used by page skeletons")
    if kind == ATTACHMENT_CLIPPING:
        raise Unsupported("clipping attachments are not used by page skeletons")
    if kind != ATTACHMENT_MESH:
        raise Unsupported(f"unknown attachment type {kind}")

    path = source.string_ref()
    color = source.int32()
    vertex_count = source.int(True)
    uvs = source.float_array(vertex_count * 2)
    triangles = source.short_array()
    vertices, bones, weights = read_vertices(source, vertex_count)
    hull = source.int(True)
    if source.boolean():
        raise Unsupported("sequenced mesh attachments are not used by page skeletons")
    edges = []
    width = 0.0
    height = 0.0
    if nonessential:
        edges = source.short_array()
        width = source.float32()
        height = source.float32()
    return {
        "name": name,
        "slot": slot_index,
        "path": path or name,
        "vertices": vertices,
        "bones": bones,
        "boneCounts": weights,
        "triangles": triangles,
        "uvs": uvs,
        "hull": hull,
        "edges": edges,
        "width": width,
        "height": height,
        "color": color,
    }


def read_curve(source: BinaryInput, value_count: int) -> object:
    kind = source.byte()
    if kind == CURVE_LINEAR:
        return "linear"
    if kind == CURVE_STEPPED:
        return "stepped"
    if kind != CURVE_BEZIER:
        raise Unsupported(f"unknown curve type {kind}")
    return [source.float_array(4) for _ in range(value_count)]


def read_timeline(source: BinaryInput, bone_index: int, kind: int, frame_count: int) -> dict:
    value_count = 2 if kind in {BONE_TRANSLATE, BONE_SCALE, BONE_SHEAR} else 1
    frames = []
    curves = []
    time = source.float32()
    values = source.float_array(value_count)
    for frame in range(frame_count):
        frames.append([time, *values])
        if frame + 1 < frame_count:
            time = source.float32()
            values = source.float_array(value_count)
            curves.append(read_curve(source, value_count))
    names = {
        BONE_ROTATE: "rotate",
        BONE_TRANSLATE: "translate",
        BONE_TRANSLATE_X: "translateX",
        BONE_TRANSLATE_Y: "translateY",
        BONE_SCALE: "scale",
        BONE_SCALE_X: "scaleX",
        BONE_SCALE_Y: "scaleY",
        BONE_SHEAR: "shear",
        BONE_SHEAR_X: "shearX",
        BONE_SHEAR_Y: "shearY",
    }
    return {
        "type": names[kind],
        "bone": bone_index,
        "frames": frames,
        "curves": curves,
    }


def read_animation(source: BinaryInput) -> dict:
    timelines = []
    source.int(True)  # Total timeline count, useful only for allocation.
    slot_timeline_pages = source.int(True)
    for _ in range(slot_timeline_pages):
        slot_index = source.int(True)
        for _ in range(source.int(True)):
            kind = source.byte()
            frame_count = source.int(True)
            if kind != SLOT_ATTACHMENT:
                raise Unsupported(f"slot timeline type {kind} is not used by page skeletons")
            frames = []
            for _ in range(frame_count):
                frames.append([source.float32(), source.string_ref()])
            timelines.append({"type": "attachment", "slot": slot_index, "frames": frames})

    bone_pages = source.int(True)
    for _ in range(bone_pages):
        bone_index = source.int(True)
        for _ in range(source.int(True)):
            kind = source.byte()
            frame_count = source.int(True)
            source.int(True)  # Maximum Bezier count.
            timelines.append(read_timeline(source, bone_index, kind, frame_count))

    for label in ("IK", "transform", "path"):
        if source.int(True):
            raise Unsupported(f"{label} timelines are not used by page skeletons")
    if source.int(True):
        raise Unsupported("deform timelines are not used by page skeletons")
    if source.int(True):
        raise Unsupported("draw-order timelines are not used by page skeletons")
    if source.int(True):
        raise Unsupported("event timelines are not used by page skeletons")
    duration = 0.0
    for timeline in timelines:
        if timeline["frames"]:
            duration = max(duration, timeline["frames"][-1][0])
    return {"duration": duration, "timelines": timelines}


def parse_skeleton(path: Path) -> dict:
    source = BinaryInput(path.read_bytes())
    low_hash = source.int32()
    high_hash = source.int32()
    version = source.string()
    x = source.float32()
    y = source.float32()
    width = source.float32()
    height = source.float32()
    nonessential = source.boolean()
    fps = 0.0
    images_path = None
    audio_path = None
    if nonessential:
        fps = source.float32()
        images_path = source.string()
        audio_path = source.string()
    source.strings = [source.string() or "" for _ in range(source.int(True))]

    bones = []
    for index in range(source.int(True)):
        name = source.string()
        parent = None if index == 0 else source.int(True)
        rotation = source.float32()
        bx = source.float32()
        by = source.float32()
        scale_x = source.float32()
        scale_y = source.float32()
        shear_x = source.float32()
        shear_y = source.float32()
        length = source.float32()
        transform_mode = source.int(True)
        skin_required = source.boolean()
        color = source.int32() if nonessential else 0
        bones.append({
            "name": name,
            "parent": parent,
            "x": bx,
            "y": by,
            "rotation": rotation,
            "scaleX": scale_x,
            "scaleY": scale_y,
            "shearX": shear_x,
            "shearY": shear_y,
            "length": length,
            "transformMode": transform_mode,
            "skinRequired": skin_required,
            "color": color,
        })

    slots = []
    for _ in range(source.int(True)):
        name = source.string()
        bone = source.int(True)
        color = source.int32()
        dark_color = source.int32()
        attachment = source.string_ref()
        blend = source.int(True)
        slots.append({
            "name": name,
            "bone": bone,
            "color": color,
            "darkColor": dark_color,
            "attachment": attachment,
            "blend": blend,
        })

    if source.int(True) or source.int(True) or source.int(True):
        raise Unsupported("constraint data is not used by page skeletons")

    attachments = []
    default_slot_count = source.int(True)
    for _ in range(default_slot_count):
        slot_index = source.int(True)
        for _ in range(source.int(True)):
            attachment_name = source.string_ref()
            if not attachment_name:
                raise Unsupported("attachment name is missing")
            attachment = parse_attachment(source, slot_index, attachment_name, nonessential)
            if attachment:
                attachments.append(attachment)
    if source.int(True):
        raise Unsupported("non-default skins are not used by page skeletons")
    if source.int(True):
        raise Unsupported("events are not used by page skeletons")

    animations = {}
    for _ in range(source.int(True)):
        name = source.string()
        if not name:
            raise Unsupported("animation name is missing")
        animations[name] = read_animation(source)
    if source.index != len(source.data):
        raise Unsupported(f"unconsumed Spine bytes: {len(source.data) - source.index}")

    return {
        "version": version,
        "hash": [high_hash, low_hash],
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "fps": fps,
        "imagesPath": images_path,
        "audioPath": audio_path,
        "bones": bones,
        "slots": slots,
        "attachments": attachments,
        "animations": animations,
    }


def finite(value: object) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(finite(item) for item in value)
    if isinstance(value, dict):
        return all(finite(item) for item in value.values())
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=REPO / "app/data/spine.json")
    parser.add_argument("--assets", type=Path, default=REPO / "app/assets/spine")
    args = parser.parse_args()
    if not args.source.is_dir():
        print(f"missing Spine source directory: {args.source}", file=sys.stderr)
        return 2
    args.assets.mkdir(parents=True, exist_ok=True)
    output = {"version": 1, "skeletons": {}}
    try:
        for path_id, config in SKELETONS.items():
            skeleton_path = args.source / config["asset"]
            atlas_path = args.source / config["atlas"]
            texture_path = args.source / config["texture"]
            atlas = parse_atlas(atlas_path)
            skeleton = parse_skeleton(skeleton_path)
            texture_name = f"{config['name'].lower()}.png"
            shutil.copyfile(texture_path, args.assets / texture_name)
            skeleton.update({
                "name": config["name"],
                "atlas": atlas,
                "texture": {
                    "file": f"spine/{texture_name}",
                    "width": atlas["size"][0],
                    "height": atlas["size"][1],
                },
            })
            if not finite(skeleton):
                raise Unsupported(f"{config['name']}: non-finite source value")
            output["skeletons"][path_id] = skeleton
    except (OSError, Unsupported, struct.error) as error:
        print(f"Spine build failed: {error}", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    summary = {
        path_id: {
            "name": item["name"],
            "bones": len(item["bones"]),
            "slots": len(item["slots"]),
            "attachments": len(item["attachments"]),
            "animations": {name: round(animation["duration"], 6) for name, animation in item["animations"].items()},
        }
        for path_id, item in output["skeletons"].items()
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
