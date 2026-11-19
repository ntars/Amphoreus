/* 翁法罗斯 · 只读仪表盘
   只做三件事：拉数据、画星图、把事件与卷册铺开。
   没有任何写操作的入口——这个世界不归看的人管。 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  data: null,
  events: [],
  ledger: [],
  selected: null,
  tab: 'world',
};

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

/* ---------------- 星图 ---------------- */
function drawMap() {
  const svg = $('#map');
  svg.innerHTML = '';
  const cities = state.data.cities;

  const defs = el('defs', {}, svg);

  // 经纬网：给「星图」一点方位感，不用真实地理投影，因为翁法罗斯没有公开地图
  for (let i = 1; i < 8; i += 1) {
    el('line', { x1: i * 12.5, y1: 4, x2: i * 12.5, y2: 96, stroke: '#1d1913', 'stroke-width': 0.15 }, svg);
    el('line', { x1: 4, y1: i * 12.5, x2: 96, y2: i * 12.5, stroke: '#1d1913', 'stroke-width': 0.15 }, svg);
  }

  // 黑潮自南向北漫上来，用一层半透明覆盖表示已经吞掉的范围
  const tide = state.data.meta.black_tide;
  const tideEdge = 96 - tide * 62;
  const grad = el('linearGradient', { id: 'tideGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#0a0908', 'stop-opacity': 0 }, grad);
  el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': 0.82 }, grad);
  el('rect', {
    x: 2, y: tideEdge, width: 96, height: 98 - tideEdge,
    fill: 'url(#tideGrad)', 'pointer-events': 'none',
  }, svg);
  el('line', {
    x1: 2, y1: tideEdge, x2: 98, y2: tideEdge,
    stroke: '#3a3128', 'stroke-width': 0.2, 'stroke-dasharray': '1.4 1.6',
  }, svg);

  // 城邦之间的连线：表示庇护与朝圣路线，只为画面结构，不是官方航线
  const links = [
    ['okhema', 'kremnos'], ['okhema', 'janusopolis'], ['okhema', 'epiphany'],
    ['okhema', 'twilight_eye'], ['okhema', 'elysiae'], ['okhema', 'dolos'],
    ['janusopolis', 'twilight_eye'], ['epiphany', 'aidonia'], ['kremnos', 'aidonia'],
    ['dolos', 'genesis_vortex'], ['styxias', 'epiphany'],
  ];
  const byId = Object.fromEntries(cities.map((c) => [c.id, c]));
  links.forEach(([a, b]) => {
    const ca = byId[a], cb = byId[b];
    if (!ca || !cb) return;
    el('line', {
      x1: ca.map.x, y1: ca.map.y, x2: cb.map.x, y2: cb.map.y,
      stroke: '#241f19', 'stroke-width': 0.22,
    }, svg);
  });

  cities.forEach((c) => {
    const g = el('g', { class: 'city', style: 'cursor:pointer' }, svg);
    const r = c.map.r * 0.62;
    const color = c.fallen ? '#4a423a' : c.tide > 0.55 ? '#b5762a' : c.tide > 0.3 ? '#9a7d2a' : '#c9a227';
    // 标签一律在圆点下方；星图最南端的城邦靠 viewBox 多留出的空间容纳。
    const labelY = c.map.y + r + 3.6;

    el('circle', {
      cx: c.map.x, cy: c.map.y, r: r + 3.4,
      fill: color, opacity: 0.1,
    }, g);
    el('circle', {
      cx: c.map.x, cy: c.map.y, r,
      fill: 'none', stroke: color, 'stroke-width': 0.35, opacity: 0.9,
    }, g);
    // 侵蚀用内圈扇面表示，不靠颜色深浅单独承载信息
    if (c.tide > 0.02) {
      el('circle', {
        cx: c.map.x, cy: c.map.y, r: r * c.tide,
        fill: color, opacity: 0.22,
      }, g);
    }
    el('circle', { cx: c.map.x, cy: c.map.y, r: 0.7, fill: color }, g);

    const label = el('text', {
      x: c.map.x, y: labelY,
      'text-anchor': 'middle', 'font-size': 2.4,
      fill: '#a89e8e', 'letter-spacing': 0.1,
    }, g);
    label.textContent = c.zh;

    // 火种已归位的城邦加一圈虚线环
    if (c.titan && (state.data.titans.find((t) => t.id === c.titan) || {}).taken) {
      el('circle', {
        cx: c.map.x, cy: c.map.y, r: r + 1.8,
        fill: 'none', stroke: '#c9a227', 'stroke-width': 0.22,
        'stroke-dasharray': '0.9 1.3', opacity: 0.85,
      }, g);
    }

    g.addEventListener('click', () => selectCity(c.id));
    if (state.selected === c.id) {
      el('circle', {
        cx: c.map.x, cy: c.map.y, r: r + 6,
        fill: 'none', stroke: '#c9a227', 'stroke-width': 0.25, opacity: 0.6,
      }, g);
    }
  });

  // 中央标注：创世涡心
  const vortex = byId.genesis_vortex;
  if (vortex) {
    el('circle', {
      cx: vortex.map.x, cy: vortex.map.y, r: 1.6,
      fill: 'none', stroke: '#8c3a2e', 'stroke-width': 0.3,
    }, svg);
  }
}

