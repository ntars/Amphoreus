import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

let raw, assets;
try {
  raw = JSON.parse(readFileSync('dump/_masks.json', 'utf8'));
  assets = JSON.parse(readFileSync('app/data/assets.json', 'utf8'));
} catch (error) {
  envFail(`遮罩证据不可用：${error.message}`);
}

// All 49 SmoothMask records in the booklet CAB plus 14 in the catalog CAB
// are parsed from the same validated 136-byte layout.
if (raw.smoothMaskRecords !== 145) fail(`SmoothMask 记录 ${raw.smoothMaskRecords} != 145`);
const textureCount = raw.byType?.Texture || 0;
const rectangleCount = raw.byType?.Rectangle || 0;
if (textureCount + rectangleCount !== 145) fail(`SmoothMask 类型计数异常 ${JSON.stringify(raw.byType)}`);
if (raw.reverseMaskRecords < 4) fail(`reverseMask 记录 ${raw.reverseMaskRecords} < 4`);

for (const state of ['bookletPage', 'catalog']) {
  const dump = JSON.parse(readFileSync(`dump/${state}.json`, 'utf8'));
  const compiled = JSON.parse(readFileSync(`app/data/states/${state}.json`, 'utf8'));
  const sourceRevert = findByPath(dump.root, p => p.endsWith('/RevertMask'));
  const compiledRevert = compiled.nodes.find(node => node.path?.endsWith('/RevertMask'));
  if (!sourceRevert || !compiledRevert) fail(`${state}: RevertMask 缺失`);
  const source = sourceRevert.components.find(component => component.maskType === 'SmoothMask');
  if (!source) fail(`${state}: RevertMask 没有 SmoothMask 源组件`);
  if (source.smoothMaskType !== 'Rectangle') fail(`${state}: RevertMask 类型 ${source.smoothMaskType}`);
  if (source.reverseMask !== true) fail(`${state}: RevertMask reverseMask 不为真`);
  if (source.radius !== 0) fail(`${state}: RevertMask radius=${source.radius}`);
  if (source.smoothMaskTypeCode !== 2) fail(`${state}: RevertMask enum=${source.smoothMaskTypeCode}`);
  if (compiledRevert.mask !== 'rect-round' || compiledRevert.maskType !== 'Rectangle' || !compiledRevert.reverseMask) {
    fail(`${state}: 编译状态未保留 Rectangle/reverseMask`);
  }
  if (compiledRevert.maskKind !== 'SmoothMask') fail(`${state}: 编译状态缺少 maskKind=SmoothMask`);
  if (compiledRevert.smoothMaskReverse !== true) fail(`${state}: 编译状态丢失 smoothMaskReverse`);

  const leftPath = state === 'bookletPage'
    ? 'TarotBookBookletPage/Root/PanelContent/MainBookPanel/PagePanel/PageFrame/Left'
    : null;
  if (leftPath) {
    const left = compiled.nodes.find(node => node.path === leftPath);
    if (!left || left.mask !== 'sprite' || left.maskType !== 'Texture' || left.reverseMask) {
      fail('bookletPage: PageFrame/Left 未按 Texture SmoothMask 编译');
    }
    const spritePathId = String(left.smoothMask?.source?.spritePathId || '');
    const expected = '-7174613630072137938';
    if (spritePathId !== expected) fail(`PageFrame/Left: mask sprite ${spritePathId} != ${expected}`);
    const key = assets.spritePathIds?.[spritePathId];
    if (!key || !assets.sprites?.[key]) fail(`PageFrame/Left: 遮罩图 ${spritePathId} 未登记`);
  }
}

function findByPath(node, predicate) {
  if (!node) return null;
  if (predicate(node.path || '')) return node;
  for (const child of node.children || []) {
    const found = findByPath(child, predicate);
    if (found) return found;
  }
  return null;
}

pass(`SmoothMask verified: ${raw.smoothMaskRecords} records, Texture=${textureCount}, Rectangle=${rectangleCount}, reverse=${raw.reverseMaskRecords}`);
