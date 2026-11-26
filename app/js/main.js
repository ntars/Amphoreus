import { createStage } from './stage.js';
import { renderState } from './render.js';
import { mountAnimations } from './anim.js';
import { load as loadSave, save as saveState } from './save.js';
import { STATES, navigate, eventForNode } from './fsm.js';
import { loadAssets, loadState } from './loader.js';
import { mountButtonStates } from './input.js';
import { mountFx } from './fx.js';

const params = new URLSearchParams(location.search);
const states = STATES;
let currentState = null;
const app = document.getElementById('app');

async function boot(override) {
  const stateId = override || params.get('state') || 'entrance';
  if (!states.includes(stateId)) { app.textContent = `未知状态：${stateId}`; return; }
  try {
    const [assets, state] = await Promise.all([loadAssets(), loadState(stateId)]);
    const only = params.get('only');
    const freezeAt = params.has('freeze') ? Number(params.get('freeze')) : params.has('t') ? Number(params.get('t')) : null;
    const stage = document.createElement('div');
    stage.id = 'stage';
    app.replaceChildren(stage);
    const stageApi = createStage(stage, state.canvas);
    const flip = stateId === 'bookletPage' && params.get('flip') === '1';
    const els = await renderState(stage, state, assets, { freezeAt, flip });
    mountButtonStates(stage, state.nodes);
    mountFx(stage, state, assets).catch(error => console.error(`FX: ${error.message}`));
    if (stateId === 'bookletPage') {
      stage.dataset.bookletPage = '1';
      // UI_TaroBook_Page(Spine 4.1.24).FadeIn is 1.333333 s in the unpacked
      // .skel.asset; the CSS-3D fallback must use that authored duration.
      const duration = Number(new URL(location.href).searchParams.get('flipMs')) || 1333.333;
      stage.style.setProperty('--page-duration', `${duration}ms`);
      if (new URL(location.href).searchParams.get('flip') === '1') {
        stage.dataset.flip = '1';
      }
    }
    currentState = stateId;
    const saved = loadSave();
    saveState({ unlocked: [...new Set([...(saved.unlocked || []), stateId])], lastState: stateId });
    if (only) {
      for (const el of els) {
        if (el.dataset.id === only || el.dataset.path === only) continue;
        el.style.opacity = '0.12';
      }
    }
    for (const el of els) {
      if (!el.dataset.hit) continue;
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => {
        const event = eventForNode(el, currentState);
        if (!event) return;
        const to = navigate(currentState, event);
        if (to !== currentState) boot(to);
      });
    }
    if (!globalThis.__amphEscHook) {
      globalThis.__amphEscHook = true;
      window.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const to = navigate(currentState, 'esc');
        if (to !== currentState) boot(to);
      });
    }
    if (params.get('anim') !== '0') {
      const animations = mountAnimations(els, state);
      if (freezeAt != null) {
        animations.then(() => {
          for (const el of els) {
            for (const layer of [el, el.querySelector(':scope > .a'), el.querySelector(':scope > .a > .art')].filter(Boolean)) {
              for (const animation of layer.getAnimations()) {
                animation.pause();
                animation.currentTime = Math.max(0, freezeAt * 1000);
              }
            }
          }
        }).catch(() => {});
      } else animations.catch(() => {});
    }
    window.addEventListener('popstate', () => boot(new URL(location.href).searchParams.get('state')));
    if (params.get('debug') === '1') {
      document.body.classList.add('debug');
      const debug = document.createElement('div');
      debug.id = 'debug';
      debug.textContent = `${stateId} · ${state.nodes.length} nodes · scale ${stageApi.getScale().toFixed(3)}`;
      document.body.append(debug);
    }
    if (params.get('perf') === '1') {
      const perf = document.createElement('div');
      perf.id = 'perf';
      window.__amphPerf = { frames: [], last: performance.now() };
      const tick = now => {
        const meter = window.__amphPerf;
        if (!meter) return;
        meter.frames.push(now - meter.last);
        meter.last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      perf.textContent = 'perf';
      document.body.append(perf);
    }
  } catch (error) {
    app.textContent = `加载失败：${error.message}`;
  }
}
boot();

window.__amphoreusDebug = {
  getStage: () => document.getElementById('stage'),
};
