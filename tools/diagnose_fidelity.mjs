// Read-only runtime diagnosis: reports rendering structure without capturing
// or storing screenshots. All outputs are textual and source-addressable.
import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';
import { launch } from './lib/cdp.mjs';

const base = process.env.AMPH_DIAG_BASE || 'http://127.0.0.1:8080';
const fidelityThreshold = Number(process.env.AMPH_FIDELITY_THRESHOLD || 1.0);
const effectiveThreshold = Number(process.env.AMPH_EFFECTIVE_THRESHOLD || 1.0);
const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk', 'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
try {
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) { envFail(`${base} 未就绪：${error.message}`); }

let browser;
const errors = [];
const report = {};
const renderProblems = [];
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  browser.on('Runtime.exceptionThrown', () => errors.push('exception'));
  browser.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console'); });
  for (const state of states) {
    await browser.navigate(`${base}/?state=${state}&anim=0`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const text = await browser.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('#stage .node')];
      const active = nodes.filter(el => el.style.display !== 'none');
      const art = active.filter(el => el.querySelector('.art'));
      const img = active.filter(el => el.querySelector('.art img'));
      const text = active.filter(el => el.querySelector('.text'));
      const missing = active.filter(el => el.querySelector('.art [data-missing],.art [data-missing-font]'));
      const effectivelyVisible = active.filter(el => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const w = parseFloat(el.style.width) || 0;
        const h = parseFloat(el.style.height) || 0;
        if (w === 0 || h === 0) return true; // zero-sized authored nodes are valid
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const painted = effectivelyVisible.filter(el => {
        if (el.querySelector('.text')) return true;
        const s = getComputedStyle(el.querySelector('.art'));
        return s.backgroundImage !== 'none' || s.maskImage !== 'none' || s.webkitMaskImage !== 'none'
          || s.borderImageSource !== 'none' || s.backgroundColor !== 'rgba(0, 0, 0, 0)';
      });
      const hidden = nodes.filter(el => el.style.display === 'none');
      const zero = active.filter(el => { const r = el.getBoundingClientRect(); return r.width < 1 || r.height < 1; });
      const rect = el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
      return JSON.stringify({
        active: active.length, hidden: hidden.length, art: art.length,
        painted: painted.length, effectivelyVisible: effectivelyVisible.length,
        images: img.length, texts: text.length, zeroSize: zero.length, missing: missing.length,
        sample: active.slice(0, 8).map(el => ({ path: el.dataset.path, box: rect(el), art: !!el.querySelector('.art'), img: !!el.querySelector('.art img'), text: el.querySelector('.text')?.textContent?.slice(0, 24) || '' })),
      });
    })()`);
    report[state] = JSON.parse(text);
    const source = JSON.parse(readFileSync(`app/data/states/${state}.json`, 'utf8'));
    const byId = new Map(source.nodes.map(node => [node.id, node]));
    const blocked = new Set();
    for (const node of source.nodes) {
      if (!node.active) continue;
      if (node.scale?.some(value => value === 0)) blocked.add(node.id);
      const parent = byId.get(node.parent);
      if (parent && !parent.active) blocked.add(node.id);
    }
    for (const node of source.nodes) {
      let cursor = node;
      while (cursor?.parent && !blocked.has(cursor.id)) cursor = byId.get(cursor.parent);
      if (cursor?.parent && blocked.has(cursor.id)) blocked.add(node.id);
      if (!node.depth) continue;
      let ancestor = byId.get(node.parent);
      while (ancestor) {
        if (ancestor.mask && node.box && ancestor.box) {
          const childCenter = [node.box.l + node.box.w / 2, node.box.t + node.box.h / 2];
          const [l, t, w, h] = [ancestor.box.l, ancestor.box.t, ancestor.box.w, ancestor.box.h];
          if (childCenter[0] < l || childCenter[0] > l + w || childCenter[1] < t || childCenter[1] > t + h) {
            blocked.add(node.id);
            break;
          }
        }
        ancestor = byId.get(ancestor.parent);
      }
    }
    const expectedPainted = source.nodes.filter(node => node.active && (node.img || node.text)).length;
    const paintedRatio = expectedPainted ? report[state].painted / expectedPainted : 1;
    if (paintedRatio < fidelityThreshold) {
      renderProblems.push(`${state}: painted ${report[state].painted}/${expectedPainted} (${paintedRatio.toFixed(3)} < ${fidelityThreshold})`);
    }
    const expectedVisible = source.nodes.filter(node => node.active).length - blocked.size;
    const visibleRatio = expectedVisible ? report[state].effectivelyVisible / expectedVisible : 1;
    if (visibleRatio < effectiveThreshold) {
      renderProblems.push(`${state}: effectively visible ${report[state].effectivelyVisible}/${expectedVisible} (${visibleRatio.toFixed(3)} < ${effectiveThreshold}), ${blocked.size} active nodes under inactive parents`);
    }
    if (report[state].missing) renderProblems.push(`${state}: missing resources ${report[state].missing}`);
  }
} catch (error) {
  envFail(`CDP 失败：${error.message}`);
} finally {
  if (browser) await browser.close();
}
console.log(JSON.stringify({ errors, report }, null, 2));
if (errors.length) fail(`浏览器运行错误：${errors.join(', ')}`);
if (renderProblems.length) fail(`渲染覆盖率不足：${renderProblems.join('; ')}`);
pass(`runtime diagnosis collected for 10 states; effective visibility and painted coverage >= ${fidelityThreshold}`);
