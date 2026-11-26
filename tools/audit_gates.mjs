import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail } from './lib/gate.mjs';

const files = readdirSync('tools')
  .filter(name => /^(verify_|probe_).*\.mjs$/.test(name) || name === 'run_all.mjs')
  .map(name => join('tools', name));
const problems = [];
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  const text = readFileSync(file, 'utf8');
  if (/process\.exit\(\s*0\s*\)/.test(text)) problems.push(`${file}: process.exit(0)`);
  const exits = [...text.matchAll(/process\.exit\(\s*([^)]*)\s*\)/g)].map(m => m[1].trim());
  if (exits.some(value => !['1', '2', 'failed'].includes(value))) problems.push(`${file}: non-gate exit ${exits.join(',')}`);
  if (/catch\s*\([^)]*\)\s*\{[^}]*exit\s*\(\s*0/.test(text)) problems.push(`${file}: catch swallows to exit 0`);
}
if (problems.length) fail(problems.join('; '));
pass(`gate exits audited: ${files.length} scripts`);
