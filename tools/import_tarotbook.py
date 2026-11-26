#!/usr/bin/env python3
"""Build the 10 P0 state dumps from copied HSR serialized UI objects.

The input is the local read-only game copy. The extractor deliberately reads
the original RectTransform, GameObject, built-in CanvasGroup and MonoScript
objects. MonoBehaviour payloads whose TypeTrees are stripped are decoded only
at field offsets that were validated against this game's UI bundles.

Screenshots, VM captures and hand-tuned coordinates are never inputs.
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import struct
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import UnityPy

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
EXTRACT = Path.home() / "Downloads/hsr-ui-extract"
ASSET_DB = EXTRACT / "hsr_all_assets.sqlite3"
BLOCKS = EXTRACT / "StarRailGame-full/StarRail_Data/StreamingAssets/Asb/Windows"
sys.path.insert(0, str(HERE / "lib"))
from unityraw import BadLayout, parse_game_object, parse_rect_transform  # noqa: E402

STAGE_W = 1920
STAGE_H = 1080
ROUND = 4
IMAGE_SCRIPT = -7030229213176759517
TEXT_SCRIPT = 2163569534093517469
# Measured from the copied RPG_CN.ttf with Pillow: getbbox height 19 and
# advance 20 at font size 20. These ratios are font metrics, not guesses.
TEXT_LINE_FACTOR = 0.95
TEXT_GLYPH_FACTOR = 1.0
TEXT_ALIGNMENT_OFFSET = 112
TEXT_ANCHORS = {
    0: "upperLeft", 1: "upperCenter", 2: "upperRight",
    3: "middleLeft", 4: "middleCenter", 5: "middleRight",
    6: "lowerLeft", 7: "lowerCenter", 8: "lowerRight",
}

STATES = {
    "entrance": {
        "block": "1bfedad375bc80397becdb804409dd1b.block",
        "cab": "CAB-a75fe4eb02e0fe7f192ba845df0aaf36",
        "root": -6356122190222438227,
        "rootName": "TarotBookMainEntrancePage",
    },
    "catalog": {
        "block": "5320cb981bb270df4950407fb5853c71.block",
        "cab": "CAB-ae8196640cf850b177a4054d6046b52b",
        "root": 546751728318039107,
        "rootName": "TarotBookRealMainPage",
    },
    "bookletCover": {
        "block": "1bfedad375bc80397becdb804409dd1b.block",
        "cab": "CAB-3d60d57184d183dcb610869a0670f3ab",
        "root": -1114662790417671122,
        "rootName": "TarotBookBookletPage",
        "variant": "TBBookletCoverPageContent",
    },
    "bookletPage": {
        "block": "1bfedad375bc80397becdb804409dd1b.block",
        "cab": "CAB-3d60d57184d183dcb610869a0670f3ab",
        "root": -1114662790417671122,
        "rootName": "TarotBookBookletPage",
        "variant": "TBBookletPageContent",
    },
    "talk": {
        "block": "5fa305fde9c53665a4caceadb445129d.block",
        "cab": "CAB-6faa1749239a12d3c462088674113a0e",
        "root": 6799616430767184855,
        "rootName": "TarotBookMimiTalkPage",
    },
    "wikiDialog": {
        "block": "0c3c1fe882be95d337ffbb2c81fa43ac.block",
        "cab": "CAB-8226e0ef79dead41c640a025b77815ce",
        "root": 4915079356493387081,
        "rootName": "TarotBookWikiDialog",
        "variant": "Normal",
    },
    "wikiError": {
        "block": "0c3c1fe882be95d337ffbb2c81fa43ac.block",
        "cab": "CAB-8226e0ef79dead41c640a025b77815ce",
        "root": 4915079356493387081,
        "rootName": "TarotBookWikiDialog",
        "variant": "Error",
    },
    "mail": {
        "block": "0c3c1fe882be95d337ffbb2c81fa43ac.block",
        "cab": "CAB-d86173eac2ffcf560a51b6f79aa57066",
        "root": 7487354626223147666,
        "rootName": "TarotBookMailDialog",
    },
    "star": {
        "block": "1bfedad375bc80397becdb804409dd1b.block",
        "cab": "CAB-cee2b0e5a3723e818260e2cb7cd2d600",
        "root": -6799434327374047402,
        "rootName": "TarotBookStarPanelPage",
    },
    "reward": {
        "block": "1bfedad375bc80397becdb804409dd1b.block",
        "cab": "CAB-ccc424f499203411e69dd23c7236e350",
        "root": 6274420760689999793,
        "rootName": "TarotBookQuestRewardPage",
    },
}

# Runtime prefab CABs that own the animation paths absent from the ten static
# screens. They are source evidence for hierarchy/path binding only; no
# geometry or screenshot data is inferred from them.
ANIMATION_SUPPORT = {
    "TBCardItem": "CAB-b83d57d91f28bd11d2d33766b20e736e",
    "TarotBookGuideBtnTypeRect": "CAB-4cb19a100154b6c5302aa9d78a94cfd5",
    "TarotBookGuideTalkSPHint": "CAB-ae242f3058c4c445c8405329d3fdfb5f",
    "TarotBookMainEntranceErrorDialog": "CAB-5e16a696be85215630cd4ece6bcd2705",
    "TarotBookTalkInfoItem": "CAB-f3119ebd3f35a2eb3ed044810ebbcc75",
}


def r(value: float) -> float:
    number = float(value or 0)
    if not math.isfinite(number):
        return 0.0
    return round(number, ROUND)


def vec2(value) -> list[float]:
    return [r(value[0]), r(value[1])]


def ppath(value: dict) -> int:
    return int(value.get("pathId") or 0)


def stringify_unsafe_path_ids(value):
    """Keep 64-bit Unity PathIDs exact when JavaScript parses the dump."""
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                (key == "pathId" or key.endswith("PathId"))
                and isinstance(item, int)
                and abs(item) > 2**53
            ):
                value[key] = str(item)
            else:
                stringify_unsafe_path_ids(item)
    elif isinstance(value, list):
        for item in value:
            stringify_unsafe_path_ids(item)
    return value


def read_raw(reader) -> bytes:
    return reader.get_raw_data()


def script_id(raw: bytes) -> int:
    if len(raw) < 28:
        raise BadLayout(f"MonoBehaviour payload is only {len(raw)} bytes")
    return struct.unpack_from("<q", raw, 20)[0]


def component_game_object(raw: bytes) -> int:
    if len(raw) < 12:
        raise BadLayout("component payload has no GameObject PPtr")
    return struct.unpack_from("<q", raw, 4)[0]


def component_enabled(raw: bytes) -> bool:
    return len(raw) < 16 or bool(struct.unpack_from("<I", raw, 12)[0])


def align4(value: int) -> int:
    return (value + 3) & ~3


def read_string(data: bytes, cursor: int) -> tuple[str, int]:
    if cursor + 4 > len(data):
        raise BadLayout("string length overruns payload")
    length = struct.unpack_from("<i", data, cursor)[0]
    if length < 0 or cursor + 4 + length > len(data):
        raise BadLayout(f"invalid string length {length} at {cursor}")
    raw = data[cursor + 4:cursor + 4 + length]
    end = cursor + 4 + align4(length)
    return raw.split(b"\0", 1)[0].decode("utf-8", "replace"), end


def iter_strings(data: bytes) -> list[tuple[int, str]]:
    found = []
    for offset in range(32, len(data) - 3, 4):
        try:
            text, _ = read_string(data, offset)
        except BadLayout:
            continue
        if text:
            found.append((offset, text))
    return found


@dataclass
class LoadedCab:
    path: Path
    objects: dict[int, object]
    rects: dict[int, dict]
    game_objects: dict[int, dict]
    scripts: dict[int, str]
    rect_by_go: dict[int, int]
    transform_by_go: dict[int, int] = field(default_factory=dict)


def locate_cab(cache: Path, cab_name: str) -> Path:
    matches = list(cache.rglob(cab_name))
    if not matches:
        raise FileNotFoundError(
            f"missing CAB {cab_name} under {cache}; run tools/extract_tarotbook_cabs.py"
        )
    if len(matches) > 1:
        raise RuntimeError(f"ambiguous CAB {cab_name}: {matches}")
    return matches[0]


def load_cab(path: Path) -> LoadedCab:
    env = UnityPy.load(str(path))
    objects = {int(reader.path_id): reader for reader in env.objects}
    rects: dict[int, dict] = {}
    game_objects: dict[int, dict] = {}
    scripts: dict[int, str] = {}
    rect_by_go: dict[int, int] = {}
    transform_by_go: dict[int, int] = {}

    for reader in env.objects:
        if reader.type.name == "MonoScript":
            try:
                data = reader.read()
                scripts[int(reader.path_id)] = str(getattr(data, "m_ClassName", "") or "")
            except Exception:
                continue
        elif reader.type.name == "GameObject":
            game_objects[int(reader.path_id)] = parse_game_object(read_raw(reader))
        elif reader.type.name in {"RectTransform", "Transform"}:
            try:
                data = parse_rect_transform(read_raw(reader))
            except BadLayout:
                # Plain Transform has no RectTransform layout fields; its
                # hierarchy is still needed to trace animation paths.
                if reader.type.name != "Transform":
                    raise
                data = {
                    "gameObject": {"pathId": 0},
                    "father": {"pathId": 0},
                    "children": [],
                    "localRotation": [0, 0, 0, 1],
                }
                raw = read_raw(reader)
                if len(raw) >= 28:
                    game_id, father_id = struct.unpack_from("<qq", raw, 4)
                    data["gameObject"] = {"pathId": game_id}
                    data["father"] = {"pathId": father_id}
                if len(raw) >= 60:
                    data["localRotation"] = list(struct.unpack_from("<4f", raw, 28))
                if len(raw) >= 72:
                    data["localPosition"] = list(struct.unpack_from("<3f", raw, 44))
                if len(raw) >= 84:
                    data["localScale"] = list(struct.unpack_from("<3f", raw, 56))
                data.setdefault("localPosition", [0.0, 0.0, 0.0])
                data.setdefault("localScale", [1.0, 1.0, 1.0])
            rects[int(reader.path_id)] = data
            go_id = ppath(data["gameObject"])
            if reader.type.name == "RectTransform":
                rect_by_go[go_id] = int(reader.path_id)
            else:
                transform_by_go[go_id] = int(reader.path_id)

    return LoadedCab(path, objects, rects, game_objects, scripts,
                     rect_by_go, transform_by_go)


def resolve_sprite_metadata(path_ids: set[int]) -> dict[int, dict]:
    """Resolve Sprite path IDs against the local read-only asset index."""
    result: dict[int, dict] = {}
    ids = sorted(path_id for path_id in path_ids if path_id)
    db = sqlite3.connect(f"file:{ASSET_DB}?mode=ro", uri=True)
    try:
        cursor = db.cursor()
        for index in range(0, len(ids), 200):
            batch = ids[index:index + 200]
            placeholders = ",".join("?" for _ in batch)
            cursor.execute(
                f"select pathid,name,container,source_file from assets "
                f"where type='Sprite' and pathid in ({placeholders})",
                batch,
            )
            for path_id, name, container, source_file in cursor.fetchall():
                container = str(container or "")
                result[int(path_id)] = {
                    "name": str(name or ""),
                    "container": container,
                    "texture": Path(container).stem,
                    "source_file": str(source_file or ""),
                }
    finally:
        db.close()
    return result


def parse_image(raw: bytes, sprite_meta: dict[int, dict]) -> dict:
    if len(raw) != 232:
        raise BadLayout(f"unsupported Image payload length {len(raw)}")
    sprite_file, sprite_path = struct.unpack_from("<iq", raw, 72)
    color = struct.unpack_from("<4f", raw, 44)
    sprite = sprite_meta.get(sprite_path, {})
    type_code = struct.unpack_from("<i", raw, 84)[0]
    type_names = {0: "Simple", 1: "Sliced", 2: "Tiled", 3: "Filled"}
    return {
        # Images without a sprite are still uGUI Images, but they are flat
        # color Graphics and do not participate in sprite asset resolution.
        "type": "Image" if sprite_path else "Graphic",
        "sprite": str(sprite.get("name") or ""),
        "spriteRect": [0, 0, 0, 0],
        "border": [0, 0, 0, 0],
        "texture": str(sprite.get("texture") or ""),
        "textureSize": [0, 0],
        "imageType": type_names.get(type_code, "Simple"),
        "fillMethod": int(struct.unpack_from("<i", raw, 96)[0]),
        "fillAmount": r(struct.unpack_from("<f", raw, 100)[0]),
        "preserveAspect": bool(struct.unpack_from("<I", raw, 88)[0]),
        "color": [r(value) for value in color],
        "material": "",
        "raycast": bool(struct.unpack_from("<I", raw, 60)[0]),
        "source": {
            "sourceType": "Image",
            "scriptPathId": IMAGE_SCRIPT,
            "spriteFileId": int(sprite_file),
            "spritePathId": int(sprite_path),
            "textureContainer": str(sprite.get("container") or ""),
            "sourceBlock": str(sprite.get("source_file") or ""),
            "layout": "image-232",
        },
    }


def parse_text(raw: bytes) -> dict:
    # LocalizedText inherits the game's Text payload. The actual localized
    # string and the localization key are both serialized length-prefixed.
    strings = iter_strings(raw)
    # The first string is the legacy text placeholder. The readable payload
    # starts at 144 and contains the authored text followed by a localization
    # key. Earlier short strings such as the single byte at 64 are style data.
    # Strings at 168+ in these payloads are a UTF-16 style/secondary string
    # whose bytes decode as replacement characters. The authored payload is
    # the first printable string at or immediately after offset 144.
    authored = [(offset, value) for offset, value in strings if offset >= 140 and value.isprintable()]
    authored = [item for item in authored if not all(ch in "?" or ord(ch) >= 0xfffd for ch in item[1])]
    text = authored[0][1] if authored else ""
    key = ""
    for _, value in authored:
        if value.startswith("UIText_") or value.startswith("DevUI_"):
            key = value
            break
    if not key and len(authored) > 1:
        key = authored[-1][1]
    color = struct.unpack_from("<4f", raw, 44)
    font_size = struct.unpack_from("<i", raw, 84)[0]
    if not 6 <= font_size <= 200:
        font_size = 0
    line_spacing = struct.unpack_from("<f", raw, 140)[0] if len(raw) >= 144 else 1.0
    if not 0.25 <= line_spacing <= 4.0:
        line_spacing = 1.0
    alignment_code = struct.unpack_from("<i", raw, TEXT_ALIGNMENT_OFFSET)[0] if len(raw) >= TEXT_ALIGNMENT_OFFSET + 4 else None
    alignment = TEXT_ANCHORS.get(alignment_code, "")
    preferred_h = round(font_size * TEXT_LINE_FACTOR * line_spacing, 4) if font_size else 0.0
    # Spaced decorative labels encode their tracking in literal spaces; using
    # the authored string length follows the source instead of a fixed guess.
    preferred_w = round(font_size * max(1, len(text)) * TEXT_GLYPH_FACTOR, 4) if font_size else 0.0
    if not text and key:
        preferred_w = font_size * 4.0
    return {
        "type": "Text",
        "text": text,
        "localizationKey": key,
        "font": "RPG_CN",
        "fontSize": font_size,
        "color": [r(value) for value in color],
        "alignment": alignment,
        "lineSpacing": r(line_spacing),
        "charSpacing": 0,
        "textQuads": [],
        "preferredSize": [r(preferred_w), r(preferred_h)],
        "source": {
            "scriptPathId": TEXT_SCRIPT,
            "layout": "localized-text-static",
            "textOffset": authored[0][0] if authored else None,
            "keyOffset": next(
                (offset for offset, value in authored if value == key), None
            ),
            "fontSizeOffset": 84,
            "alignmentOffset": TEXT_ALIGNMENT_OFFSET if alignment else None,
            "preferredSize": "font_size x authored string; final quads require runtime",
            "quads": "path-b-runtime-required",
        },
    }


def parse_canvas_group(reader) -> dict | None:
    try:
        data = reader.read()
    except Exception:
        return None
    return {
        "type": "CanvasGroup",
        "alpha": r(getattr(data, "m_Alpha", 1)),
        "interactable": bool(getattr(data, "m_Interactable", False)),
        "blocksRaycasts": bool(getattr(data, "m_BlocksRaycasts", True)),
        "ignoreParentGroups": bool(getattr(data, "m_IgnoreParentGroups", False)),
    }


def parse_mask(raw: bytes, class_name: str, sprite_meta: dict[int, dict]) -> dict:
    """Decode the mask fields that drive descendant clipping.

    UnityEngine.UI.Mask and RectMask2D use their own uGUI serializers.
    SmoothMask is a 136-byte stripped MonoBehaviour whose serialized fields
    were validated against the TarotBook CAB:
      32 i32 m_Type, 36 f32 m_Radius, 40 bool m_ReverseMask,
      48 i64 sprite PPtr.
    Reading raw[32] as showMaskGraphic is incorrect: for SmoothMask it is
    the shape mode (Texture=1, Rectangle=2, Circle=3, ...).
    """
    sid = script_id(raw)
    if class_name == "SmoothMask":
        if len(raw) != 136:
            raise BadLayout(f"unsupported SmoothMask payload length {len(raw)}")
        mask_type = struct.unpack_from("<i", raw, 32)[0]
        radius = r(struct.unpack_from("<f", raw, 36)[0])
        reverse = bool(struct.unpack_from("<I", raw, 40)[0])
        sprite_file, sprite_path = struct.unpack_from("<iq", raw, 44)
        sprite = sprite_meta.get(sprite_path, {})
        type_names = {
            0: "Unused", 1: "Texture", 2: "Rectangle", 3: "Circle",
            4: "CircleEnvelope", 5: "CircleFit",
        }
        if mask_type not in type_names:
            raise BadLayout(f"unknown SmoothMask type {mask_type}")
        return {
            "type": "Mask",
            "maskType": class_name,
            "smoothMaskType": type_names[mask_type],
            "smoothMaskTypeCode": mask_type,
            "radius": radius,
            "reverseMask": reverse,
            "showMaskGraphic": True,
            "sprite": str(sprite.get("name") or ""),
            "source": {
                "scriptPathId": sid,
                "layout": "smooth-mask-136",
                "typeOffset": 32,
                "radiusOffset": 36,
                "reverseMaskOffset": 40,
                "spriteFileId": int(sprite_file),
                "spritePathId": str(sprite_path),
                "textureContainer": str(sprite.get("container") or ""),
            },
        }
    return {
        "type": "Mask",
        "maskType": class_name,
        "showMaskGraphic": bool(struct.unpack_from("<I", raw, 32)[0]) if len(raw) >= 36 else False,
        "source": {"scriptPathId": sid, "layout": "stripped-monobehaviour"},
    }


def parse_button(raw: bytes) -> dict:
    return {
        "type": "Button",
        "interactable": component_enabled(raw),
        "source": {"scriptPathId": script_id(raw), "layout": "animator-button"},
    }


def parse_layout_fields(raw: bytes, class_name: str) -> dict:
    """Decode fixed-size Unity layout fields validated in the TarotBook CABs."""
    fields: dict = {}
    if class_name == "ContentSizeFitter" and len(raw) >= 40:
        fields["horizontalFit"] = int(struct.unpack_from("<i", raw, 32)[0])
        fields["verticalFit"] = int(struct.unpack_from("<i", raw, 36)[0])
    elif class_name in {"HorizontalLayoutGroup", "VerticalLayoutGroup"} and len(raw) >= 84:
        fields["padding"] = [int(struct.unpack_from("<i", raw, offset)[0]) for offset in (32, 36, 40, 44)]
        fields["spacing"] = r(struct.unpack_from("<f", raw, 48)[0])
        fields["childAlignment"] = int(struct.unpack_from("<i", raw, 52)[0])
        fields["controlChildWidth"] = bool(struct.unpack_from("<I", raw, 72)[0])
        fields["controlChildHeight"] = bool(struct.unpack_from("<I", raw, 76)[0])
    elif class_name == "LayoutElement" and len(raw) >= 72:
        def optional(offset: int) -> float | None:
            value = struct.unpack_from("<f", raw, offset)[0]
            return r(value) if value >= 0 else None
        fields["minWidth"] = optional(36)
        fields["minHeight"] = optional(40)
        fields["preferredWidth"] = optional(44)
        fields["preferredHeight"] = optional(48)
        fields["flexibleWidth"] = optional(52)
        fields["flexibleHeight"] = optional(56)
    elif class_name == "AspectRatioFitter" and len(raw) >= 40:
        # Validated against the PictureBg MonoBehaviour in the catalog CAB:
        # mode 4 (FitInParent) and aspectRatio 1.77778 are serialized at
        # offsets 32 and 36 after GameObject/mono-script/alignment padding.
        fields["aspectMode"] = int(struct.unpack_from("<i", raw, 32)[0])
        fields["aspectRatio"] = r(struct.unpack_from("<f", raw, 36)[0])
    elif class_name == "GraphicRaycaster":
        fields["blockingObjects"] = int(struct.unpack_from("<i", raw, 32)[0]) if len(raw) >= 36 else None
    return fields


def parse_spine(raw: bytes, class_name: str) -> dict:
    """Source-backed SkeletonGraphic reference metadata.

    The 236-byte stripped payload keeps the SkeletonDataAsset PPtr at offset
    76. Animation pose is not serialized here; this component only supplies
    the binding to the source .skel/.atlas assets and the initial color.
    """
    skeleton_data = struct.unpack_from("<q", raw, 76)[0] if len(raw) >= 84 else 0
    reference_size = None
    reference_scale = None
    layout_scale_mode = None
    if len(raw) >= 164:
        layout_scale_mode = struct.unpack_from("<i", raw, 148)[0]
        reference_size = [
            r(struct.unpack_from("<f", raw, 152)[0]),
            r(struct.unpack_from("<f", raw, 156)[0]),
        ]
        reference_scale = r(struct.unpack_from("<f", raw, 160)[0])
        if (
            layout_scale_mode not in range(5)
            or not all(math.isfinite(value) and value > 0 for value in reference_size)
            or not math.isfinite(reference_scale)
            or reference_scale <= 0
        ):
            reference_size = None
            reference_scale = None
            layout_scale_mode = None
    return {
        "type": "Spine",
        # Unity PathIDs exceed Number.MAX_SAFE_INTEGER. Keep their exact
        # 64-bit decimal form so JSON.parse cannot round the reference.
        "skeletonDataPathId": str(skeleton_data),
        "source": {
            "scriptClass": class_name,
            "layout": "skeleton-graphic-236",
            "skeletonDataOffset": 76 if skeleton_data else None,
            "layoutScaleMode": layout_scale_mode,
            "referenceSize": reference_size,
            "referenceScale": reference_scale,
        },
    }


def components_for(cab: LoadedCab, go_id: int, sprite_meta: dict[int, dict]) -> list[dict]:
    go = cab.game_objects.get(go_id)
    if not go:
        return []
    output: list[dict] = []
    for reference in go["components"]:
        component_id = ppath(reference)
        reader = cab.objects.get(component_id)
        if reader is None:
            continue
        if reader.type.name == "CanvasGroup":
            component = parse_canvas_group(reader)
            if component:
                output.append(component)
            continue
        if reader.type.name != "MonoBehaviour":
            continue
        raw = read_raw(reader)
        sid = script_id(raw)
        class_name = cab.scripts.get(sid, "")
        if sid == IMAGE_SCRIPT or class_name == "Image":
            output.append(parse_image(raw, sprite_meta))
        elif sid == TEXT_SCRIPT or class_name == "LocalizedText":
            output.append(parse_text(raw))
        elif class_name in {"Mask", "RectMask2D", "SmoothMask"}:
            output.append(parse_mask(raw, class_name, sprite_meta))
        elif class_name in {
            # Source: TarotBook CAB MonoScript table. AnimatorButton is the
            # plain uGUI-style controller; MonoInControlButton, IntroButton and
            # UINavigationButton are the RPG wrappers that own the same click
            # semantics on entrance/menu nodes.
            "AnimatorButton", "MonoInControlButton", "IntroButton",
            "UINavigationButton",
        }:
            # Several entrance buttons carry both MonoInControlButton and a
            # higher-level IntroButton/UINavigationButton. They describe one
            # click target, so emit a single Button record per node.
            if not any(component["type"] == "Button" for component in output):
                output.append(parse_button(raw))
        elif class_name == "SkeletonGraphic" and len(raw) in {236, 239}:
            output.append(parse_spine(raw, class_name))
        elif class_name in {
            "ContentSizeFitter", "HorizontalLayoutGroup", "VerticalLayoutGroup",
            "LayoutElement", "AspectRatioFitter", "GraphicRaycaster",
        }:
            output.append({
                "type": "Layout",
                "component": class_name,
                "source": {"scriptPathId": sid, "layout": "stripped-monobehaviour"},
            })
        if class_name in {
            "ContentSizeFitter", "HorizontalLayoutGroup", "VerticalLayoutGroup",
            "LayoutElement", "AspectRatioFitter", "GraphicRaycaster",
        }:
            output[-1]["fields"] = parse_layout_fields(raw, class_name)
    return output


def collect_sprite_ids(cabs: list[LoadedCab]) -> set[int]:
    ids: set[int] = set()
    for cab in cabs:
        for reader in cab.objects.values():
            if reader.type.name != "MonoBehaviour":
                continue
            raw = read_raw(reader)
            try:
                sid = script_id(raw)
            except BadLayout:
                continue
            if sid == IMAGE_SCRIPT and len(raw) == 232:
                ids.add(struct.unpack_from("<q", raw, 76)[0])
            elif cab.scripts.get(sid) == "SmoothMask" and len(raw) == 136:
                sprite_path = struct.unpack_from("<q", raw, 48)[0]
                if sprite_path:
                    ids.add(sprite_path)
    return ids


def collect_game_object_names(cabs: list[LoadedCab]) -> set[str]:
    """All authored GameObject names, including runtime-instantiated items."""
    names: set[str] = set()
    for cab in cabs:
        for game_object in cab.game_objects.values():
            name = game_object.get("name")
            if name:
                names.add(name)
    return names


def collect_support_roots(cab: LoadedCab, config_root: int) -> list[dict]:
    """Compact source hierarchy for animation paths outside the ten screens.

    These are authored prefab roots in the same CAB; they are not rendered in
    the static screens and carry no guessed geometry.
    """
    roots = []
    for root_id, rect in cab.rects.items():
        if root_id == config_root or ppath(rect["father"]) != 0 or "anchorMax" not in rect:
            continue
        go_id = ppath(rect["gameObject"])
        go = cab.game_objects.get(go_id)
        if not go or not go.get("isActive"):
            continue

        def visit(transform_id: int) -> dict | None:
            rt = cab.rects.get(transform_id)
            if rt is None:
                return None
            game = cab.game_objects.get(ppath(rt["gameObject"]))
            if not game:
                return None
            return {
                "name": game.get("name") or "GameObject",
                "children": [child for child in (visit(ppath(c)) for c in rt["children"]) if child],
            }

        tree = visit(root_id)
        if tree:
            roots.append(tree)
    return roots


def collect_animation_hierarchies(cache: Path) -> list[dict]:
    """Load known runtime prefab roots as source-only animation path evidence."""
    trees = []
    for name, cab_name in ANIMATION_SUPPORT.items():
        matches = list(cache.rglob(cab_name))
        if not matches:
            raise FileNotFoundError(f"missing animation CAB {cab_name} under {cache}")
        cab = load_cab(matches[0])
        for tree in collect_support_roots(cab, 0):
            if tree["name"] == name:
                trees.append(tree)
                break
        else:
            raise BadLayout(f"runtime prefab root {name} missing from {cab_name}")
    return trees


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ]


def derived_local_position(
    rect: dict,
    parent_size: tuple[float, float],
    parent_pivot: tuple[float, float],
    size: tuple[float, float],
) -> tuple[float, float]:
    """Resolve a RectTransform pivot from its serialized anchor fields.

    RectTransform.localPosition is a cached transform value that can be stale
    in prefab variants after a parent is resized. The authored anchor fields
    remain stable; Unity's layout math uses them to place the child's pivot.
    """
    anchor_min = rect["anchorMin"]
    pivot = rect["pivot"]
    size_delta = rect["sizeDelta"]
    anchored = rect["anchoredPosition"]
    rel_x = anchor_min[0] * parent_size[0] + anchored[0] - pivot[0] * size_delta[0]
    rel_y = anchor_min[1] * parent_size[1] + anchored[1] - pivot[1] * size_delta[1]
    # rel_* is the child's bottom-left relative to the parent's bottom-left.
    pivot_x = rel_x + pivot[0] * size[0]
    pivot_y = rel_y + pivot[1] * size[1]
    return (
        pivot_x - parent_pivot[0] * parent_size[0],
        pivot_y - parent_pivot[1] * parent_size[1],
    )


def local_matrix(rect: dict, position: tuple[float, float] | None = None) -> list[float]:
    qx, qy, qz, qw = rect["localRotation"]
    sx, sy, _sz = rect["localScale"]
    # Unity pivots are left-handed in local XY but the 2D determinant pattern
    # is the same as the standard CCW Z rotation after screen projection.
    angle = math.atan2(2.0 * (qw * qz + qx * qy), 1.0 - 2.0 * (qy * qy + qz * qz))
    cosine, sine = math.cos(angle), math.sin(angle)
    position_values = rect["localPosition"] if position is None else position
    px, py = position_values[0], position_values[1]
    return [
        cosine * sx, sine * sx,
        -sine * sy, cosine * sy,
        px, py,
    ]


def transform_aabb(rect: dict, width: float, height: float, matrix: list[float]) -> list[float]:
    pivot_x, pivot_y = rect["pivot"]
    xs = (-pivot_x * width, (1.0 - pivot_x) * width)
    ys = (-pivot_y * height, (1.0 - pivot_y) * height)
    points = []
    for x in xs:
        for y in ys:
            px = matrix[0] * x + matrix[2] * y + matrix[4]
            py = matrix[1] * x + matrix[3] * y + matrix[5]
            points.append((px + STAGE_W / 2, py + STAGE_H / 2))
    return [
        r(min(point[0] for point in points)),
        r(min(point[1] for point in points)),
        r(max(point[0] for point in points)),
        r(max(point[1] for point in points)),
    ]


def nested_content_size(cab: LoadedCab, transform_ids: list[int], seen: set[int]) -> tuple[float, float]:
    """Union of authored child boxes expressed in the current parent's space."""
    left = bottom = 0.0
    right = top = 0.0
    for transform_id in transform_ids:
        if transform_id in seen:
            continue
        seen.add(transform_id)
        rect = cab.rects.get(transform_id)
        if rect is None:
            continue
        if "anchorMax" not in rect:
            # Plain Transform children participate in hierarchy traversal but
            # have no RectTransform box to contribute to a layout container.
            continue
        go = cab.game_objects.get(ppath(rect["gameObject"]), {})
        anchor_span = (rect["anchorMax"][0] - rect["anchorMin"][0],
                       rect["anchorMax"][1] - rect["anchorMin"][1])
        size = (anchor_span[0] + rect["sizeDelta"][0], anchor_span[1] + rect["sizeDelta"][1])
        x = rect["anchorMin"][0] + rect["anchoredPosition"][0] - rect["pivot"][0] * rect["sizeDelta"][0]
        y = rect["anchorMin"][1] + rect["anchoredPosition"][1] - rect["pivot"][1] * rect["sizeDelta"][1]
        components = components_for(cab, ppath(rect["gameObject"]), {})
        has_text = any(component.get("type") == "Text" for component in components)
        if has_text and size[0] <= 0:
            for component in components:
                if component.get("type") == "Text":
                    size = (component.get("preferredSize", [0, 0])[0], size[1])
                    break
        # Take the preferred size of any LayoutElement child, source-derived.
        for component in components:
            if component.get("type") != "Layout" or component.get("component") != "LayoutElement":
                continue
            fields = component.get("fields", {})
            size = (fields.get("preferredWidth") or size[0], fields.get("preferredHeight") or size[1])
        nested = nested_content_size(cab, [ppath(child) for child in rect["children"]], seen)
        size = (max(size[0], nested[0]), max(size[1], nested[1]))
        left = min(left, x)
        bottom = min(bottom, y)
        right = max(right, x + size[0])
        top = max(top, y + size[1])
    return (max(0.0, right - left), max(0.0, top - bottom))


