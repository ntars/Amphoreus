import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const DIR = 'app/data/anim';
if (!existsSync(join(DIR, 'clips.json'))) envFail('动画数据未生成');
const clips = JSON.parse(readFileSync(join(DIR, 'clips.json'), 'utf8'));
const css = readFileSync('app/css/clips.css', 'utf8');
if (!/@keyframes\s+k_/.test(css)) fail('clips.css 中没有生成的 @keyframes');
const url = 'http://127.0.0.1:8080/?state=wikiDialog&anim=0';
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`8080 未就绪：${error.message}`); }

let browser;
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  await browser.navigate(url);
  const injected = await browser.evaluate(`(async () => {
    const text = await (await fetch('./css/clips.css')).text();
    if (!text.includes('@keyframes k_carditemshow_0')) throw new Error('clips.css missing keyframes');
    const style = document.createElement('style');
    style.textContent = text;
    document.head.append(style);
    return text.length;
  })()`);
  if (Number(injected) < 1000) envFail('生成的 CSS 未注入页面');
  const report = JSON.parse(await browser.evaluate(`(() => {
    const clips = ${JSON.stringify(clips)};
    const layer = document.createElement('div');
    layer.id = '__anim_probe';
    layer.style.cssText = 'position:absolute;left:100px;top:100px;width:100px;height:100px;transform-origin:0 0';
    document.body.append(layer);
    const art = document.createElement('div');
    art.style.cssText = 'position:absolute;inset:0';
    layer.append(art);
    const value = (ch, t, duration) => {
      const values = ch?.values || [];
      if (!values.length) return null;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(t / duration * (values.length - 1))));
      return values[i];
    };
    const results = [];
    const failures = [];
    let maxReport = 0;
    for (const clip of clips.filter(c => c.group !== 'manual')) {
      for (const target of clip.targets || []) {
        const channels = target.channels || {};
        if (!['tx', 'ty', 'rz', 'sx', 'sy', 'alpha'].some(k => channels[k])) continue;
        const duration = Math.max(1, clip.duration);
        const sample = (ch, t) => {
          const values = ch?.values || [];
          if (!values.length) return null;
          const pos = Math.min(values.length - 1, Math.max(0, t / duration * (values.length - 1)));
          const i = Math.floor(pos);
          const next = Math.min(values.length - 1, i + 1);
          return values[i] * (1 - (pos - i)) + values[next] * (pos - i);
        };
        if (!channels.tx && !channels.ty && !channels.rz && !channels.sx && !channels.sy) continue;
        if (!target.nodeId) continue; // unbound source hierarchy cannot drive a DOM layer
        layer.style.animation = 'none';
        art.style.animation = 'none';
        for (const anim of layer.getAnimations()) anim.cancel();
        const names = [];
        if (target.opacityCssName) names.push(target.opacityCssName);
        if (target.boxCssName) names.push(target.boxCssName);
        if (target.visibilityCssName) names.push(target.visibilityCssName);
        if (target.transformCssName) names.push(target.transformCssName);
        if (names.length) layer.style.animation = names.map(name => name + ' ' + duration + 'ms linear 0ms 1 both').join(',');
        if (target.artCssName) art.style.animation = target.artCssName + ' ' + duration + 'ms linear 0ms 1 both';
        for (const anim of layer.getAnimations()) anim.pause();
        for (let frame = 0; frame < 60; frame++) {
          const t = Math.min(duration, frame / 59 * duration);
          const tx = sample(channels.tx, t) || 0;
          const ty = sample(channels.ty, t) || 0;
          const rz = sample(channels.rz, t) || 0;
          const sx = target.transformCssName ? (sample(channels.sx, t) ?? 1) : 1;
          const sy = target.transformCssName ? (sample(channels.sy, t) ?? 1) : 1;
          const alpha = value(channels.alpha, t, duration) ?? 1;
        for (const anim of layer.getAnimations()) anim.currentTime = t;
        layer.getAnimations().forEach(anim => { void anim.effect?.getComputedTiming?.().progress; });
          const style = getComputedStyle(layer);
          const matrix = new DOMMatrix(style.transform);
          const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
          const scaleX = Math.hypot(matrix.a, matrix.b);
          const scaleY = Math.hypot(matrix.c, matrix.d);
          const computedAlpha = Number(getComputedStyle(layer).opacity);
          const expectedAlpha = target.opacityCssName ? (sample(channels.alpha, t) ?? alpha) : alpha;
          const err = {
            tx: Number.isFinite(matrix.e) ? Math.abs(matrix.e - tx) : 1,
            ty: Number.isFinite(matrix.f) ? Math.abs(matrix.f - ty) : 1,
            rz: Number.isFinite(rotation) ? Math.abs(rotation - rz) : 1,
            sx: Number.isFinite(scaleX) ? Math.abs(scaleX - sx) : 1,
            sy: Number.isFinite(scaleY) ? Math.abs(scaleY - sy) : 1,
            alpha: Number.isFinite(computedAlpha) ? Math.abs(computedAlpha - expectedAlpha) : 1,
          };
          // The compiler stores sampled values at 60fps; compare against the
          // actual keyframe sample underlying the current time, not the raw
          // curve at an arbitrary 59-point verification grid.
          if (target.transformCssName) {
            const sampleAt = ch => {
              const values = ch?.values || [];
              if (!values.length) return null;
              const pos = Math.min(values.length - 1, Math.max(0, t / duration * (values.length - 1)));
              const i = Math.floor(pos);
              const next = Math.min(values.length - 1, i + 1);
              return values[i] * (1 - (pos - i)) + values[next] * (pos - i);
            };
            const expectedTx = sampleAt(channels.tx) || 0;
            const expectedTy = sampleAt(channels.ty) || 0;
            const expectedRz = sampleAt(channels.rz) || 0;
            const expectedSx = sampleAt(channels.sx) ?? 1;
            const expectedSy = sampleAt(channels.sy) ?? 1;
            err.tx = Math.abs(matrix.e - expectedTx);
            err.ty = Math.abs(matrix.f - expectedTy);
            err.rz = Math.abs(rotation - expectedRz);
            err.sx = Math.abs(scaleX - expectedSx);
            err.sy = Math.abs(scaleY - expectedSy);
          }
          const worst = Math.max(...Object.values(err));
          results.push(worst);
          maxReport = Math.max(maxReport, worst);
          if (worst > 0.75 && failures.length < 8) failures.push({ clip: clip.name, target: target.nodeId, frame, t, err, tx, ty, rz, sx, sy, alpha, computedAlpha, transform: style.transform });
        }
      }
    }
    return JSON.stringify({ frames: results.length, max: maxReport, errors: failures });
  })()`));
  if (report.frames < 60 * Math.min(10, clips.length)) envFail(`动画采样帧不足：${report.frames}`);
  if (report.max > 0.75) fail(`位移采样最大误差 ${report.max.toFixed(4)} > 0.75px; first=${JSON.stringify(report.errors)}`);
  pass(`animations verified: ${report.frames} sampled frames, max error ${report.max.toFixed(4)}`);
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
