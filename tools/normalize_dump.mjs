// Manual 7.4: normalize path-A/path-B dumps into one schema and record
// conflicting fields. This implementation operates on already materialized
// dump/*.json files; it never guesses geometry or invents state data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envFail, fail, pass } from './lib/gate.mjs';

const args = new Set(process.argv.slice(2));
const inputDir = args.has('--in') ? process.argv[process.argv.indexOf('--in') + 1] : 'dump';
const outputDir = args.has('--out') ? process.argv[process.argv.indexOf('--out') + 1] : inputDir;
const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
const conflicts = [];
let checked = 0;

const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
const fields = ['active', 'rt', 'components', 'stage'];

for (const state of states) {
  const file = join(inputDir, `${state}.json`);
  if (!existsSync(file)) envFail(`缺少 dump：${file}`);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { fail(`${file}: JSON 失败：${error.message}`); }
  if (data.schema !== 1 || data.state !== state || !data.root) fail(`${file}: schema/state/root 不一致`);
  const seen = new Map();
  for (const node of flatten(data.root)) {
    if (!node.path) fail(`${state}: 节点缺少 path`);
    if (seen.has(node.path)) {
      const previous = seen.get(node.path);
      for (const field of fields) {
        if (JSON.stringify(previous[field]) !== JSON.stringify(node[field])) {
          conflicts.push({ state, path: node.path, field, decision: 'keep-first' });
        }
      }
    } else seen.set(node.path, node);
  }
  if (!args.has('--check')) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, `${state}.json`), JSON.stringify(data, null, 2) + '\n');
  }
  checked++;
}

const traceDir = join(outputDir, '_trace');
if (!args.has('--check')) {
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(join(traceDir, 'conflicts.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    rule: 'duplicate path: keep first complete source record',
    conflicts,
  }, null, 2) + '\n');
}
pass(`normalize dump ${args.has('--check') ? 'checked' : 'written'}: ${checked} states, conflicts=${conflicts.length}`);
