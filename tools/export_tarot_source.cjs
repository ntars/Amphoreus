#!/usr/bin/env node
/* Export a compact, source-derived description of the unpacked TarotBook UI.
   Inputs are the split Unity prefab JSON, animation clips and extracted sprite
   PNGs under ~/Downloads/hsr-ui-extract. Output is CSS data only: no image,
   screenshot, or rendered-page pixel data is used. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HOME = process.env.HOME;
const EXTRACT = process.env.HSR_EXTRACT || path.join(HOME, 'Downloads/hsr-ui-extract');
const PREFAB = path.join(EXTRACT, 'source-dump/probe-prefab-json/assets/asbres/ui/tarotbook');
const RECT_OVERLAY = process.env.HSR_RECT_OVERLAY || '';
const ANIM = path.join(EXTRACT, 'source-dump/tarot-source/assets/asbres/ui/animation/tarotbook');
const SPRITES = path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/ui/tarotbook/_autogen');
const SPRITE_OUTPUT = path.join(EXTRACT, 'exports/convert-all/assets/asbres/spriteoutput/ui/tarotbook');
const UI_SPRITE_OUTPUT = path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook');
const TEXTURES = path.join(EXTRACT, 'exports/convert-all/assets/asbres/ui/ui_texture');
const MATERIALS = path.join(EXTRACT, 'source-dump/block-9497e32c47e859c8911353a82d0eca3e/assets/asbres/ui/ui3d/tarotbook/_dependencies/materials');
const TYPOGRAPHY = path.join(__dirname, 'tarot_typography.json');
const OUT = path.join(__dirname, '..', 'web/codex-source.json');
const ANIMATION_CLIPS = [
  'TBBookletCoverPageContent_FadeIn.anim',
  'TarotBookStarPanelPage_FadeIn.anim',
  'TarotBookBookletBtn_FadeIn.anim',
  'TarotBookStoryStarShow.anim',
  'TarotBookRealMainPage_FadeIn.anim',
  'TarotBookRealMainPage_FadeIn_Error.anim',
  'TarotBookRealMainPageIcon_Loop1.anim',
  'TarotBookRealMainPageIcon_Loop2.anim',
  'TarotBookRealMainPageIcon_Loop3.anim',
  'TarotBookRealMainPageIcon_Loop4.anim',
  'TarotBookRealMainPageIcon_Loop5.anim',
  'TarotBookRealMainPageIcon_Loop6.anim',
  'TBBookletCoverPageContent_FadeOut.anim',
  'TBBookletCatalogContent_FadeOut.anim',
  'TarotBookRealMainPage_FadeOut.anim',
  'TarotBookRealMainPage_FadeOutAll.anim',
  'TarotBookRealMainPage_FadeIn3.anim',
  'TarotBookRealMainPage_FadeIn_FirstTime.anim',
  'TarotBookRealMainPage_FadeIn_Switch.anim',
  'TarotBookStarPanelPage_FadeOut.anim',
  'TarotBookBookletPage_FadeOut.anim',
  'TarotBookBookletPage_FadeIn3.anim',
  'TarotBookBookletPageRefresh_FadeIn.anim',
  'TarotBookBookletPageRefresh_FadeOut.anim',
  'TBBookletCatalogContent_FadeIn.anim',
  'TarotBookBookletPage_FadeIn.anim',
  'TarotBookBookletTopBtn_FadeIn.anim',
];
const HINT_ANIM = path.join(EXTRACT, 'source-dump/block-346e1042a7f55e1526f23bb56a4e20a7/assets/asbres/ui/animation/tarotbook');
const FULL_ANIM = path.join(EXTRACT, 'exports/convert-all/assets/asbres/ui/animation/tarotbook');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/"m_PathID":\s*(-?\d+)/g, '"m_PathID": "$1"'));
const listJson = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f)));
const round = (v, n = 4) => Number(Number(v).toFixed(n));
const pathIdKey = (v) => String(v);

function loadTypography() {
  if (!fs.existsSync(TYPOGRAPHY)) {
    throw new Error(`missing ${TYPOGRAPHY}; run tools/extract_tarot_typography.py first`);
  }
  const data = readJson(TYPOGRAPHY);
  const styles = Array.isArray(data.styles) ? data.styles : [];
  if (!styles.length) throw new Error('tarot typography contains no validated styles');
  return data;
}

function loadGraph() {
  const files = fs.readdirSync(PREFAB).filter((f) => f.endsWith('.json'));
  const objects = [];
  for (const file of files) {
    const data = readJson(path.join(PREFAB, file));
    // GameObject JSON embeds a transform snapshot; standalone RectTransform/Transform
    // files can carry the real child list. Prefer the richer transform for hierarchy.
    if (!file.startsWith('RectTransform#') && !file.startsWith('Transform#')) objects.push(data);
  }
  const transforms = [];
  for (const file of files) {
    const data = readJson(path.join(PREFAB, file));
    if (file.startsWith('RectTransform#') || file.startsWith('Transform#')) transforms.push(data);
  }
  for (const obj of objects) {
    const goId = obj.m_GameObject && obj.m_GameObject.m_PathID;
    const match = transforms.find((t) => t.m_GameObject && pathIdKey(t.m_GameObject.m_PathID) === pathIdKey(goId));
    if (match && (match.m_Children || []).length > (obj.m_Transform?.m_Children || []).length) {
      obj.m_Transform = match;
    }
  }
  const componentToObject = new Map();
  for (const obj of objects) {
    const transform = obj.m_Transform || obj;
    const name = transform.m_GameObject?.Name || obj.m_GameObject?.Name || obj.m_Name;
    if (!name) continue;
    for (const component of obj.m_Components || []) {
      if (component?.m_PathID !== undefined && component?.m_PathID !== null) {
        componentToObject.set(pathIdKey(component.m_PathID), obj);
      }
    }
  }
  const byFather = new Map();
  for (const obj of objects) {
    const transform = obj.m_Transform || obj;
    const father = transform.m_Father && transform.m_Father.m_PathID;
    const name = transform.m_GameObject?.Name || obj.m_GameObject?.Name || obj.m_Name;
    if (!father || father === 0 || !name) continue;
    if (!byFather.has(father)) byFather.set(father, []);
    byFather.get(father).push(obj);
  }
  const root = objects.find((o) => o.m_Transform?.m_Father?.IsNull && (o.m_GameObject?.Name || o.m_Name) === 'TarotBookRealMainPage');
  if (!root) throw new Error('TarotBookRealMainPage root not found');

  const transformByName = new Map();
  for (const obj of objects) {
    const name = obj.m_Transform?.m_GameObject?.Name || obj.m_GameObject?.Name || obj.m_Name;
    const transform = obj.m_Transform || obj;
    if (!name || !transform.m_LocalPosition) continue;
    if (!transformByName.has(name)) transformByName.set(name, []);
    transformByName.get(name).push(transform);
  }
  const named = (name, predicate = () => true) => (transformByName.get(name) || []).find(predicate);
  // AnimeStudio's stock RectTransform reader omits anchored/anchor/size/pivot for
  // this Unity build. A temporary patched build exports those fields; accept
  // only nodes whose GameObject PathID and local position match the split JSON.
  const rectOverlay = new Map();
  if (RECT_OVERLAY && fs.existsSync(RECT_OVERLAY)) {
    const finiteInRange = (value, min, max) => Number.isFinite(value) && Math.abs(value) <= max && (value === 0 || Math.abs(value) >= min);
    const sane = (rect) => {
      const fields = [rect.m_AnchorMin, rect.m_AnchorMax, rect.m_AnchoredPosition, rect.m_SizeDelta, rect.m_Pivot].flatMap((v) => [v?.X, v?.Y]);
      return fields.every((value) => finiteInRange(Number(value), 1e-5, 8192));
    };
    for (const file of fs.readdirSync(RECT_OVERLAY).filter((f) => f.endsWith('.json'))) {
      const rect = readJson(path.join(RECT_OVERLAY, file));
      if (!rect.m_GameObject || !rect.m_AnchoredPosition || !rect.m_SizeDelta || !sane(rect)) continue;
      const original = transforms.find((t) => pathIdKey(t.m_GameObject?.m_PathID) === pathIdKey(rect.m_GameObject.m_PathID)
        && Math.abs(Number(t.m_LocalPosition?.X || 0) - Number(rect.m_LocalPosition?.X || 0)) < 1e-3
        && Math.abs(Number(t.m_LocalPosition?.Y || 0) - Number(rect.m_LocalPosition?.Y || 0)) < 1e-3);
      if (original) {
        rectOverlay.set(pathIdKey(rect.m_GameObject.m_PathID), rect);
        // BtnBook/FunctionList have unnamed legacy objects in the local CAB;
        // the stable 3x2 grid and the sibling button records identify them.
        const pos = rect.m_LocalPosition;
        if (Math.abs(pos.X - 98) < 1e-3 && Math.abs(pos.Y + 27) < 1e-3 && rect.m_Children.length >= 2) {
          const book = transforms.find((t) => t.m_GameObject?.Name === 'BtnBook' && Math.abs(t.m_LocalPosition?.X - 98) < 1e-3 && Math.abs(t.m_LocalPosition?.Y + 27) < 1e-3);
          if (book) rectOverlay.set(pathIdKey(book.m_GameObject.m_PathID), rect);
        }
        if (Math.abs(pos.X) < 1e-3 && Math.abs(pos.Y + 60) < 1e-3 && rect.m_Children.length >= 6) {
          const list = transforms.find((t) => t.m_GameObject?.Name === 'FunctionList' && Math.abs(t.m_LocalPosition?.Y - 60) < 1e-3);
          if (list) rectOverlay.set(pathIdKey(list.m_GameObject.m_PathID), rect);
        }
      }
    }
  }
  const enriched = (transform) => {
    const rect = rectOverlay.get(pathIdKey(transform?.m_GameObject?.m_PathID));
    return rect ? { ...transform, ...rect } : transform;
  };
  const point = (raw) => {
    const obj = enriched(raw);
    return {
    x: round(obj?.m_LocalPosition?.X || 0), y: round(obj?.m_LocalPosition?.Y || 0), z: round(obj?.m_LocalPosition?.Z || 0),
    rotation: round(obj?.m_LocalRotation?.Z || 0, 6),
    scale: [round(obj?.m_LocalScale?.X || 1), round(obj?.m_LocalScale?.Y || 1), round(obj?.m_LocalScale?.Z || 1)],
    size: [
      round(obj?.m_SizeDelta?.X || 0),
      round(obj?.m_SizeDelta?.Y || 0),
    ],
    anchoredPosition: [
      round(obj?.m_AnchoredPosition?.X || 0),
      round(obj?.m_AnchoredPosition?.Y || 0),
    ],
    anchors: [
      round(obj?.m_AnchorMin?.X ?? 0, 6), round(obj?.m_AnchorMin?.Y ?? 0, 6),
      round(obj?.m_AnchorMax?.X ?? 0, 6), round(obj?.m_AnchorMax?.Y ?? 0, 6),
    ],
    pivot: [round(obj?.m_Pivot?.X ?? 0, 6), round(obj?.m_Pivot?.Y ?? 0, 6)],
    };
  };
  const childNames = (transform) => {
    const ids = new Set((transform?.m_Children || []).map((c) => c.m_PathID));
    const found = [];
    const seen = new Set();
    for (const id of ids) {
      const direct = componentToObject.get(pathIdKey(id));
      if (direct) {
        found.push((direct.m_Transform?.m_GameObject?.Name || direct.m_GameObject?.Name || direct.m_Name));
        continue;
      }
      const standalone = transforms.find((t) => pathIdKey(t.m_GameObject?.m_PathID) === pathIdKey(id));
      const name = standalone?.m_GameObject?.Name;
      if (name && !seen.has(name)) {
        seen.add(name);
        found.push(name);
      }
    }
    return found;
  };
  const children = (transform) => {
    const ids = new Set((transform?.m_Children || []).map((c) => c.m_PathID));
    const picks = [];
    for (const id of ids) {
      const direct = componentToObject.get(pathIdKey(id));
      if (direct) {
        picks.push(direct);
        continue;
      }
      const standalone = transforms.find((t) => pathIdKey(t.m_GameObject?.m_PathID) === pathIdKey(id));
      const name = standalone?.m_GameObject?.Name;
      const obj = name ? objects.find((o) => (o.m_Transform?.m_GameObject?.Name || o.m_GameObject?.Name || o.m_Name) === name) : null;
      if (obj) picks.push(obj);
    }
    return picks.filter((o, i) => picks.findIndex((x) => x === o) === i);
  };
  const findChild = (obj, name) => children(obj).find((o) => (o.m_Transform?.m_GameObject?.Name || o.m_GameObject?.Name || o.m_Name) === name);

  const desktop = named('DesktopPanel');
  const functionList = named('FunctionList', (o) => (o.m_Children || []).length >= 6);
  const starRoot = named('StarPanel', (o) => (o.m_Children || []).length >= 3);
  const center = named('CenterPanel', (o) => (o.m_Children || []).length >= 1);
  const frame = named('Frame', (o) => (o.m_Children || []).length >= 6 && (o.m_Children || []).some((c) => String(c.m_PathID) === '4220632411438594893'));
  const namedAll = (name) => transformByName.get(name) || [];
  const starRings = ['Circle1', 'InnerCircle1', 'StarPatternBg', 'StarPatternOutline', 'StarPatternLight', 'StarMask', 'EffTechStarMask', 'StarOutcircle', 'StarLight']
    .map((name) => ({ name, ...point(named(name)) }));
  const outside = named('Outside');
  const pageInfo = named('PageInfo', (o) => (o.m_Children || []).length >= 3);
  const bottomBar = named('BottomBar', (o) => (o.m_Children || []).length >= 3);
  const bottomBarGeometry = Object.fromEntries(childNames(bottomBar).map((name) => {
    const transform = named(name) || transforms.find((t) => t.m_GameObject?.Name === name);
    return [name, point(transform)];
  }));
  const outsideGeometry = Object.fromEntries(childNames(outside).map((name) => {
    const transform = named(name) || transforms.find((t) => t.m_GameObject?.Name === name);
    return [name, point(transform)];
  }));
  const pageInfoGeometry = Object.fromEntries(childNames(pageInfo).map((name) => {
    const transform = named(name) || transforms.find((t) => t.m_GameObject?.Name === name);
    return [name, point(transform)];
  }));
  const panelNames = [
    'PageInfo', 'Title', 'TitleType', 'IconPanel', 'Outside', 'RewardPanel',
    'BtnClose', 'BtnGo', 'BtnReward', 'BottomBar', 'CenterPanel', 'StarPanel',
    'Content', 'DesktopPanel', 'FunctionList',
  ];
  const panels = Object.fromEntries(panelNames.map((name) => {
    const hits = transformByName.get(name) || [];
    const transform = hits.find((t) => t.m_LocalPosition) || transforms.find((t) => t.m_GameObject?.Name === name);
    return [name, point(transform)];
  }));

  // RectTransform size/anchor/pivot data is essential for exact CSS geometry;
  // export the named nodes that drive visible UI layers, not just positions.
  const geometryNames = [
    ...panelNames, 'Content', 'ScreenBg', 'BottomBar', 'CountText', 'TimeText',
    'Title', 'TitleType', 'IconPanel', 'PageInfo', 'Outside', 'RewardPanel',
    'BtnClose', 'BtnGo', 'BtnReward', 'StarPanel', 'CenterPanel', 'Frame',
    'StarOutcircle', 'StarLight', 'Circle1', 'InnerCircle1', 'StarPatternBg',
    'StarPatternOutline', 'StarPatternLight', 'StarMask', 'EffTechStarMask',
    'FunctionList', 'NewMailHint',
    'BtnBook', 'BtnStar', 'BtnPaper', 'BtnWiki', 'BtnMem', 'BtnMail',
  ];
  const geometry = Object.fromEntries([...new Set(geometryNames)].map((name) => {
    const hits = transformByName.get(name) || [];
    const original = hits.find((t) => t.m_SizeDelta || t.m_LocalPosition)
      || transforms.find((t) => t.m_GameObject?.Name === name);
    const overlay = original && rectOverlay.get(pathIdKey(original.m_GameObject?.m_PathID));
    const transform = overlay ? { ...original, ...overlay } : original;
    return [name, point(transform)];
  }));

  const buttons = ['BtnBook', 'BtnStar', 'BtnPaper', 'BtnWiki', 'BtnMem', 'BtnMail'].map((name) => {
    const obj = named(name, (o) => Math.abs(o.m_LocalPosition.X) > 1 || Math.abs(o.m_LocalPosition.Y) > 1);
    return { name, ...point(obj) };
  });

  return {
    root: point(root?.m_Transform),
    hierarchy: {
      panels,
      geometry,
      root: children(root?.m_Transform).map((o) => (o.m_Transform?.m_GameObject?.Name || o.m_GameObject?.Name || o.m_Name)),
      desktop: children(desktop).map((o) => ({ name: (o.m_Transform?.m_GameObject?.Name || o.m_GameObject?.Name || o.m_Name), ...point(o.m_Transform) })),
      functionList: childNames(functionList).map((name) => {
        const transform = named(name) || transforms.find((t) => t.m_GameObject?.Name === name);
        return { name, ...point(transform) };
      }),
      outside: childNames(outside),
      outsideGeometry,
      pageInfo: childNames(pageInfo),
      pageInfoGeometry,
      bottomBar: point(bottomBar?.m_Transform || transforms.find((t) => t.m_GameObject?.Name === 'BottomBar')),
      bottomBarGeometry,
      starPanel: children(starRoot).map((o) => ({ name: (o.m_Transform?.m_GameObject?.Name || o.m_GameObject?.Name || o.m_Name), ...point(o.m_Transform) })),
      centerPanel: childNames(center).map((name) => {
        const transform = named(name) || transforms.find((t) => t.m_GameObject?.Name === name);
        return { name, ...point(transform) };
      }),
      frame: childNames(frame).map((name) => {
        const transform = transforms.find((t) => t.m_GameObject?.Name === name);
        return { name, ...point(transform) };
      }),
      starRings,
    },
    buttons,
  };
}

function parseCurves(file, dir = ANIM) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const out = [];
  // Unity has two YAML shapes: transform curves end with `attribute/path`, while
  // Euler curves only carry `path`. Keep the collection name so CSS consumers
  // do not confuse rotations with float curves.
  const lines = text.split(/\r?\n/);
  let collection = '';
  let current = null;
  const flush = () => {
    if (current && current.keys.length) out.push(current);
    current = null;
  };
  for (const line of lines) {
    const header = line.match(/^  m_([A-Za-z]+Curves):\s*(.*)$/);
    if (header) {
      flush();
      collection = header[2].trim() === '[]' ? '' : 'm_' + header[1];
      continue;
    }
    if (!collection) continue;
    if (/^\s*-\s+curve:\s*$/.test(line)) {
      flush();
      current = { collection, path: '', attribute: '', keys: [], pending: null };
      continue;
    }
    if (!current) continue;
    const path = line.match(/^\s+path:\s*(.*)$/);
    if (path) current.path = path[1].trim() || 'Root';
    const attr = line.match(/^\s+attribute:\s*(.*)$/);
    if (attr) current.attribute = attr[1].trim();
    const key = line.match(/^\s+time:\s*([-\d.e]+)\s*$/);
    if (key) {
      const entry = { time: round(key[1], 6), value: '' };
      current.keys.push(entry);
      current.pending = entry;
      continue;
    }
    const value = line.match(/^\s+value:\s*(.*)$/);
    if (value && current.pending) {
      current.pending.value = Number(value[1]) || value[1];
      current.pending = null;
    }
  }
  flush();
  const settings = text.match(/m_StartTime: ([-\d.]+)[\s\S]*?m_StopTime: ([-\d.]+)/);
  const deduped = out.filter((curve, i) => out.findIndex((other) =>
    other.collection === curve.collection && other.path === curve.path && other.attribute === curve.attribute) === i);
  return { file, startTime: settings ? Number(settings[1]) : 0, stopTime: settings ? Number(settings[2]) : 0, curves: deduped };
}

function decodePng(png) {
  const buf = fs.readFileSync(png);
  let off = 8;
  let width, height, bitDepth, colorType;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`${png}: unsupported PNG ${bitDepth}/${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  let ro = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ro++];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = raw[ro++];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, pixels };
}

function sampleSprite(rel, grid = 3) {
  return samplePng(path.join(SPRITES, rel), rel, grid);
}

function samplePng(file, rel, grid = 3) {
  const { width, height, channels, pixels } = decodePng(file);
  const colors = [];
  const alphaByCell = [];
  for (let gy = 0; gy < grid; gy++) {
    const row = [];
    for (let gx = 0; gx < grid; gx++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(gx * width / grid), x1 = Math.floor((gx + 1) * width / grid);
      const y0 = Math.floor(gy * height / grid), y1 = Math.floor((gy + 1) * height / grid);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        const av = channels === 4 ? pixels[i + 3] / 255 : 1;
        r += pixels[i] * av; g += pixels[i + 1] * av; b += pixels[i + 2] * av; a += av; n++;
      }
      row.push({ color: a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a)] : [0, 0, 0], alpha: round(a / n, 4) });
    }
    colors.push(row); alphaByCell.push(row.map((c) => c.alpha));
  }
  return { file: rel, size: [width, height], colors, alpha: alphaByCell };
}

function sampleTexture(rel, grid = 4) {
  const { width, height, channels, pixels } = decodePng(path.join(TEXTURES, rel));
  const colors = [];
  for (let gy = 0; gy < grid; gy++) {
    const row = [];
    for (let gx = 0; gx < grid; gx++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(gx * width / grid), x1 = Math.floor((gx + 1) * width / grid);
      const y0 = Math.floor(gy * height / grid), y1 = Math.floor((gy + 1) * height / grid);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        const av = channels === 4 ? pixels[i + 3] / 255 : 1;
        r += pixels[i] * av; g += pixels[i + 1] * av; b += pixels[i + 2] * av; a += av; n++;
      }
      row.push({ color: a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a)] : [0, 0, 0], alpha: round(a / n, 4) });
    }
    colors.push(row);
  }
  return { file: rel, size: [width, height], colors };
}

function readMaterial(file, colorName = '_MainColor') {
  const direct = path.join(MATERIALS, file);
  const nested = path.join(MATERIALS, 'starpanel', file);
  const data = readJson(fs.existsSync(direct) ? direct : nested);
  const colors = data.m_SavedProperties?.m_Colors || {};
  const color = colors[colorName];
  if (!color) return null;
  return {
    file,
    colorName,
    rgb: [color.r, color.g, color.b].map((v) => round(v, 6)),
    alpha: round(color.a, 8),
    css: `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${round(color.a, 6)})`,
  };
}

function silhouette(rel, cols = 32, rows = 32) {
  return silhouettePng(path.join(SPRITES, rel), rel, cols, rows);
}

function silhouettePng(file, rel, cols = 32, rows = 32) {
  const { width, height, channels, pixels } = decodePng(file);
  const lines = [];
  const threshold = 96;
  for (let gy = 0; gy < rows; gy++) {
    let line = '';
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(gx * width / cols), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / cols));
      const y0 = Math.floor(gy * height / rows), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / rows));
      let max = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        max = Math.max(max, channels === 4 ? pixels[i + 3] : 255);
      }
      line += max >= threshold ? '#' : '.';
    }
    lines.push(line);
  }
  return lines;
}

// Convert an official alpha sprite into an axis-aligned polygon. The browser
// rasterizes this vector outline, so no PNG is loaded at runtime.
function averageSpriteColor(rel, alphaThreshold = 128) {
  return averagePngColor(path.join(SPRITES, rel), rel, alphaThreshold);
}

function averagePngColor(file, rel, alphaThreshold = 128) {
  const { width, height, channels, pixels } = decodePng(file);
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let i = 0; i < width * height; i++) {
    const av = channels === 4 ? pixels[i * channels + 3] : 255;
    if (av < alphaThreshold) continue;
    r += pixels[i * channels]; g += pixels[i * channels + 1]; b += pixels[i * channels + 2]; a += av; n++;
  }
  if (!n) return null;
  const rgb = [r / n, g / n, b / n].map((v) => Math.round(v));
  return { file: rel, rgb, alpha: round(a / n / 255, 4), css: `rgb(${rgb.join(', ')})` };
}

function silhouettePath(rel, cols = 32, rows = 32, threshold = 96) {
  return silhouettePngPath(path.join(SPRITES, rel), rel, cols, rows, threshold);
}

function silhouettePngPath(file, rel, cols = 32, rows = 32, threshold = 96) {
  const { width, height, channels, pixels } = decodePng(file);
  const covered = [];
  for (let gy = 0; gy < rows; gy++) {
    const row = [];
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(gx * width / cols), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / cols));
      const y0 = Math.floor(gy * height / rows), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / rows));
      let max = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        max = Math.max(max, channels === 4 ? pixels[i + 3] : 255);
      }
      row.push(max >= threshold);
    }
    covered.push(row);
  }
  const edges = [];
  const point = (gx, gy) => `${round(gx / cols * 100, 3)}% ${round(gy / rows * 100, 3)}%`;
  const filled = (gx, gy) => gx >= 0 && gy >= 0 && gx < cols && gy < rows && covered[gy][gx];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (!filled(gx, gy)) continue;
    if (!filled(gx - 1, gy)) edges.push([point(gx, gy), point(gx, gy + 1)]);
    if (!filled(gx + 1, gy)) edges.push([point(gx + 1, gy + 1), point(gx + 1, gy)]);
    if (!filled(gx, gy - 1)) edges.push([point(gx + 1, gy), point(gx, gy)]);
    if (!filled(gx, gy + 1)) edges.push([point(gx, gy + 1), point(gx + 1, gy + 1)]);
  }
  // Chain boundary segments into loops so clip-path remains a single polygon.
  const ends = edges.map(([a, b]) => ({ a, b, used: false }));
  const key = (p) => p;
  const byStart = new Map();
  ends.forEach((e, i) => byStart.set(key(e.a), [...(byStart.get(key(e.a)) || []), i]));
  const ordered = [];
  let current = ends[0];
  while (current && !current.used) {
    current.used = true;
    ordered.push(current.a);
    const next = (byStart.get(key(current.b)) || []).find((i) => !ends[i].used);
    current = next === undefined ? null : ends[next];
  }
  return ordered.length >= 3 ? `polygon(${ordered.join(', ')})` : null;
}

// Generate chapter-card vector/color keys from the unpacked sprite families.
// Names are normalised so Card1 and Card01 refer to the same official chapter.
const cardChapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const cardLayers = [
  ['banner', 'Banner', 48, 32],
  ['circle', 'CenterCircle', 32, 32],
  ['backCircle', 'CenterBackCircle', 36, 36],
  ['deco', 'DecoItem', 48, 48],
  ['symbol', 'Symbol', 32, 32],
  ['spSymbol', 'SpSymbol', 32, 32],
  ['character', 'Character', 48, 64],
];
const cardVectorEntries = [];
const cardColorEntries = [];
for (const chapter of cardChapters) {
  const folderNumber = String(chapter).padStart(2, '0');
  const spriteNumber = chapter === 1 ? '1' : folderNumber;
  for (const [layer, suffix, cols, rows] of cardLayers) {
    for (const state of ['Active', 'UnActive']) {
      const spriteName = `TarotBookCard${spriteNumber}_${suffix}_${state}.png`;
      let rel = `spriteoutput/ui/tarotbook/tarotbookcard/card${folderNumber}/${spriteName}`;
      let file = path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres', rel);
      if (!fs.existsSync(file)) {
        // Selected cards have their missing state frames in the unpacked
        // _autogen atlas rather than the spriteoutput card folder.
        rel = `ui/tarotbook/_autogen/${spriteName}`;
        file = path.join(SPRITES, spriteName);
      }
      if (!fs.existsSync(file)) continue;
      const key = `chapter${folderNumber}${layer}${state === 'Active' ? 'Active' : ''}`;
      const clip = silhouettePngPath(file, rel, cols, rows, 96);
      if (!clip) continue;
      cardVectorEntries.push([key, clip]);
      cardColorEntries.push([key, averagePngColor(file, rel, 1)]);
    }
  }
}
const cardVectors = Object.fromEntries(cardVectorEntries);
const cardColors = Object.fromEntries(cardColorEntries);
// Card1 uses a different sprite number but the same runtime chapter key as card01.
for (const [key, value] of Object.entries(cardVectors)) {
  if (key.startsWith('chapter01')) cardVectors[key.replace('chapter01', 'chapter1')] = value;
}
for (const [key, value] of Object.entries(cardColors)) {
  if (key.startsWith('chapter01')) cardColors[key.replace('chapter01', 'chapter1')] = value;
}

const result = {
  generatedFrom: {
    prefab: '~/Downloads/hsr-ui-extract/source-dump/probe-prefab-json/assets/asbres/ui/tarotbook',
    animation: '~/Downloads/hsr-ui-extract/source-dump/tarot-source/assets/asbres/ui/animation/tarotbook',
    sprites: '~/Downloads/hsr-ui-extract/exports/tarot-ui-all-blocks/assets/asbres/ui/tarotbook',
    textures: '~/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/ui/ui_texture',
    typography: 'tools/tarot_typography.json',
  },
  typography: loadTypography(),
  layout: loadGraph(),
  animations: [
    ...ANIMATION_CLIPS.map((file) => parseCurves(file)),
  ],
  materials: {
    starLineWarm: readMaterial('UI3D_TarotBook_1007_StarPanelLine.json'),
    starLineGold: readMaterial('UI3D_TarotBook_1008_StarPanelLine.json'),
    starBg: readMaterial('UI3D_TarotBook_1004_StarPanelBg2.json'),
    starDeco: readMaterial('UI3D_TarotBook_1004_StarPanelBgDeco2.json'),
    starCircle1: readMaterial('UI3D_TarotBook_1004_StarPanelCircle1.json'),
    starCircle6: readMaterial('UI3D_TarotBook_1006_StarPanelCircle6.json'),
    scene: {
      sky: readMaterial('UI3D_TarotBook_1001_Sky.json'),
      skyCloud: readMaterial('UI3D_TarotBook_1002_SkyCloud.json'),
      stone: readMaterial('UI3D_TarotBook_1007_Stone.json'),
      glow: readMaterial('UI3D_TarotBook_1015_Glow.json'),
    },
  },
  sprites: {
    buttonStar: sampleSprite('TarotBookMainIconStar1.png'),
    buttonStarWhite: sampleSprite('TarotBookMainIconStar3.png'),
  },
  textures: {
    petal: sampleTexture('object/UI_Obj_1048_Leaf.png'),
    glow: sampleTexture('glow/UI_Glow_77.png'),
    bookletPage: averageSpriteColor('sactx-1024x1024-BC7-TarotBookBookletPage-45eccf76.png', 1),
    mimiTalkPage: averageSpriteColor('sactx-1024x1024-BC7-TarotBookMimiTalkPage-abf05028.png', 1),
    realMainPage: averageSpriteColor('sactx-1024x512-BC7-TarotBookRealMainPage-4ea96422.png', 1),
    openMainPage: averageSpriteColor('sactx-2048x2048-BC7-TarotBookOpenMainPage-3863994d.png', 1),
    questRewardPage: averageSpriteColor('sactx-512x1024-BC7-TarotBookQuestRewardPage-aa3a1c07.png', 1),
    mainEntrancePage: averageSpriteColor('sactx-512x512-BC7-TarotBookMainEntrancePage-fdf3ef07.png', 1),
  },
  silhouettes: {
    buttonStar: silhouette('TarotBookMainIconStar1.png'),
  },
  vectors: {
    ...cardVectors,
    buttonStar: silhouettePath('TarotBookMainIconStar1.png'),
    buttonStar2: silhouettePath('TarotBookMainIconStar2.png', 40, 40, 96),
    buttonBook: silhouettePath('TarotBookMainIconBook3.png', 40, 52, 48),
    buttonMail2: silhouettePath('TarotBookMainIconMail2.png', 38, 16, 96),
    buttonMail3: silhouettePath('TarotBookMainIconMail3.png', 38, 16, 96),
    buttonMail4: silhouettePath('TarotBookMainIconMail4.png', 38, 16, 96),
    buttonMem2: silhouettePath('TarotBookMainIconMem2.png', 40, 42, 96),
    buttonMem3: silhouettePath('TarotBookMainIconMem3.png', 40, 42, 96),
    buttonMem4: silhouettePath('TarotBookMainIconMem4.png', 40, 42, 96),
    buttonMem5: silhouettePath('TarotBookMainIconMem5.png', 40, 42, 96),
    buttonMem6: silhouettePath('TarotBookMainIconMem6.png', 40, 42, 96),
    buttonPaper2: silhouettePath('TarotBookMainIconPaper2.png', 32, 42, 96),
    buttonPaper3: silhouettePath('TarotBookMainIconPaper3.png', 32, 42, 96),
    buttonPaper4: silhouettePath('TarotBookMainIconPaper4.png', 32, 42, 96),
    buttonWiki2: silhouettePath('TarotBookMainIconWiki2.png', 40, 40, 96),
    buttonBook1: silhouettePath('TarotBookMainIconBook1.png', 40, 52, 96),
    buttonBook4: silhouettePath('TarotBookMainIconBook4.png', 40, 52, 96),
    buttonBook5: silhouettePath('TarotBookMainIconBook5.png', 40, 52, 96),
    buttonBook6: silhouettePath('TarotBookMainIconBook6.png', 40, 52, 96),
    buttonWiki: silhouettePath('TarotBookMainIconWiki1.png', 40, 40, 48),
    buttonPaper: silhouettePath('TarotBookMainIconPaper1.png', 32, 42, 48),
    buttonMail: silhouettePath('TarotBookMainIconMail1.png', 38, 16, 48),
    buttonMem: silhouettePath('TarotBookMainIconMem7.png', 40, 42, 48),
    catalogBgDeco: silhouettePath('TBMainCatalogBgDecoNormal.png', 30, 36, 48),
    catalogItem: silhouettePath('TBMainCatalogItemEmpty.png', 16, 16, 48),
    catalogCorner: silhouettePath('TBMainCatalogItemCornorDeco.png', 16, 16, 48),
    catalogBgDeco13: silhouettePath('TBMainCatalogBgDeco13.png', 30, 36, 48),
    catalogItem13: silhouettePath('TBMainCatalogItem13Bg.png', 28, 28, 48),
    catalogItemMask: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBMainCatalogItemMask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogItemMask.png', 24, 24, 96),
    catalogItem13Mask: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBMainCatalogItem13Mask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogItem13Mask.png', 30, 30, 96),
    confirmBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnCheckBg.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnCheckBg.png', 32, 16, 64),
    confirmCircle: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnCheckDecoCircle.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnCheckDecoCircle.png', 24, 24, 64),
    buttonPattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnDecoPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnDecoPattern.png', 48, 12, 64),
    bookDecoItem: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBookDecoItem.png'), 'spriteoutput/ui/tarotbook/TarotBookBookDecoItem.png', 32, 96, 64),
    signCenterIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterIcon.png', 32, 32, 64),
    signCenterStar: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterStar.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterStar.png', 24, 24, 64),
    signDotPattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignDotPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDotPattern.png', 64, 64, 64),
    errorDialogBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogBg.png', 64, 32, 64),
    errorHintBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogHintBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogHintBg.png', 64, 24, 64),
    errorHintIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogHintIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogHintIcon.png', 32, 32, 64),
    errorIconEff: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorIconEff.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorIconEff.png', 48, 48, 64),
    buttonComDeco1: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnComDecoIcon1.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnComDecoIcon1.png', 24, 24, 64),
    buttonComDeco2: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnComDecoIcon2.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnComDecoIcon2.png', 48, 16, 64),
    buttonLargePattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnPattern.png', 64, 64, 72),
    mailStarIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookMailStarIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMailStarIcon.png', 20, 20, 64),
    signBgLight: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignBgLight.png'), 'spriteoutput/ui/tarotbook/TarotBookSignBgLight.png', 96, 64, 64),
    signBgPattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignBgPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookSignBgPattern.png', 96, 96, 64),
    signDecoIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignDecoIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDecoIcon.png', 20, 16, 64),
    signLineBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignLineBg.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineBg.png', 64, 32, 64),
    signLineEffect: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignLineEffect.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineEffect.png', 64, 32, 64),
    signLineOutlineGlow: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignLineOutlineGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineOutlineGlow.png', 64, 32, 64),
    signCenterStarLight: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterStarLight.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterStarLight.png', 32, 32, 64),
    signPressCircle2: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCircle2.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCircle2.png', 48, 48, 64),
    coverCenterDeco1: silhouettePath('TBBookletCoverPageCenterDeco1.png', 20, 32, 48),
    coverCenterDeco2: silhouettePath('TBBookletCoverPageCenterDeco2.png', 20, 28, 48),
    coverCloud: silhouettePath('TBBookletCoverPageDecoCloud2.png', 50, 12, 48),
    coverFire: silhouettePath('TBBookletCoverPageDecoFire.png', 32, 40, 48),
    coverPeople: silhouettePath('TBBookletCoverPageDecoPeople2.png', 24, 46, 48),
    mainRing: silhouettePath('TarotBookMainDecoRing.png', 42, 42, 48),
    starItemEmptyStar: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemEmptyStar.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemEmptyStar.png', 32, 32, 1),
    starItemLightStar: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemLightStar.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemLightStar.png', 32, 32, 1),
    starItemOutline4px: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemOutline4px.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemOutline4px.png', 40, 40, 1),
    starLightItemOutline: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarLightItemOutline.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarLightItemOutline.png', 48, 48, 1),
    starItemCircle: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemCircle.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemCircle.png', 40, 40, 128),
    catalogTextDeco: silhouettePath('TBMainCatalogBgTextDeco1.png', 30, 6, 48),
    catalogItemIcon: silhouettePath('TBMainCatalogItemDecoIcon.png', 32, 16, 48),
    rewardButton: silhouettePngPath(
      path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/ui/travelbrochure/_autogen/TBStickerRewardBtnBg.png'),
      'travelbrochure/_autogen/TBStickerRewardBtnBg.png', 40, 16, 48),
    rewardTextBg: silhouettePngPath(
      path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/ui/travelbrochure/_autogen/TBMainPageProgressRewardBtnTextBg.png'),
      'travelbrochure/_autogen/TBMainPageProgressRewardBtnTextBg.png', 40, 16, 48),
    mailHintBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBEnergyHintBg.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintBg.png', 32, 32, 48),
    mailHintDeco: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBEnergyHintDecoItem.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintDecoItem.png', 32, 32, 48),
    mailHintStar: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBEnergyHintStarDeco1.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintStarDeco1.png', 20, 28, 48),
    waitingIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookIconWait.png'), 'spriteoutput/ui/tarotbook/TarotBookIconWait.png', 32, 32, 48),
    waitingLight: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookIconWaitLight.png'), 'spriteoutput/ui/tarotbook/TarotBookIconWaitLight.png', 32, 32, 48),
    signDecoLine: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignDecoLine.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDecoLine.png', 40, 24, 48),
    signLightLine: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignLightLine.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLightLine.png', 40, 24, 48),
    signLineOutline: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignLineOutline.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineOutline.png', 40, 40, 48),
    closeIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBtnCloseIcon.png'), 'spriteoutput/ui/tarotbook/TBBtnCloseIcon.png', 32, 32, 48),
    buttonDecoIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookBtnDecoIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnDecoIcon.png', 32, 32, 48),
    cardBack: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardBackBg.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardBackBg.png', 28, 40, 48),
    cardOutline: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardOutline.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardOutline.png', 28, 40, 48),
    cardSelectOutline: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardSelectOutline.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardSelectOutline.png', 28, 40, 48),
    cardStar: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBCardUpStarOutline.png'), 'spriteoutput/ui/tarotbook/TBCardUpStarOutline.png', 24, 24, 48),
    cardBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardBg.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardBg.png', 40, 40, 48),
    cardIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardIcon.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardIcon.png', 32, 32, 48),
    cardMask: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardMask.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardMask.png', 40, 40, 48),
    cardShadow: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardShadow.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardShadow.png', 48, 48, 48),
    cardLightStar: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBCardUpLightStar.png'), 'spriteoutput/ui/tarotbook/TBCardUpLightStar.png', 24, 24, 48),
    cardLightIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBCardUpLightIcon.png'), 'spriteoutput/ui/tarotbook/TBCardUpLightIcon.png', 24, 24, 48),
    coverPagePattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageBgPattern.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageBgPattern.png', 96, 56, 72),
    catalogBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBMainCatalogBg.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogBg.png', 24, 96, 96),
    signPageBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookSignPageBg.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPageBg.png', 96, 56, 80),
    endPageDeco: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBookletEndPageDecoPattern.png'), 'spriteoutput/ui/tarotbook/TBBookletEndPageDecoPattern.png', 40, 16, 96),
    coverPageBg: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageBg.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageBg.png', 72, 40, 72),
    coverPageDecoItem: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageDecoItem.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageDecoItem.png', 24, 48, 72),
    endPageBorder: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBBookletEndPageDeco.png'), 'spriteoutput/ui/tarotbook/TBBookletEndPageDeco.png', 96, 12, 72),
    energyHintPattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBEnergyHintBgPattern.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintBgPattern.png', 16, 16, 64),
    energyHintDecoPattern: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBEnergyHintDecoPattern.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintDecoPattern.png', 32, 12, 64),
    catalogSideDeco: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TBMainCatalogBgDeco.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogBgDeco.png', 24, 64, 64),
    toastIcon: silhouettePngPath(path.join(SPRITE_OUTPUT, 'TarotBookToastIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookToastIcon.png', 32, 16, 64),
    autoIcon: silhouettePath('TarotBookBtnAutoIcon.png', 32, 24, 64),
    autoIconGlow: silhouettePath('TarotBookBtnAutoIconGlow.png', 32, 24, 64),
    autoIconOutline: silhouettePath('TarotBookBtnAutoIconOutline.png', 32, 24, 64),
    autoShadow: silhouettePath('TarotBookBtnAutoShadow.png', 32, 24, 1),
    checkIcon: silhouettePath('TarotBookBtnCheckIcon.png', 24, 24, 64),
    checkOutline: silhouettePath('TarotBookBtnCheckOutline.png', 32, 32, 64),
    waitProgress: silhouettePath('TarotBookIconWaitProgress.png', 40, 40, 64),
    mailHintPanel: silhouettePath('TarotBookMailHint.png', 32, 32, 64),
    mainDecoRect: silhouettePath('TarotBookMainDecoRect.png', 48, 40, 64),
    entranceBtnLine: silhouettePath('TarotBookMainEntranceBtnLine.png', 64, 8, 64),
    selectFrame: silhouettePath('TarotBookMainSelectFrame.png', 40, 32, 64),
    openBookHintTextBg: silhouettePath('TarotBookOpenBookHintTextBg.png', 64, 12, 64),
    textUnderLine: silhouettePath('TarotBookTextUnderLine.png', 64, 8, 64),
    chartCataTabDeco: silhouettePath('TarotBookChartCataTabDeco.png', 48, 24, 64),
    chartCataTabOutline: silhouettePath('TarotBookChartCataTabOutline.png', 72, 24, 64),
    chartTabBgShadow: silhouettePath('TarotBookChartTabBgShadow.png', 32, 32, 64),
    chartTabDecoIcon: silhouettePath('TarotBookChartTabDecoIcon.png', 16, 32, 64),
    chartTabFinishIcon: silhouettePath('TarotBookChartTabFinishIcon.png', 20, 20, 64),
    chartTabLockIcon: silhouettePath('TarotBookChartTabLockIcon.png', 16, 24, 64),
    chartTabOutline: silhouettePath('TarotBookChartTabOutline.png', 20, 40, 64),
    chartTabOutlineR: silhouettePath('TarotBookChartTabOutlineR.png', 24, 40, 64),
    chartTabPattern: silhouettePath('TarotBookChartTabPattern.png', 48, 32, 64),
    questRewardTabLine: silhouettePath('TarotBookQuestRewardTabLine.png', 24, 8, 64),
    questRewardTabLineCopy: silhouettePath('TarotBookQuestRewardTabLineCopy.png', 8, 16, 64),
    questRewardTabOutline: silhouettePath('TarotBookQuestRewardTabOutline.png', 24, 32, 64),
    pageNextBtnOutline: silhouettePath('TarotBookPageNextBtnOutline.png', 48, 28, 64),
    talkTabFrame: silhouettePath('TarotBookTalkTabFrame.png', 48, 24, 64),
    mainScreenFrame: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookMainScreenFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookMainScreenFrame.png', 64, 36, 96),
    mainScreenFrame2: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookMainScreenFrame2.png'), 'spriteoutput/ui/tarotbook/TarotBookMainScreenFrame2.png', 64, 36, 96),
    subScreenFrame: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookSubScreenFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookSubScreenFrame.png', 36, 48, 96),
    starPanelCardBack: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardBgBack.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardBgBack.png', 56, 56, 96),
    starPanelCardFront: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardBgFront.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardBgFront.png', 48, 48, 96),
    starPanelCardCenterBack: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterBgBack.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterBgBack.png', 56, 56, 96),
    starPanelCardCenterItem: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterBgItem.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterBgItem.png', 48, 48, 96),
    starPanelCardCenterSun: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterItem.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterItem.png', 64, 64, 96),
    starPanelCardIcon: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardIcon1.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardIcon1.png', 32, 32, 96),
    cardUpDotBg: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBCardUpDecoDotBg.png'), 'spriteoutput/ui/tarotbook/TBCardUpDecoDotBg.png', 64, 64, 1),
    cardUpHalfCircle: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBCardUpDecoHalfCircle.png'), 'spriteoutput/ui/tarotbook/TBCardUpDecoHalfCircle.png', 64, 32, 96),
    cardUpPattern: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBCardUpPattern.png'), 'spriteoutput/ui/tarotbook/TBCardUpPattern.png', 32, 96, 1),
    catalog13CardMask: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBMainCatalog13BgCardMask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalog13BgCardMask.png', 24, 24, 96),
    switchMailIcon: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookBtnSwitchMailIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnSwitchMailIcon.png', 32, 32, 96),
    switchMailOutline2: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookBtnSwitchMailOutline2px.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnSwitchMailOutline2px.png', 32, 32, 96),
    switchMailOutline3: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookBtnSwitchMailOutline3px.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnSwitchMailOutline3px.png', 32, 32, 96),
    rewardButtonBgRing: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'BtnTarotBookRewardBg.png'), 'spriteoutput/ui/tarotbook/BtnTarotBookRewardBg.png', 40, 40, 96),
    diamondPattern: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TBDiamondPattern.png'), 'spriteoutput/ui/tarotbook/TBDiamondPattern.png', 24, 36, 96),
    titleDecoItem: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TBTitleDecoItem.png'), 'spriteoutput/ui/tarotbook/TBTitleDecoItem.png', 20, 20, 96),
    buttonDecoItem: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnDecoItem.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnDecoItem.png', 16, 32, 96),
    storyBgOutline: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryBgOutline.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryBgOutline.png', 32, 40, 96),
    storyFinishIcon: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryFinishIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryFinishIcon.png', 20, 16, 96),
    storyHintIcon: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryHintIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryHintIcon.png', 8, 20, 96),
    storyLeftDeco: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryLeftDecoIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryLeftDecoIcon.png', 16, 16, 96),
    storyRightDeco: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryRightDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryRightDeco.png', 32, 40, 96),
    chartCataTabBg: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookChartCataTabBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCataTabBg.png', 64, 28, 96),
    chartTabBg: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookChartTabBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartTabBg.png', 24, 24, 96),
    roundBrownDecoL: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_BrownDecoL.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_BrownDecoL.png', 24, 24, 96),
    roundBrownDecoR: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_BrownDecoR.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_BrownDecoR.png', 24, 24, 96),
    energyOrb: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookEnergyBg.png'), 'spriteoutput/ui/tarotbook/TarotBookEnergyBg.png', 32, 32, 96),
    mainSwitchIcon: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMainEntranceSwitchIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceSwitchIcon.png', 24, 20, 96),
    mainMailIcon: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMainIconMail.png'), 'spriteoutput/ui/tarotbook/TarotBookMainIconMail.png', 44, 44, 96),
    mimiBookDeco2: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiBookDecoItem2.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiBookDecoItem2.png', 48, 12, 1),
    mimiBookDeco5: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiBookDecoItem5.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiBookDecoItem5.png', 48, 16, 1),
    mimiTalkDeco: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiTalkDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiTalkDeco.png', 48, 72, 96),
    mimiTalkPanelBg: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiTalkPanelBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiTalkPanelBg.png', 24, 24, 96),
    nextPageBg: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookNextPageBtnBg.png'), 'spriteoutput/ui/tarotbook/TarotBookNextPageBtnBg.png', 30, 36, 96),
    openBookCardBg: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookOpenBookCardBg.png'), 'spriteoutput/ui/tarotbook/TarotBookOpenBookCardBg.png', 42, 72, 1),
    rewardDecoRect: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect.png', 40, 36, 96),
    rewardDecoRect2: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect02.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect02.png', 40, 36, 96),
    rewardDecoRect3: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect03.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect03.png', 24, 32, 96),
    signLightStar: silhouettePngPath(path.join(UI_SPRITE_OUTPUT, 'TarotBookSignLightStar.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLightStar.png', 24, 24, 96),
    collectRewardDecoCenter: silhouettePath('TarotBookCollectRewardDecoCenter.png', 40, 40, 64),
    collectRewardDecoCenterBg: silhouettePath('TarotBookCollectRewardDecoCenterBg.png', 40, 40, 64),
    collectRewardDecoCenterBgCircle: silhouettePath('TarotBookCollectRewardDecoCenterBgCircle.png', 40, 40, 64),
    rewardItemBg: silhouettePath('TarotBookRewardItemBg.png', 48, 24, 64),
    rewardItemOutline: silhouettePath('TarotBookRewardItemOutline.png', 40, 12, 64),
    reviewBtnBg: silhouettePath('TarotBookReviewBtnBg.png', 48, 20, 64),
    reviewBtnIcon: silhouettePath('TarotBookReviewBtnIcon.png', 20, 24, 64),
    unloadBtnBg: silhouettePath('TarotBookUnloadBtnBg.png', 32, 32, 64),
    mimiBookDeco1: silhouettePath('TarotBookMimiBookDecoItem1.png', 32, 32, 64),
    mimiBookDeco3: silhouettePath('TarotBookMimiBookDecoItem3.png', 32, 32, 1),
    mimiBookDeco41: silhouettePath('TarotBookMimiBookDecoItem4-1.png', 32, 32, 64),
    mimiBookDeco42: silhouettePath('TarotBookMimiBookDecoItem4-2.png', 32, 32, 64),
    mimiBookDeco43: silhouettePath('TarotBookMimiBookDecoItem4-3.png', 32, 32, 64),
    mimiTalkBtnChooseBg: silhouettePath('TarotBookMimiTalkBtnChooseBg.png', 48, 24, 64),
    mimiTalkChooseDeco: silhouettePath('TarotBookMimiTalkChooseDeco.png', 32, 32, 64),
    mimiTalkChooseIcon: silhouettePath('TarotBookMimiTalkChooseIcon.png', 24, 24, 64),
    mimiTalkPanelArrow: silhouettePath('TarotBookMimiTalkPanelArrow.png', 24, 24, 64),
    mimiTalkPanelBgDeco: silhouettePath('TarotBookMimiTalkPanelBgDeco.png', 48, 32, 64),
    mimiTalkPanelHintArrow: silhouettePath('TarotBookMimiTalkPanelHintArrow.png', 24, 24, 64),
    mimiTalkPanelOutline: silhouettePath('TarotBookMimiTalkPanelOutline.png', 48, 32, 64),
    guideClickFrame: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame.png', 48, 32, 1),
    guideClickGlow: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_Glow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_Glow.png', 48, 32, 1),
    guideClickInnerGlow: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_InnerGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_InnerGlow.png', 48, 32, 1),
    guideClickSolidBg: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_SolidBg.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_SolidBg.png', 48, 32, 1),
    guideArrow: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideArrow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideArrow.png', 32, 32, 1),
    guideArrowTexture: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideArrowTexture.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideArrowTexture.png', 32, 32, 1),
    guideTalkFrame: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideTalkFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideTalkFrame.png', 48, 24, 1),
    guideLight: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideLight.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideLight.png', 48, 32, 1),
    collectRewardDeco: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardDeco.png', 48, 32, 1),
    collectRewardDecoCenterCircle: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardDecoCenterCircle.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardDecoCenterCircle.png', 40, 40, 1),
    collectRewardMask: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardMask.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardMask.png', 48, 32, 1),
    collectRewardNumbg: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardNumbg.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardNumbg.png', 32, 24, 1),
    rewardAvatarMask: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookRewardAvatarMask.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardAvatarMask.png', 40, 40, 1),
    crystalItemGlow: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemGlow.png', 48, 48, 1),
    crystalItemIcon: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemIcon.png', 32, 32, 1),
    crystalItemImgmask: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemImgmask.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemImgmask.png', 48, 48, 1),
    comHintPanelBg: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookComHintPanelBg.png'), 'spriteoutput/ui/tarotbook/TarotBookComHintPanelBg.png', 48, 32, 1),
    comToastStarDeco: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookComToastStarDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookComToastStarDeco.png', 32, 32, 1),
    chartBookPaperBg: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBg.png', 48, 64, 96),
    chartBookPaperBgLeft: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgLeft.png', 24, 64, 96),
    chartBookPaperBgShadow: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadow.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadow.png', 24, 64, 8),
    chartBookPaperBgShadowR: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadowR.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadowR.png', 24, 64, 96),
    chartBookPaperTopPatternLeft: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternLeft.png', 32, 12, 96),
    chartBookPaperTopPatternRight: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternRight.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternRight.png', 32, 12, 96),
    chartCatalogPaperBgLeft: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeft.png', 24, 64, 96),
    chartCatalogPaperBgLeftDeco: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeftDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeftDeco.png', 16, 64, 96),
    chartCatalogPaperBgRight: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgRight.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgRight.png', 24, 64, 96),
    chartTitleDeco: silhouettePngPath(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartTitleDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookChartTitleDeco.png', 48, 24, 96),
    card07Banner: silhouettePath('TarotBookCard07_Banner_UnActive.png', 48, 32, 96),
    card07Circle: silhouettePath('TarotBookCard07_CenterCircle_UnActive.png', 32, 32, 96),
    card07BackCircle: silhouettePath('TarotBookCard07_CenterBackCircle_UnActive.png', 36, 36, 96),
    card07Deco: silhouettePath('TarotBookCard07_DecoItem_UnActive.png', 48, 48, 96),
    card07Symbol: silhouettePath('TarotBookCard07_Symbol_UnActive.png', 32, 32, 96),
    card07SpSymbol: silhouettePath('TarotBookCard07_SpSymbol_UnActive.png', 32, 32, 96),
    card09Banner: silhouettePath('TarotBookCard09_Banner_UnActive.png', 48, 32, 96),
    card09Circle: silhouettePath('TarotBookCard09_CenterCircle_UnActive.png', 32, 32, 96),
    card09BackCircle: silhouettePath('TarotBookCard09_CenterBackCircle_UnActive.png', 36, 36, 96),
    card09Deco: silhouettePath('TarotBookCard09_DecoItem_UnActive.png', 48, 48, 96),
    card09Symbol: silhouettePath('TarotBookCard09_Symbol_UnActive.png', 32, 32, 96),
    card09SpSymbol: silhouettePath('TarotBookCard09_SpSymbol_UnActive.png', 32, 32, 96),
    card10Banner: silhouettePath('TarotBookCard10_Banner_UnActive.png', 48, 32, 96),
    card10Circle: silhouettePath('TarotBookCard10_CenterCircle_UnActive.png', 32, 32, 96),
    card10BackCircle: silhouettePath('TarotBookCard10_CenterBackCircle_UnActive.png', 36, 36, 96),
    card10Deco: silhouettePath('TarotBookCard10_DecoItem_UnActive.png', 48, 48, 96),
    card10Symbol: silhouettePath('TarotBookCard10_Symbol_UnActive.png', 32, 32, 96),
    card10SpSymbol: silhouettePath('TarotBookCard10_SpSymbol_UnActive.png', 32, 32, 96),
    card1Banner: silhouettePath('TarotBookCard1_Banner_UnActive.png', 48, 32, 96),
    card1Circle: silhouettePath('TarotBookCard1_CenterCircle_UnActive.png', 32, 32, 96),
    card1BackCircle: silhouettePath('TarotBookCard1_CenterBackCircle_UnActive.png', 36, 36, 96),
    card1Deco: silhouettePath('TarotBookCard1_DecoItem_UnActive.png', 48, 48, 96),
    card1Symbol: silhouettePath('TarotBookCard1_Symbol_UnActive.png', 32, 32, 96),
    card1SpSymbol: silhouettePath('TarotBookCard1_SpSymbol_UnActive.png', 32, 32, 96),
    card07SymbolActive: silhouettePath('TarotBookCard07_Symbol_Active.png', 32, 32, 96),
    card07SpSymbolActive: silhouettePath('TarotBookCard07_SpSymbol_Active.png', 32, 32, 96),
    card09SymbolActive: silhouettePath('TarotBookCard09_Symbol_Active.png', 32, 32, 96),
    card09SpSymbolActive: silhouettePath('TarotBookCard09_SpSymbol_Active.png', 32, 32, 96),
    card10SymbolActive: silhouettePath('TarotBookCard10_Symbol_Active.png', 32, 32, 96),
    card10SpSymbolActive: silhouettePath('TarotBookCard10_SpSymbol_Active.png', 32, 32, 96),
    card1SymbolActive: silhouettePath('TarotBookCard1_Symbol_Active.png', 32, 32, 96),
    card1SpSymbolActive: silhouettePath('TarotBookCard1_SpSymbol_Active.png', 32, 32, 96),
    card1Character: silhouettePath('TarotBookCard1_Character_UnActive.png', 48, 64, 96),
    dataStoryInnerOutline: silhouettePath('BtnTBCataStoryInnerOutline.png', 48, 32, 96),
    dataStoryBg: silhouettePath('TarotBookBtnTBCataStoryBg.png', 48, 32, 96),
    dataStoryOutlineL: silhouettePath('TarotBookBtnTBCataStoryBgOutlineL.png', 64, 32, 96),
    dataStoryOutlineR: silhouettePath('TarotBookBtnTBCataStoryBgOutlineR.png', 64, 32, 96),
    roundDecoL: silhouettePath('TarotBookComRoundBtn_RedDecoL.png', 32, 32, 96),
    roundDecoR: silhouettePath('TarotBookComRoundBtn_RedDecoR.png', 32, 32, 96),
    cornerOutlineRight: silhouettePath('TarotBookCornorBtnComOutlineRight.png', 32, 32, 96),
    endFinishBg: silhouettePath('TarotBookEndEntranceFinishBg.png', 64, 32, 96),
    entranceWaterShadow: silhouettePath('TarotBookEntraBtnWaterShadow.png', 48, 32, 8),
    entranceIcon1: silhouettePath('TarotBookEntraIcon1.png', 40, 40, 96),
    entranceIcon2: silhouettePath('TarotBookEntraIcon2.png', 40, 40, 96),
    menuGradient: silhouettePath('TarotBookMenuIconBGradient.png', 48, 48, 96),
    openCrystalShadow: silhouettePath('TarotBookOpenCrystalShadow.png', 48, 48, 8),
    entranceBgT2: silhouettePath('TarotBookBtnEntranceBgT2.png', 64, 32, 96),
    entranceDecoBotT2: silhouettePath('TarotBookBtnEntranceDecoBotT2.png', 48, 24, 96),
    entranceDecoCircleT2: silhouettePath('TarotBookBtnEntranceDecoCircleT2.png', 48, 48, 96),
    entranceDecoTopT2: silhouettePath('TarotBookBtnEntranceDecoTopT2.png', 48, 24, 96),
    imgShadow: silhouettePath('ImgShadow.png', 48, 48, 96),
    coverCloud1: silhouettePath('TBBookletCoverPageDecoCloud1.png', 50, 12, 96),
    coverPeople1: silhouettePath('TBBookletCoverPageDecoPeople1.png', 24, 46, 96),
    hintStarDeco2: silhouettePath('TBEnergyHintStarDeco2.png', 20, 28, 96),
    autoBg: silhouettePath('TarotBookBtnAutoBg.png', 48, 32, 96),
    book2: silhouettePath('TarotBookMainIconBook2.png', 40, 52, 96),
    entranceBg: silhouettePath('TarotBookBtnEntranceBg.png', 64, 32, 96),
    entranceGlow: silhouettePath('TarotBookBtnEntranceBgGlow.png', 64, 32, 8),
    entranceDecoBot: silhouettePath('TarotBookBtnEntranceDecoBot.png', 48, 24, 96),
    entranceDecoCircle: silhouettePath('TarotBookBtnEntranceDecoCircle.png', 48, 48, 96),
    entranceDecoTop: silhouettePath('TarotBookBtnEntranceDecoTop.png', 48, 24, 96),
    entranceIcon: silhouettePath('TarotBookBtnEntranceIcon.png', 40, 40, 96),
    replayIcon: silhouettePath('TarotBookBtnReplayIcon.png', 40, 40, 96),
    replayOutline: silhouettePath('TarotBookBtnReplayIconOutline.png', 40, 40, 96),
    endFinishIcon: silhouettePath('TarotBookEndEntranceFinishIcon.png', 40, 40, 96),
    mainDownloadArrow: silhouettePath('TarotBookMainDownloadArrow.png', 32, 32, 96),
    mainDownloadBase: silhouettePath('TarotBookMainDownloadBase.png', 48, 32, 96),
    crystalMini: silhouettePath('TarotBookIconCrystalMini.png', 32, 32, 96),
    rewardDeco: silhouettePath('TarotBookRewardDecoitem.png', 48, 48, 96),
    rewardGet: silhouettePath('TarotBookRewardGetIcon.png', 40, 40, 96),
  },
  colors: {
    ...cardColors,
    catalogBackground: averageSpriteColor('TBMainCatalogBgDecoNormal.png'),
    catalogText: averageSpriteColor('TBMainCatalogBgTextDeco.png'),
    coverCenter: averageSpriteColor('TBBookletCoverPageCenterCircle.png'),
    coverFire: averageSpriteColor('TBBookletCoverPageDecoFire.png'),
    buttonStar: averageSpriteColor('TarotBookMainIconStar1.png'),
    buttonStar2: averageSpriteColor('TarotBookMainIconStar2.png'),
    buttonStarWhite: averageSpriteColor('TarotBookMainIconStar3.png'),
    buttonBook: averageSpriteColor('TarotBookMainIconBook3.png'),
    buttonMail2: averageSpriteColor('TarotBookMainIconMail2.png'),
    buttonMail3: averageSpriteColor('TarotBookMainIconMail3.png'),
    buttonMail4: averageSpriteColor('TarotBookMainIconMail4.png'),
    buttonMem2: averageSpriteColor('TarotBookMainIconMem2.png'),
    buttonMem3: averageSpriteColor('TarotBookMainIconMem3.png'),
    buttonMem4: averageSpriteColor('TarotBookMainIconMem4.png'),
    buttonMem5: averageSpriteColor('TarotBookMainIconMem5.png'),
    buttonMem6: averageSpriteColor('TarotBookMainIconMem6.png'),
    buttonPaper2: averageSpriteColor('TarotBookMainIconPaper2.png'),
    buttonPaper3: averageSpriteColor('TarotBookMainIconPaper3.png'),
    buttonPaper4: averageSpriteColor('TarotBookMainIconPaper4.png'),
    buttonWiki2: averageSpriteColor('TarotBookMainIconWiki2.png'),
    buttonBook1: averageSpriteColor('TarotBookMainIconBook1.png'),
    buttonBook4: averageSpriteColor('TarotBookMainIconBook4.png'),
    buttonBook5: averageSpriteColor('TarotBookMainIconBook5.png'),
    buttonBook6: averageSpriteColor('TarotBookMainIconBook6.png'),
    buttonPaper: averageSpriteColor('TarotBookMainIconPaper1.png'),
    buttonWiki: averageSpriteColor('TarotBookMainIconWiki1.png'),
    buttonMem: averageSpriteColor('TarotBookMainIconMem7.png'),
    buttonMail: averageSpriteColor('TarotBookMainIconMail1.png'),
    guideClickFrame: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame.png', 1),
    guideClickGlow: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_Glow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_Glow.png', 1),
    guideClickInnerGlow: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_InnerGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_InnerGlow.png', 1),
    guideClickSolidBg: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_SolidBg.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideClickFrame_SolidBg.png', 1),
    guideArrow: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideArrow.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideArrow.png', 1),
    guideArrowTexture: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideArrowTexture.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideArrowTexture.png', 1),
    guideTalkFrame: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideTalkFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideTalkFrame.png', 1),
    guideLight: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookGuideLight.png'), 'spriteoutput/ui/tarotbook/TarotBookGuideLight.png', 1),
    collectRewardDeco: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardDeco.png', 1),
    collectRewardDecoCenterCircle: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardDecoCenterCircle.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardDecoCenterCircle.png', 1),
    collectRewardMask: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardMask.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardMask.png', 1),
    collectRewardNumbg: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCollectRewardNumbg.png'), 'spriteoutput/ui/tarotbook/TarotBookCollectRewardNumbg.png', 1),
    rewardAvatarMask: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookRewardAvatarMask.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardAvatarMask.png', 1),
    crystalItemGlow: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemGlow.png', 1),
    crystalItemIcon: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemIcon.png', 1),
    crystalItemImgmask: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookCrystalItemImgmask.png'), 'spriteoutput/ui/tarotbook/TarotBookCrystalItemImgmask.png', 1),
    comHintPanelBg: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookComHintPanelBg.png'), 'spriteoutput/ui/tarotbook/TarotBookComHintPanelBg.png', 1),
    comToastStarDeco: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookComToastStarDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookComToastStarDeco.png', 1),
    chartBookPaperBg: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBg.png', 1),
    chartBookPaperBgLeft: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgLeft.png', 1),
    chartBookPaperBgShadow: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadow.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadow.png', 1),
    chartBookPaperBgShadowR: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadowR.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperBgShadowR.png', 1),
    chartBookPaperTopPatternLeft: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternLeft.png', 1),
    chartBookPaperTopPatternRight: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternRight.png'), 'spriteoutput/ui/tarotbook/TarotBookChartBookPaperTopPatternRight.png', 1),
    chartCatalogPaperBgLeft: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeft.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeft.png', 1),
    chartCatalogPaperBgLeftDeco: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeftDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgLeftDeco.png', 1),
    chartCatalogPaperBgRight: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgRight.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCatalogBookPaperBgRight.png', 1),
    chartTitleDeco: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TarotBookChartTitleDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookChartTitleDeco.png', 1),
    card07Symbol: averageSpriteColor('TarotBookCard07_Symbol_UnActive.png'),
    card09Symbol: averageSpriteColor('TarotBookCard09_Symbol_UnActive.png'),
    card10Symbol: averageSpriteColor('TarotBookCard10_Symbol_UnActive.png'),
    card1Symbol: averageSpriteColor('TarotBookCard1_Symbol_UnActive.png'),
    entranceBg: averageSpriteColor('TarotBookBtnEntranceBg.png'),
    entranceGlow: averageSpriteColor('TarotBookBtnEntranceBgGlow.png', 1),
    entranceWaterShadow: averageSpriteColor('TarotBookEntraBtnWaterShadow.png', 1),
    openCrystalShadow: averageSpriteColor('TarotBookOpenCrystalShadow.png', 1),
    replayIcon: averageSpriteColor('TarotBookBtnReplayIcon.png'),
    endFinishIcon: averageSpriteColor('TarotBookEndEntranceFinishIcon.png'),
    mainDownloadArrow: averageSpriteColor('TarotBookMainDownloadArrow.png'),
    crystalMini: averageSpriteColor('TarotBookIconCrystalMini.png'),
    rewardGet: averageSpriteColor('TarotBookRewardGetIcon.png'),
    rewardButton: averagePngColor(
      path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/ui/travelbrochure/_autogen/TBStickerRewardBtnBg.png'),
      'travelbrochure/_autogen/TBStickerRewardBtnBg.png'),
    rewardText: averagePngColor(
      path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/ui/travelbrochure/_autogen/TBMainPageProgressRewardBtnTextBg.png'),
      'travelbrochure/_autogen/TBMainPageProgressRewardBtnTextBg.png'),
    mailHintBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TBEnergyHintBg.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintBg.png'),
    mailHintDeco: averagePngColor(path.join(SPRITE_OUTPUT, 'TBEnergyHintDecoItem.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintDecoItem.png'),
    starItemEmptyStar: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemEmptyStar.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemEmptyStar.png', 1),
    starItemLightStar: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemLightStar.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemLightStar.png', 1),
    starItemOutline4px: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemOutline4px.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemOutline4px.png', 1),
    starLightItemOutline: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarLightItemOutline.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarLightItemOutline.png', 1),
    starItemCircle: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/TBStarPanelStarItemCircle.png'), 'spriteoutput/ui/tarotbook/TBStarPanelStarItemCircle.png'),
    waitingIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookIconWait.png'), 'spriteoutput/ui/tarotbook/TarotBookIconWait.png'),
    waitingLight: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookIconWaitLight.png'), 'spriteoutput/ui/tarotbook/TarotBookIconWaitLight.png'),
    signDecoLine: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignDecoLine.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDecoLine.png'),
    signLightLine: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignLightLine.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLightLine.png'),
    cardBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardBg.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardBg.png'),
    cardBack: averagePngColor(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardBackBg.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardBackBg.png'),
    cardIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TBStarPanelCenterCardIcon.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCenterCardIcon.png'),
    cardLightStar: averagePngColor(path.join(SPRITE_OUTPUT, 'TBCardUpLightStar.png'), 'spriteoutput/ui/tarotbook/TBCardUpLightStar.png'),
    coverPagePattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageBgPattern.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageBgPattern.png'),
    catalogBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TBMainCatalogBg.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogBg.png'),
    signPageBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignPageBg.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPageBg.png'),
    endPageDeco: averagePngColor(path.join(SPRITE_OUTPUT, 'TBBookletEndPageDecoPattern.png'), 'spriteoutput/ui/tarotbook/TBBookletEndPageDecoPattern.png'),
    catalogItemMask: averagePngColor(path.join(SPRITE_OUTPUT, 'TBMainCatalogItemMask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogItemMask.png'),
    catalogItem13Mask: averagePngColor(path.join(SPRITE_OUTPUT, 'TBMainCatalogItem13Mask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogItem13Mask.png'),
    confirmBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnCheckBg.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnCheckBg.png'),
    confirmCircle: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnCheckDecoCircle.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnCheckDecoCircle.png'),
    buttonPattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnDecoPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnDecoPattern.png'),
    bookDecoItem: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBookDecoItem.png'), 'spriteoutput/ui/tarotbook/TarotBookBookDecoItem.png'),
    signCenterIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterIcon.png'),
    signCenterStar: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterStar.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterStar.png'),
    signDotPattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignDotPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDotPattern.png'),
    errorDialogBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogBg.png', 1),
    errorHintBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogHintBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogHintBg.png'),
    errorHintIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorDialogHintIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorDialogHintIcon.png'),
    errorIconEff: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookMainEntranceErrorIconEff.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceErrorIconEff.png'),
    buttonComDeco1: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnComDecoIcon1.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnComDecoIcon1.png'),
    buttonComDeco2: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnComDecoIcon2.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnComDecoIcon2.png'),
    buttonLargePattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookBtnPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnPattern.png', 1),
    mailStarIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookMailStarIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMailStarIcon.png'),
    mainScreenFrame: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookMainScreenFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookMainScreenFrame.png', 1),
    subScreenFrame: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookSubScreenFrame.png'), 'spriteoutput/ui/tarotbook/TarotBookSubScreenFrame.png', 1),
    starPanelCardBack: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardBgBack.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardBgBack.png', 1),
    starPanelCardFront: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardBgFront.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardBgFront.png', 1),
    starPanelCardCenterBack: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterBgBack.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterBgBack.png', 1),
    starPanelCardCenterItem: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterBgItem.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterBgItem.png', 1),
    starPanelCardCenterSun: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardCenterItem.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardCenterItem.png', 1),
    starPanelCardIcon: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBStarPanelCardIcon1.png'), 'spriteoutput/ui/tarotbook/TBStarPanelCardIcon1.png', 1),
    cardUpDotBg: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBCardUpDecoDotBg.png'), 'spriteoutput/ui/tarotbook/TBCardUpDecoDotBg.png', 1),
    cardUpHalfCircle: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBCardUpDecoHalfCircle.png'), 'spriteoutput/ui/tarotbook/TBCardUpDecoHalfCircle.png'),
    catalog13CardMask: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TBMainCatalog13BgCardMask.png'), 'spriteoutput/ui/tarotbook/TBMainCatalog13BgCardMask.png'),
    switchMailIcon: averagePngColor(path.join(EXTRACT, 'exports/tarot-ui-all-blocks/assets/asbres/spriteoutput/ui/tarotbook/', 'TarotBookBtnSwitchMailIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnSwitchMailIcon.png', 1),
    rewardButtonBgRing: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'BtnTarotBookRewardBg.png'), 'spriteoutput/ui/tarotbook/BtnTarotBookRewardBg.png', 1),
    diamondPattern: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TBDiamondPattern.png'), 'spriteoutput/ui/tarotbook/TBDiamondPattern.png'),
    titleDecoItem: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TBTitleDecoItem.png'), 'spriteoutput/ui/tarotbook/TBTitleDecoItem.png'),
    buttonDecoItem: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnDecoItem.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnDecoItem.png'),
    storyBgOutline: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryBgOutline.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryBgOutline.png'),
    storyFinishIcon: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryFinishIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryFinishIcon.png'),
    storyHintIcon: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryHintIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryHintIcon.png'),
    storyLeftDeco: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryLeftDecoIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryLeftDecoIcon.png'),
    storyRightDeco: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookBtnTBCataStoryRightDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookBtnTBCataStoryRightDeco.png'),
    chartCataTabBg: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookChartCataTabBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartCataTabBg.png'),
    chartTabBg: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookChartTabBg.png'), 'spriteoutput/ui/tarotbook/TarotBookChartTabBg.png'),
    commonBrownPattern: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_BrownPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_BrownPattern.png', 1),
    commonRedPattern: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_RedPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_RedPattern.png', 1),
    roundBrownDecoL: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_BrownDecoL.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_BrownDecoL.png'),
    roundBrownDecoR: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookComRoundBtn_BrownDecoR.png'), 'spriteoutput/ui/tarotbook/TarotBookComRoundBtn_BrownDecoR.png'),
    energyOrb: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookEnergyBg.png'), 'spriteoutput/ui/tarotbook/TarotBookEnergyBg.png', 1),
    mainSwitchIcon: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMainEntranceSwitchIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookMainEntranceSwitchIcon.png'),
    mainMailIcon: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMainIconMail.png'), 'spriteoutput/ui/tarotbook/TarotBookMainIconMail.png'),
    mimiBookDeco2: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiBookDecoItem2.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiBookDecoItem2.png', 1),
    mimiBookDeco5: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiBookDecoItem5.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiBookDecoItem5.png', 1),
    mimiTalkDeco: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiTalkDeco.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiTalkDeco.png'),
    mimiTalkPanelBg: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookMimiTalkPanelBg.png'), 'spriteoutput/ui/tarotbook/TarotBookMimiTalkPanelBg.png'),
    nextPageBg: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookNextPageBtnBg.png'), 'spriteoutput/ui/tarotbook/TarotBookNextPageBtnBg.png'),
    openBookCardBg: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookOpenBookCardBg.png'), 'spriteoutput/ui/tarotbook/TarotBookOpenBookCardBg.png', 1),
    rewardDecoRect: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect.png', 1),
    rewardDecoRect2: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect02.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect02.png', 1),
    rewardDecoRect3: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookRewardDecoRect03.png'), 'spriteoutput/ui/tarotbook/TarotBookRewardDecoRect03.png', 1),
    signLightStar: averagePngColor(path.join(UI_SPRITE_OUTPUT, 'TarotBookSignLightStar.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLightStar.png'),
    signBgLight: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignBgLight.png'), 'spriteoutput/ui/tarotbook/TarotBookSignBgLight.png', 1),
    signBgPattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignBgPattern.png'), 'spriteoutput/ui/tarotbook/TarotBookSignBgPattern.png', 1),
    signDecoIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignDecoIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookSignDecoIcon.png', 1),
    signLineBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignLineBg.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineBg.png', 1),
    signLineEffect: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignLineEffect.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineEffect.png', 1),
    signLineOutlineGlow: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignLineOutlineGlow.png'), 'spriteoutput/ui/tarotbook/TarotBookSignLineOutlineGlow.png', 1),
    signCenterStarLight: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCenterStarLight.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCenterStarLight.png'),
    signPressCircle2: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookSignPressCircle2.png'), 'spriteoutput/ui/tarotbook/TarotBookSignPressCircle2.png', 1),
    coverPageBg: averagePngColor(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageBg.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageBg.png', 1),
    coverPageDecoItem: averagePngColor(path.join(SPRITE_OUTPUT, 'TBBookletCoverPageDecoItem.png'), 'spriteoutput/ui/tarotbook/TBBookletCoverPageDecoItem.png', 1),
    endPageBorder: averagePngColor(path.join(SPRITE_OUTPUT, 'TBBookletEndPageDeco.png'), 'spriteoutput/ui/tarotbook/TBBookletEndPageDeco.png', 1),
    energyHintPattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TBEnergyHintBgPattern.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintBgPattern.png', 1),
    energyHintDecoPattern: averagePngColor(path.join(SPRITE_OUTPUT, 'TBEnergyHintDecoPattern.png'), 'spriteoutput/ui/tarotbook/TBEnergyHintDecoPattern.png', 1),
    catalogSideDeco: averagePngColor(path.join(SPRITE_OUTPUT, 'TBMainCatalogBgDeco.png'), 'spriteoutput/ui/tarotbook/TBMainCatalogBgDeco.png', 1),
    toastIcon: averagePngColor(path.join(SPRITE_OUTPUT, 'TarotBookToastIcon.png'), 'spriteoutput/ui/tarotbook/TarotBookToastIcon.png', 1),
    autoIcon: averageSpriteColor('TarotBookBtnAutoIcon.png', 1),
    autoIconGlow: averageSpriteColor('TarotBookBtnAutoIconGlow.png', 1),
    autoIconOutline: averageSpriteColor('TarotBookBtnAutoIconOutline.png', 1),
    autoShadow: averageSpriteColor('TarotBookBtnAutoShadow.png', 1),
    checkIcon: averageSpriteColor('TarotBookBtnCheckIcon.png', 1),
    checkOutline: averageSpriteColor('TarotBookBtnCheckOutline.png', 1),
    waitProgress: averageSpriteColor('TarotBookIconWaitProgress.png', 1),
    mailHintPanel: averageSpriteColor('TarotBookMailHint.png', 1),
    mainDecoRect: averageSpriteColor('TarotBookMainDecoRect.png', 1),
    entranceBtnLine: averageSpriteColor('TarotBookMainEntranceBtnLine.png', 1),
    selectFrame: averageSpriteColor('TarotBookMainSelectFrame.png', 1),
    openBookHintTextBg: averageSpriteColor('TarotBookOpenBookHintTextBg.png', 1),
    textUnderLine: averageSpriteColor('TarotBookTextUnderLine.png', 1),
    chartCataTabDeco: averageSpriteColor('TarotBookChartCataTabDeco.png', 1),
    chartCataTabOutline: averageSpriteColor('TarotBookChartCataTabOutline.png', 1),
    chartTabBgShadow: averageSpriteColor('TarotBookChartTabBgShadow.png', 1),
    chartTabDecoIcon: averageSpriteColor('TarotBookChartTabDecoIcon.png', 1),
    chartTabFinishIcon: averageSpriteColor('TarotBookChartTabFinishIcon.png', 1),
    chartTabLockIcon: averageSpriteColor('TarotBookChartTabLockIcon.png', 1),
    chartTabOutline: averageSpriteColor('TarotBookChartTabOutline.png', 1),
    chartTabOutlineR: averageSpriteColor('TarotBookChartTabOutlineR.png', 1),
    chartTabPattern: averageSpriteColor('TarotBookChartTabPattern.png', 1),
    questRewardTabLine: averageSpriteColor('TarotBookQuestRewardTabLine.png', 1),
    questRewardTabLineCopy: averageSpriteColor('TarotBookQuestRewardTabLineCopy.png', 1),
    questRewardTabOutline: averageSpriteColor('TarotBookQuestRewardTabOutline.png', 1),
    pageNextBtnOutline: averageSpriteColor('TarotBookPageNextBtnOutline.png', 1),
    talkTabFrame: averageSpriteColor('TarotBookTalkTabFrame.png', 1),
    collectRewardDecoCenter: averageSpriteColor('TarotBookCollectRewardDecoCenter.png', 1),
    collectRewardDecoCenterBg: averageSpriteColor('TarotBookCollectRewardDecoCenterBg.png', 1),
    collectRewardDecoCenterBgCircle: averageSpriteColor('TarotBookCollectRewardDecoCenterBgCircle.png', 1),
    rewardItemBg: averageSpriteColor('TarotBookRewardItemBg.png', 1),
    rewardItemOutline: averageSpriteColor('TarotBookRewardItemOutline.png', 1),
    reviewBtnBg: averageSpriteColor('TarotBookReviewBtnBg.png', 1),
    reviewBtnIcon: averageSpriteColor('TarotBookReviewBtnIcon.png', 1),
    unloadBtnBg: averageSpriteColor('TarotBookUnloadBtnBg.png', 1),
    mimiBookDeco1: averageSpriteColor('TarotBookMimiBookDecoItem1.png', 1),
    mimiBookDeco3: averageSpriteColor('TarotBookMimiBookDecoItem3.png', 1),
    mimiBookDeco41: averageSpriteColor('TarotBookMimiBookDecoItem4-1.png', 1),
    mimiBookDeco42: averageSpriteColor('TarotBookMimiBookDecoItem4-2.png', 1),
    mimiBookDeco43: averageSpriteColor('TarotBookMimiBookDecoItem4-3.png', 1),
    mimiTalkBtnChooseBg: averageSpriteColor('TarotBookMimiTalkBtnChooseBg.png', 1),
    mimiTalkChooseDeco: averageSpriteColor('TarotBookMimiTalkChooseDeco.png', 1),
    mimiTalkChooseIcon: averageSpriteColor('TarotBookMimiTalkChooseIcon.png', 1),
    mimiTalkPanelArrow: averageSpriteColor('TarotBookMimiTalkPanelArrow.png', 1),
    mimiTalkPanelBgDeco: averageSpriteColor('TarotBookMimiTalkPanelBgDeco.png', 1),
    mimiTalkPanelHintArrow: averageSpriteColor('TarotBookMimiTalkPanelHintArrow.png', 1),
    mimiTalkPanelOutline: averageSpriteColor('TarotBookMimiTalkPanelOutline.png', 1),
  },
};

// Hint clips were extracted into another unpacked block. They are included as
// source evidence and consumed by the homepage reward panel bridge.
for (const file of ['TarotBookMailHintFadeIn.anim', 'TarotBookMailHintLoop.anim', 'TarotBookBottomGoToHintFadeIn.anim', 'TarotBookWaitingLoop.anim',
  'Normal.anim', 'Disabled.anim', 'Highlighted.anim', 'Pressed.anim', 'Selected.anim',
  'TarotBookSignLongPressNew.anim']) {
  result.animations.push(parseCurves(file, HINT_ANIM));
}

// The full convert-all export contains dialog, wiki and timeline clips that
// are absent from the split source blocks. They are preserved as source
// evidence; only readable curves are consumed by the runtime.
for (const file of [
  'TarotBookMailDialog_FadeIn.anim', 'TarotBookMailDialog_FadeOut.anim', 'TarotBookMailDilalogShowLeftTab.anim',
  'TarotBookMainEntranceErrorDialog_FadeIn.anim', 'TarotBookMainEntranceErrorDialog_FadeOut.anim', 'TarotBookMainEntranceErrorDialog_Loop.anim',
  'TarotBookWikiDialog_Normal_FadeIn.anim', 'TarotBookWikiDialog_Error_FadeIn.anim', 'TarotBookWikiDialog_NormToErrorTransition.anim',
  'TarotBookWikiDialog_ErrorToNormTransition.anim', 'TarotBookWikiDialog_FadeOut.anim',
  'TarotBookGuideBtnTypeRect.anim', 'TarotBookGuideBtnTypeRect_Loop.anim', 'TarotBookGuideBtnTypeRect_FadeOut.anim',
  'TarotBookGuideTalkDialogFadeIn.anim', 'TarotBookGuideTalkDialogFadeOut.anim',
  'TarotBookTalkInfoItem_FadeIn.anim', 'TarotBookTalkSelectTab_UnlockHint.anim',
  'TarotBookTimelineInfoItem_FadeIn.anim', 'TarotBookTimelineInfoItemColor_Normal.anim', 'TarotBookTimelineInfoItemColor_Error.anim',
  'TarotBookTimelineTimeBlockColor_Normal.anim', 'TarotBookTimelineTimeBlockColor_Error.anim',
  'TarotBookAssistantIconLoop_Normal.anim', 'TarotBookAssistantIconLoop_SP.anim', 'TarotBookVoiceLoop.anim',
  'TarotBookSPTalkPage_FadeIn.anim', 'TarotBookSPTalkPage_FadeOut.anim', 'TarotBookSPTalkPage_ScreenFadeIn.anim', 'TarotBookSPTalkPage_ScreenFadeOut.anim',
  'TarotBookMimiTalkPage_FadeIn2.anim', 'TarotBookDataInfoItemColor_Normal.anim', 'TarotBookDataInfoItemColor_Error.anim',
  'TarotBookDataTitleInfoItemColor_Normal.anim', 'TarotBookDataTitleInfoItemColor_Error.anim',
  'CardItemShow.anim', 'CardItemNone.anim', 'Checked.anim', 'Unchecked.anim',
]) {
  if (fs.existsSync(path.join(FULL_ANIM, file))) result.animations.push(parseCurves(file, FULL_ANIM));
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const bridgeSource = path.join(__dirname, '..', 'web/codex-source.js.template');
const bridgeOut = path.join(__dirname, '..', 'web/codex-source.js');
if (fs.existsSync(bridgeSource)) {
  fs.writeFileSync(bridgeOut, fs.readFileSync(bridgeSource, 'utf8').replace('__TAROT_SOURCE__', JSON.stringify(result)));
}
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
