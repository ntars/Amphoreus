import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fail, pass, envFail } from './lib/gate.mjs';

const SOURCE = '/Users/ntars/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/ui/materials/tarotbook';
let files;
try { files = readdirSync(SOURCE).filter(name => name.endsWith('.json')).sort(); }
catch (error) { envFail(`材质源不可用：${error.message}`); }
const materials = [];
for (const file of files) {
  const data = JSON.parse(readFileSync(join(SOURCE, file), 'utf8'));
  const name = data.Name || data.m_Name || file.replace(/\.json$/, '');
  const lower = name.toLowerCase();
  const kind = ['Glitch', 'Scanline', 'Dissolve', 'UVMove', 'Glow', 'Ring', 'Trail', 'Flow', 'OneChannel']
    .find(token => lower.includes(token.toLowerCase()))
    || (lower.includes('screenscan') ? 'Scanline' : 'Other');
  const props = data.m_SavedProperties || {};
  materials.push({
    name, kind,
    sourceFile: file,
    sha1: createHash('sha1').update(readFileSync(join(SOURCE, file))).digest('hex'),
    floats: props.m_Floats || {},
    colors: props.m_Colors || {},
    textures: Object.fromEntries(Object.entries(props.m_TexEnvs || {}).map(([key, tex]) => [key, {
      scale: tex.m_Scale, offset: tex.m_Offset,
    }])),
  });
}
mkdirSync('app/data/materials', { recursive: true });
for (const material of materials) {
  writeFileSync(join('app/data/materials', `${material.name}.json`), JSON.stringify(material, null, 2) + '\n');
}
writeFileSync('app/data/materials.json', JSON.stringify(materials, null, 2) + '\n');
if (materials.length < 30) fail(`材质数 ${materials.length} < 30`);
pass(`materials compiled: ${materials.length}, kinds ${[...new Set(materials.map(m => m.kind))].join(',')}`);
