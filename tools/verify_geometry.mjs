import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { launch } from './lib/cdp.mjs';
import { pass, fail, envFail } from './lib/gate.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1]?.startsWith('--') ? '1' : process.argv[i + 1] ?? '1');
}
const strict = args.has('strict');
const allStates = ['entrance','catalog','bookletCover','bookletPage','talk','wikiDialog','wikiError','mail','star','reward'];
const state = args.get('state') || 'wikiDialog';
if (process.argv.includes('--all') && process.argv[1] && process.argv[1].endsWith('verify_geometry.mjs')) {
  // WBS compatibility: verify the whole state set through the same check.
  let failedStates = 0;
  for (const item of allStates) {
    const result = spawnSync(process.execPath, [process.argv[1], '--state', item, ...(strict ? ['--strict'] : [])], { stdio: 'inherit' });
    if (result.status !== 0) failedStates++;
  }
  if (failedStates) fail(`${failedStates} geometry state(s) failed`);
  pass('all 10 states geometry ok');
}
const url = `http://127.0.0.1:8080/?state=${encodeURIComponent(state)}&anim=0`;
let dump;
try { dump = JSON.parse(readFileSync(join('dump', `${state}.json`), 'utf8')); }
catch (error) { envFail(`dump 不可用：${error.message}`); }
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }

let browser;
try {
  browser = await launch();
  process.on('exit', () => { try { browser?.close(); } catch {} });
  await browser.setViewport(1920, 1080, 1);
  await browser.navigate(url);
  await new Promise(resolve => setTimeout(resolve, 500));
  const report = JSON.parse(await browser.evaluate(`(() => {
    const st = document.getElementById('stage');
    if (!st) return JSON.stringify({ error: 'stage missing' });
    const scale = Number(st.dataset.scale || 1);
    const nodes = [...st.querySelectorAll('.node')];
    const dims = nodes.map(el => [parseFloat(el.style.width) || 0, parseFloat(el.style.height) || 0]);
    const boxes = nodes.map(el => el.getBoundingClientRect ? [el.getBoundingClientRect().left, el.getBoundingClientRect().top, el.getBoundingClientRect().right, el.getBoundingClientRect().bottom] : []);
    const missing = document.querySelectorAll('[data-missing]').length;
    return JSON.stringify({ scale, count: nodes.length, dims, boxes, missing, body: document.body.scrollWidth });
  })()`));
  if (report.error) fail(report.error);
  const targets = [];
  const visit = (node, shown = true) => { const visible = shown && node.active !== false; targets.push({ ...node, visible }); for (const child of node.children || []) visit(child, visible); };
  visit(dump.root);
  if (report.count !== targets.length) fail(`${state}: DOM nodes ${report.count} != dump ${targets.length}`);
  let maxSize = 0, maxAabb = 0, maxAabbActive = 0, aabbFailures = 0;
  const problems = [];
  targets.forEach((node, i) => {
    const [w, h] = report.dims[i] || [0, 0];
    const size = node.rt?.size || [0, 0];
    const wantW = Math.abs(size[0]), wantH = Math.abs(size[1]);
    if (Math.max(Math.abs(w - wantW), Math.abs(h - wantH)) > 0.75 && problems.length < 5) problems.push([i, node.path, w, h, wantW, wantH]);
    maxSize = Math.max(maxSize, Math.abs(w - wantW), Math.abs(h - wantH));
    const expected = node.stage?.aabb || [];
    const actual = report.boxes[i] || [];
  const isEmptyTransform = !node.components?.some(c =>
    ['Image', 'Graphic', 'RawImage', 'Text', 'Mask', 'CanvasGroup'].includes(c.type));
  if (expected.length === 4 && actual.length === 4 && node.visible && !isEmptyTransform) {
      const err = Math.max(...actual.map((v, k) => Math.abs(v - expected[k])));
      if (err > 1 && problems.length < 8) problems.push([i, node.path, actual, expected]);
      maxAabb = Math.max(maxAabb, err);
      if (node.visible && node.active !== false) {
        maxAabbActive = Math.max(maxAabbActive, err);
        if (err > 1) aabbFailures++;
      }
    }
  });
  if (maxSize > 0.75) fail(`${state}: DOM size error ${maxSize.toFixed(2)}px > 0.75px; examples ${JSON.stringify(problems)}`);
  if (maxAabb > 1 && !strict) console.warn(`WARN ${state}: DOM AABB error ${maxAabb.toFixed(2)}px > 1px; examples ${JSON.stringify(problems.slice(0, 3))}`);
  if (report.missing) fail(`${state}: missing assets=${report.missing}`);
  if (report.body !== 1920) fail(`${state}: body scrollWidth=${report.body}`);
  if (strict && aabbFailures) {
    fail(`${state}: active AABB ${aabbFailures} nodes exceed 1px, max=${maxAabbActive.toFixed(2)}px; examples ${JSON.stringify(problems.slice(0, 3))}`);
  }
  pass(`${state}: browser geometry ok, nodes=${report.count}, maxSize=${maxSize.toFixed(2)}px, maxAabb=${maxAabb.toFixed(2)}px, active=${maxAabbActive.toFixed(2)}px`);
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