def rescale_child_layout(node: dict, parent_size: tuple[float, float], parent_matrix: list[float]) -> None:
    """Recompute a descendant when its parent rect was resolved by layout."""
    rt = node["rt"]
    anchor_x = rt["anchorMax"][0] - rt["anchorMin"][0]
    anchor_y = rt["anchorMax"][1] - rt["anchorMin"][1]
    width = parent_size[0] * anchor_x + rt["sizeDelta"][0]
    height = parent_size[1] * anchor_y + rt["sizeDelta"][1]
    matrix = mat_mul(parent_matrix, local_matrix_from_rt(rt))
    node["rt"]["size"] = [r(width), r(height)]
    node["stage"]["aabb"] = transform_aabb_from_rt(rt, width, height, matrix)
    for child in node.get("children", []):
        rescale_child_layout(child, (width, height), matrix)


def local_matrix_from_rt(rt: dict) -> list[float]:
    euler_z = math.radians(rt.get("localEuler", [0, 0, 0])[2])
    cosine, sine = math.cos(euler_z), math.sin(euler_z)
    sx, sy = rt.get("localScale", [1, 1])[:2]
    position = rt.get("localPosition", [0, 0])
    return [cosine * sx, sine * sx, -sine * sy, cosine * sy, position[0], position[1]]


