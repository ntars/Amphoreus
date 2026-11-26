export function applyMask(el, node, assets) {
  // Apply clipping to the child container, never to .art: the compiled DOM
  // mounts descendants under .a, so masking .art would leave siblings of
  // .art (the mask node's children) unclipped.
  if (!node.mask) return;
  const reverse = Boolean(node.reverseMask);
  let maskImage = '';
  if (node.mask === 'sprite') {
    const named = node.smoothMask?.sprite;
    // Texture-mode SmoothMask keeps its sprite in the component, not in an
    // Image. Look it up by the exact serialized path ID first; fall back to
    // the node's own Image only for vanilla uGUI Mask.
    const pathId = String(node.smoothMask?.source?.spritePathId ?? '');
    const src = (pathId && (assets.sprites?.[pathId] ? pathId : assets.spritePathIds?.[pathId]))
      || node.img?.src
      || Object.keys(assets.sprites || {}).find(key => key === named || (assets.sprites[key]?.texture || '').toLowerCase() === String(named || '').toLowerCase());
    const sp = src ? assets.sprites?.[src] || Object.values(assets.sprites || {}).find(sprite => sprite.file === src) : null;
    if (!sp) return;
    maskImage = `url(./assets/${sp.file})`;
  } else if (node.mask === 'rect-round' && node.maskRadius > 0) {
    maskImage = `radial-gradient(closest-side, #000 calc(100% - ${node.maskRadius}px), transparent ${node.maskRadius}px)`;
  }
  if (maskImage) {
    el.style.maskImage = maskImage;
    el.style.webkitMaskImage = maskImage;
    el.style.maskMode = 'luminance';
    el.style.webkitMaskMode = 'luminance';
    el.style.maskSize = '100% 100%';
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskRepeat = 'no-repeat';
    el.style.webkitMaskRepeat = 'no-repeat';
  }
  el.dataset.mask = node.maskKind || String(node.mask);
  el.dataset.maskType = node.maskType || '';
  if (reverse) {
    el.dataset.reverseMask = '1';
    // Source-backed representation only. True inverse stencil compositing is
    // not expressible with CSS mask-image; the mask fields stay in dump and
    // compiled state for a WebGL stencil layer. Do not fake a visual inverse.
  }
  if (!node.showMaskGraphic) {
    const art = el.querySelector(':scope > .a > .art');
    if (art) {
      art.style.backgroundImage = 'none';
      art.style.backgroundColor = 'transparent';
    }
  }
}
