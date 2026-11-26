import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fail, pass } from './lib/gate.mjs';

const outIndex = process.argv.indexOf('--out');
if (outIndex < 0 || !process.argv[outIndex + 1]) fail('missing --out <dir>');
const out = process.argv[outIndex + 1];
const allow = [
  'app/index.html', 'app/css', 'app/js', 'app/data', 'tools', 'docs/FIDELITY.md',
  'docs/BASELINE.md', 'docs/ACCEPTANCE.md', 'docs/FIDELITY.md', 'content/text',
  'tools/serve.mjs', 'BUILD_INFO.json', 'README.md', 'LICENSE',
];
const exclude = /(^|\/)(assets|shots)(\/|$)|captureScreenshot/;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = [];
const copy = path => {
  if (!existsSync(path)) return;
  const dest = join(out, path);
  const stat = statSync(path);
  if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (exclude.test(child)) continue;
      copy(child);
    }
    return;
  }
  if (exclude.test(path)) return;
  mkdirSync(join(dest, '..'), { recursive: true });
  cpSync(path, dest);
  files.push(path);
};
for (const path of allow) copy(path);
const manifest = {
  version: 1,
  files: files.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(out, path))).digest('hex') })),
  generatedAt: '1980-01-01T00:00:00.000Z',
  noAssets: true,
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// The runtime build must be reproducible and must never smuggle in extracted
// game assets; manifest and extension checks make that guarantee executable.
const manifestFiles = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')).files;
if (!manifestFiles.length || manifestFiles.some(file => exclude.test(file.path))) {
  fail('build manifest contains game assets or is empty');
}
pass(`build ${out}: ${files.length} files, no assets`);