/* ---------------- 地方详情 ---------------- */
function selectCity(id) {
  state.selected = id;
  drawMap();
  renderCity();
}

function renderCity() {
  const box = $('#city-detail');
  const c = state.data.cities.find((x) => x.id === state.selected);
  if (!c) {
    box.innerHTML = '<div class="panel-head"><h2>此刻</h2></div><p class="empty">选择星图上的一处地方。</p>';
    return;
  }

  const titan = state.data.titans.find((t) => t.id === c.titan) || {};
  const bar = (label, v, color) => `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar"><i style="width:${Math.round(v * 100)}%;background:${color}"></i></div>
      <b>${Math.round(v * 100)}</b>
    </div>`;

  box.innerHTML = `
    <div class="panel-head"><h2>此刻</h2><span class="hint">${c.mood}</span></div>
    <h3 class="city-name">${c.zh}</h3>
    <p class="city-alias">${c.tide > 0.75 ? c.name_zh.replace(/^「|」.*$/g, '') : c.epithet}</p>
    <p class="city-blurb">${c.blurb}</p>
    <div class="bars">
      ${bar('秩序', c.order, '#c9a227')}
      ${bar('信仰', c.faith, '#8a6f1a')}
      ${bar('侵蚀', c.tide, '#4a423a')}
    </div>
    <div class="city-facts">
      <span class="chip">${c.pop.toLocaleString()} 人</span>
      <span class="chip">${titan.zh || '—'} ${titan.taken ? '· 火种已失' : '· ' + (titan.mood || '')}</span>
      <span class="chip">${c.landmarks.slice(0, 2).join(' / ')}</span>
    </div>`;
}

/* ---------------- 指标 ---------------- */
function renderMetrics() {
  const m = state.data.meta;
  const cards = [
    { k: '黑潮', v: Math.round(m.black_tide * 100), u: '%', note: m.epoch_note },
    { k: '火种归位', v: m.sparks, u: '/ 12', note: '十二原动力之简化模型' },
    { k: '方程式', v: Math.round(m.equation * 100), u: '%', note: m.stage_note },
    { k: '演算轮次', v: m.cycle, u: '', note: '每一次都从头开始' },
    { k: '熵', v: Math.round(m.entropy * 100), u: '%', note: '越高越难收敛' },
  ];
  $('#metrics').innerHTML = cards.map((c) => `
    <div class="metric ${c.k === '黑潮' ? 'tide' : ''}">
      <div class="label">${c.k}</div>
      <div class="value">${c.v}<small>${c.u}</small></div>
      <div class="note">${c.note || ''}</div>
    </div>`).join('');
}

/* ---------------- 事件流 ---------------- */
function renderStream() {
  const box = $('#stream');
  if (!state.events.length) {
    box.innerHTML = '<li><span></span><span></span><span class="body empty">还没有发生过什么。</span></li>';
    return;
  }
  box.innerHTML = state.events.map((e) => {
    // 时间折成两行：年月日一行、时段一行，窄列也不会挤成三条。
    const parts = (e.when || '').split(' · ');
    const when = parts.length === 2
      ? `${parts[0].replace('光历 ', '')}<br>${parts[1]}`
      : (e.when || '');
    const narr = e.narrative
      ? `<span class="narr">${e.narrative}</span>` : '';
    const who = [e.subject_zh, e.place_zh].filter(Boolean).join(' · ');
    return `<li class="sev-${e.severity}">
      <span class="when">${when}</span>
      <span class="mark"></span>
      <span class="body"><em>${who ? who + '｜' : ''}</em>${e.text_zh}${narr}</span>
    </li>`;
  }).join('');
}

