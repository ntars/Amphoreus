// Manual T1.7: validate the source-derived sprite index used by the layout
// compiler. app/data/assets.json is produced by tools/build_sprites.py from
// original Unity blocks; this script cannot invent missing sprite metadata.
import { existsSync, readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

const source = 'dump/_sprites.json';
const assetsFile = 'app/data/assets.json';
for (const file of [source, assetsFile]) {
  if (!existsSync(file)) envFail(`缺少 sprite 索引：${file}`);
}
const sprites = JSON.parse(readFileSync(source, 'utf8'));
const assets = JSON.parse(readFileSync(assetsFile, 'utf8'));
const entries = Array.isArray(sprites) ? sprites : Object.values(sprites.sprites || sprites);
if (entries.length < 110) fail(`_sprites.json 只有 ${entries.length} 条，少于 110`);
const indexed = Object.values(assets.sprites || {});
if (indexed.length < 110) fail(`assets.json 只有 ${indexed.length} 条，少于 110`);
const withBorder = indexed.filter(sprite => Array.isArray(sprite.border) && sprite.border.some(v => v !== 0)).length;
pass(`sprite index valid: _sprites=${entries.length}, assets=${indexed.length}, nonzeroBorder=${withBorder}`);