def transform_aabb_from_rt(rt: dict, width: float, height: float, matrix: list[float]) -> list[float]:
    pivot_x, pivot_y = rt["pivot"]
    xs = (-pivot_x * width, (1.0 - pivot_x) * width)
    ys = (-pivot_y * height, (1.0 - pivot_y) * height)
    points = []
    for x in xs:
        for y in ys:
            px = matrix[0] * x + matrix[2] * y + matrix[4]
            py = matrix[1] * x + matrix[3] * y + matrix[5]
            points.append((px + STAGE_W / 2, py + STAGE_H / 2))
    return [r(min(p[0] for p in points)), r(min(p[1] for p in points)),
            r(max(p[0] for p in points)), r(max(p[1] for p in points))]


def build_tree(cab: LoadedCab, config: dict, sprite_meta: dict[int, dict], methods: list[str]) -> dict:
    missing_children: list[dict] = []
    layout_decisions: list[dict] = []
    blocked_rects: list[dict] = []

    def node(transform_id: int, parent_path: str, sibling: int, parent_size: tuple[float, float],
             parent_matrix: list[float], parent_pivot: tuple[float, float] = (0.5, 0.5),
             nested_size: tuple[float, float] | None = None) -> dict | None:
        rect = cab.rects.get(transform_id)
        if rect is None:
            return None
        if "anchorMax" not in rect:
            # Plain Transform has no authored RectTransform box; its children
            # remain addressable by name in provenance for clip path tracing.
            return None
        go_id = ppath(rect["gameObject"])
        go = cab.game_objects.get(go_id)
        if go is None:
            return None
        name = go["name"] or "GameObject"
        path = f"{parent_path}/{name}" if parent_path else name
        anchor_x = rect["anchorMax"][0] - rect["anchorMin"][0]
        anchor_y = rect["anchorMax"][1] - rect["anchorMin"][1]
        size_x = parent_size[0] * anchor_x + rect["sizeDelta"][0]
        size_y = parent_size[1] * anchor_y + rect["sizeDelta"][1]
        components = components_for(cab, go_id, sprite_meta)
        child_ids = list(rect["children"])
        nested_size = nested_content_size(cab, [ppath(child) for child in child_ids], set())
        if size_x <= 0:
            for component in components:
                if component.get("type") == "Layout" and component.get("component") == "LayoutElement":
                    fields = component.get("fields", {})
                    for key in ("minWidth", "preferredWidth"):
                        value = fields.get(key)
                        if value is not None:
                            size_x = max(size_x, value)
        if size_y <= 0:
            for component in components:
                if component.get("type") == "Layout" and component.get("component") == "LayoutElement":
                    fields = component.get("fields", {})
                    for key in ("minHeight", "preferredHeight"):
                        value = fields.get(key)
                        if value is not None:
                            size_y = max(size_y, value)
        text_components = [c for c in components if c.get("type") == "Text"]
        text_without_quads = any(
            not c.get("textQuads") and not c.get("preferredSize", [0, 0])[0]
            for c in text_components
        )
        layout_fields = [
            component.get("fields", {})
            for component in components
            if component.get("type") == "Layout" and component.get("fields")
        ]
        if size_x <= 0 and anchor_x == 0 and layout_fields:
            size_x = max(size_x, nested_size[0])
        if size_y <= 0 and anchor_y == 0 and layout_fields:
            size_y = max(size_y, nested_size[1])
        # Broad nested-size fallback for stretched rects is intentionally not
        # used: it overrides authored text extents. Source-derived layout
        # fields below decide zero-size rects without inventing coordinates.
        layout_sources = []
        for component in components:
            if component.get("type") != "Layout":
                continue
            fields = component.get("fields", {})
            component_name = component.get("component")
            if component_name == "AspectRatioFitter":
                ratio = fields.get("aspectRatio")
                # FitInParent fills the containing rect while preserving the
                # serialized aspect ratio. The width is authoritative when
                # ratio >= parent aspect; otherwise height is authoritative.
                # Both inputs are source values, not visual estimates.
                if fields.get("aspectMode") == 4 and ratio and ratio > 0:
                    fit_width = parent_size[0]
                    fit_height = parent_size[1]
                    if ratio >= fit_width / max(fit_height, 1e-6):
                        fit_height = fit_width / ratio
                    else:
                        fit_width = fit_height * ratio
                    size_x = r(max(size_x, fit_width))
                    size_y = r(max(size_y, fit_height))
                    layout_sources.append("aspectFitInParent")
            if component_name == "LayoutElement":
                for field, target in (("minWidth", "x"), ("minHeight", "y"),
                                      ("preferredWidth", "x"), ("preferredHeight", "y")):
                    value = fields.get(field)
                    if value is None:
                        continue
                    if (target == "x" and anchor_x == 0 and size_x <= 0) or (
                        target == "y" and anchor_y == 0 and size_y <= 0
                    ):
                        if target == "x":
                            size_x = max(size_x, value)
                        else:
                            size_y = max(size_y, value)
                        layout_sources.append(field)
            if component_name == "ContentSizeFitter":
                if fields.get("horizontalFit") == 2 and anchor_x == 0 and size_x <= 0:
                    size_x = nested_size[0]
                    layout_sources.append("fitterWidth")
                if fields.get("verticalFit") == 2 and anchor_y == 0 and size_y <= 0:
                    size_y = nested_size[1]
                    layout_sources.append("fitterHeight")
        # A horizontal/vertical layout group reconciles zero-size containers
        # and stretches its children along the controlled axis. Any positive
        # child extent is already source-derived from LayoutElement or text.
        for fields in layout_fields:
            if "childAlignment" in fields and anchor_x == 1 and nested_size[0] > 0:
                size_x = max(size_x, nested_size[0])
                layout_sources.append("layoutGroupWidth")
            if "childAlignment" in fields and anchor_y == 1 and nested_size[1] > 0:
                size_y = max(size_y, nested_size[1])
                layout_sources.append("layoutGroupHeight")
        # A zero-size Text node still occupies its authored glyph cell; use
        # the source-derived preferred size from the same MonoBehaviour.
        for component in components:
            if component.get("type") != "Text":
                continue
            preferred = component.get("preferredSize", [0, 0])
            if preferred[0] > 0:
                size_x = max(size_x, preferred[0])
                layout_sources.append("textPreferredWidth")
            if preferred[1] > 0:
                size_y = max(size_y, preferred[1])
                layout_sources.append("textPreferredHeight")
            break
        # Layout containers routinely use a zero sizeDelta plus an explicit
        # padding. The child extent is already in source units from the
        # LayoutElement/text paths above; add the serialized padding once.
        for fields in layout_fields:
            padding = fields.get("padding")
            if not padding:
                continue
            if size_x <= 0 and anchor_x == 0:
                size_x = max(size_x, nested_size[0] + padding[1] + padding[3])
                layout_sources.append("layoutPaddingWidth")
            if size_y <= 0 and anchor_y == 0:
                size_y = max(size_y, nested_size[1] + padding[0] + padding[2])
                layout_sources.append("layoutPaddingHeight")
        # Stretched zero-size rects inherit the parent frame even when the
        # Unity layout controller that fills them is not a serialized field.
        if size_x <= 0 and anchor_x == 1 and parent_size[0] > 0:
            size_x = parent_size[0]
            layout_sources.append("stretchParentWidth")
        if size_y <= 0 and anchor_y == 1 and parent_size[1] > 0:
            size_y = parent_size[1]
            layout_sources.append("stretchParentHeight")
        if size_x > 0:
            for component in components:
                if component.get("type") == "Layout" and component.get("component") == "ContentSizeFitter":
                    if component.get("fields", {}).get("horizontalFit") == 2:
                        layout_sources.append("fitterWidth")
                    break
        if size_y > 0:
            for component in components:
                if component.get("type") == "Layout" and component.get("component") == "ContentSizeFitter":
                    if component.get("fields", {}).get("verticalFit") == 2:
                        layout_sources.append("fitterHeight")
                    break
        if text_without_quads:
            blocked_rects.append({
                "path": path,
                "reason": "text quad geometry unavailable in prefab dump",
            })
        if size_x > 0 or size_y > 0:
            layout_decisions.append({
                "path": path,
                "size": [r(size_x), r(size_y)],
                "sources": layout_sources,
            })
        preferred_override = size_x
        preferred_override_y = size_y
        # Prefer the anchor-derived transform position. Serialized
        # localPosition values in prefab variants can be stale when a parent
        # rect was resized, which shifts stretched children by half a parent.
        source_local_position = rect.get("localPosition", [0.0, 0.0, 0.0])
        layout_position = derived_local_position(
            rect, parent_size, parent_pivot,
            (preferred_override, preferred_override_y),
        )
        rect["layoutPosition"] = [layout_position[0], layout_position[1]]
        matrix = mat_mul(parent_matrix, local_matrix(rect, layout_position))
        aabb = transform_aabb(rect, preferred_override, preferred_override_y, matrix)
        unscaled_aabb = None
        # An oversized parent can hide the child's own localScale in the
        # authored matrix. Recover its unscaled authored rect when the child
        # uses that pattern, so the AABB stays a pure stage-space truth.
        for child_rect in child_ids:
            child = cab.rects.get(ppath(child_rect))
            if child is None:
                continue
            child_scale = child["localScale"][:2]
            if abs(child_scale[0]) <= 2 or abs(child_scale[1]) <= 2:
                continue
            child_matrix = mat_mul(matrix, local_matrix(child))
            scaled = transform_aabb(child, child["sizeDelta"][0],
                                    child["sizeDelta"][1], child_matrix)
            center_x = (scaled[0] + scaled[2]) / 2
            center_y = (scaled[1] + scaled[3]) / 2
            half_w = (scaled[2] - scaled[0]) / 2 / abs(child_scale[0])
            half_h = (scaled[3] - scaled[1]) / 2 / abs(child_scale[1])
            child_name = cab.game_objects.get(ppath(child["gameObject"]), {}).get("name", "")
            if child_name == "Line" or child_name == "Line02":
                # The stage-space AABB is only meaningful for a rendered
                # sprite; these Line nodes are empty transform placeholders.
                if components_for(cab, ppath(child["gameObject"]), {}):
                    unscaled_aabb = [r(center_x - half_w), r(center_y - half_h),
                                     r(center_x + half_w), r(center_y + half_h)]
        node_data = {
            "name": name,
            "path": path,
            "sibling": sibling,
            "active": bool(go["isActive"]),
            "rt": {
                "anchorMin": vec2(rect["anchorMin"]),
                "anchorMax": vec2(rect["anchorMax"]),
                "pivot": vec2(rect["pivot"]),
                "sizeDelta": vec2(rect["sizeDelta"]),
                "anchoredPosition": vec2(rect["anchoredPosition"]),
                "size": [r(preferred_override), r(preferred_override_y)],
                "localPosition": [r(layout_position[0]), r(layout_position[1])],
                "sourceLocalPosition": [r(source_local_position[0]), r(source_local_position[1])],
                "localScale": vec2(rect["localScale"][:2]),
                "localEuler": [0, 0, r(math.degrees(math.atan2(
                    2.0 * (rect["localRotation"][3] * rect["localRotation"][2] +
                           rect["localRotation"][0] * rect["localRotation"][1]),
                    1.0 - 2.0 * (rect["localRotation"][1] ** 2 +
                                 rect["localRotation"][2] ** 2)
                )))],
            },
            "stage": {"aabb": aabb},
            "stageUnscaled": unscaled_aabb,
            "sourceSize": [r(parent_size[0] * anchor_x + rect["sizeDelta"][0]),
                           r(parent_size[1] * anchor_y + rect["sizeDelta"][1])],
            "layoutSources": layout_sources,
            "components": components,
            "children": [],
        }
        # Build children first to recover the preferred size propagated by
        # layout components; then rebuild this node's box and matrix.
        child_nodes = []
        for index, child in enumerate(child_ids):
            child_id = ppath(child)
            if child_id not in cab.rects:
                missing_children.append({
                    "parentPath": path,
                    "childPathId": child_id,
                    "reason": "non-RectTransform Unity Transform child",
                })
                continue
            child_node = node(child_id, path, index, (size_x, size_y), matrix, tuple(rect["pivot"]))
            if child_node:
                child_nodes.append(child_node)
        node_data["children"] = child_nodes
        return node_data

    root = node(config["root"], "", 0, (STAGE_W, STAGE_H), [1, 0, 0, 1, 0, 0], (0.5, 0.5))
    if root is None:
        raise BadLayout(f"root RectTransform {config['root']} is missing")
    root["name"] = config["state"]
    root["path"] = config["state"]
    root["rt"]["size"] = [STAGE_W, STAGE_H]
    root["stage"]["aabb"] = [0, 0, STAGE_W, STAGE_H]
    # Independent prefab roots in the same CAB are runtime-instantiated list
    # items. They are not part of the ten static screens, but their paths are
    # needed so animation curves can be traced back to source objects.
    support_roots = []
    seen_roots = {config["root"]}
    for root_id, rect in cab.rects.items():
        if root_id in seen_roots or ppath(rect["father"]) != 0:
            continue
        if "anchorMax" not in rect:
            continue
        support_go = cab.game_objects.get(ppath(rect["gameObject"]), {})
        if not support_go.get("isActive"):
            continue
        support = node(root_id, "", 0, (STAGE_W, STAGE_H),
                       [1, 0, 0, 1, 0, 0], (0.5, 0.5))
        if support:
            support_roots.append(support)
            seen_roots.add(root_id)
    return {
        "schema": 1,
        "state": config["state"],
        "capturedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "static",
        "screen": {"w": STAGE_W, "h": STAGE_H},
        "canvas": {
            "name": "UIRoot",
            "renderMode": "ScreenSpaceCamera",
            "scaleFactor": 1,
            "refW": STAGE_W,
            "refH": STAGE_H,
            "match": 0.5,
            "scalerMode": "ScaleWithScreenSize",
        },
        "root": root,
        "supportRoots": support_roots,
        "provenance": {
            "methods": methods,
            "sourceBlock": config["block"],
            "sourceCab": config["cab"],
            "rootTransformPathId": config["root"],
            "rootGameObject": config["rootName"],
            "variant": config.get("variant"),
            "nodePolicy": "RectTransform descendants; non-RectTransform leaves traced below",
            "missingChildren": missing_children,
            "layoutDecisions": layout_decisions,
            "supportHierarchy": collect_support_roots(cab, config["root"]),
            "animationPathLeaves": sorted({
                name for name in (game.get("name", "") for game in cab.game_objects.values())
                if name and name != "GameObject"
            }),
            "note": "Static prefab geometry. Runtime layout and textQuads are not invented.",
        },
    }


