// Manual 13.2/13.3: source-derived hit targets and button visual states.
// The source prefabs expose state groups as Normal/Highlight/Press/Selected/
// Disable subtrees. Each hit button is linked to its authored state sprites;
// no visual property is guessed.
const STATE_ORDER = ['normal', 'hover', 'pressed', 'selected', 'disabled'];
const NAME_TO_STATE = {
  normal: 'normal', normalized: 'normal', highlight: 'hover', highlighted: 'hover',
  press: 'pressed', pressed: 'pressed', selected: 'selected',
  disable: 'disabled', disabled: 'disabled',
};

function stateOfPath(path) {
  const leaf = String(path || '').split('/').at(-1) || '';
  const part = leaf.split('_')[0].toLowerCase();
  return NAME_TO_STATE[part] || null;
}

function collectVariants(node, nodes) {
  const variants = { normal: null, hover: null, pressed: null, selected: null, disabled: null };
  const prefix = `${node.path}/`;
  for (const candidate of nodes) {
    const state = stateOfPath(candidate.path);
    if (!state || !candidate.path.startsWith(prefix)) continue;
    if (variants[state]) continue;
    const art = candidate.img?.src;
    if (!art && !candidate.img) continue;
    variants[state] = {
      src: art,
      color: candidate.img.color,
      alpha: candidate.alpha,
      path: candidate.path,
    };
  }
  return variants;
}

export function setBtnState(el, state) {
  if (!STATE_ORDER.includes(state)) return;
  const variants = el.__amphButtonVariants;
  if (!variants) return;
  const chosen = variants[state] || variants.normal || STATE_ORDER
    .map(name => variants[name]).find(Boolean);
  if (!chosen) return;
  el.dataset.state = state;
  const art = el.querySelector(':scope > .a > .art');
  if (!art) return;
  art.style.backgroundImage = chosen.src ? `url(./assets/${chosen.src})` : 'none';
  const color = chosen.color;
  if (Array.isArray(color)) {
    art.style.setProperty('--btn-rgb', color.slice(0, 3).map(v => Math.round(v * 255)).join(','));
    art.style.setProperty('--btn-a', String(color[3] ?? 1));
  }
  el.style.setProperty('--btn-alpha', String(chosen.alpha ?? 1));
}

export function mountButtonStates(root, nodes = []) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const el of root.querySelectorAll('[data-hit="1"]')) {
    const node = byId.get(el.dataset.id);
    if (!node || !node.path) continue;
    const variants = collectVariants(node, nodes);
    if (!STATE_ORDER.some(state => variants[state])) continue;
    el.__amphButtonVariants = variants;
    el.dataset.buttonStates = STATE_ORDER.filter(state => variants[state]).join(',');
    setBtnState(el, 'normal');
    el.addEventListener('pointerenter', () => setBtnState(el, 'hover'));
    el.addEventListener('pointerleave', () => setBtnState(el, 'normal'));
    el.addEventListener('pointerdown', () => setBtnState(el, 'pressed'));
    el.addEventListener('pointerup', () => setBtnState(el, 'hover'));
  }
}
