export function applyImage(el, node, assets) {
  // uGUI Mask(showMaskGraphic=false) contributes no visible Graphic. SmoothMask
  // has no showMaskGraphic field: its own sprite is a clipping input, and a
  // separate Image component on the same node remains visible.
  if (node.maskKind !== 'SmoothMask' && node.mask === 'sprite' && node.showMaskGraphic === false) return;
  const src = node.img?.src;
  if (!src) {
    if (node.img?.kind === 'Graphic') {
      const [r, g, b, a] = node.img.color || [1, 1, 1, 0];
      el.style.background = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
    }
    return;
  }
  const sp = assets.sprites?.[src] || Object.values(assets.sprites || {}).find(item => item.file === src);
  if (!sp) { el.dataset.missing = src; return; }
  const [r, g, b, a] = node.img.color || [1, 1, 1, 1];
  const white = r === 1 && g === 1 && b === 1;
  const url = `./assets/${sp.file}`;
  if (node.img.mode === 'sliced' && sp.border) {
    const [l, bm, rr, t] = sp.border;
    el.style.borderImage = `url(${url}) ${t} ${rr} ${bm} ${l} fill / ${t}px ${rr}px ${bm}px ${l}px stretch`;
    return;
  }
  if (white) {
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = node.img.aspect ? 'contain' : '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    if (a < 1) el.style.opacity = String(a);
  } else {
    // Unity tints a sprite by multiplying its RGB by Graphic.color. CSS masks
    // use luminance mode here so black sprite pixels stay black instead of
    // becoming an opaque tinted rectangle.
    el.style.backgroundColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    el.style.maskImage = `url(${url})`;
    el.style.webkitMaskImage = `url(${url})`;
    el.style.maskMode = 'luminance';
    el.style.maskSize = '100% 100%';
    el.style.maskRepeat = 'no-repeat';
    if (a < 1) el.style.opacity = String(a);
  }
  if (node.img.fill && node.img.fill.method === 4) {
    el.style.maskImage = `linear-gradient(#000, #000), ${el.style.maskImage || 'none'}`;
    el.style.maskSize = `${node.img.fill.amount * 100}% 100%, 100% 100%`;
  }
}
