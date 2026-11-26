#!/usr/bin/env node
// M3 layout compiler: dump/<state>.json -> app/data/states/<state>.json.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rectToCss, round4 } from './lib/rect.mjs';
import { envFail, fail, pass } from './lib/gate.mjs';

const STATES = [
  'entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward',
];
const repo = process.cwd();
const first = process.argv[2];
const dumpDir = join(repo, first && !first.startsWith('--') ? first : 'dump');
const outDir = join(repo, process.argv.find(arg => arg && arg.startsWith('app/')) || 'app/data/states');
const assetsPath = join(repo, 'app/data/assets.json');
let assets;
try {
  assets = JSON.parse(readFileSync(assetsPath, 'utf8'));
} catch (error) {
  envFail(`assets.json 不可用：${error.message}`);
}

const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Source: dump/<state>.json stage.aabb is the Unity-authored world box.
// Compiled boxes are solved against that box so CSS ancestor transforms
// reproduce the same AABB without visual tuning.
const IDENTITY = [1, 0, 0, 1, 0, 0];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const compose = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function localTransform(node) {
  const { w, h } = node.box;
  const [px, py] = node.pivot;
  const [sx, sy] = node.scale;
  const angle = node.rot * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  const r = [c * sx, s * sx, -s * sy, c * sy, 0, 0];
  const ox = px * w, oy = (1 - py) * h;
  return compose(compose(translate(ox, oy), r), translate(-ox, -oy));
}

function solveBoxFromStage(node, parentMatrix) {
  // Source: dump/<state>.json stage.aabb; inverse-scale nodes use the
  // unscaled authored rect recorded by the importer when available.
  const aabb = node.source?.aabbUnscaled || node.source?.aabb;
  if (!Array.isArray(aabb)) return;
  const ltm = localTransform(node);
  const points = [[0, 0], [node.box.w, 0], [node.box.w, node.box.h], [0, node.box.h]]
    .map(([x, y]) => apply(ltm, x, y));
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const offsetX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const offsetY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const targetX = (aabb[0] + aabb[2]) / 2 - parentMatrix[4];
  const targetY = (aabb[1] + aabb[3]) / 2 - parentMatrix[5];
  const det = parentMatrix[0] * parentMatrix[3] - parentMatrix[1] * parentMatrix[2];
  if (Math.abs(det) < 1e-8) return;
  const x = (targetX * parentMatrix[3] - parentMatrix[2] * targetY) / det - offsetX;
  const y = (parentMatrix[0] * targetY - parentMatrix[1] * targetX) / det - offsetY;
  node.box.l = round4(x);
  node.box.t = round4(y);
}

function solveStateBoxes(output) {
  const matrices = new Map();
  for (const node of output.nodes) {
    const parentMatrix = matrices.get(node.parent) || IDENTITY;
    solveBoxFromStage(node, parentMatrix);
    const local = compose(translate(node.box.l, node.box.t), localTransform(node));
    matrices.set(node.id, compose(parentMatrix, local));
  }
}

