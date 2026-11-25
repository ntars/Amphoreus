import { launch } from './lib/cdp.mjs';
import { pass, fail, envFail } from './lib/gate.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1] ?? '1');
}
const state = args.get('state') || 'entrance';
const url = `http://127.0.0.1:8080/?state=${encodeURIComponent(state)}`;
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
  await browser.navigate(url);
  await new Promise(resolve => setTimeout(resolve, 400));
  const missing = await browser.evaluate("document.querySelectorAll('[data-missing]').length");
  if (errors.length) fail(`${state}: console errors=${errors.length}`);
  if (missing && !args.has('allow-missing')) fail(`${state}: missing assets=${missing}`);
  pass(`${state}: smoke ok (missing=${missing})`);
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
