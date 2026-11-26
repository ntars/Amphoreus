// Animation runtime: compiled clips drive generated CSS keyframes on the
// manual's three-layer node structure (.n > .a > .art).
const cache = new Map();

async function loadClip(name) {
  if (cache.has(name)) return cache.get(name);
  const response = await fetch(`./data/anim/${encodeURIComponent(name)}.json`);
  if (!response.ok) throw new Error(`动画加载失败：${name}`);
  const clip = await response.json();
  cache.set(name, clip);
  return clip;
}

function layerAnimations(el) {
  return [
    el,
    el.querySelector(':scope > .a'),
    el.querySelector(':scope > .a > .art'),
  ].filter(Boolean);
}

function setRule(element, name, duration, iterations, delay, direction = 'normal') {
  if (!name) return;
  element.style.animation = `${name} ${duration}ms linear ${delay}ms ${iterations} ${direction} both`;
}

export async function play(el, name, { iterations = 1, delay = 0, at = null } = {}) {
  const clip = await loadClip(name);
  const count = clip.loop ? Infinity : iterations;
  el.dataset.clip = name;
  for (const layer of layerAnimations(el)) layer.getAnimations().forEach(anim => anim.cancel());
  clip.targets.forEach((target, index) => {
    if (target.nodeId !== el.dataset.id) return;
    setRule(el, target.opacityCssName, clip.duration, count, delay);
    setRule(el, target.boxCssName, clip.duration, count, delay);
    setRule(el, target.visibilityCssName, clip.duration, count, delay);
    setRule(el.querySelector(':scope > .a'), target.transformCssName, clip.duration, count, delay);
    setRule(el.querySelector(':scope > .a > .art'), target.artCssName, clip.duration, count, delay);
    void index;
  });
  if (at != null) seek(el, at);
}

export function seek(el, atMs) {
  for (const layer of layerAnimations(el)) {
    for (const anim of layer.getAnimations()) {
      anim.pause();
      anim.currentTime = Math.max(0, atMs);
    }
  }
}

export async function mountAnimations(els, state) {
  const response = await fetch(`./data/anim/bindings.json`);
  if (!response.ok) return;
  const bindings = await response.json();
  const group = bindings[state.state];
  if (!group) return;
  for (const entry of group.onEnter || []) {
    for (const id of entry.targets || []) {
      const el = els.find(node => node.dataset.id === id);
      if (el) await play(el, entry.clip);
    }
  }
  for (const entry of group.loops || []) {
    for (const id of entry.targets || []) {
      const el = els.find(node => node.dataset.id === id);
      if (el) await play(el, entry.clip, { iterations: Infinity });
    }
  }
}
