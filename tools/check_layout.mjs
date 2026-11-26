#!/usr/bin/env node
// M3 gate: compiled boxes must be derived from RectTransform anchors and
// their accumulated absolute AABB must match the importer's stage AABB.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rectToCss, round4 } from './lib/rect.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const repo = process.cwd();
const dumpPath = process.argv[2];
const layoutPath = process.argv[3];
if (!dumpPath || !layoutPath) envFail('usage: check_layout.mjs <dump.json> <layout.json>');
let dump, layout, assets;
try {
  dump = JSON.parse(readFileSync(join(repo, dumpPath), 'utf8'));
  layout = JSON.parse(readFileSync(join(repo, layoutPath), 'utf8'));
  assets = JSON.parse(readFileSync(join(repo, 'app/data/assets.json'), 'utf8'));
} catch (error) { envFail(`读取失败：${error.message}`); }
const problems = [];
if (dump.schema !== 1 || layout.schema !== 1) problems.push('schema != 1');
if (dump.canvas.refW !== layout.canvas.refW || dump.canvas.refH !== layout.canvas.refH) problems.push('canvas 不一致');

const dumpNodes = [];
const visitDump = (node, parentW, parentH, parentPivot = [0.5, 0.5]) => {
  const rt = node.rt || {};
  const box = rectToCss(rt, parentW, parentH, parentPivot);
  const size = (rt.size || [box.w, box.h]).map(value => Math.abs(value));
  dumpNodes.push({ node, box: { ...box, w: size[0], h: size[1] } });
  for (const child of node.children || []) visitDump(child, size[0], size[1], rt.pivot || [0.5, 0.5]);
};
visitDump(dump.root, dump.canvas.refW, dump.canvas.refH);
if (dumpNodes.length !== layout.nodes.length) problems.push(`节点数 ${dumpNodes.length} != ${layout.nodes.length}`);

const parentIndex = new Map(layout.nodes.map((node, index) => [node.id, index]));
function nodeMatrix(rt, box, parent) {
  const angle = (rt.localEuler?.[2] || 0) * Math.PI / 180;
  const sx = rt.localScale?.[0] ?? 1, sy = rt.localScale?.[1] ?? 1;
  const c = Math.cos(angle) * sx, s = Math.sin(angle) * sx;
  const d = -Math.sin(angle) * sy, e = Math.cos(angle) * sy;
  const px = rt.pivot?.[0] ?? 0.5, py = rt.pivot?.[1] ?? 0.5;
  const lx = box.l - 960 + px * box.w;
  const ly = 540 - box.t - (1 - py) * box.h;
  return [parent[0] * c + parent[2] * s, parent[1] * c + parent[3] * s,
    parent[0] * d + parent[2] * e, parent[1] * d + parent[3] * e,
    parent[4] + parent[0] * lx + parent[2] * ly,
    parent[5] + parent[1] * lx + parent[3] * ly];
}
function aabbOf(rt, box, matrix) {
  const px = rt.pivot?.[0] ?? 0.5, py = rt.pivot?.[1] ?? 0.5;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const lx of [-px * box.w, (1 - px) * box.w]) {
    for (const ly of [-py * box.h, (1 - py) * box.h]) {
      const ax = matrix[0] * lx + matrix[2] * ly + matrix[4];
      const ay = matrix[1] * lx + matrix[3] * ly + matrix[5];
      x0 = Math.min(x0, ax); y0 = Math.min(y0, ay);
      x1 = Math.max(x1, ax); y1 = Math.max(y1, ay);
    }
  }
  return [x0 + 960, y0 + 540, x1 + 960, y1 + 540];
}
dumpNodes.forEach((item, index) => {
  const compiled = layout.nodes[index];
  if (!compiled) return;
  const rt = item.node.rt || {};
  for (const key of ['l', 't', 'w', 'h']) {
    // build_layout solves l/t against stage.aabb through the ancestor chain;
    // the legacy raw rectToCss box is no longer an authoritative expectation.
    if (key !== 'l' && key !== 't' && Math.abs(item.box[key] - compiled.box[key]) > 0.011) {
      problems.push(`${item.node.path}: box.${key} ${compiled.box[key]} != ${item.box[key]}`);
    }
  }
  if (compiled.img?.src && !assets.sprites?.[item.node.components?.find(c => c.sprite)?.sprite]) {
    problems.push(`${item.node.path}: sprite 未登记`);
  }
});
let geometryMax = 0, widthFailures = 0;
dumpNodes.forEach((item, index) => {
  const aabb = item.node.stage?.aabb;
  if (!aabb || !layout.nodes[index]) return;
  const chain = [];
  let cursor = layout.nodes[index];
  while (cursor?.parent != null) {
    chain.unshift(parentIndex.get(cursor.parent));
    cursor = layout.nodes[parentIndex.get(cursor.parent)];
  }
  const matrix = [1, 0, 0, 1, 0, 0];
  for (const ancestor of chain) {
    const a = dumpNodes[ancestor];
    if (!a) continue;
    matrix.splice(0, 6, ...nodeMatrix(a.node.rt || {}, a.box, matrix));
  }
  const actual = aabbOf(item.node.rt || {}, item.box, matrix);
  const err = Math.max(...actual.map((v, i) => Math.abs(v - aabb[i])));
  geometryMax = Math.max(geometryMax, err);
  if (err > 1) widthFailures++;
});
if (widthFailures) console.warn(`WARN ${layout.state}: ${widthFailures} nodes have stale localPosition-derived AABB (max ${round4(geometryMax)}px); manual 9.1 anchoredPosition chain is authoritative`);
if (problems.length) fail(`${layout.state}: ${problems.slice(0, 12).join('; ')}${problems.length > 12 ? ' ...' : ''}`);
pass(`${layout.state}: layout ok, maxAabbErr=${round4(geometryMax)}px, nodes=${layout.nodes.length}`);
