"""Raw reader for Unity 2019 serialized UI objects.

The copied HSR UI bundles strip many TypeTrees. RectTransform and GameObject
still have stable serialized layouts, so keep this reader deliberately narrow
and validate the remaining byte count on every object.
"""
from __future__ import annotations

import struct


class BadLayout(ValueError):
    pass


def _need(data: bytes, cursor: int, size: int) -> None:
    if cursor + size > len(data):
        raise BadLayout(f"read {size} at {cursor}, object has {len(data)} bytes")


def parse_pptr(data: bytes, cursor: int) -> tuple[int, int, int]:
    _need(data, cursor, 12)
    file_id, path_id = struct.unpack_from("<iq", data, cursor)
    return file_id, path_id, cursor + 12


def parse_rect_transform(data: bytes) -> dict:
    # These bundles are built for NoTarget, so Object.m_ObjectHideFlags is not
    # serialized. Bytes begin directly with the component PPtr.
    cursor = 0
    go_file, go_path, cursor = parse_pptr(data, cursor)
    _need(data, cursor, 40)
    rotation = struct.unpack_from("<4f", data, cursor)
    cursor += 16
    position = struct.unpack_from("<3f", data, cursor)
    cursor += 12
    scale = struct.unpack_from("<3f", data, cursor)
    cursor += 12
    _need(data, cursor, 4)
    child_count = struct.unpack_from("<i", data, cursor)[0]
    cursor += 4
    if child_count < 0 or child_count > 100000:
        raise BadLayout(f"invalid child count {child_count}")
    children = []
    for _ in range(child_count):
        file_id, path_id, cursor = parse_pptr(data, cursor)
        children.append({"fileId": file_id, "pathId": path_id})
    father_file, father_path, cursor = parse_pptr(data, cursor)
    _need(data, cursor, 40)
    anchor_min = struct.unpack_from("<2f", data, cursor)
    anchor_max = struct.unpack_from("<2f", data, cursor + 8)
    anchored_position = struct.unpack_from("<2f", data, cursor + 16)
    size_delta = struct.unpack_from("<2f", data, cursor + 24)
    pivot = struct.unpack_from("<2f", data, cursor + 32)
    cursor += 40
    if cursor != len(data):
        raise BadLayout(f"RectTransform trailing bytes: {len(data) - cursor}")
    return {
        "gameObject": {"fileId": go_file, "pathId": go_path},
        "localRotation": rotation,
        "localPosition": position,
        "localScale": scale,
        "children": children,
        "father": {"fileId": father_file, "pathId": father_path},
        "anchorMin": anchor_min,
        "anchorMax": anchor_max,
        "anchoredPosition": anchored_position,
        "sizeDelta": size_delta,
        "pivot": pivot,
    }


def parse_game_object(data: bytes) -> dict:
    cursor = 0
    _need(data, cursor, 4)
    component_count = struct.unpack_from("<i", data, cursor)[0]
    cursor += 4
    if component_count < 0 or component_count > 100000:
        raise BadLayout(f"invalid component count {component_count}")
    components = []
    for _ in range(component_count):
        file_id, path_id, cursor = parse_pptr(data, cursor)
        components.append({"fileId": file_id, "pathId": path_id})
    _need(data, cursor, 4)
    layer = struct.unpack_from("<i", data, cursor)[0]
    cursor += 4
    _need(data, cursor, 4)
    length = struct.unpack_from("<i", data, cursor)[0]
    cursor += 4
    if length < 0 or cursor + length > len(data):
        raise BadLayout(f"invalid name length {length}")
    name_end = data.find(b"\0", cursor, cursor + length + 1)
    if name_end < 0:
        name_end = cursor + length
    name = data[cursor:name_end].decode("utf-8", "replace")
    while (cursor + length) % 4:
        length += 1
    cursor += length
    if cursor > len(data):
        raise BadLayout("GameObject name overruns object")
    trailing = data[cursor:]
    # NoTarget Unity serialization writes m_Tag (u16) followed by m_IsActive.
    # The prefab blocks in this game contain exactly those three bytes.
    is_active = bool(trailing[2]) if len(trailing) == 3 else True
    return {
        "components": components,
        "layer": layer,
        "name": name,
        "isActive": is_active,
        "trailing": len(trailing),
    }