function compileNode(node, parent, parentW, parentH, order, depth, output, trace, state, parentPivot = [0.5, 0.5], parentActive = true) {
  const rt = node.rt || {};
  const sourceBox = rectToCss(rt, parentW, parentH, parentPivot);
  const rtSize = rt.size || [sourceBox.w, sourceBox.h];
  // The importer resolves layout components into rt.size; that authored
  // extent replaces sizeDelta-derived width/height without touching position.
  const box = { ...sourceBox, w: round4(Math.abs(rtSize[0])), h: round4(Math.abs(rtSize[1])) };
  if (Math.abs(sourceBox.w - rtSize[0]) > 0.01 || Math.abs(sourceBox.h - rtSize[1]) > 0.01) {
    trace.push({ state, path: node.path, kind: 'resolvedLayoutSize', raw: sourceBox, resolved: rtSize });
  }
  const id = `n-${String(output.nodes.length).padStart(4, '0')}`;
  const compiled = {
    id,
    path: node.path,
    cls: `n-${slug(state)}-${slug(node.path || node.name).slice(0, 48)}`,
    parent,
    depth,
    box,
    pivot: rt.pivot || [0.5, 0.5],
    rot: round4(rt.localEuler?.[2] || 0),
    scale: rt.localScale || [1, 1],
    active: parentActive && node.active !== false,
    alpha: 1,
    order,
    source: {
      aabb: node.stage?.aabb || null,
      aabbUnscaled: node.stageUnscaled || null,
      layoutSources: node.layoutSources || [],
      anchorMin: rt.anchorMin,
      anchorMax: rt.anchorMax,
      anchoredPosition: rt.anchoredPosition,
      sizeDelta: rt.sizeDelta,
    },
  };
  for (const component of node.components || []) {
    if (component.type === 'CanvasGroup') compiled.alpha = round4(component.alpha ?? 1);
    if (component.material) compiled.material = component.material;
    if (component.type === 'Image' || component.type === 'Graphic') {
      const buttonState = (() => {
        const leaf = String(node.path || '').split('/').at(-1) || '';
        const map = { Normal: 'normal', Normalized: 'normal', Highlight: 'hover', Highlighted: 'hover', Press: 'pressed', Pressed: 'pressed', Selected: 'selected', Disable: 'disabled', Disabled: 'disabled' };
        const part = leaf.split('_')[0];
        return map[part] || null;
      })();
      const spriteName = String(component.sprite || '');
      const pathIds = assets.spritePathIds || {};
      const spriteKey = component.source?.spritePathId != null ? String(component.source.spritePathId) : spriteName;
      const canonical = Object.entries(pathIds).find(([pathId, name]) => pathId === spriteKey) ? spriteKey : Object.entries(pathIds).find(([, name]) => String(name).toLowerCase() === spriteName.toLowerCase())?.[0];
      const asset = (canonical && assets.sprites?.[canonical]) || assets.sprites?.[spriteKey] || assets.sprites?.[spriteName] ||
        (assets.spritePathIds?.[spriteName] != null ? assets.sprites?.[String(assets.spritePathIds[spriteName])] : null) ||
        (assets.spritePathIds?.[spriteKey] != null ? assets.sprites?.[String(assets.spritePathIds[spriteKey])] : null) ||
        Object.entries(assets.sprites || {}).find(([key]) => key.toLowerCase() === spriteName.toLowerCase())?.[1];
      compiled.img = {
        buttonState,
        src: asset?.file || null,
        mode: String(component.imageType || 'Simple').toLowerCase(),
        slice: (Array.isArray(component.border) && component.border.some(v => v > 0)) ? component.border : (Array.isArray(asset?.border) ? asset.border : null),
        color: component.color || [1, 1, 1, 1],
        alignment: component.alignment || '',
        aspect: Boolean(component.preserveAspect),
        fill: component.fillMethod ? { method: component.fillMethod, amount: component.fillAmount ?? 1 } : null,
        raycast: Boolean(component.raycast),
        kind: component.type,
        material: component.material || null,
      };
      if (component.sprite && !asset) trace.push({ state, path: node.path, kind: 'missingSprite', sprite: component.sprite });
    }
    if (component.type === 'Text') {
      compiled.text = {
        font: slug(component.font || 'rpg-cn'),
        size: component.fontSize ?? 24,
        color: component.color || [1, 1, 1, 1],
        raw: component.text ?? '',
        key: component.localizationKey || null,
        alignment: component.alignment || '',
        preferredSize: component.preferredSize || null,
        quads: component.textQuads || [],
      };
    }
    if (component.type === 'Mask' || component.type === 'RectMask2D') {
      // SmoothMask does not use uGUI Mask.showMaskGraphic. Its serialized
      // m_Type at offset 32 is the clipping shape; keep the source enum and
      // the reverse flag so the runtime can apply Rectangle/Texture correctly.
      if (component.maskType === 'SmoothMask') {
        compiled.mask = component.smoothMaskType === 'Rectangle' ? 'rect-round' : 'sprite';
        compiled.maskKind = 'SmoothMask';
        compiled.maskType = component.smoothMaskType;
        compiled.maskRadius = component.radius ?? 0;
        compiled.reverseMask = Boolean(component.reverseMask);
        // The source field must survive compilation verbatim. SVG/CSS cannot
        // implement inverse stencil compositing; the WebGL layer consumes
        // this source flag instead of guessing a visual approximation.
        compiled.smoothMaskReverse = Boolean(component.reverseMask);
        compiled.showMaskGraphic = component.showMaskGraphic !== false;
        compiled.smoothMask = {
          sprite: component.sprite || null,
          source: component.source || null,
        };
      } else {
        compiled.mask = component.type === 'RectMask2D' ? 'rect' : 'sprite';
        compiled.maskKind = component.maskType || component.type;
        compiled.showMaskGraphic = component.showMaskGraphic !== false;
      }
    }
    if (component.type === 'Spine') {
      compiled.spine = {
        // Unity path IDs are 64-bit integers; JSON.stringify preserves them.
        skeletonDataPathId: String(component.skeletonDataPathId),
        source: component.source || null,
      };
    }
  }
  const hit = (compiled.img?.raycast) || (node.components || []).some(c => c.type === 'Button');
  if (hit) compiled.hit = true;
  output.nodes.push(compiled);
  (node.children || []).forEach((child, index) => {
    compileNode(child, id, box.w, box.h, index, depth + 1, output, trace, state, rt.pivot || [0.5, 0.5], parentActive && node.active !== false);
  });
}

mkdirSync(outDir, { recursive: true });
const trace = [];
const summary = [];
const explicitState = (() => { const i = process.argv.indexOf('--state'); return i >= 0 ? process.argv[i + 1] : null; })();
const selected = explicitState ? [explicitState] : process.argv.includes('--all') ? STATES : STATES;
for (const state of selected) {
  let dump;
  try {
    dump = JSON.parse(readFileSync(join(dumpDir, `${state}.json`), 'utf8'));
  } catch (error) {
    envFail(`${state}: dump 不可用：${error.message}`);
  }
  if (dump.schema !== 1) fail(`${state}: dump schema != 1`);
  const output = {
    schema: 1,
    state,
    canvas: dump.canvas,
    rootId: null,
    nodes: [],
  };
  compileNode(dump.root, null, dump.canvas.refW, dump.canvas.refH, 0, 0, output, trace, state);
  solveStateBoxes(output);
  output.rootId = output.nodes[0]?.id || null;
  writeFileSync(join(outDir, `${state}.json`), JSON.stringify(output, null, 2) + '\n');
  summary.push({ state, nodes: output.nodes.length });
}
if (trace.length) writeFileSync(join(outDir, '_trace.json'), JSON.stringify(trace, null, 2) + '\n');
pass(`layout compiled: ${summary.map(s => `${s.state}=${s.nodes}`).join(' ')}`);
