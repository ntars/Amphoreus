import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pass, fail } from './lib/gate.mjs';

const ROOT = process.argv[2] || 'app';
const banned = [/captureScreenshot/, /background-image\s*:\s*url\((['"])?(?:\.\.\/)*(?:verify|shots)\//i];
const files = [];
function walk(path) {
  for (const name of readdirSync(path)) {
    if (name === 'assets') continue;
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|mjs|css|html)$/.test(name)) files.push(full);
  }
}
try { walk(ROOT); } catch (error) { fail(`scan ${ROOT}: ${error.message}`); }
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of banned) if (pattern.test(text)) hits.push(`${relative('.', file)}: ${pattern}`);
}
if (hits.length) fail(`screenshot backdoor: ${hits.join('; ')}`);
pass(`${files.length} app files clean`);
