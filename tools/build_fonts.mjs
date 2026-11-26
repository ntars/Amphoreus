// Manual 8.2 path 2: SDF font atlases from the source dump are consumed via
// app/data/assets.json. The runtime draws SDF glyphs for characters present
// in the source glyph tables and falls back to RPG_CN.ttf only for characters
// that have no source glyph record. No glyph table is synthesized.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { envFail, fail, pass } from './lib/gate.mjs';

const assetsFile = 'app/data/assets.json';
if (!existsSync(assetsFile)) envFail(`缺少 ${assetsFile}`);
const assets = JSON.parse(readFileSync(assetsFile, 'utf8'));
const names = Object.keys(assets.fonts || {});
if (!names.length) fail('assets.json 没有字体');
for (const name of names) {
  const font = assets.fonts[name];
  if (!font.file || !existsSync(`app/assets/${font.file}`)) fail(`${name}: 字体文件不存在 ${font.file}`);
  if (!font.sha1) fail(`${name}: 缺少 sha1`);
}

// Source-derived TMP atlases are optional until the runtime consumes quads,
// but when present they must be complete and hash-consistent.
if (existsSync('dump/_fonts.json')) {
  const dump = JSON.parse(readFileSync('dump/_fonts.json', 'utf8'));
  const fonts = Array.isArray(dump) ? dump : dump.fonts || [];
  if (!fonts.length) fail('_fonts.json contains no fonts');
  for (const font of fonts) {
    for (const key of ['atlasFile', 'atlasSha1', 'atlasWidth', 'atlasHeight', 'pointSize', 'lineHeight', 'ascent']) {
      if (font[key] === undefined) fail(`${font.name}: missing ${key}`);
    }
    const source = font.source || {};
    if (source.faceInfoOffset !== 156) fail(`${font.name}: missing faceInfoOffset`);
    if (!font.metricsProvenance?.includes('offset 156')) fail(`${font.name}: faceInfo provenance missing`);
    for (const value of [font.pointSize, font.lineHeight, font.ascent]) {
      if (!Number.isFinite(value) || value <= 0) fail(`${font.name}: invalid faceInfo`);
    }
    const path = `app/assets/${font.atlasFile}`;
    if (!existsSync(path)) fail(`${font.name}: atlas missing ${path}`);
    const actual = createHash('sha1').update(readFileSync(path)).digest('hex');
    if (actual !== font.atlasSha1) fail(`${font.name}: atlas sha1 mismatch`);
    const glyphIds = new Set((font.glyphs || []).map(glyph => glyph.index));
    if (!glyphIds.size) fail(`${font.name}: no glyphs`);
    for (const entry of font.chars || []) {
      if (!glyphIds.has(entry.g)) fail(`${font.name}: character ${entry.c} has no glyph`);
    }
  }
  pass(`fonts verified: ${names.join(', ')}; SDF fonts ${fonts.length}, glyphs ${fonts.reduce((sum, font) => sum + font.glyphs.length, 0)}`);
} else {
  pass(`fonts verified: ${names.join(', ')}; no SDF dump present`);
}
