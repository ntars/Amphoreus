import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

const arg = (key, fallback) => {
  const i = process.argv.indexOf(`--${key}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const oldDir = arg('old', 'dump.old');
const newDir = arg('new', 'dump');
const outPath = arg('out', 'docs/DIFF.md');
if (!existsSync(oldDir) || !existsSync(newDir)) envFail('diff 需要两个 dump 目录');
const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk', 'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
const lines = ['# Dump diff', '', '## Summary', ''];
let changed = 0;
for (const state of states) {
  const oldPath = `${oldDir}/${state}.json`;
  const newPath = `${newDir}/${state}.json`;
  if (!existsSync(oldPath) || !existsSync(newPath)) {
    lines.push(`- ${state}: missing one side`);
    continue;
  }
  const oldNodes = flatten(JSON.parse(readFileSync(oldPath, 'utf8')).root);
  const newNodes = flatten(JSON.parse(readFileSync(newPath, 'utf8')).root);
  const oldMap = new Map(oldNodes.map(n => [n.path, n]));
  const newMap = new Map(newNodes.map(n => [n.path, n]));
  const added = [...newMap.keys()].filter(p => !oldMap.has(p));
  const removed = [...oldMap.keys()].filter(p => !newMap.has(p));
  const sizeChanged = [...newMap.keys()].filter(p => oldMap.has(p) && String(oldMap.get(p).rt?.size) !== String(newMap.get(p).rt?.size));
  changed += added.length + removed.length + sizeChanged.length;
  lines.push(`- ${state}: nodes ${oldNodes.length}->${newNodes.length}, added=${added.length}, removed=${removed.length}, sizeChanged=${sizeChanged.length}`);
}
lines.push('', '## Impact', '', changed ? 'Review listed states before recompiling affected layouts.' : 'No structural differences.');
mkdirSync(outPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(outPath, lines.join('\n') + '\n');
pass(`dump diff written: ${outPath}, ${changed} changes`);