/* ---------------- 黄金裔 ---------------- */
function renderScions() {
  const list = state.data.scions;
  $('#scion-grid').innerHTML = list.map((s) => {
    const done = s.progress >= 1;
    return `<article class="scion ${done ? 'done' : ''}">
      <div class="scion-top">
        <h3>${s.zh}</h3>
        <span class="epi">${done ? s.final_epithet : s.epithet}</span>
      </div>
      <p class="full">${s.full_zh !== s.zh ? s.full_zh + ' · ' : ''}${s.city_zh || '无归属'}</p>
      <div class="rows">
        <div class="row"><span>火种</span><span>${s.spark}</span></div>
        <div class="row"><span>命途</span><span>${s.path}</span></div>
        <div class="row"><span>原动力</span><span>${s.drive}</span></div>
        <div class="row"><span>试炼</span>
          <div class="bar"><i style="width:${Math.round(s.progress * 100)}%;background:#c9a227"></i></div>
        </div>
        <div class="row"><span>状态</span><span>${s.state}</span></div>
      </div>
      <p class="prophecy">${s.prophecy}</p>
    </article>`;
  }).join('');
}

/* ---------------- 如我所书 ---------------- */
function renderCodex() {
  const box = $('#codex');
  if (!state.ledger.length) {
    box.innerHTML = '<p class="empty">卷册还空着。等演算攒够了，它自己会写。</p>';
    return;
  }
  const byChapter = {};
  state.ledger.forEach((row) => {
    (byChapter[row.chapter] = byChapter[row.chapter] || []).push(row);
  });
  box.innerHTML = Object.keys(byChapter).sort((a, b) => a - b).map((ch) => {
    const rows = byChapter[ch].slice().sort((a, b) => a.section - b.section);
    const sections = rows.map((r) => `
      <div class="section ${r.origin === 'template' ? 'tpl' : ''}">
        <div class="sec-title">第 ${r.section} 节 · ${r.origin === 'template' ? '著录' : '亲笔'}</div>
        <p>${r.body}</p>
      </div>`).join('');
    // title 里存的是卷名（如「缇宝」），卷号单独渲染，不重复。
    const name = rows[0].title || '';
    return `<div class="volume">
      <h3>第 ${ch} 卷${name ? ' · ' + name : ''}</h3>
      ${sections}
    </div>`;
  }).join('');
}

/* ---------------- 时钟与页脚 ---------------- */
function renderClock() {
  const m = state.data.moment;
  $('#date').textContent = `光历 ${m.year} 年 ${m.month_zh} ${m.day} 日 · ${m.weekday_zh}`;
  $('#time').textContent = `${m.time_zh} · ${m.season_zh}`;
  $('#foot-meta').textContent = `${state.data.meta.epoch_zh} · ${state.data.meta.stage_zh}`;
  $('#foot-seed').textContent = state.data.meta.seed;
  const p = state.data.pacing;
  const secs = p.seconds_per_tick;
  const human = secs >= 3600 ? `${(secs / 3600).toFixed(1)} 小时` : `${Math.round(secs)} 秒`;
  $('#foot-pace').textContent = `一拍 = 一个时段 ≈ 现实 ${human}`;
}

/* ---------------- 刷新 ---------------- */
async function refresh(full = true) {
  try {
    state.events = (await get('/api/events?limit=60')).events;
    if (full) {
      const first = !state.data;
      state.data = await get('/api/state');
      state.ledger = (await get('/api/ledger?limit=30')).volumes;
      // 首屏不该留一块空面板：默认落在奥赫玛，世界的中心。
      if (first && !state.selected) state.selected = 'okhema';
      drawMap();
      renderMetrics();
      renderClock();
      renderScions();
      renderCodex();
      if (state.selected) renderCity();
    }
    renderStream();
  } catch (e) {
    console.warn('刷新失败', e);
  }
}

function switchTab(name) {
  state.tab = name;
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === name)));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

$$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.view)));

// 支持用 #scions / #codex 直接打开某个视图，方便收藏与分享。
const initialTab = location.hash.replace('#', '');
if (['world', 'scions', 'codex'].includes(initialTab)) switchTab(initialTab);

refresh(true);
setInterval(() => refresh(false), 4000);
setInterval(() => refresh(true), 20000);
