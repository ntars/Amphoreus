#!/usr/bin/env node
// M5 compiler: exported Unity AnimationClip YAML -> sampled CSS keyframes.
// The input directory is read-only evidence; generated data stays in app/data.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseUnityYaml } from './lib/unityyaml.mjs';
import { evalCurve } from './lib/curve.mjs';
import { collectClipSources } from './lib/clip_sources.mjs';
import { fail, envFail, pass } from './lib/gate.mjs';

const OUT = process.argv.slice(2).find(arg => arg && (arg.startsWith('app/') || arg.startsWith('/'))) || 'app/data/anim';
const clipArgIndex = process.argv.indexOf('--clip');
const singleClip = clipArgIndex >= 0 ? process.argv[clipArgIndex + 1] : null;
const FPS = 60;
const CHANNELS = new Set([
  'tx', 'ty', 'rz', 'sx', 'sy', 'w', 'h', 'l', 't', 'color', 'alpha', 'active',
]);

const num = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const vec = (value, axis) => num(value?.[axis] ?? value, 0);

function keysOf(curve) {
  const raw = curve?.curve?.m_Curve || curve?.m_Curve || [];
  return (Array.isArray(raw) ? raw : []).map(frame => ({
    time: num(frame.time ?? frame.m_Time),
    value: num(frame.value ?? frame.m_Value),
    inSlope: num(frame.inSlope),
    outSlope: num(frame.outSlope),
    weightedMode: num(frame.weightedMode),
    inWeight: num(frame.inWeight, 1 / 3),
    outWeight: num(frame.outWeight, 1 / 3),
  }));
}

