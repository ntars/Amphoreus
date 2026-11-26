import { readFileSync, existsSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

let data;
try {
  data = JSON.parse(readFileSync('app/data/spine.json', 'utf8'));
} catch (error) { envFail(`Spine 数据不可用：${error.message}`); }
if (data.version !== 1) fail('spine.json schema version != 1');

const expected = new Map([
  ['8451025478121060839', {
    name: 'UI_TaroBook_Page', bones: 20, slots: 4, attachments: 1,
    triangles: 48, texture: 'spine/ui_tarobook_page.png',
    animations: { FadeIn: 1.333333, Standby: 0 },
    region: 'TarotBookChartBookPaperBgLeft',
  }],
  ['-348631082036145761', {
    name: 'UI_TaroBook_PageR', bones: 20, slots: 1, attachments: 1,
    triangles: 48, texture: 'spine/ui_tarobook_pager.png',
    animations: { FadeInR: 1.333333, StandbyR: 0 },
    region: 'TarotBookChartBookPaperRight1',
  }],
]);

for (const [pathId, want] of expected) {
  const skeleton = data.skeletons?.[pathId];
  if (!skeleton) fail(`Spine skeleton ${pathId} missing`);
  if (skeleton.version !== '4.1.24') fail(`${pathId}: Spine version ${skeleton.version} != 4.1.24`);
  if (skeleton.name !== want.name) fail(`${pathId}: name ${skeleton.name} != ${want.name}`);
  for (const [field, count] of Object.entries({ bones: want.bones, slots: want.slots, attachments: want.attachments })) {
    if (skeleton[field]?.length !== count) fail(`${pathId}: ${field}=${skeleton[field]?.length} != ${count}`);
  }
  if (skeleton.texture?.file !== want.texture) fail(`${pathId}: texture ${skeleton.texture?.file} != ${want.texture}`);
  if (!existsSync(`app/assets/${want.texture}`)) fail(`${pathId}: texture file missing ${want.texture}`);
  const region = skeleton.atlas?.regions?.find(item => item.name === want.region);
  if (!region || String(region.bounds) !== '2,2,836,1096') fail(`${pathId}: atlas region not source-exact`);
  const attachment = skeleton.attachments[0];
  if (attachment.triangles.length !== want.triangles) fail(`${pathId}: triangles=${attachment.triangles.length} != ${want.triangles}`);
  const weightedValues = attachment.vertices.length / 3;
  const weightedVertices = attachment.boneCounts.reduce((sum, count) => sum + count, 0);
  if (weightedValues !== weightedVertices) fail(`${pathId}: weighted vertex count mismatch`);
  const vertexCount = attachment.uvs.length / 2;
  if (attachment.boneCounts.length !== vertexCount) fail(`${pathId}: bone-count/vertex mismatch`);
  if (weightedVertices !== weightedValues) fail(`${pathId}: weighted vertex count mismatch`);
  const animations = Object.fromEntries(Object.entries(skeleton.animations).map(([name, animation]) => [name, Number(animation.duration.toFixed(6))]));
  if (JSON.stringify(animations) !== JSON.stringify(want.animations)) fail(`${pathId}: animations ${JSON.stringify(animations)}`);
  const timelines = Object.values(skeleton.animations).flatMap(animation => animation.timelines);
  const allowed = new Set(['rotate', 'scale', 'attachment']);
  if (timelines.some(timeline => !allowed.has(timeline.type))) fail(`${pathId}: unsupported timeline type`);
  for (const timeline of timelines) {
    if (timeline.type === 'attachment') continue;
    let previous = -Infinity;
    for (const frame of timeline.frames) {
      if (!(frame[0] >= previous)) fail(`${pathId}: non-monotonic timeline frames`);
      previous = frame[0];
    }
    if (timeline.curves.length !== timeline.frames.length - 1) fail(`${pathId}: curve/frame mismatch`);
  }
}
pass('spine source data verified: 2 skeletons, source dimensions and animations exact');
