#!/usr/bin/env python3
"""Extract current HSR `ENCR` UnityFS blocks on macOS without a VM.

The HSR client uses AssetBundle compression flags 6 (Oodle) and 7 (Mr0k +
Oodle). This script ports the two algorithms used by AnimeStudio at commit
76234e9f6f5a839504f41f9612719529fe2309a5 and calls the Oodle entry point from
a locally built libooz shared library.

Only extraction inputs and outputs are touched. The game binary, encryption
tables, and Oodle library are not copied into this repository.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import re
import struct
import sys
from pathlib import Path, PurePosixPath
from typing import Iterable

try:
    from lz4.block import decompress as lz4_decompress
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit("缺少 lz4：请先安装 python3 -m pip install lz4") from exc


ANIMESTUDIO_COMMIT = "76234e9f6f5a839504f41f9612719529fe2309a5"
MR0K_KEYS = ("Mr0kExpansionKey", "Mr0kInitVector", "Mr0kBlockKey")
AES_TABLES = (
    "ShiftRowsTableInv",
    "LookupSBoxInv",
    "LookupG9",
    "LookupG11",
    "LookupG13",
    "LookupG14",
)


def _read_source_array(source: str, name: str) -> list[int]:
    pattern = re.compile(
        rf"(?:public\s+)?static\s+(?:readonly\s+)?byte\[\]\s+{re.escape(name)}"
        r"\s*=\s*(?:new\s+byte\[\]\s*)?\{(.*?)\};",
        re.S,
    )
    match = pattern.search(source)
    if not match:
        raise ValueError(f"未找到字节数组 {name}")
    return [int(value, 16) for value in re.findall(r"0x([0-9A-Fa-f]{2})", match.group(1))]


def load_crypto(anime_source: Path) -> tuple[dict[str, bytes], dict[str, list[int]]]:
    crypto_path = anime_source / "AnimeStudio/Crypto/CryptoHelper.cs"
    aes_path = anime_source / "AnimeStudio/Crypto/AES.cs"
    for path in (crypto_path, aes_path):
        if not path.is_file():
            raise FileNotFoundError(f"缺少 AnimeStudio 源文件：{path}")
    crypto_source = crypto_path.read_text(encoding="utf-8")
    aes_source = aes_path.read_text(encoding="utf-8")
    keys = {name: bytes(_read_source_array(crypto_source, name)) for name in MR0K_KEYS}
    tables = {name: _read_source_array(aes_source, name) for name in AES_TABLES}
    if len(keys["Mr0kExpansionKey"]) != 176:
        raise ValueError("Mr0kExpansionKey 长度不是 176")
    if len(keys["Mr0kInitVector"]) != 16 or len(keys["Mr0kBlockKey"]) != 1024:
        raise ValueError("Mr0k IV 或 BlockKey 长度错误")
    for name, table in tables.items():
        expected = 16 if name == "ShiftRowsTableInv" else 256
        if len(table) != expected or any(value < 0 or value > 255 for value in table):
            raise ValueError(f"AES 表 {name} 不是 {expected} 项字节表")
    return keys, tables


def _aes_decrypt_block(
    block: bytes, round_keys: bytes, tables: dict[str, list[int]]
) -> bytes:
    if len(block) != 16 or len(round_keys) != 176:
        raise ValueError("AES 输入块或轮密钥长度错误")
    shift = tables["ShiftRowsTableInv"]
    sbox = tables["LookupSBoxInv"]
    g9 = tables["LookupG9"]
    g11 = tables["LookupG11"]
    g13 = tables["LookupG13"]
    g14 = tables["LookupG14"]
    state = [value ^ round_keys[index] for index, value in enumerate(block)]
    for round_index in range(9):
        state = [sbox[value] for value in state]
        mixed = [state[shift[index]] for index in range(16)]
        for offset in range(0, 16, 4):
            a0, a1, a2, a3 = mixed[offset : offset + 4]
            mixed[offset] = g14[a0] ^ g9[a3] ^ g13[a2] ^ g11[a1]
            mixed[offset + 1] = g14[a1] ^ g9[a0] ^ g13[a3] ^ g11[a2]
            mixed[offset + 2] = g14[a2] ^ g9[a1] ^ g13[a0] ^ g11[a3]
            mixed[offset + 3] = g14[a3] ^ g9[a2] ^ g13[a1] ^ g11[a0]
        state = [
            value ^ round_keys[index + (round_index + 1) * 16]
            for index, value in enumerate(mixed)
        ]
    state = [sbox[value] for value in state]
    mixed = [state[shift[index]] for index in range(16)]
    return bytes(
        value ^ round_keys[index + 10 * 16] for index, value in enumerate(mixed)
    )


def mr0k_decrypt(
    data: bytes, keys: dict[str, bytes], tables: dict[str, list[int]]
) -> bytes:
    if data[:4] != b"mr0k":
        return data
    if len(data) < 0x94:
        raise ValueError("Mr0k payload 小于头部长度")
    expansion = keys["Mr0kExpansionKey"]
    init_vector = keys["Mr0kInitVector"]
    block_key = keys["Mr0kBlockKey"]
    data_buffer = bytearray(data)
    key1 = bytearray(data_buffer[4:20])
    key2 = bytearray(data_buffer[0x74:0x84])
    key3 = bytearray(data_buffer[0x84:0x94])
    encrypted_block_size = min(0x10 * ((len(data_buffer) - 0x94) >> 7), 0x400)
    for index in range(len(init_vector)):
        key2[index] ^= init_vector[index]
    key1 = bytearray(_aes_decrypt_block(bytes(key1), expansion, tables))
    key3 = bytearray(_aes_decrypt_block(bytes(key3), expansion, tables))
    for index in range(16):
        key1[index] ^= key3[index]
    data_buffer[0x84:0x94] = key1
    seed1 = int.from_bytes(key2, "little")
    seed2 = int.from_bytes(key3, "little")
    seed = (
        seed2 ^ seed1 ^ ((seed1 + len(data_buffer) - 20) & 0xFFFFFFFFFFFFFFFF)
    ) & 0xFFFFFFFFFFFFFFFF
    seed_bytes = seed.to_bytes(8, "little")
    for index in range(encrypted_block_size):
        data_buffer[0x94 + index] ^= seed_bytes[index % 8] ^ block_key[index % len(block_key)]
    return bytes(data_buffer[0x14:])


class Oodle:
    def __init__(self, library: Path) -> None:
        if not library.is_file():
            raise FileNotFoundError(f"找不到 Oodle 动态库：{library}")
        self.lib = ctypes.CDLL(str(library))
        if not hasattr(self.lib, "Ooz_Decompress"):
            raise ValueError(f"{library} 未导出 Ooz_Decompress")
        self.decompress_fn = self.lib.Ooz_Decompress
        self.decompress_fn.restype = ctypes.c_int
        self.decompress_fn.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_int,
        ]

    def decompress(self, source: bytes, expected_size: int) -> bytes:
        source_buffer = (ctypes.c_ubyte * len(source)).from_buffer_copy(source)
        output_buffer = (ctypes.c_ubyte * expected_size)()
        written = self.decompress_fn(
            source_buffer,
            len(source),
            output_buffer,
            expected_size,
            1,
            0,
            0,
            None,
            0,
            None,
            None,
            None,
            0,
            3,
        )
        if written != expected_size:
            raise RuntimeError(
                f"Oodle 解压长度不符：{written} != {expected_size}，"
                f"输入头部 {source[:16].hex()}"
            )
        return bytes(output_buffer)


def _safe_relative_path(path: str) -> Path:
    relative = PurePosixPath(path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Bundle 内存在越界路径：{path!r}")
    return Path(*relative.parts)


def _decompress_block(
    data: bytes,
    block_type: int,
    expected_size: int,
    oodle: Oodle,
    keys: dict[str, bytes],
    tables: dict[str, list[int]],
) -> bytes:
    if block_type == 0:
        return data
    if block_type in (2, 3):
        return lz4_decompress(data, uncompressed_size=expected_size)
    if block_type in (6, 7, 9):
        payload = mr0k_decrypt(data, keys, tables) if block_type == 7 else data
        return oodle.decompress(payload, expected_size)
    raise ValueError(f"不支持的 block compression flag {block_type}")


def parse_bundle(
    source: bytes,
    offset: int,
    oodle: Oodle,
    keys: dict[str, bytes],
    tables: dict[str, list[int]],
) -> tuple[int, dict]:
    if source[offset : offset + 4] != b"ENCR":
        raise ValueError(f"0x{offset:x} 处不是 ENCR")
    if source[offset + 4 : offset + 5] != b"\0":
        raise ValueError(f"0x{offset:x} 处 ENCR 后缺少 NUL")
    cursor = offset + 5
    bundle_size, compressed_info_size, uncompressed_info_size, flags = struct.unpack_from(
        ">qIII", source, cursor
    )
    cursor += 20
    bundle_end = offset + bundle_size
    if bundle_size <= 0 or bundle_end > len(source):
        raise ValueError(
            f"Bundle 尺寸非法：size={bundle_size}, end={bundle_end}, file={len(source)}"
        )
    info_compression = flags & 0x3F
    compressed_info = source[cursor : cursor + compressed_info_size]
    cursor += compressed_info_size
    if len(compressed_info) != compressed_info_size:
        raise ValueError("BlockInfo 数据被截断")
    info = _decompress_block(
        compressed_info,
        info_compression,
        uncompressed_info_size,
        oodle,
        keys,
        tables,
    )
    if len(info) != uncompressed_info_size:
        raise ValueError("BlockInfo 解压长度不符")

    info_cursor = 0
    block_count = struct.unpack_from(">I", info, info_cursor)[0]
    info_cursor += 4
    blocks: list[tuple[int, int, int]] = []
    for _ in range(block_count):
        block_size, block_compressed_size, block_flags = struct.unpack_from(
            ">IIH", info, info_cursor
        )
        info_cursor += 10
        blocks.append((block_size, block_compressed_size, block_flags))

    node_count = struct.unpack_from(">I", info, info_cursor)[0]
    info_cursor += 4
    nodes: list[tuple[int, int, int, str]] = []
    for _ in range(node_count):
        node_offset, node_size, node_flags = struct.unpack_from(
            ">qqI", info, info_cursor
        )
        info_cursor += 20
        nul = info.find(b"\0", info_cursor)
        if nul < 0:
            raise ValueError("Node 路径缺少 NUL 终止符")
        path = info[info_cursor:nul].decode("utf-8", "replace")
        info_cursor = nul + 1
        nodes.append((node_offset, node_size, node_flags, path))

    payload = bytearray()
    block_manifest = []
    for index, (block_size, compressed_size, block_flags) in enumerate(blocks):
        compressed = source[cursor : cursor + compressed_size]
        cursor += compressed_size
        if len(compressed) != compressed_size:
            raise ValueError(f"Block {index} 数据被截断")
        decompressed = _decompress_block(
            compressed,
            block_flags & 0x3F,
            block_size,
            oodle,
            keys,
            tables,
        )
        if len(decompressed) != block_size:
            raise ValueError(f"Block {index} 解压长度不符")
        payload.extend(decompressed)
        block_manifest.append(
            {
                "uncompressedBytes": block_size,
                "compressedBytes": compressed_size,
                "flags": block_flags,
            }
        )

    files = []
    for node_offset, node_size, node_flags, path in nodes:
        if node_offset < 0 or node_size < 0 or node_offset + node_size > len(payload):
            raise ValueError(
                f"Node 范围越界：{path!r} {node_offset}+{node_size} of {len(payload)}"
            )
        files.append((path, bytes(payload[node_offset : node_offset + node_size]), node_flags))

    manifest = {
        "offset": offset,
        "size": bundle_size,
        "flags": flags,
        "blockInfoCompression": info_compression,
        "blockInfoCompressedBytes": compressed_info_size,
        "blockInfoUncompressedBytes": uncompressed_info_size,
        "blocks": block_manifest,
        "files": files,
    }
    return bundle_end, manifest


def _iter_manifest_files(manifest: dict) -> Iterable[tuple[str, bytes, int]]:
    yield from manifest["files"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="在 macOS 主机上解包当前 HSR ENCR UnityFS block（Oodle/Mr0k）"
    )
    parser.add_argument("block", type=Path, help="客户端 .block 文件")
    parser.add_argument("output", type=Path, help="解包输出目录")
    parser.add_argument(
        "--oodle-lib",
        type=Path,
        default=Path.home() / "Downloads/hsr-ui-extract/tools/libooz.dylib",
        help="本机构建的 libooz 动态库",
    )
    parser.add_argument(
        "--anime-studio-src",
        type=Path,
        default=Path(
            os.environ.get(
                "ANIMESTUDIO_SRC",
                Path.home() / "Downloads/hsr-ui-extract/AnimeStudio-src-35036",
            )
        ),
        help="AnimeStudio 源码 checkout（读取 AES/Mr0k 常量）",
    )
    args = parser.parse_args()

    if not args.block.is_file():
        parser.error(f"block 不存在：{args.block}")
    keys, tables = load_crypto(args.anime_studio_src)
    oodle = Oodle(args.oodle_lib)
    source = args.block.read_bytes()
    args.output.mkdir(parents=True, exist_ok=True)
    bundles = []
    cursor = 0
    while cursor < len(source):
        if source[cursor : cursor + 4] != b"ENCR":
            raise ValueError(
                f"0x{cursor:x} 后出现无法识别的尾随数据："
                f"{source[cursor:cursor + 32].hex()}"
            )
        bundle_end, manifest = parse_bundle(source, cursor, oodle, keys, tables)
        bundle_dir = args.output / f"bundle-{len(bundles):04d}-0x{cursor:08x}"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        for relative_path, content, file_flags in _iter_manifest_files(manifest):
            destination = bundle_dir / _safe_relative_path(relative_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        manifest["files"] = [
            {
                "path": path,
                "bytes": len(content),
                "flags": file_flags,
            }
            for path, content, file_flags in manifest["files"]
        ]
        bundles.append(manifest)
        print(
            f"{len(bundles) - 1:04d} offset=0x{cursor:08x} "
            f"size={bundle_end - cursor} blocks={len(manifest['blocks'])} "
            f"files={len(manifest['files'])}"
        )
        cursor = bundle_end

    report = {
        "sourceBlock": str(args.block),
        "sourceBytes": len(source),
        "consumedBytes": cursor,
        "animeStudioCommit": ANIMESTUDIO_COMMIT,
        "oodleLibrary": str(args.oodle_lib),
        "bundles": bundles,
    }
    manifest_path = args.output / "manifest.json"
    manifest_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成：{len(bundles)} bundles，{len(source)} bytes；manifest={manifest_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"解包失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc
