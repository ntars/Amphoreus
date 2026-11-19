/* 如我所书。只读。
   结构照官方六件档案：英雄纪（十三卷）／命路（四行诗）／迷迷／
   管理员批注／δ-me13／邮箱。 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const S = { archive: null, canon: null, warden: null, view: 'home', chapter: 1 };

async function get(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + ' ' + r.status);
  return r.json();
}

/* ---------------- 图标 ---------------- */
const ICONS = {
  book: '<path d="M6 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 4v18"/><path d="M10 9h5M10 13h5"/>',
  path: '<circle cx="11" cy="5" r="2"/><path d="M11 7v6l-3 8"/><path d="M11 13l4 3v5"/>',
  mem: '<circle cx="11" cy="11" r="6"/><path d="M11 8v3l2 2"/><path d="M3 11h2M17 11h2"/>',
  wave: '<path d="M2 11h2l2-5 3 11 3-8 2 4h6"/>',
  core: '<rect x="4" y="4" width="14" height="14" rx="2"/><path d="M8 8h6v6H8z"/><path d="M11 2v2M11 18v2M2 11h2M18 11h2"/>',
  mail: '<rect x="2" y="5" width="18" height="12" rx="1"/><path d="M2 6l9 6 9-6"/>',
};

function iconSvg(name) {
  return `<svg class="ico" viewBox="0 0 22 22" aria-hidden="true">${ICONS[name] || ICONS.book}</svg>`;
}

/* ---------------- 视图切换 ---------------- */
function show(name) {
  S.view = name;
  $$('.spread').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

/* ---------------- 首页 ---------------- */
function renderHome() {
  $('#archives').innerHTML = S.archive.archives.map((a) => `
    <button class="arc" data-arc="${a.id}">
      ${iconSvg(a.glyph)}
      <span class="name">${a.zh}<span class="ext">.${a.ext}</span></span>
      <span class="role">${a.role}</span>
      <span class="note">${a.note}</span>
    </button>`).join('');

  $$('.arc').forEach((b) => b.addEventListener('click', () => openArchive(b.dataset.arc)));
  $('#foot-left').textContent = '如我所书';
  $('#foot-right').textContent = `第 ${S.archive.cycle} 次演算 · 火种 ${S.archive.sparks}/12`;
}

function openArchive(id) {
  if (id === 'hero') return openCatalog();
  if (id === 'path') return openPath();
  if (id === 'warden') return openWarden();
  if (id === 'me13') return openMe13();
  if (id === 'mimi') return openMimi();
  if (id === 'mail') return openMail();
}

/* ---------------- 目录 ---------------- */
function openCatalog() {
  const cat = S.archive.catalog;
  $('#cat-meta').textContent = cat.length + ' 卷 · 每卷五节 · 已录 ' +
    cat.reduce((n, v) => n + v.written, 0) + '/' + (cat.length * 5);
  $('#catalog').innerHTML = cat.map((v) => {
    // 未写的卷照样能翻。书是给人读的，空卷比锁卷诚实。
    const dots = [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= v.written ? 'on' : '') + '"></i>').join('');
    const parts = v.new.split(' ');
    return '<div class="card' + (v.written ? '' : ' blank') + '" data-ch="' + v.chapter + '">' +
      '<span class="no">第 ' + v.chapter + ' 卷</span>' +
      '<span class="tag">' + v.spark + '</span>' +
      '<div class="name">' + parts[0] + '</div>' +
      '<div class="sub">' + (parts[1] || '') + '</div>' +
      '<div class="bar">' + dots + '</div>' +
    '</div>';
  }).join('');

  $$('#catalog .card').forEach((c) => c.addEventListener('click', () => {
    openVolume(Number(c.dataset.ch));
  }));
  show('catalog');
}

/* ---------------- 单卷 ---------------- */
async function openVolume(chapter) {
  const { volume: v } = await get(`/api/archive/volume?chapter=${chapter}`);
  S.chapter = chapter;

  $('#vol-title').innerHTML = `第 ${v.chapter} 卷 · ${v.new.split(' ')[0]}<span class="ext"> ${v.new.split(' ')[1] || ''}</span>`;
  $('#vol-meta').textContent = v.old !== v.new ? `旧称 ${v.old}` : '';

  const lines = v.verse || [];
  $('#verse').innerHTML = lines.map((l, i) => {
    const isLast = i === lines.length - 1;
    return `<span class="${isLast ? 'last' : ''}">${l}</span>`;
  }).join('\n');

  $('#epigraph').innerHTML = `
    <span class="k">神谕</span>
    ${v.prophecy || '—'}`;

  $('#sections').innerHTML = v.sections.map((s) => `
    <article class="sec ${s.written ? '' : 'unwritten'}">
      <div class="sec-head">
        <span class="rom">${s.roman}</span>
        <h3>${s.zh}</h3>
        <span class="when">${s.written ? (s.origin === 'template' ? '著录' : '亲笔') + ' · ' + s.when : '尚未写下'}</span>
      </div>
      <p>${s.written ? s.body : '这一节还没写到。世界还在往前走。'}</p>
    </article>`).join('');

  show('volume');
}