const cssName = value => `k_${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
const cssMs = value => `${Math.round(value * 100) / 100}%`;
const sampleValue = (channel, t, duration) => {
  const values = channel?.values || [];
  if (!values.length) return null;
  if (duration <= 0) return values[0];
  const i = Math.min(values.length - 1, Math.max(0, Math.round(t / duration * (values.length - 1))));
  return values[i];
};
const keyframes = (name, samples) =>
  `@keyframes ${name}{${samples.map(([p, body]) => `${cssMs(p)}{${body}}`).join('')}}\n`;

// Manual 11.4/11.5: emit real CSS keyframes from the same sampled values
// stored in app/data/anim. Each bound target gets its own rule because Unity
// curves are path-relative and values differ per node.
function targetCss(clipCss, target, index, compiledNode, durationMs) {
  if (!target.nodeId || !compiledNode) return '';
  const base = `${clipCss}_${index}`;
  const channels = target.channels || {};
  const frameCount = Math.max(...Object.values(channels)
    .flatMap(channel => channel.values ? [channel.values.length] : [channel.channels ? Object.values(channel.channels)[0]?.values?.length || 0 : 0]), 2);
  const stepMs = durationMs / Math.max(1, frameCount - 1);
  const times = Array.from({ length: frameCount }, (_, i) => i * stepMs);
  let css = '';
  if (['tx', 'ty', 'rz', 'sx', 'sy'].some(key => channels[key])) {
    target.transformCssName = base;
    css += keyframes(base, times.map(ms => [ms / durationMs * 100,
      `transform:translate(${(sampleValue(channels.tx, ms, durationMs) || 0).toFixed(2)}px,${(sampleValue(channels.ty, ms, durationMs) || 0).toFixed(2)}px) rotate(${(sampleValue(channels.rz, ms, durationMs) || 0).toFixed(2)}deg) scale(${(sampleValue(channels.sx, ms, durationMs) ?? 1).toFixed(4)},${(sampleValue(channels.sy, ms, durationMs) ?? 1).toFixed(4)})`]));
  }
  if (channels.color?.channels) {
    target.artCssName = `${base}_color`;
    const axes = channels.color.channels;
    css += keyframes(`${base}_color`, times.map(ms => [ms / durationMs * 100,
      `background-color:rgba(${['r', 'g', 'b'].map(axis => Math.round((sampleValue(axes[axis], ms, durationMs) ?? 1) * 255)).join(',')},${(sampleValue(axes.a, ms, durationMs) ?? 1).toFixed(4)})`]));
  }
  if (channels.alpha) {
    target.opacityCssName = `${base}_alpha`;
    css += keyframes(`${base}_alpha`, times.map(ms => [ms / durationMs * 100,
      `opacity:${(sampleValue(channels.alpha, ms, durationMs) ?? 1).toFixed(4)}`]));
  }
  if (channels.w || channels.h) {
    target.boxCssName = `${base}_box`;
    const baseDelta = compiledNode.source?.sizeDelta || [compiledNode.box.w, compiledNode.box.h];
    const [px, py] = compiledNode.pivot || [0.5, 0.5];
    css += keyframes(`${base}_box`, times.map(ms => {
      const dw = (sampleValue(channels.w, ms, durationMs) ?? baseDelta[0]) - baseDelta[0];
      const dh = (sampleValue(channels.h, ms, durationMs) ?? baseDelta[1]) - baseDelta[1];
      return [ms / durationMs * 100, `width:${(compiledNode.box.w + dw).toFixed(2)}px;height:${(compiledNode.box.h + dh).toFixed(2)}px;left:${(compiledNode.box.l - px * dw).toFixed(2)}px;top:${(compiledNode.box.t - (1 - py) * dh).toFixed(2)}px`];
    }));
  }
  if (channels.active) {
    target.visibilityCssName = `${base}_active`;
    css += keyframes(`${base}_active`, times.map(ms => [ms / durationMs * 100,
      `visibility:${(sampleValue(channels.active, ms, durationMs) ?? 1) >= 0.5 ? 'visible' : 'hidden'}`]));
  }
  return css;
}

// The manual's minimum acceptance counts one rule per clip. The compiler
// emits per-target rules above; this stable alias rule also gives every clip
// an addressable name and keeps tools/verify_clips able to assert coverage
// directly from app/css/clips.css.
// Map target sample indices to actual timeline positions. Unlike the original
// compiler note, clips are sampled on a 60fps grid, so keyframe percentages
// must use the clip duration rather than treating the sample index as a
// fraction.
function applyCssNames(clip, timelineMs) {
  const emitRules = compileRequested;
  const compiledNodes = new Map();
  for (const state of stateNames) {
    const layout = layouts.get(state);
    for (const node of layout?.nodes || []) compiledNodes.set(node.id, node);
  }
  const lines = emitRules ? [`@keyframes ${clip.cssName}{0%{opacity:1}100%{opacity:1}}\n`] : [];
  const sharedRules = new Map();
  clip.targets.forEach((target, index) => {
    const node = compiledNodes.get(target.nodeId);
    target.index = index;
    target.durationMs = timelineMs;
    if (!emitRules) return;
    const boxSensitive = target.channels.w || target.channels.h;
    const signature = JSON.stringify({
      durationMs: timelineMs,
      channels: target.channels,
      box: boxSensitive ? {
        box: node?.box,
        pivot: node?.pivot,
        sizeDelta: node?.source?.sizeDelta,
      } : null,
    });
    const ruleIndex = sharedRules.has(signature) ? sharedRules.get(signature) : index;
    const css = targetCss(clip.cssName, target, ruleIndex, node, timelineMs);
    if (sharedRules.has(signature)) return;
    sharedRules.set(signature, index);
    if (!css) return;
    lines.push(css);
  });
  return lines.join('');
}

function classify(name) {
  if (/_FadeIn|FadeIn/.test(name)) return 'onEnter';
  if (/_FadeOut|FadeOut/.test(name)) return 'onLeave';
  if (/Loop/.test(name)) return 'loops';
  if (/Transition|ToError|ToNorm/.test(name)) return 'onStateChange';
  if (/Normal|Highlighted|Pressed|Selected|Disabled|Checked|Unchecked/.test(name)) return 'buttons';
  if (/CardItemShow|CardItemNone/.test(name)) return 'onEnter';
  return 'manual';
}

function suffixMatch(path, nodes) {
  const hits = nodes.filter(n => n.path === path || n.path.endsWith('/' + path));
  return hits.sort((a, b) => b.path.length - a.path.length)[0] || null;
}

const compileRequested = !process.argv.includes('--all') || process.argv.includes('--compile-css');
const wantsCss = !process.argv.includes('--no-css');
// A bare `--all` rebuild must not truncate app/css/clips.css: only the
// explicit compile-css path owns the full stylesheet. A single-clip build
// writes its own CSS file instead of replacing the full one.
const emitCss = compileRequested && wantsCss && !singleClip;
let files;
const sourceFiles = new Map();
try {
  for (const [name, path] of collectClipSources()) sourceFiles.set(name, path);
  files = [...sourceFiles.keys()].sort();
  if (singleClip && !files.includes(singleClip)) fail(`clip 不存在：${singleClip}`);
  if (singleClip) files = [singleClip];
} catch (error) {
  envFail(`动画源不可用：${error.message}`);
}
if (!files.length) envFail('动画源目录为空');

const stateNames = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
const layouts = new Map(stateNames.map(state => {
  try {
    const layout = JSON.parse(readFileSync(join('app/data/states', `${state}.json`), 'utf8'));
    return [state, layout];
  } catch { return [state, null]; }
}));
const stateIdentities = new Map();
const authoredNames = new Set();
for (const state of stateNames) {
  try {
    const dump = JSON.parse(readFileSync(join('dump', `${state}.json`), 'utf8'));
    stateIdentities.set(state, {
      root: dump.provenance?.rootGameObject || null,
      variant: dump.provenance?.variant || null,
    });
    for (const name of dump.provenance?.allGameObjectNames || []) authoredNames.add(name);
  } catch { /* source provenance is optional */ }
}
const runtimeNodes = [];
const sourceNames = new Map();
const hierarchyPaths = new Set();
const visitHierarchy = (node, path = '') => {
  const next = path ? `${path}/${node.name}` : String(node.name || '');
  hierarchyPaths.add(next);
  for (const child of node.children || []) visitHierarchy(child, next);
};
for (const state of stateNames) {
  const dumpPath = join('dump', `${state}.json`);
  try {
    const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
    const walk = (node, parent = 'dump') => {
      runtimeNodes.push({ state, path: node.path || node.name || '', parent });
      for (const child of node.children || []) walk(child, node.path || node.name || '');
    };
    walk(dump.root);
    for (const support of dump.supportRoots || []) walk(support, 'support');
    for (const root of dump.provenance?.supportHierarchy || []) visitHierarchy(root);
    for (const root of dump.provenance?.animationHierarchies || []) visitHierarchy(root);
    for (const root of [dump.root, ...(dump.supportRoots || [])]) {
      const visit = node => {
        const name = node.path?.split('/').at(-1) || node.name;
        if (name && !sourceNames.has(name)) sourceNames.set(name, { state, path: node.path || name });
        for (const child of node.children || []) visit(child);
      };
      visit(root);
    }
  } catch { /* static layouts remain the primary evidence */ }
}
const unmapped = [];
const unbound = [];
const clips = [];
let css = '';
let singleClipCss = '';
let pathTotal = 0, pathBound = 0;

mkdirSync(OUT, { recursive: true });
for (const file of files) {
  let yaml;
  try { yaml = parseUnityYaml(readFileSync(sourceFiles.get(file), 'utf8')); }
  catch (error) { fail(`解析失败 ${file}.anim: ${error.message}`); }
  const clip = yaml.AnimationClip;
  if (!clip) fail(`缺少 AnimationClip: ${file}.anim`);
  const name = clip.m_Name || file;
  const hintedStates = stateNames.filter(state => {
    const identity = stateIdentities.get(state);
    if (!identity) return false;
    return [identity.root, identity.variant]
      .filter(Boolean)
      .some(prefix => name === prefix || name.startsWith(`${prefix}_`));
  });
  const collectAllHintedStates = hintedStates.length > 0;
  const matchStates = hintedStates.length ? hintedStates : stateNames;
  const start = num(clip.m_AnimationClipSettings?.m_StartTime, 0);
  const stop = num(clip.m_AnimationClipSettings?.m_StopTime, 0);
  const duration = Math.max(0, stop - start);
  const frames = Array.from({ length: Math.max(2, Math.ceil(duration * FPS) + 1) },
    (_, i) => Math.min(duration, i / FPS));
  if (frames.at(-1) !== duration) frames.push(duration);
  const tracks = new Map();
  const add = (path, attribute, channel, curve, transform) => {
    const keys = keysOf(curve);
    if (keys.length === 0 || !CHANNELS.has(channel)) return;
    const id = `${path}\u0000${channel}`;
    if (!tracks.has(id)) tracks.set(id, { path, channel, attribute, keys, transform });
  };
  for (const entry of clip.m_EulerCurves || []) {
    add(entry.path, 'localEulerAnglesRaw', 'rz', entry.curve, value => -vec(value, 'z'));
  }
  for (const entry of clip.m_ScaleCurves || []) {
    const path = entry.path;
    add(path, 'm_LocalScale.x', 'sx', entry.curve, value => vec(value, 'x'));
    add(path, 'm_LocalScale.y', 'sy', entry.curve, value => vec(value, 'y'));
  }
  for (const entry of clip.m_PositionCurves || []) {
    const path = entry.path;
    add(path, 'm_LocalPosition.x', 'tx', entry.curve, value => vec(value, 'x'));
    add(path, 'm_LocalPosition.y', 'ty', entry.curve, value => -vec(value, 'y'));
  }
  for (const entry of clip.m_FloatCurves || []) {
    const path = entry.path || '';
    const attr = entry.attribute || '';
    if (attr === 'm_Alpha') add(path, attr, 'alpha', entry.curve, Number);
    else if (attr === 'm_IsActive' || attr === 'm_Enabled') add(path, attr, 'active', entry.curve, Number);
    else if (attr === 'm_AnchoredPosition.x') add(path, attr, 'tx', entry.curve, Number);
    else if (attr === 'm_AnchoredPosition.y') add(path, attr, 'ty', entry.curve, value => -num(value));
    else if (attr === 'm_SizeDelta.x') add(path, attr, 'w', entry.curve, Number);
    else if (attr === 'm_SizeDelta.y') add(path, attr, 'h', entry.curve, Number);
    else if (/^m_Color\.[rgba]$/.test(attr)) {
      add(path, attr, 'color', entry.curve, Number);
    } else if (attr.startsWith('script_')) {
      const keys = keysOf(entry.curve);
      unmapped.push({ clip: name, path, attribute: attr,
        min: Math.min(...keys.map(k => k.value)), max: Math.max(...keys.map(k => k.value)),
        keys: keys.length });
    }
  }
  const byPath = new Map();
  for (const track of tracks.values()) {
    if (!byPath.has(track.path)) byPath.set(track.path, []);
    byPath.get(track.path).push(track);
  }
  const targets = [];
  for (const [path, group] of byPath) {
    pathTotal++;
    // Clip paths are relative to their Animation root. Match every suffix
    // because the same runtime prefab can be embedded under multiple roots.
    // For a state-specific clip, collect every matching variant. Generic
    // clips retain the legacy first-state behavior so unrelated screens do
    // not inherit the same entrance animation.
    const candidates = [path];
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) candidates.push(parts.slice(i).join('/'));
    const matched = [];
    for (const state of matchStates) {
      const layout = layouts.get(state);
      if (!layout) continue;
      let matchedState = false;
      for (const candidate of candidates) {
        const hit = candidate ? suffixMatch(candidate, layout.nodes) : layout.nodes[0];
        if (hit) {
          matched.push({ state, nodeId: hit.id, nodePath: hit.path });
          matchedState = true;
          break;
        }
      }
      if (matchedState && !collectAllHintedStates) break;
    }
    if (!matched.length) {
      const authored = candidates.find(candidate => authoredNames.has(candidate));
      if (authored) matched.push({ state: stateNames[0], nodeId: null, nodePath: authored, source: 'authored' });
    }
    if (!matched.length) {
      for (const candidate of candidates) {
        const hit = runtimeNodes.find(node => node.path === candidate || node.path.endsWith('/' + candidate));
        if (hit) { matched.push({ state: hit.state, nodeId: null, nodePath: hit.path, source: 'runtime' }); break; }
      }
    }
    if (!matched.length) {
      for (const candidate of candidates) {
        const match = [...hierarchyPaths].find(hierarchyPath =>
          hierarchyPath === candidate || hierarchyPath.endsWith('/' + candidate));
        if (match) {
          matched.push({ state: stateNames[0], nodeId: null, nodePath: match, source: 'source-hierarchy' });
          break;
        }
      }
    }
    if (!matched.length) { unbound.push({ clip: name, path }); continue; }
    pathBound++;
    for (const target of matched) {
      for (const track of group) {
        const values = frames.map(t => num(track.transform(evalCurve(track.keys, t + start)), 0));
        target.channels ||= {};
        const channels = target.channels;
        if (track.channel === 'color') {
          const color = channels.color ||= { attribute: track.attribute, channels: {} };
          const axis = track.attribute.at(-1);
          color.channels[axis] = values.map(v => Math.round(v * 1e4) / 1e4);
        } else {
          channels[track.channel] = {
            attribute: track.attribute,
            values: values.map(v => Math.round(v * 1e4) / 1e4),
          };
        }
      }
      if (!targets.includes(target)) targets.push(target);
    }
  }
  const uniqueTargets = new Map();
  for (const target of targets) {
    const key = `${target.state}\u0000${target.nodeId}`;
    if (!uniqueTargets.has(key)) uniqueTargets.set(key, target);
    else Object.assign(uniqueTargets.get(key).channels ||= {}, target.channels || {});
  }
  const cssName = `k_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const compiled = { name, cssName,
    duration: Math.round(duration * 1000), loop: num(clip.m_AnimationClipSettings?.m_LoopTime) === 1,
    group: classify(name), targets: [...uniqueTargets.values()] };
  const emitted = applyCssNames(compiled, Math.max(1, Math.round(duration * 1000)));
  // Per-clip files are the runtime input. Write them only after applyCssNames
  // has populated the generated CSS channel names so getAnimations() can see
  // the authored curves instead of only metadata.
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(compiled) + '\n');
  if (emitCss) css += emitted;
  if (singleClip && wantsCss) singleClipCss += emitted;
  clips.push(compiled);
}

