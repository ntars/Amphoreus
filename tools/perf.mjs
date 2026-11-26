import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const state = process.argv.find(arg => arg.startsWith('--state='))?.slice(8) || 'catalog';
const baselinePath = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11) || 'docs/BASELINE.md';
const mobile = process.argv.includes('--mobile');
const viewport = mobile ? { width: 1280, height: 720, dpr: 1 } : { width: 1920, height: 1080, dpr: 1 };
const url = `http://127.0.0.1:8080/?state=${encodeURIComponent(state)}&anim=1`;
const alreadyServing = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }
if (!existsSync(baselinePath)) envFail(`缺少性能基线：${baselinePath}`);
let browser;
try {
  browser = await launch();
  await browser.setViewport(viewport.width, viewport.height, viewport.dpr);
  await browser.navigate(url);
  const metrics = JSON.parse(await browser.evaluate(`(async () => {
    const interactiveAt = performance.getEntriesByType('navigation')[0]?.domInteractive || performance.now();
    const longTasks = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); })
      .observe({ entryTypes: ['longtask'] });
    const frames = [];
    let last = performance.now();
    const start = last;
    await new Promise(resolve => {
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (now - start < 3000) requestAnimationFrame(tick); else resolve();
      };
      const start = performance.now();
      requestAnimationFrame(tick);
    });
    const intervals = frames.slice(1).sort((a, b) => a - b);
    const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))] || 16.7;
    return JSON.stringify({
      interactiveMs: interactiveAt,
      fps: Math.round(1000 / p95),
      p95Ms: p95,
      domNodes: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      longTasks: longTasks.length,
      longTaskMaxMs: longTasks.length ? Math.max(...longTasks) : 0,
    });
  })()`));
  const baselineText = readFileSync(baselinePath, 'utf8');
  const baselineFps = Number((baselineText.match(/≥\s*(\d+)\s*fps/) || [])[1] || 58);
  const baselineDom = Number((baselineText.match(/DOM\s*≤\s*(\d+)/i) || [])[1] || 6000);
  const baselineInteractive = Number((baselineText.match(/首屏可交互\s*≤\s*([\d.]+)\s*s/i) || [])[1] || 1.5) * 1000;
  const baselineHeap = Number((baselineText.match(/堆内存\s*≤\s*(\d+)\s*MB/i) || [])[1] || 300);
  if (metrics.domNodes > 6000) fail(`DOM 节点 ${metrics.domNodes} > 6000`);
  if (metrics.domNodes > baselineDom) fail(`DOM 节点 ${metrics.domNodes} > 基线 ${baselineDom}`);
  if (metrics.fps < baselineFps) fail(`帧率 ${metrics.fps} < 基线 ${baselineFps}fps`);
  if (metrics.longTasks > 0) fail(`长任务 ${metrics.longTasks} > 0`);
  if (metrics.interactiveMs > baselineInteractive) fail(`首屏可交互 ${metrics.interactiveMs.toFixed(0)}ms > ${baselineInteractive.toFixed(0)}ms`);
  if (metrics.heapMB != null && metrics.heapMB > baselineHeap) fail(`堆内存 ${metrics.heapMB}MB > ${baselineHeap}MB`);
  pass(`perf ${state} ${viewport.width}x${viewport.height}@${viewport.dpr}: interactive=${metrics.interactiveMs.toFixed(0)}ms, fps=${metrics.fps}, p95=${metrics.p95Ms.toFixed(2)}ms, dom=${metrics.domNodes}, heap=${metrics.heapMB ?? 'n/a'}MB, longTasks=${metrics.longTasks}`);
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