/* ---------------- 逐火者的命路 ---------------- */
function openPath() {
  $('#paths').innerHTML = S.archive.catalog
    .slice()
    .sort((a, b) => a.chapter - b.chapter)
    .map((v) => `<div class="path-item">
      <h3>${v.new}</h3>
      <div class="old">${v.old !== v.new ? v.old : '&nbsp;'}</div>
      <div class="poem">${(v.verse || []).join('\n')}</div>
    </div>`).join('');
  show('path');
}

/* ---------------- 管理员批注 ---------------- */
function openWarden() {
  const lines = S.warden.lines;
  // 原文里有多处自然分段，按三行一组给出呼吸。
  $('#warden').innerHTML = lines.map((l, i) => {
    const gap = (i + 1) % 3 === 0 && i < lines.length - 1 ? ' class="gap"' : '';
    return `<p${gap}>${l}</p>`;
  }).join('');
  show('warden');
}

/* ---------------- δ-me13 ---------------- */
function openMe13() {
  const list = (S.canon && S.canon.pipeline) || [];
  const now = (S.archive && S.archive.sparks) || 0;
  $('#me13-meta').textContent = list.length + ' 阶段 · 33550336 次回归';
  // 真正的进度由火种数决定：十二枚齐了才走到「再创世」之后。
  const reached = Math.min(list.length, Math.floor((now / 12) * list.length));
  $('#pipeline').innerHTML = list.map((p, i) => {
    const cls = i < reached ? 'done' : (i === reached ? 'now' : '');
    return '<div class="stage ' + cls + '">' +
      '<span class="st-num">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="st-name">' + p.zh + '</span>' +
      '<span class="st-note">' + p.note + '<br><span class="st-loops">' + p.loops + '</span></span>' +
      '<span class="st-pct">' + p.progress + '%</span>' +
    '</div>';
  }).join('');
  show('me13');
}

/* ---------------- 迷迷 ---------------- */
function openMimi() {
  $('#mimi').innerHTML = `<div class="mimi-grid">${
    S.warden.mimi.map((t) => `<span>${t}</span>`).join('')
  }</div>`;
  show('mimi');
}

/* ---------------- 题记与书写指引 ----------------
   原文是官方那十一句「自旅途间……前往书中将其写下」。
   这是书的书写指引，不是信件——不能套上「第 N 封 · 发件人」的信封。 */
function openMail() {
  const hints = S.warden.hints;
  $('#mail-meta').textContent = hints.length + ' 则 · 待写入书';
  $('#mail').innerHTML = hints.map((h, i) => {
    const cut = h.indexOf('自旅途');
    const lead = cut > 0 ? h.slice(0, cut) : h;
    const tail = cut > 0 ? h.slice(cut) : '';
    return '<div class="mail-item">' +
      '<div class="from">其 ' + (i + 1) + '</div>' +
      '<div class="subject">' + lead + '</div>' +
      (tail ? '<div class="body">' + tail + '</div>' : '') +
    '</div>';
  }).join('') +
  '<p class="src-note">以上为游戏原文的书写指引，逐条照录，未作改写。' +
  '书里正在写下的文字由这个世界的演算生成，与这些句子无关。</p>';
  show('mail');
}

/* ---------------- 启动 ---------------- */
async function boot() {
  [S.archive, S.canon, S.warden] = await Promise.all([
    get('/api/archive'),
    get('/api/canon'),
    get('/api/warden'),
  ]);
  renderHome();

  $$('.back').forEach((b) => b.addEventListener('click', () => {
    const to = b.dataset.go;
    if (to === 'home') show('home');
    else if (to === 'catalog') show('catalog');
  }));

  // 单个视图出错不该把整本书清空。这里逐个兜住，坏的那页只坏它自己。
  const h = location.hash.replace('#', '');
  const routes = {
    home: () => show('home'),
    catalog: openCatalog,
    path: openPath,
    warden: openWarden,
    me13: openMe13,
    mimi: openMimi,
    mail: openMail,
  };
  try {
    if (h.startsWith('vol')) await openVolume(Number(h.slice(3)) || 1);
    else (routes[h] || routes.home)();
  } catch (e) {
    console.error(e);
    const sec = document.querySelector('#view-' + (h.startsWith('vol') ? 'volume' : h));
    if (sec) {
      const box = document.createElement('p');
      box.style.cssText = 'color:#8f8878;font-size:13px;padding:24px 0';
      box.textContent = '这一页没能打开：' + e.message;
      sec.appendChild(box);
      show(sec.id.replace('view-', ''));
    }
  }
}

boot().catch((e) => {
  document.querySelector('#view-home').innerHTML =
    '<div style="padding:60px 40px;color:#8f8878;font-size:13px;line-height:2">' +
    '书打不开：' + e.message + '<br>先跑 python3 main.py start，再刷新。</div>';
});
