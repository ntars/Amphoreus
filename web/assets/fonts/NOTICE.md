# Third-party font notice

`RPG_CN.ttf` is an official in-game font resource extracted from the local
copy of *Honkai: Star Rail*. It is included only for this non-commercial,
fan-made interface recreation.

The repository's MIT license covers the Amphoreus source code, not this font.
The font remains the property of its respective rights holders and is not
relicensed under MIT.

Extraction evidence:

- Source block: `6b642bb3192c13322893776c629617fb.block`
- Unity resource name: `RPG_CN`
- Family metadata: `HYQiHei` / `汉仪旗黑` / `汉仪旗黑 65简`
- Original packed resource: 12,125,028 bytes
- Original MD5: `4eb01671e5e7e64f18c8e5da64d88d59`
- Original SHA-256: `a60ee0514450445babc56c0457b749b9c1889690217c4fddb05635b214515f10`

The packed `RPG_CN` resource has a broken `loca` tail and is rejected by
OTS/Chrome. To keep its 55,415-glyph ordering and original cmap intact, this
repository rebuilds the sfnt with the valid outlines from the official Chinese
SDK font (`MiHoYoSDKRes/HttpServerResources/font/zh-cn.ttf`) matched by glyph
name; the 281 names absent from that SDK are emitted as empty glyphs, and the
123 glyphs after the broken `loca` boundary cannot be recovered from this
packed copy.

- SDK MD5: `607e21c10affce03609e36909d7554e0`
- SDK SHA-256: `0d49951c017c299ca9bcb12c6e8283649ec100d34f367f4b567e5ab9a2b6b52e`
- Rebuilt family metadata: `RPG_CN` (rebuilt metadata) / `HYQiHei 65J`
- Rebuilt size: 11,183,992 bytes
- Rebuilt MD5: `1420a7784aa5659c8a4fd8c1440ac139`
- Rebuilt SHA-256: `12a6bf115b2632e3c9abfa4a036fc4d4ef6e749afb77df3611a0f213209d3bfb`
