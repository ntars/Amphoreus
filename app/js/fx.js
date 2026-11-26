// Manual 12.10: optional WebGL comparison layer. The CSS fallback stays the
// default so no-WebGL and freeze cases remain visible; ?fx=gl activates the
// source-bound shader layer and reports a human-readable notice if absent.
import { createFxLayer } from './glitch.js';

const loadJson = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};

function texValue(source, field, channels) {
  if (!source) return null;
  if (channels === 'scale') {
    const scale = source.textures?.[field]?.scale || { X: 1, Y: 1 };
    return [scale.X ?? 1, scale.Y ?? 1];
  }
  const color = source.colors?.[field];
  if (!color) {
    const value = source.floats?.[field];
    return typeof value === 'number' ? value : null;
  }
  if (channels === 'rg') return [color.r ?? 0, color.g ?? 0];
  if (channels === 'rgb') return [color.r ?? 0, color.g ?? 0, color.b ?? 0];
  return color.r ?? 0;
}

export async function mountFx(stage, state, assets) {
  const params = new URLSearchParams(location.search);
  if (params.get('fx') !== 'gl') return null;
  const [bindings, materials] = await Promise.all([
    loadJson('./data/fx_bindings.json'), loadJson('./data/materials.json'),
  ]);
  const layer = await createFxLayer(stage, state.canvas.refW, state.canvas.refH);
  if (!layer.gl) {
    const notice = document.createElement('div');
    notice.className = 'fx-fallback';
    notice.textContent = 'WebGL 不可用：已保留 CSS 静态降级';
    document.body.append(notice);
    return layer;
  }
  const materialMap = new Map(materials.map(item => [item.name, item]));
  const wanted = new Set();
  for (const node of state.nodes) {
    const name = node.material || node.img?.material;
    if (name) wanted.add(name);
  }
  const gl = layer.gl;
  const noise = gl.createTexture();
  const image = new Image();
  let noiseReady = false;
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    noiseReady = true;
  };
  image.src = './assets/noise-256.png';
  const textures = new Map();
  const sources = [];
  for (const effect of Object.values(bindings.effects)) {
    for (const name of effect.materials) {
      const material = materialMap.get(name);
      if (!material || !wanted.has(name)) continue;
      const spriteName = nodeSpriteForMaterial(state, name) || 'noise-256.png';
      const sprite = assets.sprites?.[spriteName] || Object.values(assets.sprites || {})
        .find(item => item.file?.endsWith(`/${spriteName}`) || item.file === spriteName);
      if (!sprite) continue;
      if (!textures.has(spriteName)) {
        const texture = gl.createTexture();
        const img = new Image();
        img.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        };
        img.src = `./assets/${sprite.file}`;
        textures.set(spriteName, texture);
      }
      sources.push({ effect, material, main: textures.get(spriteName) });
    }
  }
  const frozen = params.has('freeze') ? Number(params.get('freeze')) * 1000 : null;
  const start = performance.now();
  const draw = () => {
    if (!noiseReady) return;
    gl.viewport(0, 0, stage.canvas.width, stage.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const time = frozen == null ? performance.now() - start : frozen;
    for (const item of sources) {
      const uniforms = { uTime: time / 1000 };
      for (const [key, [field, channels]] of Object.entries(item.effect.uniforms)) {
        const value = texValue(item.material, field, channels);
        if (value != null) uniforms[key] = value;
      }
      layer.draw(item.effect.materials[0], item.effect.fragment, uniforms, {
        uMain: item.main, uNoise: noise,
      });
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return layer;
}

function nodeSpriteForMaterial(state, materialName) {
  for (const node of state.nodes) {
    if ((node.material || node.img?.material) === materialName && node.img?.src) {
      return node.img.src;
    }
  }
  return null;
}