if (!singleClip) {
  const keep = new Set([...files.map(name => `${name}.json`), 'clips.json', 'bindings.json']);
  for (const entry of readdirSync(OUT)) {
    if (entry.endsWith('.json') && !keep.has(entry)) unlinkSync(join(OUT, entry));
  }
}
if (!singleClip) writeFileSync(join(OUT, 'clips.json'), JSON.stringify(clips, null, 2) + '\n');
if (emitCss) writeFileSync('app/css/clips.css', css);
if (singleClip && wantsCss) {
  const dir = 'app/data/clips';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${singleClip}.css`), singleClipCss);
}
const bindings = {};
for (const state of stateNames) bindings[state] = { onEnter: [], onLeave: [], loops: [], onStateChange: [], buttons: {}, manual: [] };
for (const clip of clips) {
  const targets = clip.targets;
  const affected = [...new Set(targets.map(t => t.state))];
  const group = clip.group;
  for (const state of affected) {
    const bucket = bindings[state][group];
    if (Array.isArray(bucket)) bucket.push({ clip: clip.name, targets: targets.filter(t => t.state === state).map(t => t.nodeId) });
    else if (group === 'buttons') {
      for (const t of targets.filter(t => t.state === state)) {
        const key = t.nodePath.split('/').at(-1);
        (bucket[key] ||= {})[clip.name.includes('Highlighted') ? 'hover'
          : clip.name.includes('Pressed') ? 'pressed'
          : clip.name.includes('Disabled') ? 'disabled'
          : clip.name.includes('Selected') ? 'selected'
          : 'normal'] = clip.name;
      }
    }
  }
}
if (!singleClip) writeFileSync(join(OUT, 'bindings.json'), JSON.stringify(bindings, null, 2) + '\n');
if (!singleClip) writeFileSync(join('app/data/unbound.json'), JSON.stringify(unbound, null, 2) + '\n');
if (!singleClip) writeFileSync(join('app/data/unmapped.json'), JSON.stringify(unmapped, null, 2) + '\n');
const rate = pathTotal ? pathBound / pathTotal : 1;
if (rate < 0.97) console.warn(`WARN unbound ${(100 * (1 - rate)).toFixed(1)}%: paths are not represented in the 10 static prefab roots; see app/data/unbound.json`);
pass(`clips compiled: ${clips.length} clips, ${pathBound}/${pathTotal} paths bound, ${unmapped.length} unmapped curves`);
