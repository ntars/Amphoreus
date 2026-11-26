// Verify the source-only separation rules from the manual's §0 and §14.4.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fail, pass } from './lib/gate.mjs';

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const problems = [];
for (const path of walk('app')) {
  const name = path.toLowerCase();
  if (/(screenshot|capture)/.test(name) || /\bshot\b/.test(name)) {
    problems.push(`${path}: screenshot-like name`);
  }
  if (/\.(jpg|jpeg|webp)$/.test(name)) problems.push(`${path}: screenshot-like image format`);
}
for (const path of walk('app/css')) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/url\(["']?([^)"']+)/g)) {
    const url = match[1];
    if (/\.(png|jpg|jpeg|webp)$/i.test(url) && !/assets\//.test(url)) {
      problems.push(`${path}: image URL outside assets: ${url}`);
    }
  }
}
if (existsSync('app/data/states')) {
  for (const path of walk('app/data/states')) {
    const text = readFileSync(path, 'utf8');
    if (/"1920"\s*,\s*"1080"/.test(text) || /1920x1080/i.test(text)) {
      problems.push(`${path}: full-screen image dimension in state data`);
    }
  }
}
if (problems.length) fail(problems.join('; '));
pass('source-only separation verified: no screenshot inputs in app/');
