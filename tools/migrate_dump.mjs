import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pass, fail, envFail } from './lib/gate.mjs';

const checkOnly = process.argv.includes('--check');
const files = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk', 'wikiDialog', 'wikiError', 'mail', 'star', 'reward']
  .map(state => `dump/${state}.json`);
if (files.some(file => !existsSync(file))) envFail('dump 不完整');
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.schema !== 1 || !data.state || !data.root) fail(`${file}: schema 1 校验失败`);
  if (!checkOnly) writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
pass(`dump schema migration ${checkOnly ? 'checked' : 'applied'}: ${files.length} files`);
