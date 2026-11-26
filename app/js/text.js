const fallbackFont = 'RPG_CN';

function rgba(color) {
  return `rgba(${Math.round((color?.[0] ?? 1) * 255)},${Math.round((color?.[1] ?? 1) * 255)},${Math.round((color?.[2] ?? 1) * 255)},${color?.[3] ?? 1})`;
}

function glyphTable(sdfFonts) {
  const table = new Map();
  for (const font of Object.values(sdfFonts || {})) {
    const glyphs = new Map((font.glyphs || []).map(glyph => [glyph.index, glyph]));
    for (const entry of font.chars || []) {
      const glyph = glyphs.get(entry.g);
      if (!glyph || table.has(entry.c)) continue;
      table.set(entry.c, { font, glyph });
    }
  }
  return table;
}

function textNodes(text, table) {
  const nodes = [];
  const add = (value, code) => {
    if (value == null) return;
    nodes.push(code == null ? { raw: String(value) } : { value: String(value), code });
  };
  const pattern = /<\/?ub>/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    add(text.slice(cursor, match.index), null);
    for (const char of match[0]) add(char, char.codePointAt(0));
    cursor = match.index + match[0].length;
  }
  add(text.slice(cursor), null);
  return nodes.flatMap(node => {
    if (node.raw != null) return [...node.raw].map(char => ({ value: char, code: char.codePointAt(0) }));
    return [node];
  }).map(node => ({ ...node, glyph: table.get(node.code) || null }));
}

function drawSdf(text, node, assets, table) {
  const t = node.text;
  const source = t.raw || '';
  const parts = textNodes(source, table);
  const sdfCount = parts.filter(part => part.glyph).length;
  if (!sdfCount) return false;
  // Only the covered characters may become SDF quads; uncovered characters
  // stay in a source TTF fallback instead of inventing glyph rectangles.
  const chosen = Object.values(assets.sdfFonts || {}).find(font => parts.filter(part => part.glyph?.font === font).length >= sdfCount / 2);
  const font = chosen || parts.find(part => part.glyph)?.glyph.font;
  const metrics = font.metrics || {};
  const pointSize = Number(metrics.pointSize) || 52;
  const scale = (Number(t.size) || pointSize) / pointSize;
  const baseline = (Number(metrics.ascent) || pointSize) * scale;
  const lineHeight = (Number(metrics.lineHeight) || t.size || pointSize) * scale;
  const maxX = Math.max(1, node.box?.w || Number.MAX_SAFE_INTEGER);
  const frag = document.createDocumentFragment();
  let penX = 0;
  let penY = 0;
  for (const part of parts) {
    if (part.value === '\n') { penX = 0; penY += lineHeight; continue; }
    if (!part.glyph || part.glyph.font !== font) {
      const span = document.createElement('span');
      span.className = 'ttf-fallback';
      span.textContent = part.value;
      span.style.left = `${penX}px`;
      span.style.top = `${penY}px`;
      span.style.fontSize = `${t.size}px`;
      span.style.lineHeight = `${lineHeight}px`;
      frag.append(span);
      penX += (Number(t.size) || pointSize) * 0.5;
      continue;
    }
    const g = part.glyph.glyph;
    const quad = document.createElement('i');
    quad.className = 'sdf-glyph';
    quad.textContent = part.value;
    quad.setAttribute('aria-hidden', 'true');
    quad.style.left = `${penX + g.bx * scale}px`;
    quad.style.top = `${penY + baseline - g.by * scale - g.h * scale}px`;
    quad.style.width = `${g.w * scale}px`;
    quad.style.height = `${g.h * scale}px`;
    quad.style.backgroundColor = rgba(t.color);
    quad.style.maskImage = `url(./assets/${font.file})`;
    quad.style.webkitMaskImage = quad.style.maskImage;
    quad.style.maskSize = `${font.atlasWidth / g.rw * 100}% ${font.atlasHeight / g.rh * 100}%`;
    quad.style.maskPosition = `${g.rx / (font.atlasWidth - g.rw) * 100}% ${(font.atlasHeight - g.ry - g.rh) / (font.atlasHeight - g.rh) * 100}%`;
    quad.style.maskRepeat = 'no-repeat';
    frag.append(quad);
    penX += (g.adv + (Number(t.charSpacing) || 0)) * scale;
    if (penX > maxX) { penX = 0; penY += lineHeight; }
  }
  text.replaceChildren(frag);
  return true;
}

export function applyText(el, node, assets) {
  const t = node.text;
  const text = document.createElement('div');
  text.className = 'text';
  text.setAttribute('aria-label', t.raw || '');
  text.style.pointerEvents = 'none';
  el.append(text);
  if (t.quads?.length) {
    const font = assets.fonts?.[t.font] || assets.fonts?.[fallbackFont];
    if (!font) { text.dataset.missingFont = t.font; return; }
    const frag = document.createDocumentFragment();
    for (const q of t.quads) {
      const g = document.createElement('i');
      g.textContent = q.c || '';
      g.style.left = `${q.l}px`;
      g.style.top = `${q.t}px`;
      g.style.width = `${q.w}px`;
      g.style.height = `${q.h}px`;
      g.style.backgroundColor = rgba(t.color);
      g.style.maskImage = `url(./assets/${font.file})`;
      g.style.webkitMaskImage = g.style.maskImage;
      g.style.maskSize = `${100 / Math.max(q.u1 - q.u0, 1e-4)}% ${100 / Math.max(q.v1 - q.v0, 1e-4)}%`;
      g.style.maskPosition = `${(q.u0 / Math.max(1 - (q.u1 - q.u0), 1e-4)) * 100}% ${((1 - q.v1) / Math.max(1 - (q.v1 - q.v0), 1e-4)) * 100}%`;
      g.style.maskRepeat = 'no-repeat';
      frag.append(g);
    }
    text.replaceChildren(frag);
    return;
  }
  // The stripped Text payload has an empty m_Font PPtr; the TMP fallback
  // font chain is resolved by the game at runtime. Only an explicit binding
  // can authorize SDF replacement; coverage-only matching would be invented.
  if (node.text.sdfFont && drawSdf(text, node, assets, glyphTable(assets.sdfFonts))) {
    text.dataset.renderer = 'sdf';
    return;
  }
  const font = assets.fonts?.[t.font] || assets.fonts?.[fallbackFont];
  if (!font) { text.dataset.missingFont = t.font; return; }
  text.dataset.renderer = 'ttf';
  // Uncovered characters keep the prior source TTF layout so no glyph is
  // silently dropped when a TMP atlas does not include that codepoint.
  text.replaceChildren(document.createTextNode(t.raw || ''));
  text.style.color = rgba(t.color);
  text.style.fontFamily = font.family || fallbackFont;
  text.style.fontSize = `${t.size}px`;
  text.style.lineHeight = `${Math.max(1, t.size)}px`;
  text.style.whiteSpace = 'nowrap';
  text.style.overflow = 'hidden';
  const anchor = /middle/i.test(t.alignment || '') ? 'center' : /lower/i.test(t.alignment || '') ? 'flex-end' : 'flex-start';
  const justify = /Right/i.test(t.alignment || '') ? 'flex-end' : /Center/i.test(t.alignment || '') ? 'center' : 'flex-start';
  text.style.display = 'flex';
  text.style.alignItems = anchor;
  text.style.justifyContent = justify;
}
