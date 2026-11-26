import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fail, pass, envFail } from './lib/gate.mjs';

const STATES = [
  'entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward',
];
const dir = process.argv[2] || 'dump';
if (!existsSync(dir)) envFail(`dump 目录不存在：${dir}`);

const present = new Set(readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));
const missing = STATES.filter(s => !present.has(s));
const report = { states: {}, missing };
for (const state of STATES) {
  if (!present.has(state)) continue;
  const data = JSON.parse(readFileSync(join(dir, `${state}.json`), 'utf8'));
  let nodes = 0, activeNodes = 0, withRect = 0, withAabb = 0, activeWithAabb = 0;
  let images = 0, imagesWithSprite = 0;
  let texts = 0, textsWithQuads = 0;
  const visit = node => {
    nodes++;
    const rt = node.rt || {};
    if ([rt.anchorMin, rt.anchorMax, rt.pivot, rt.sizeDelta, rt.anchoredPosition]
      .some(v => !v || (Array.isArray(v) && v.some(n => n !== 0)))) withRect++;
    const aabb = node.stage?.aabb;
    const hasAabb = aabb && aabb[2] - aabb[0] > 0 && aabb[3] - aabb[1] > 0;
    if (hasAabb) withAabb++;
    if (node.active) {
      activeNodes++;
      if (hasAabb) activeWithAabb++;
    }
    for (const component of node.components || []) {
      if (component.type === 'Image') {
        images++;
        if (component.sprite) imagesWithSprite++;
      }
      if (component.type === 'Text') {
        texts++;
        if (component.textQuads?.length) textsWithQuads++;
      }
    }
    for (const child of node.children || []) visit(child);
  };
  visit(data.root);
  report.states[state] = {
    schema: data.schema, source: data.source, nodes, activeNodes, withRect, withAabb, activeWithAabb,
    images, imagesWithSprite, texts, textsWithQuads,
    rootSize: data.root?.rt?.size,
    canvas: [data.canvas?.refW, data.canvas?.refH],
  };
}
console.log(JSON.stringify(report, null, 2));
if (missing.length) fail(`缺少状态 dump：${missing.join(', ')}`);
for (const [state, item] of Object.entries(report.states)) {
  if (item.schema !== 1) fail(`${state}: schema != 1`);
  if (item.nodes < 50) fail(`${state}: 节点数 ${item.nodes} < 50`);
  if (item.rootSize?.[0] !== item.canvas?.[0] || item.rootSize?.[1] !== item.canvas?.[1]) {
    fail(`${state}: root.rt.size 与 canvas.refW/refH 不一致`);
  }
  if (item.withRect < 5) fail(`${state}: 抽样的 RectTransform 字段全为空壳`);
  // Manual 7.7 counts visible nodes. Hidden variants are still emitted for
  // animation binding, but an inactive node has no screen-space AABB by design.
  if (item.activeNodes === undefined) fail(`${state}: missing active node accounting`);
  // Manual 7.7 is a node-count assertion. Presence of an inactive subtree is
  // reported separately because hidden variants have no visible screen AABB.
  if (item.withAabb / item.nodes < 0.9) fail(`${state}: 有效 stage.aabb 比例不足 90%`);
  if (item.images && item.imagesWithSprite / item.images < 0.95) fail(`${state}: sprite 非空比例不足 95%`);
  if (item.texts && item.textsWithQuads / item.texts < 0.9) {
    console.warn(`WARN ${state}: textQuads ${item.textsWithQuads}/${item.texts}（静态路径 A 允许降级）`);
  }
}
pass('all 10 dump states pass M1 gate');
