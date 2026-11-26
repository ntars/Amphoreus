import { applyImage } from './image.js';
import { applyText } from './text.js';
import { applyMask } from './mask.js';
import { mountMaterials } from './effects.js';
import { mountSpine } from './spine_render.js';

export async function renderState(stage, state, assets, renderOptions = {}) {
  const els = new Map();
  const frag = document.createDocumentFragment();
  const contentFor = el => el.querySelector(':scope > .a') || el;
  for (const n of state.nodes) {
    const el = document.createElement('div');
    el.className = 'node';
    el.dataset.id = n.id;
    el.dataset.path = n.path || '';
    el.dataset.depth = String(n.depth);
    el.dataset.box = `${n.box.l},${n.box.t},${n.box.w},${n.box.h}`;
    if (n.hit) el.dataset.hit = '1';
    const s = el.style;
    s.left = `${n.box.l}px`;
    s.top = `${n.box.t}px`;
    s.width = `${n.box.w}px`;
    s.height = `${n.box.h}px`;
    s.setProperty('--origin', `${n.pivot[0] * 100}% ${(1 - n.pivot[1]) * 100}%`);
    s.transform = `rotate(${n.rot}deg) scale(${n.scale[0]}, ${n.scale[1]})`;
    if (!n.active) s.display = 'none';
    s.visibility = n.active ? 'visible' : 'hidden';
    if (n.alpha < 1) s.opacity = String(n.alpha);
    if (n.mask === 'rect') s.overflow = 'hidden';
    if (n.clip) el.dataset.clip = String(n.clip);
    const content = document.createElement('div');
    content.className = 'a';
    const art = document.createElement('div');
    art.className = 'art';
    content.appendChild(art);
    el.appendChild(content);
    if (n.img) applyImage(art, n, assets);
    if (n.text) applyText(art, n, assets);
    // Mask source fields are compiled onto the node; apply them to the
    // container that actually owns all descendants.
    applyMask(el, n, assets);
    mountMaterials(el, n, assets.materials || {});
    els.set(n.id, el);
  }
  for (let i = 0; i < state.nodes.length; i++) {
    const parent = state.nodes[i].parent;
    const child = els.get(state.nodes[i].id);
    const parentEl = parent == null ? null : els.get(parent);
    (parentEl ? contentFor(parentEl) : frag).appendChild(child);
  }
  stage.replaceChildren(frag);
  try { await mountSpine(stage, state, renderOptions); }
  catch (error) { console.warn(`Spine renderer unavailable: ${error.message}`); }
  return [...els.values()];
}
