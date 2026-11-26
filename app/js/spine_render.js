// Canvas-2D renderer for the exact weighted mesh produced by spine.js.
// Geometry and UVs come from app/data/spine.json; no screenshots or tracing.
import { SpineSkeleton, sourceUvs, layoutScale } from './spine.js';

const skeletons = new Map();
const images = new Map();

async function loadSpineData() {
  const response = await fetch('./data/spine.json');
  if (!response.ok) throw new Error(`spine.json: HTTP ${response.status}`);
  return response.json();
}

function skeletonFor(pathId, data) {
  if (!skeletons.has(pathId)) skeletons.set(pathId, new SpineSkeleton(data.skeletons[pathId]));
  return skeletons.get(pathId);
}

function affineFor(p0, p1, p2, uv0, uv1, uv2, imageW, imageH) {
  const e0 = [p1[0] - p0[0], p1[1] - p0[1]];
  const e1 = [p2[0] - p0[0], p2[1] - p0[1]];
  const d0 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
  const d1 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];
  const det = d0[0] * d1[1] - d0[1] * d1[0];
  if (Math.abs(det) < 1e-9) return null;
  const s0 = [uv0[0] * imageW, uv0[1] * imageH];
  const m00 = (d1[1] * e0[0] - d0[1] * e1[0]) / det * imageW;
  const m10 = (d1[1] * e0[1] - d0[1] * e1[1]) / det * imageH;
  const m01 = (-d1[0] * e0[0] + d0[0] * e1[0]) / det * imageW;
  const m11 = (-d1[0] * e0[1] + d0[0] * e1[1]) / det * imageH;
  return [
    m00,
    m10,
    m01,
    m11,
    p0[0] - (m00 * s0[0] + m01 * s0[1]),
    p0[1] - (m10 * s0[0] + m11 * s0[1]),
  ];
}

function drawTriangle(ctx, image, vertices, indices, uvs) {
  const [a, b, c] = indices;
  const p0 = [vertices[a * 2], vertices[a * 2 + 1]];
  const p1 = [vertices[b * 2], vertices[b * 2 + 1]];
  const p2 = [vertices[c * 2], vertices[c * 2 + 1]];
  const uv0 = [uvs[a * 2], uvs[a * 2 + 1]];
  const uv1 = [uvs[b * 2], uvs[b * 2 + 1]];
  const uv2 = [uvs[c * 2], uvs[c * 2 + 1]];
  const m = affineFor(p0, p1, p2, uv0, uv1, uv2, image.naturalWidth, image.naturalHeight);
  if (!m) return;
  const [m00, m10, m01, m11, tx, ty] = m;
  if (![m00, m10, m01, m11, tx, ty].every(Number.isFinite)) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m00, m10, m01, m11, tx, ty);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

export async function mountSpine(stage, state, options = {}) {
  const nodes = state.nodes.filter(node => node.spine);
  if (!nodes.length) return null;
  let data;
  try { data = await loadSpineData(); } catch (error) { console.warn(`Spine: ${error.message}`); return null; }
  const layers = [];
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  for (const node of nodes) {
    const host = stage.querySelector(`.node[data-id="${node.id}"] > .a > .art`);
    if (!host) continue;
    const canvas = document.createElement('canvas');
    canvas.dataset.spine = String(node.spine.skeletonDataPathId);
    canvas.className = 'spine-layer';
    canvas.width = Math.max(1, Math.ceil(node.box.w * ratio));
    canvas.height = Math.max(1, Math.ceil(node.box.h * ratio));
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    host.appendChild(canvas);
    layers.push({ node, canvas, ctx: canvas.getContext('2d') });
  }
  if (!layers.length) return null;
  const frozen = options.freezeAt != null ? options.freezeAt : null;
  const flip = options.flip === true;
  const started = performance.now();
  const durationByName = { FadeIn: 1.333333, FadeInR: 1.333333, Standby: 0, StandbyR: 0 };
  let raf = 0;
  let ready = false;
  const draw = () => {
    if (!ready) return;
    for (const layer of layers) {
      const { node, canvas, ctx } = layer;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const pathId = String(node.spine.skeletonDataPathId);
      const skeletonData = data.skeletons[pathId];
      const image = images.get(pathId);
      if (!skeletonData || !image) continue;
      const source = node.spine.source || {};
      const scale = layoutScale(skeletonData, { width: node.box.w, height: node.box.h },
        source.referenceSize, source.referenceScale, source.layoutScaleMode);
      const names = Object.keys(skeletonData.animations);
      const preferred = names.includes('FadeIn') ? 'FadeIn' : names.includes('FadeInR') ? 'FadeInR' : names[0];
      const standby = names.includes('Standby') ? 'Standby' : names.includes('StandbyR') ? 'StandbyR' : preferred;
      const elapsed = frozen == null ? (performance.now() - started) / 1000 : frozen;
      const duration = durationByName[preferred] || 0;
      // On the flip path, DOM page frames already turn via CSS 3D. Keep the
      // Spine mesh on its standby pose so the two layers do not double-render
      // the same turn; normal page entry still plays the source FadeIn pose.
      const animation = flip ? standby : elapsed < duration ? preferred : standby;
      const time = animation === standby ? 0 : elapsed;
      const skeleton = skeletonFor(pathId, data).apply(animation, time, { blend: 'setup' });
      const attachment = skeletonData.attachments.find(item =>
        skeleton.slots.some(slot => slot.attachmentName === item.name || slot.attachmentName === item.path));
      if (!attachment) continue;
      const vertices = skeleton.worldVertices();
      const uvs = sourceUvs(skeleton);
      ctx.save();
      // The canvas lives inside the source DOM node. Spine's local origin maps
      // through that node's RectTransform pivot, and its Y axis points up.
      ctx.translate(
        node.box.w * node.pivot[0],
        node.box.h * (1 - node.pivot[1]),
      );
      ctx.scale(scale, -scale);
      for (let i = 0; i < attachment.triangles.length; i += 3) {
        drawTriangle(ctx, image, vertices, attachment.triangles.slice(i, i + 3), uvs);
      }
      ctx.restore();
    }
    if (frozen == null) raf = requestAnimationFrame(draw);
  };
  await Promise.all([...new Set(nodes.map(node => String(node.spine.skeletonDataPathId)))].map(async pathId => {
    const skeletonData = data.skeletons[pathId];
    if (!skeletonData) return;
    const image = new Image();
    image.src = `./assets/${skeletonData.texture.file}`;
    await image.decode().catch(() => {});
    if (image.naturalWidth) images.set(pathId, image);
  }));
  ready = true;
  draw();
  return {
    canvases: layers.map(layer => layer.canvas),
    dispose() {
      cancelAnimationFrame(raf);
      for (const layer of layers) layer.canvas.remove();
    },
  };
}
