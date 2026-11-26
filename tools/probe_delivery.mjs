// Manual 15 maturity checks 9/10: every P0 state opens directly and optional
// WebGL/font failures remain visible with human-readable fallbacks.
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
const base = 'http://127.0.0.1:8080/';
const alreadyServing = await fetch(base, { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));
try {
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }
let browser;
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  const opened = [];
  for (const state of states) {
    await browser.navigate(`${base}?state=${state}&anim=0`);
    await new Promise(resolve => setTimeout(resolve, 120));
    const nodes = await browser.evaluate(`document.querySelectorAll('#stage .node').length`);
    const param = await browser.evaluate(`new URL(location.href).searchParams.get('state')`);
    if (!nodes || param !== state) fail(`state ${state} not directly openable: nodes=${nodes}, param=${param}`);
    opened.push(state);
  }

  // The fallback notice belongs to a fx=gl document; revisit one before testing.
  await browser.navigate(`${base}?state=wikiError&fx=gl&anim=0`);
  await new Promise(resolve => setTimeout(resolve, 150));
  const fallback = await browser.evaluate(`(async () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const { mountFx } = await import('./js/fx.js');
    const stage = document.getElementById('stage');
    await mountFx(stage, { state: 'wikiError', canvas: { refW: 1920, refH: 1080 } }, { sprites: {} });
    return document.querySelector('.fx-fallback')?.textContent || '';
  })()`);
  if (!fallback.includes('WebGL 不可用')) fail(`WebGL fallback not visible: ${fallback}`);

  // Missing font data must be surfaced as data-missingFont, never a blank node.
  const missingFont = await browser.evaluate(`(async () => {
    const { applyText } = await import('./js/text.js');
    const el = document.createElement('div');
    applyText(el, { text: { font: '__missing__', size: 12, color: [1,1,1,1], raw: '字' } }, { fonts: {} });
    return !!el.querySelector('[data-missing-font]');
  })()`);
  if (!missingFont) fail('missing font fallback not visible');
  pass(`delivery probe ok: states=${opened.length}/10, webglFallback, fontFallback`);
} catch (error) { envFail(`CDP 失败：${error.message}`); }
finally { if (browser) await browser.close(); server?.kill('SIGKILL'); }
