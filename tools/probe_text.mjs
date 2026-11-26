// What: verifies the manual 10.5 path-2 SDF glyph renderer using source font
// metrics and glyph rectangles, plus the explicit TTF fallback.
// Why smoke is insufficient: smoke only proves that a text node is non-empty;
// it cannot catch wrong atlas UVs, mask scaling, or silent SDF activation.
// Baseline: RPG_CN_SDF_TarotBook_300 '之' glyph index 1361, 58.9531x55.0938,
// bearing (2.1719,52.7969), advance 64, atlas rect (703,2,60,56).
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const base = 'http://127.0.0.1:8080/?state=catalog&anim=0';
const alreadyServing = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
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
  await browser.navigate(base);
  await new Promise(resolve => setTimeout(resolve, 150));
  const report = JSON.parse(await browser.evaluate(`(async () => {
    const { applyText } = await import('./js/text.js');
    const { loadAssets } = await import('./js/loader.js');
    const assets = await loadAssets();
    const host = document.createElement('div');
    const node = {
      box: { w: 100, h: 100 },
      text: {
        raw: '之', sdfFont: 'RPG_CN_SDF_TarotBook_300', size: 52,
        charSpacing: 0, color: [1, 1, 1, 1], alignment: 'middleCenter',
      },
    };
    applyText(host, node, assets);
    const glyph = host.querySelector('i.sdf-glyph');
    const style = glyph?.style;
    const expected = {
      left: 2.1719, top: 85.89 - 52.7969 - 55.0938,
      width: 58.9531, height: 55.0938,
      maskSize: (1024 / 60 * 100) + '% ' + (1024 / 56 * 100) + '%',
      maskPosition: (703 / (1024 - 60) * 100) + '% ' + ((1024 - 2 - 56) / (1024 - 56) * 100) + '%',
    };
    return JSON.stringify({
      renderer: host.querySelector('.text')?.dataset.renderer || null,
      glyphs: host.querySelectorAll('i.sdf-glyph').length,
      style: style && {
        left: parseFloat(style.left), top: parseFloat(style.top),
        width: parseFloat(style.width), height: parseFloat(style.height),
        maskSize: style.maskSize, maskPosition: style.maskPosition,
        maskImage: style.maskImage,
      },
      expected,
      fallback: (() => {
        const fallbackHost = document.createElement('div');
        applyText(fallbackHost, { box: { w: 100, h: 20 }, text: { raw: '之', size: 20, color: [1,1,1,1] } }, assets);
        return fallbackHost.querySelector('.text')?.dataset.renderer || null;
      })(),
    });
  })()`));
  if (report.renderer !== 'sdf' || report.glyphs !== 1) fail(`SDF renderer not activated: ${JSON.stringify(report)}`);
  for (const key of ['left', 'top', 'width', 'height']) {
    if (Math.abs(report.style[key] - report.expected[key]) > 0.01) fail(`${key}: expected ${report.expected[key]}, got ${report.style[key]}`);
  }
  const pair = value => String(value).split(/\s+/).map(parseFloat);
  for (const key of ['maskSize', 'maskPosition']) {
    const got = pair(report.style[key]); const want = pair(report.expected[key]);
    if (got.length !== 2 || want.some((value, i) => Math.abs(value - got[i]) > 0.01)) fail(`${key}: expected ${report.expected[key]}, got ${report.style[key]}`);
  }
  if (!report.style.maskImage.includes('RPG_CN_SDF_TarotBook_300_Atlas.png')) fail(`mask source: ${report.style.maskImage}`);
  if (report.fallback !== 'ttf') fail(`unbound text must use TTF fallback, got ${report.fallback}`);
  pass(`text probe ok: sdf-glyph=1, ttfFallback, mask=source-atlas`);
} catch (error) { envFail(`CDP 失败：${error.message}`); }
finally { if (browser) await browser.close(); server?.kill('SIGKILL'); }
