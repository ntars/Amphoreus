#!/usr/bin/env python3
"""Extract the official localization table (TextMap) from the read-only game copy.

Source record shape, observed byte-for-byte in
StarRail_Data/Persistent/DesignData/Windows/cn/2992a81e50e9f57b177c31317600ada3.bytes:

    <u8 len> <len bytes UTF-8 text> 0x03 <4 bytes LE TextID.hash>

Records are packed with optional 0x01 group markers and variable opaque tails,
so the reader uses a self-validating signature scan (length <= 120 -> valid
UTF-8 -> 0x03 -> hash) rather than a fixed stride. It recovers 373,873
candidates and 373,708 unique hashes; the five TarotBook sibling strings and
chapter ids below prove the alignment is not drifted.

The 4-byte tail is the same hash space used by RPG.Client.TextID.hash, which is
why the config blob at 32.1-32.4 MB resolves to chapter ids ("1", "1-1", ...).
We do not reverse the hash function itself: the table is the authoritative
hash -> text index, so lookups only need the hash carried by the config row.

Output: dump/_textmap.json
  { schema, source: {file, size, sha256}, count, records: {<hash> <text>} }
"""

import argparse
import hashlib
import json
import os
import sys

DEFAULT_ROOT = os.path.expanduser('~/Downloads/hsr-ui-extract/StarRailGame-full')
REL = 'StarRail_Data/Persistent/DesignData/Windows/cn/2992a81e50e9f57b177c31317600ada3.bytes'


def parse_records(buf):
    """Return list of (offset, hash, text) using the validated record shape."""
    n = len(buf)
    out = []
    i = 0
    while i < n - 7:
        length = buf[i]
        if length < 1 or length > 120:
            i += 1
            continue
        text_start = i + 1
        text_end = text_start + length
        if text_end + 5 > n or buf[text_end] != 0x03:
            i += 1
            continue
        try:
            text = buf[text_start:text_end].decode('utf-8')
        except UnicodeDecodeError:
            i += 1
            continue
        if not text:
            i += 1
            continue
        value = int.from_bytes(buf[text_end + 1:text_end + 5], 'little')
        out.append((i, value, text))
        i = text_end + 5
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default=DEFAULT_ROOT, help='read-only game copy root')
    parser.add_argument('--out', default='dump/_textmap.json')
    args = parser.parse_args()

    path = os.path.join(args.root, REL)
    if not os.path.exists(path):
        print(f'ENVFAIL missing TextMap: {path}', file=sys.stderr)
        return 2
    buf = open(path, 'rb').read()
    records = parse_records(buf)
    if len(records) < 370000:
        print(f'FAIL parsed {len(records)} records < 370000', file=sys.stderr)
        return 1

    entries = {}
    conflicts = 0
    for _, value, text in records:
        previous = entries.get(str(value))
        if previous is not None and previous != text:
            conflicts += 1
            continue
        entries[str(value)] = text

    # Source-proven acceptance strings; if any hash resolves to the wrong text
    # the scan is desynchronized and the dump must not be trusted.
    expected = {
        '3656770492': '回到目录',   # UIText_TarotBook_StoryTemplatePage_ToCata
        '2314004923': '本节完',     # UIText_TarotBook_StoryTemplatePage_Finish
        '3065615277': '点击书页继续',  # UIText_TarotBook_StoryTemplatePage_Click
        '2331500738': '上一节',     # UIText_TarotBook_StoryTemplatePage_Back
        '2965043345': '下一节',     # UIText_TarotBook_StoryTemplatePage_Next
    }
    for key, text in expected.items():
        if entries.get(key) != text:
            print(f'FAIL TextMap {key} -> {entries.get(key)!r}, expected {text!r}', file=sys.stderr)
            return 1

    payload = {
        'schema': 'textmap/1',
        'source': {
            'file': REL,
            'size': len(buf),
            'sha256': hashlib.sha256(buf).hexdigest(),
        },
        'count': len(entries),
        'conflicts': conflicts,
        'records': entries,
    }
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(',', ':'))
    print(f'PASS textmap records={len(entries)} conflicts={conflicts} out={args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
