// Manual 17.16 probe layer: verify that source-derived interactions and
// animations actually occur in the live DOM. No screenshots are produced.
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const base = 'http://127.0.0.1:8080/';
const alreadyServing = await fetch(base, { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));
let browser;
try {
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) {
  envFail(`8080 未就绪：${error.message}`);
}
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  const errors = [];
  browser.on('Runtime.exceptionThrown', () => errors.push('exception'));
  browser.on('Runtime.consoleAPICalled', params => { if (params.type === 'error') errors.push('console'); });

  // Entrance animation: at least one authored onEnter clip must bind a real
  // CSS animation with a positive duration.
  await browser.navigate(`${base}?state=entrance`);
  await new Promise(resolve => setTimeout(resolve, 700));
  const animation = JSON.parse(await browser.evaluate(`(() => {
    const layers = [...document.querySelectorAll('#stage .node, #stage .node > .a, #stage .node > .a > .art')];
    const active = layers.flatMap(el => el.getAnimations()).filter(anim => anim.effect?.getTiming?.().duration > 0);
    return JSON.stringify({ clips: document.querySelectorAll('[data-clip]').length, active: active.length });
  })()`));
  if (!animation.clips || !animation.active) fail(`entrance animation not mounted: ${JSON.stringify(animation)}`);

  // Navigation: choose a hit target whose source-derived event maps to a
  // different state; verify history/state and a freshly rendered stage.
  await browser.navigate(`${base}?state=catalog`);
  await new Promise(resolve => setTimeout(resolve, 400));
  const nav = await browser.evaluate(`(async () => {
    const targets = [...document.querySelectorAll('[data-hit="1"]')];
    for (const el of targets) {
      const leaf = (el.dataset.path || '').split('/').at(-1) || '';
      if (!/Mail|Star|Reward|Quest|Book|Paper/i.test(leaf)) continue;
      el.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      return new URL(location.href).searchParams.get('state');
    }
    return null;
  })()`);
  if (!nav || nav === 'catalog') fail(`catalog navigation did not change state: ${nav}`);
  const rendered = await browser.evaluate(`document.querySelectorAll('#stage .node').length`);
  if (!rendered) fail('navigated state rendered no nodes');

  // Escape returns to the source-defined catalog parent.
  await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const afterEsc = await browser.evaluate(`new URL(location.href).searchParams.get('state')`);
  if (afterEsc !== 'catalog') fail(`escape did not return to catalog: ${afterEsc}`);
  if (errors.length) fail(`console/exception errors=${errors.length}`);
  pass(`interaction probe ok: clips=${animation.clips}, activeAnimations=${animation.active}, nav=${nav}, esc=${afterEsc}`);
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
  server?.kill('SIGKILL');
}
