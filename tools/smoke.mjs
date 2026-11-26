import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { pass, fail, envFail } from './lib/gate.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1] ?? '1');
}
const state = args.get('state') || 'entrance';
const url = `http://127.0.0.1:8080/?state=${encodeURIComponent(state)}`;
const alreadyServing = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));
const perfMode = args.has('perf');
let browser;
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) {
  envFail(`8080 未就绪：${error.message}`);
}
try {
  browser = await launch();
  const errors = [];
  browser.on('Runtime.exceptionThrown', () => errors.push('exception'));
  browser.on('Runtime.consoleAPICalled', params => {
    if (params.type === 'error') errors.push('console');
  });
  await browser.setViewport(1920, 1080, 1);
  const fxMode = args.get('fx');
  await browser.navigate(perfMode ? `${url}&perf=1` : fxMode ? `${url}&fx=${encodeURIComponent(fxMode)}&freeze=1` : url);
  await new Promise(resolve => setTimeout(resolve, 400));
  if (perfMode) {
    const metrics = JSON.parse(await browser.evaluate(`(() => {
      const frames = (globalThis.__amphPerf?.frames || []).slice(-120).filter(v => v > 0).sort((a,b)=>a-b);
      const p95 = frames.length ? frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))] : Infinity;
      return JSON.stringify({ frames: frames.length, p95, fps: Math.round(1000 / Math.max(1, Number.isFinite(p95) ? p95 : 16.7)) });
    })()`));
    if (!Number.isFinite(metrics.p95) || metrics.p95 > 20) fail(`${state}: perf p95 ${metrics.p95}ms > 20ms`);
    pass(`${state}: smoke perf ok (${metrics.fps}fps, p95=${metrics.p95.toFixed(2)}ms)`);
  } else {
    const missing = await browser.evaluate("document.querySelectorAll('[data-missing]').length");
    const boxes = await browser.evaluate(`(() => { var st=document.getElementById('stage'); if(!st) return JSON.stringify({err:'no stage'}); var r=st.getBoundingClientRect(); return JSON.stringify({w:r.width,h:r.height,body:document.body.scrollWidth}); })()`);
    const nav = await browser.evaluate(`(() => { var el=document.querySelector('[data-hit]'); if(!el) return 'no-hit'; el.click(); return new Promise(resolve => setTimeout(() => resolve(location.search), 150)); })()`);
    if (nav === 'no-hit') console.warn(`WARN ${state}: no hit target for navigation smoke`);
    const size = JSON.parse(boxes);
    if (Math.abs(size.w - 1920) > 1 || Math.abs(size.h - 1080) > 1) fail(`${state}: stage geometry ${boxes}`);
    if (errors.length) fail(`${state}: console errors=${errors.length}`);
    if (missing && !args.has('allow-missing')) fail(`${state}: missing assets=${missing}`);
    const fxReport = fxMode ? JSON.parse(await browser.evaluate(`(() => JSON.stringify({ canvas: !!document.querySelector('.fx-layer'), fallback: document.querySelector('.fx-fallback')?.textContent || null }))()`)) : null;
    if (fxMode === 'gl' && (!fxReport?.canvas || fxReport.fallback)) fail(`${state}: WebGL layer unavailable ${JSON.stringify(fxReport)}`);
    pass(`${state}: smoke ok (missing=${missing}${fxReport ? `,fx=${JSON.stringify(fxReport)}` : ''})`);
  }
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
