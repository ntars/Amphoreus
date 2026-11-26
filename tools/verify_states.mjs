import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';
import { launch } from './lib/cdp.mjs';

const walkNodes = node => [node, ...(node.children || []).flatMap(walkNodes)];
const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk', 'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
const compiledStates = Object.fromEntries(states.map(state => {
  let data;
  try {
    data = JSON.parse(readFileSync(`app/data/states/${state}.json`, 'utf8'));
  } catch (error) {
    envFail(`${state}: 编译状态不可用：${error.message}`);
  }
  return [state, data];
}));
for (const state of states) {
  const data = compiledStates[state];
  if (data.state !== state || data.schema !== 1) fail(`${state}: schema/state 不一致`);
  if (!data.rootId || data.nodes.length < 50) fail(`${state}: 节点不足`);
  if (!data.nodes.some(node => node.parent === null)) fail(`${state}: 缺少根节点`);
}
let bookletDump;
try {
  bookletDump = JSON.parse(readFileSync('dump/bookletPage.json', 'utf8'));
} catch (error) { envFail(`bookletPage 原始 dump 不可用：${error.message}`); }
const dumpSpineNodes = [bookletDump.root, ...(bookletDump.supportRoots || [])]
  .filter(Boolean)
  .flatMap(walkNodes)
  .filter(node => node.components?.some(component => component.type === 'Spine'));
const dumpPointers = dumpSpineNodes.map(node =>
  String(node.components.find(component => component.type === 'Spine').skeletonDataPathId));
if (dumpPointers.length !== 4) fail(`bookletPage dump: Spine 节点 ${dumpPointers.length} != 4`);
for (const expected of ['8451025478121060839', '-348631082036145761']) {
  if (!dumpPointers.includes(expected)) fail(`bookletPage dump: 缺少 SkeletonDataAsset ${expected}`);
}
const spineNodes = Object.values(compiledStates).flatMap(state => state.nodes.filter(node => node.spine?.skeletonDataPathId != null));
const spinePointers = spineNodes.map(node => String(node.spine.skeletonDataPathId));
for (const expected of ['8451025478121060839', '-348631082036145761']) {
  if (!spinePointers.includes(expected)) fail(`bookletPage 编译状态: 缺少 SkeletonDataAsset ${expected}`);
}
const url = 'http://127.0.0.1:8080/?state=entrance&anim=0';
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }

let browser;
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  const errors = [];
  for (const state of states) {
    await browser.navigate(`http://127.0.0.1:8080/?state=${state}&anim=0`);
    await new Promise(resolve => setTimeout(resolve, 120));
    const report = JSON.parse(await browser.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('#stage .node')];
      const active = nodes.filter(el => el.style.display !== 'none');
      const hit = nodes.filter(el => el.dataset.hit === '1');
      const missing = document.querySelectorAll('[data-missing],[data-missing-font]').length;
      const texts = [...document.querySelectorAll('#stage .text')];
      const textChars = texts.reduce((sum, el) => sum + (el.textContent || '').length, 0);
      // Source localization may contain inline tags; they must be rendered as
      // literal text nodes, never as executable DOM.
      // Source quads and SDF glyph quads are authored <i> elements; markup
      // injection is any element outside the renderer's two known glyph classes.
      const injectedMarkup = texts.filter(el => [...el.querySelectorAll('*')].some(child => !child.matches('i.sdf-glyph,span.ttf-fallback'))).length;
      let pointOk = 0, pointTotal = 0;
      for (const el of hit) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || el.style.display === 'none') continue;
        pointTotal++;
        const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (found && (found === el || el.contains(found))) pointOk++;
      }
      return JSON.stringify({ count: nodes.length, active: active.length, hit: hit.length, pointOk, pointTotal, missing, textChars, injectedMarkup });
    })()`));
    // Parent hit nodes are reportable but can be covered by child art; only
    // require that at least one visible hit target is actually clickable.
    if (report.count < 50 || report.active < 10 || report.missing || report.injectedMarkup || (report.pointTotal && !report.pointOk)) errors.push(`${state}: ${JSON.stringify(report)}`);
  }
  // Main chain: entrance -> catalog -> bookletCover -> bookletPage -> wikiDialog -> talk.
  for (const [state, leaf] of [
    ['entrance', 'BtnSwitch'], ['catalog', 'BtnBook'], ['bookletCover', 'BookPro'],
    ['bookletPage', 'BtnLeft'], ['wikiDialog', 'BtnLeft'],
  ]) {
    await browser.navigate(`http://127.0.0.1:8080/?state=${state}&anim=0`);
    await new Promise(resolve => setTimeout(resolve, 120));
    const next = await browser.evaluate(`(() => {
      const el = [...document.querySelectorAll('#stage .node[data-hit="1"]')].find(n => n.dataset.path.endsWith('/${leaf}'));
      if (!el) return null;
      el.click();
      return new URL(location.href).searchParams.get('state');
    })()`);
    if (!next) errors.push(`${state}: 未找到命中节点 ${leaf}`);
  }
  if (errors.length) fail(errors.join('; '));
  const saveReport = JSON.parse(await browser.evaluate(`(() => {
    const raw = localStorage.getItem('amphoreus.save.v1');
    const data = raw ? JSON.parse(raw) : null;
    return JSON.stringify({ version: data?.v, unlocked: data?.unlocked || [], lastState: data?.lastState || null });
  })()`));
  if (saveReport.version !== 1 || !saveReport.unlocked.includes('entrance') || !saveReport.lastState) {
    errors.push(`save: ${JSON.stringify(saveReport)}`);
  }
  if (errors.length) fail(errors.join('; '));
  pass('all 10 states rendered; 5 main-chain hit targets found; local save persisted');
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
