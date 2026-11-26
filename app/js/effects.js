// Material parameters are injected as CSS custom properties only; the visual
// approximation lives in app/css/app.css and is registered in FIDELITY.md.
const kebab = key => key.replace(/^_/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function mountMaterials(el, node, materials) {
  const name = node.material || node.img?.material;
  const material = materials[name] || materials.find?.(item => item.name === name);
  if (!material) return;
  el.dataset.fx = material.kind || 'Other';
  for (const [key, value] of Object.entries(material.floats || {})) {
    el.style.setProperty(`--fx-${kebab(key)}`, String(value));
  }
  for (const [key, value] of Object.entries(material.colors || {})) {
    if (!value || typeof value !== 'object') continue;
    const rgba = [value.r ?? 0, value.g ?? 0, value.b ?? 0, value.a ?? 1]
      .map((channel, index) => index === 3 ? channel : Math.round(channel * 255));
    el.style.setProperty(`--fx-${kebab(key)}`, `rgba(${rgba.join(',')})`);
  }
}
