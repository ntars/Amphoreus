// Manual 17.15 E3 support: automate non-visual parts of the resolution/DPR
// matrix. Screenshots remain human-only and never enter app/.
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const base = 'http://127.0.0.1:8080/?state=entrance&anim=0';
const alreadyServing = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));
try {
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }
const cases = [
  [1920, 1080, 1], [1280, 720, 1], [2560, 1440, 1], [1707, 960, 1.5],
];
let errors = 0;
let browser;
try {
  browser = await launch();
  for (const [width, height, dpr] of cases) {
    await browser.setViewport(width, height, dpr);
    await browser.navigate(base);
    await new Promise(resolve => setTimeout(resolve, 150));
    const report = JSON.parse(await browser.evaluate(`(() => {
      const stage = document.getElementById('stage');
      if (!stage) return JSON.stringify({ error: 'no stage' });
      const r = stage.getBoundingClientRect();
      const scale = Number(stage.dataset.scale || 1);
      return JSON.stringify({ w: r.width, h: r.height, scale, missing: document.querySelectorAll('[data-missing]').length });
    })()`));
    const expectedW = Math.min(width, 1920 * report.scale);
    const expectedH = Math.min(height, 1080 * report.scale);
    if (report.error || Math.abs(report.w - expectedW) > 2 || Math.abs(report.h - expectedH) > 2 || report.missing) {
      console.error(`FAIL ${width}x${height}@${dpr}: ${JSON.stringify(report)}`);
      errors++;
    }
  }
} catch (error) { envFail(`CDP 失败：${error.message}`); }
finally { if (browser) await browser.close(); server?.kill('SIGKILL'); }
if (errors) fail(`${errors}/${cases.length} viewport cases failed`);
pass(`viewport matrix ok: ${cases.length}/${cases.length}`);
