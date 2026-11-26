import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

const expected = new Map([
  ['bookletCover', new Set(['8451025478121060839', '-348631082036145761'])],
  ['bookletPage', new Set(['8451025478121060839', '-348631082036145761'])],
  ['talk', new Set(['8451025478121060839', '-348631082036145761'])],
]);
for (const [state, wanted] of expected) {
  let data;
  try { data = JSON.parse(readFileSync(`app/data/states/${state}.json`, 'utf8')); }
  catch (error) { envFail(`${state}: compiled state unavailable: ${error.message}`); }
  const found = new Set(data.nodes.filter(node => node.spine).map(node => String(node.spine.skeletonDataPathId)));
  for (const pathId of wanted) {
    if (!found.has(pathId)) fail(`${state}: missing Spine reference ${pathId}`);
  }
}
let dump;
try { dump = JSON.parse(readFileSync('dump/bookletPage.json', 'utf8')); }
catch (error) { envFail(`dump/bookletPage.json unavailable: ${error.message}`); }
const walk = node => [node, ...(node.children || []).flatMap(walk)];
const spineComponents = [dump.root, ...(dump.supportRoots || [])].filter(Boolean).flatMap(walk)
  .flatMap(node => node.components || []).filter(component => component.type === 'Spine');
for (const component of spineComponents) {
  const pathId = String(component.skeletonDataPathId);
  if (!/^-?\d+$/.test(pathId)) fail(`Spine PathID is not decimal string: ${pathId}`);
  const source = component.source || {};
  if (source.layoutScaleMode !== 3) fail(`Spine layoutScaleMode ${source.layoutScaleMode} != source value 3`);
  if (!Array.isArray(source.referenceSize) || !(source.referenceScale > 0)) fail(`Spine reference layout missing for ${pathId}`);
}
for (const pointer of ['8451025478121060839', '-348631082036145761']) {
  if (!spineComponents.some(component => String(component.skeletonDataPathId) === pointer)) {
    fail(`dump/bookletPage.json: missing Spine pointer ${pointer}`);
  }
}
pass('Spine state references and source layout metadata verified');
