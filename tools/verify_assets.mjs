import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fail, pass, envFail } from './lib/gate.mjs';

let assets, missing;
try {
  assets = JSON.parse(readFileSync('app/data/assets.json', 'utf8'));
  missing = JSON.parse(readFileSync('app/data/missing.json', 'utf8'));
} catch (error) {
  envFail(`资产清单不可用：${error.message}`);
}
const sprites = Object.values(assets.sprites || {});
if (sprites.length < 110) fail(`sprite 数 ${sprites.length} < 110`);
const missingCount = Array.isArray(missing) ? missing.length : Object.keys(missing).length;
if (missingCount > 5) fail(`missing ${missingCount} > 5`);
const materials = JSON.parse(readFileSync('app/data/materials.json', 'utf8') || '[]');
const sources = new Set();
for (const material of materials) {
  for (const value of Object.values(material.floats || {})) sources.add(String(value));
  for (const value of Object.values(material.colors || {})) {
    if (value && typeof value === 'object') {
      for (const channel of Object.values(value)) sources.add(String(channel));
    }
  }
}
let css = '';
for (const name of readdirSync('app/css')) if (name.endsWith('.css')) css += readFileSync(join('app/css', name), 'utf8');
const fxVars = [...css.matchAll(/--fx-[a-z0-9_-]+/gi)].map(match => match[0]);
for (const variable of new Set(fxVars)) {
  // effects.js maps a source key to kebab-case: _DisGSpeed -> --fx-dis-g-speed.
  // Recover candidates by removing underscores/hyphens and comparing canonicalized names.
  const canonical = value => String(value).replace(/^_/, '').replace(/[-_]/g, '').toLowerCase();
  const wanted = canonical(variable.slice(5));
  if (!materials.some(material => [...Object.keys(material.floats || {}), ...Object.keys(material.colors || {})]
    .some(name => canonical(name) === wanted))) {
    fail(`${variable}: materials.json 中无来源`);
  }
}
for (const sprite of sprites) {
  const path = join('app/assets', sprite.file);
  let buffer;
  try {
    if (statSync(path).size <= 1) fail(`${path}: 空文件`);
    buffer = readFileSync(path);
  } catch (error) {
    fail(`${path}: ${error.message}`);
  }
  const sha1 = createHash('sha1').update(buffer).digest('hex');
  if (sha1 !== sprite.sha1) fail(`${path}: sha1 不一致`);
}
pass(`assets verified: ${sprites.length} sprites, missing=${missingCount}`);
