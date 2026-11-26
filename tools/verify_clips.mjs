// --all is accepted as a compatibility flag; this verifier always checks the full clip set.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fail, pass, envFail } from './lib/gate.mjs';
import { collectClipSources } from './lib/clip_sources.mjs';

const DIR = 'app/data/anim';
if (!existsSync(DIR)) envFail('clips 未生成');
let index;
try { index = JSON.parse(readFileSync(join(DIR, 'clips.json'), 'utf8')); }
catch (error) { envFail(`clips.json 不可用：${error.message}`); }
let expected = 47;
try { expected = collectClipSources().size; }
catch (error) { envFail(`动画源不可用：${error.message}`); }
if (!Array.isArray(index) || index.length !== expected) fail(`clip 数 ${index?.length} != ${expected}`);
let totalBytes = 0;
const cssPath = 'app/css/clips.css';
if (!existsSync(cssPath)) fail('缺少 app/css/clips.css');
const css = readFileSync(cssPath, 'utf8');
if (css.length >= 2 * 1024 * 1024) fail(`CSS ${css.length} bytes >= 2MB`);
const rules = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]));
if (rules.size < index.length) fail(`CSS 规则 ${rules.size} 少于 clip 数 ${index.length}`);
for (const entry of index) {
  const path = join(DIR, `${entry.name}.json`);
  if (!existsSync(path)) fail(`缺少 ${path}`);
  const text = readFileSync(path, 'utf8');
  totalBytes += text.length;
  const clip = JSON.parse(text);
  if (clip.name !== entry.name) fail(`${entry.name}: 名称不一致`);
  if (Math.abs(clip.duration - entry.duration) > 1) fail(`${entry.name}: duration 不一致`);
  if (!clip.targets.every(target => target.channels && Object.keys(target.channels).length)) {
    fail(`${entry.name}: 目标没有可播放通道`);
  }
  if (clip.duration > 0 && !rules.has(entry.cssName)) fail(`${entry.name}: 缺少 CSS 规则 ${entry.cssName}`);
  for (const target of clip.targets) {
    for (const name of [target.transformCssName, target.opacityCssName, target.boxCssName, target.artCssName, target.visibilityCssName].filter(Boolean)) {
      if (!rules.has(name)) fail(`${entry.name}: 缺少目标规则 ${name}`);
    }
  }
}
const unbound = JSON.parse(readFileSync('app/data/unbound.json', 'utf8'));
const clipsByName = new Map(index.map(clip => [clip.name, clip]));
const timedUnbound = unbound.filter(entry => (clipsByName.get(entry.clip)?.duration || 0) > 0);
// Zero-duration clips are authored button/toggle snapshots: they have no
// playable timeline and are represented by static node state, not animation.
const boundPaths = index.reduce((sum, clip) => sum + clip.targets.length, 0);
// Manual 11.10 / T8.2: unbound animation paths must stay at or below 3%.
// Runtime-prefab leaves absent from the ten static dumps are still evidence
// gaps in app/data/unbound.json; they do not justify weakening this gate.
const unboundRate = timedUnbound.length / Math.max(1, timedUnbound.length + boundPaths);
if (unboundRate > 0.03) {
  fail(`unbound 比例 ${(100 * unboundRate).toFixed(1)}% > 3%`);
}
if (totalBytes > 2 * 1024 * 1024) fail(`动画数据 ${totalBytes} bytes > 2MB`);
pass(`clips verified: ${index.length} clips, ${rules.size} CSS rules, ${css.length} CSS bytes, ${totalBytes} JSON bytes, unbound=${timedUnbound.length} timed / ${unbound.length} total (${(100 * unboundRate).toFixed(1)}%)`);