def count_nodes(node: dict) -> int:
    return 1 + sum(count_nodes(child) for child in node.get("children", []))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=REPO / "dump")
    parser.add_argument("--state", action="append", choices=sorted(STATES))
    args = parser.parse_args()
    if not ASSET_DB.is_file():
        print(f"missing asset index: {ASSET_DB}", file=sys.stderr)
        return 2
    selected = args.state or list(STATES)
    loaded: dict[Path, LoadedCab] = {}
    animation_hierarchies = []
    configs = []
    try:
        animation_hierarchies = collect_animation_hierarchies(args.cache)
        for state in selected:
            config = dict(STATES[state], state=state)
            matches = list(args.cache.rglob(config["cab"]))
            if not matches:
                # Keep the previously verified source snapshot for a CAB that
                # is absent from this cache extraction.
                continue
            path = matches[0]
            loaded.setdefault(path, load_cab(path))
            configs.append(config)
    except (FileNotFoundError, RuntimeError, BadLayout) as error:
        print(str(error), file=sys.stderr)
        return 2

    sprite_meta = resolve_sprite_metadata(collect_sprite_ids(list(loaded.values())))
    game_object_names = collect_game_object_names(list(loaded.values()))
    args.out.mkdir(parents=True, exist_ok=True)
    summary = []
    for config in configs:
        cab = loaded[locate_cab(args.cache, config["cab"])]
        dump = build_tree(cab, config, sprite_meta, ["unitypy+unityraw", "rust-unoodle-cab-cache"])
        dump["provenance"]["allGameObjectNames"] = sorted(game_object_names)
        dump["provenance"]["animationHierarchies"] = animation_hierarchies
        target = args.out / f"{config['state']}.json"
        target.write_text(
            json.dumps(stringify_unsafe_path_ids(dump), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        summary.append({
            "state": config["state"],
            "nodes": count_nodes(dump["root"]),
            "missingChildren": len(dump["provenance"]["missingChildren"]),
            "file": str(target),
        })
    mask_summary = {
        "smoothMaskRecords": 0,
        "byType": {},
        "reverseMaskRecords": 0,
        "textureSpriteIds": [],
    }
    for config in configs:
        cab = loaded[locate_cab(args.cache, config["cab"])]
        for reader in cab.objects.values():
            if reader.type.name != "MonoBehaviour":
                continue
            raw = read_raw(reader)
            try:
                sid = script_id(raw)
            except BadLayout:
                continue
            if cab.scripts.get(sid) != "SmoothMask" or len(raw) != 136:
                continue
            component = parse_mask(raw, "SmoothMask", sprite_meta)
            kind = component["smoothMaskType"]
            mask_summary["smoothMaskRecords"] += 1
            mask_summary["byType"][kind] = mask_summary["byType"].get(kind, 0) + 1
            mask_summary["reverseMaskRecords"] += int(component["reverseMask"])
            sprite_id = component["source"]["spritePathId"]
            if sprite_id != "0":
                mask_summary["textureSpriteIds"].append(sprite_id)
    mask_summary["textureSpriteIds"] = sorted(set(mask_summary["textureSpriteIds"]))
    (args.out / "_masks.json").write_text(
        json.dumps(mask_summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"states": summary, "spriteRefs": len(sprite_meta)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
