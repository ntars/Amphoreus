/* 如我所书。只读。
   结构照官方六件档案：英雄纪（十三卷）／命路（四行诗）／迷迷／
   管理员批注／δ-me13／邮箱。 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const S = { archive: null, canon: null, warden: null, view: 'cover', chapter: 1, page: 0 };
let signLongPress = {};
let pageFramePattern = {};

async function get(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + ' ' + r.status);
  return r.json();
}

/* ---------------- 视图切换 ---------------- */
function show(name) {
  const previous = S.view;
  const enteringHome = name === 'home' && previous !== 'home';
  const pathView = $('#view-path');
  const volumeView = $('#view-volume');
  const starExit = previous === 'path' && name !== 'path' ? window.__amphoreusStarExitTimings : null;
  const starExitMs = starExit
    ? Math.max(50, Math.round((Number(starExit.all?.star?.delay || 0) + Number(starExit.all?.star?.duration || 0)) * 1000))
    : 0;
  S.view = name;
  const visible = name === 'home' ? ['home'] : [name];
  $$('.spread').forEach((v) => {
    const key = v.id.replace('view-', '');
    const leavingHome = key === 'home' && previous === 'home' && name !== 'home';
    v.classList.toggle('hidden', !visible.includes(key));
    if (key === 'home' && name === 'home') {
      // Re-entering the homepage must never inherit the previous exit class.
      v.classList.remove('exiting');
      delete v.dataset.exitPending;
    } else if (leavingHome) {
      v.classList.add('exiting');
    }
    if (key === 'path' && starExitMs) v.classList.add('exiting');
  });
  if (volumeView && previous === 'volume' && name !== 'volume') {
    const timing = window.__amphoreusBookletVariantTimings?.out?.page;
    const ms = Math.max(50, Math.round((Number(timing?.duration) || 0.1) * 1000));
    volumeView.classList.add('booklet-exiting');
    volumeView.classList.remove('direct-volume');
    setTimeout(() => volumeView.classList.remove('booklet-exiting'), ms);
  }
  const arcOf = { catalog: 'hero', volume: 'hero', path: 'path', mimi: 'mimi',
    warden: 'warden', me13: 'me13', mail: 'mail' };
  $$('#archive-tabs button').forEach((b) => {
    const active = b.dataset.arc === (arcOf[name] || '');
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const titles = {
    cover: '书写故事', home: '档案', catalog: '翁法罗斯英雄纪.exe', volume: '翁法罗斯英雄纪',
    path: '逐火者的命路.exe', warden: '管理员批注.wav',
    me13: 'δ-me13.exe', mimi: '迷迷.exe', mail: '邮箱.exe',
  };
  const chrome = $('#chrome-title');
  if (chrome) chrome.textContent = titles[name] || '档案';
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  const tabs = document.getElementById('archive-tabs');
  if (tabs) tabs.classList.toggle('hidden', name !== 'home');
  if (enteringHome) {
    applyHomeEntranceVariant(document.documentElement.dataset.homeEntrance || 'opening');
  }
  if (starExitMs) {
    setTimeout(() => {
      pathView?.classList.remove('exiting');
      pathView?.style.removeProperty('transform');
    }, starExitMs);
  }
}

function applyHomeEntranceVariant(variant) {
  document.documentElement.dataset.homeEntrance = variant;
  document.documentElement.dataset.homeEntrancePlayed = variant;
  const home = $('#view-home');
  home?.classList.remove('entrance-opening', 'entrance-first-time', 'entrance-returning', 'entrance-resume');
  home?.classList.add(`entrance-${variant}`);
}

function showHomeWithExit() {
  const home = $('#view-home');
  const isHomeExit = !home?.classList.contains('hidden') && S.view === 'home';
  home?.classList.toggle('exiting', isHomeExit);
  if (!home || !isHomeExit) return show('home');
  const timing = window.__amphoreusHomeExitTimings?.all?.root;
  const ms = Math.max(50, Math.round((Number(timing?.duration) || 0.25) * 1000));
  home.classList.add('exiting');
  home.dataset.exitPending = 'true';
  // Re-entering home from itself must still replay the official Switch clip.
  setTimeout(() => {
    // Let the source-timed exit finish before the returning entrance begins.
    // Clearing here avoids inheriting the exit transform on the new view.
    home.classList.remove('exiting');
    delete home.dataset.exitPending;
    applyHomeEntranceVariant('returning');
    show('home');
  }, ms);
}

function applyChapterSprites(nodes) {
  const vectors = window.__amphoreusChapterVectors || {};
  for (const node of nodes) {
    const raw = node.dataset.chapter || node.dataset.ch || '';
    const value = Number(raw) || 0;
    const key = value === 1 ? '1' : value >= 10 ? String(value) : String(value).padStart(2, '0');
    const entry = vectors[key] || vectors[String(value).padStart(2, '0')] || {};
    for (const [layer, clip] of Object.entries(entry)) {
      if (!clip) continue;
      node.style.setProperty(`--chapter-attr-${layer.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`, clip);
    }
  }
}

function applyTarotTypography() {
  const styles = typeof tarotTypography === 'function' ? tarotTypography() : {};
  const root = document.documentElement;
  const set = (prefix, style, fallbackSize, fallbackColor) => {
    const size = Number(style?.fontSize) || fallbackSize;
    const spacing = Number(style?.lineSpacing) || 1;
    const rgba = style?.color?.rgba || [];
    const color = rgba.length === 4
      ? `rgba(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)}, ${rgba[3]})`
      : fallbackColor;
    root.style.setProperty(`--tarot-${prefix}-size`, `${size}px`);
    root.style.setProperty(`--tarot-${prefix}-line-height`, `${Number((size * spacing).toFixed(3))}px`);
    root.style.setProperty(`--tarot-${prefix}-color`, color);
  };
  set('title', styles.title, 16, '#e7e3d9');
  set('status', styles.status, 24, 'rgba(163, 195, 255, .769)');
  set('function-name', styles.functionName, 20, '#f1f4fb');
  set('hint', styles.hint, 22, '#fff');
  set('count', styles.count, 20, 'rgba(255, 255, 255, .451)');
  set('caption', styles.caption, 20, '#fff');
  set('author', styles.author, 20, '#fff');
  set('load', styles.load, 18, '#121212');
  set('intro-body', styles.introBody, 26, '#fff');
}

function showSourceError(message) {
  const host = document.querySelector('#view-home');
  if (!host) return;
  const errorTiming = window.__amphoreusErrorTiming || {};
  const errorOpen = errorTiming.errorOpen || [];
  const hold = errorTiming.background?.duration || 12.5;
  host.style.setProperty('--error-hold', `${hold}s`);
  host.style.setProperty('--error-open-delay', `${Number(errorOpen[0]?.time ?? 0)}s`);
  host.innerHTML = `
    <div class="source-error" role="alert">
      <div class="source-error-dialog-bg" aria-hidden="true"></div>
      <div class="source-error-scanline" aria-hidden="true"></div>
      <div class="source-error-panel">
        <span class="source-error-hint-bg" aria-hidden="true"></span>
        <span class="source-error-glyph" aria-hidden="true"></span>
        <span class="source-error-hint-icon" aria-hidden="true"></span>
        <p class="source-error-title">${message}</p>
        <p class="source-error-hint">先跑 python3 main.py start，再刷新。</p>
      </div>
    </div>`;
  host.classList.remove('hidden');
}

/* ---------------- 首页 ---------------- */
function renderHome() {
  applyTarotTypography();
  $('#archives').innerHTML = S.archive.archives.map((a) => `
    <button class="arc" data-arc="${a.id}">
      ${archiveIcon(a.id)}
      <span class="name">${a.zh}<span class="ext">.${a.ext}</span></span>
      <span class="role">${a.role}</span>
    </button>`).join('');

  // 官方入口不是桌面文件管理器，而是六项档案导航 + 中央书封。
  // 其余档案仍保留数据与路由，不隐藏内容，只收进首页导航以外的可访问入口。
  const nav = document.querySelector('.home-nav');
  if (nav) {
    // 名称、层级、局部坐标与 reveal 时间全部来自构建期生成的解包数据；
    // 图标剪影来自官方 sprite 的 alpha 遮罩，运行时只作为 CSS path 几何数据。
    const labels = {
      BtnBook:  { arc: 'hero',   zh: '翁法罗斯英雄纪', en: 'CHRONICLES OF AMPHOREUS' },
      BtnStar:  { arc: 'path',   zh: '逐火者的命路',   en: 'PATH OF THE FLAME-CHASERS' },
      BtnPaper: { arc: 'hero',   zh: '十三卷书',       en: 'THIRTEEN CHRONICLES' },
      BtnWiki:  { arc: 'mimi',   zh: '著者的菲仪',     en: "THE AUTHOR'S GIFT" },
      BtnMem:   { arc: 'warden', zh: '管理员批注',     en: 'ADMINISTRATOR NOTES' },
      BtnMail:  { arc: 'mail',   zh: '邮箱',           en: 'MAILBOX' },
    };
    const sourceButtons = typeof tarotButtonSources === 'function' ? tarotButtonSources() : [];
    const sourceIcons = typeof tarotIconTimings === 'function' ? tarotIconTimings() : {};
    const decorativeLoops = typeof tarotDecorativeLoopTimings === 'function' ? tarotDecorativeLoopTimings() : {};
    const effTimings = typeof tarotButtonEffTimings === 'function' ? tarotButtonEffTimings() : {};
    const exitTimings = typeof tarotExitTimings === 'function' ? tarotExitTimings() : {};
    window.__amphoreusExitTimings = exitTimings;
    const homeExitTimings = typeof tarotHomeExitTimings === 'function' ? tarotHomeExitTimings() : {};
    window.__amphoreusHomeExitTimings = homeExitTimings;
    const starExitTimings = typeof tarotStarPanelExitTimings === 'function' ? tarotStarPanelExitTimings() : {};
    window.__amphoreusStarExitTimings = starExitTimings;
    const starTiming = typeof tarotStarPanelTiming === 'function' ? tarotStarPanelTiming() : null;
    if (starTiming?.rotation?.length > 1) {
      const points = starTiming.rotation;
      const duration = points[points.length - 1].time - points[0].time;
      const pct = (time) => ((time - points[0].time) / duration * 100).toFixed(6) + '%';
      const steps = points.map((point) => `${pct(point.time)} { transform: rotateZ(${point.value}deg); }`).join(' ');
      document.documentElement.style.setProperty('--star-rotation-keyframes', steps);
      document.documentElement.style.setProperty('--star-rotation-delay', `${points[0].time}s`);
      document.documentElement.style.setProperty('--star-rotation-duration', `${duration}s`);
      // CSS keyframe selectors cannot be custom properties; emit the source
      // key times as a generated stylesheet instead of hardcoding percents.
      let style = document.getElementById('amph-star-rotation-keyframes');
      if (!style) {
        style = document.createElement('style');
        style.id = 'amph-star-rotation-keyframes';
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes tarotStarPanelRotate { ${steps} }`;
    }
    if (starTiming?.effectRotation?.length > 1) {
      const points = starTiming.effectRotation;
      const t0 = Number(points[0].time);
      const duration = Number(points[points.length - 1].time) - t0;
      const pct = (time) => ((Number(time) - t0) / (duration || 1) * 100).toFixed(6) + '%';
      const steps = points.map((point) => `${pct(point.time)} { transform: rotateZ(${point.value}deg); }`).join(' ');
      let style = document.getElementById('amph-star-effect-rotation-keyframes');
      if (!style) {
        style = document.createElement('style');
        style.id = 'amph-star-effect-rotation-keyframes';
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes tarotStarPanelEffectRotate { ${steps} }`;
      document.documentElement.style.setProperty('--star-effect-rotation-delay', `${t0}s`);
      document.documentElement.style.setProperty('--star-effect-rotation-duration', `${duration}s`);
    }
    const particleOpen = starTiming?.particleOpen || [];
    if (particleOpen.length > 1) {
      const active = particleOpen.find((point) => Number(point.value)) || particleOpen[particleOpen.length - 1];
      document.documentElement.style.setProperty('--path-particle-open-delay', `${active.time}s`);
      document.documentElement.style.setProperty('--path-particle-open-value', String(active.value));
    }
    if (starTiming?.storyPanels?.length) {
      window.__amphoreusStoryPanelTimings = starTiming.storyPanels;
      const progress = starTiming.storyPanels.find((timing) => timing.values?.length > 1);
      if (progress) {
        const points = progress.values;
        const steps = points.map((point) => `${point.percent}% { opacity: ${point.value}; }`).join(' ');
        let style = document.getElementById('amph-story-panel-progress-keyframes');
        if (!style) {
          style = document.createElement('style');
          style.id = 'amph-story-panel-progress-keyframes';
          document.head.appendChild(style);
        }
        style.textContent = `@keyframes tarotStoryPanelProgress { ${steps} }`;
      }
    }
    if (starTiming) {
      const pathEntrance = {
        page: starTiming.pageAlpha,
        back: starTiming.backAlpha,
        pageInfo: starTiming.pageInfo,
        pageInfoX: starTiming.pageInfoX,
        pageInfoXValues: starTiming.pageInfoXValues,
        effectRotation: starTiming.effectRotation,
      };
      window.__amphoreusPathEntranceTimings = pathEntrance;
      const entranceEntry = (prefix, timing) => {
        if (!timing?.keys?.length) return;
        document.documentElement.style.setProperty(`--path-${prefix}-delay`, `${timing.delay}s`);
        document.documentElement.style.setProperty(`--path-${prefix}-duration`, `${timing.duration}s`);
      };
      entranceEntry('page', pathEntrance.page);
      entranceEntry('back', pathEntrance.back);
      entranceEntry('page-info', pathEntrance.pageInfo);
      entranceEntry('page-info-x', pathEntrance.pageInfoX);
      (pathEntrance.pageInfoXValues || []).forEach((point, index) => {
        document.documentElement.style.setProperty(`--path-page-info-x-${index}-at`, `${point.percent}%`);
        document.documentElement.style.setProperty(`--path-page-info-x-${index}`, `${point.value}px`);
      });
    }
    const geom = typeof tarotHomeGeometry === 'function' ? tarotHomeGeometry()
      : { originX: 0, originY: 40, bookY: 12, titleX: 30, titleY: 1, subtitleX: 0, subtitleY: 0, rewardY: -24, goY: -48, closeY: 72 };
    const outsideGeom = typeof tarotOutsideGeometry === 'function' ? tarotOutsideGeometry()
      : { closeY: 72, rewardY: -24, titleX: 30, titleY: 1, subtitleX: 0, subtitleY: 0 };
    const titleTiming = typeof tarotSubtitleTiming === 'function' ? tarotSubtitleTiming() : { delay: 0.333333, duration: 1.083334 };
    window.__amphoreusExitTimings = typeof tarotExitTimings === 'function' ? tarotExitTimings() : {};
    const homeFadeTiming = typeof tarotHomeFadeTiming === 'function' ? tarotHomeFadeTiming() : {};
    const homeFadeCurves = typeof tarotHomeFadeCurves === 'function' ? tarotHomeFadeCurves() : {};
    const homeEntrance = typeof tarotHomeEntranceTimings === 'function' ? tarotHomeEntranceTimings() : {};
    window.__amphoreusHomeEntranceTimings = homeEntrance;
    const homeEntranceButtons = typeof tarotHomeEntranceButtonTimings === 'function' ? tarotHomeEntranceButtonTimings() : {};
    window.__amphoreusHomeEntranceButtonTimings = homeEntranceButtons;
    const errorTiming = typeof tarotErrorTiming === 'function' ? tarotErrorTiming() : {};
    window.__amphoreusErrorTiming = errorTiming;
    const dialogTiming = typeof tarotDialogTiming === 'function' ? tarotDialogTiming() : {};
    window.__amphoreusDialogTiming = dialogTiming;
    const mimiTiming = typeof tarotMimiTiming === 'function' ? tarotMimiTiming() : {};
    const timelineTiming = typeof tarotTimelineTiming === 'function' ? tarotTimelineTiming() : {};
    window.__amphoreusTimelineTiming = timelineTiming;
    window.__amphoreusMimiTiming = mimiTiming;
    const setMimiStyle = (name, value) => document.documentElement.style.setProperty(`--mimi-${name}`, value);
    if (mimiTiming.page?.talkPanelAlpha) {
      setMimiStyle('panel-delay', `${mimiTiming.page.talkPanelAlpha.delay}s`);
      setMimiStyle('panel-duration', `${mimiTiming.page.talkPanelAlpha.duration}s`);
    }
    if (mimiTiming.page?.talkPanelScale?.length) {
      const first = mimiTiming.page.talkPanelScale[0];
      const last = mimiTiming.page.talkPanelScale.at(-1);
      setMimiStyle('panel-scale-start', String(Number(String(first.value).match(/x:\s*([-\d.]+)/)?.[1] ?? 0)));
      setMimiStyle('panel-scale-delay', `${first.time}s`);
      setMimiStyle('panel-scale-duration', `${Number(last.time) - Number(first.time)}s`);
    }
    if (mimiTiming.unlock?.slideAlpha) {
      setMimiStyle('slide-delay', `${mimiTiming.unlock.slideAlpha.delay}s`);
      setMimiStyle('slide-duration', `${mimiTiming.unlock.slideAlpha.duration}s`);
      setMimiStyle('slide-values', mimiTiming.unlock.slideAlpha.keys.map((key) => key.value).join(', '));
    }
    if (mimiTiming.item?.lineScale?.length) {
      const line = mimiTiming.item.lineScale.at(-1);
      setMimiStyle('line-duration', `${line.time}s`);
    }
    const mimiGuide = mimiTiming.guide || {};
    for (const [name, timing] of Object.entries({
      'guide-bg-alpha': mimiGuide.bgAlpha,
      'guide-icon-alpha': mimiGuide.iconAlpha,
      'guide-text-alpha': mimiGuide.hintTextAlpha,
      'guide-function-alpha': mimiGuide.functionAlpha,
      'guide-glow-alpha': mimiGuide.glowAlpha,
      'guide-exit-icon-alpha': mimiGuide.exitIconAlpha,
      'guide-exit-text-alpha': mimiGuide.exitTextAlpha,
    })) {
      if (!timing) continue;
      setMimiStyle(`${name}-delay`, `${timing.delay}s`);
      setMimiStyle(`${name}-duration`, `${timing.duration}s`);
    }
    const keyframePoints = (name, points) => {
      if (!points?.length) return;
      const steps = points.map((point) => `${Number(point.time).toFixed(6) * 100}% { opacity: ${point.value}; }`).join(' ');
      const style = document.createElement('style');
      style.textContent = `@keyframes ${name} { ${steps} }`;
      document.head.appendChild(style);
    };
    keyframePoints('tarotMimiGuideGlow', mimiGuide.glowAlpha?.keys);
    keyframePoints('tarotMimiVoiceIcon1', mimiTiming.voice?.icon1?.keys);
    keyframePoints('tarotMimiVoiceIcon2', mimiTiming.voice?.icon2?.keys);
    keyframePoints('tarotMimiVoiceCircleAlpha', mimiTiming.voice?.circleAlpha);
    keyframePoints('tarotMimiVoiceOutline1Alpha', mimiTiming.voice?.outline1Alpha);
    keyframePoints('tarotMimiVoiceOutline2Alpha', mimiTiming.voice?.outline2Alpha);
    const timelineRows = window.__amphoreusTimelineTiming?.rows || {};
    const timelineEntries = Object.entries(timelineRows);
    timelineEntries.forEach(([row, spec], index) => {
      const start = Number(spec?.root?.[0]?.time ?? 0);
      const end = Number(spec?.root?.at(-1)?.time ?? 0);
      document.documentElement.style.setProperty(`--timeline-${row.toLowerCase()}-delay`, `${start}s`);
      document.documentElement.style.setProperty(`--timeline-${row.toLowerCase()}-duration`, `${Math.max(0.05, end - start).toFixed(6)}s`);
      document.documentElement.style.setProperty(`--timeline-${row.toLowerCase()}-scale-start`, String(spec?.root?.[0]?.value ?? 1));
      document.documentElement.style.setProperty(`--timeline-${row.toLowerCase()}-index`, String(index));
    });
    if (timelineEntries.length) {
      const style = document.createElement('style');
      style.textContent = `@keyframes tarotTimelineRowReveal { from { opacity: 0; transform: scale(var(--timeline-row-scale-start, 1)); } to { opacity: 1; transform: scale(1); } }`;
      document.head.appendChild(style);
    }
    const voiceLength = Math.max(...['outline1', 'outline2', 'circle'].map((key) => Number(mimiTiming.voice?.[key]?.at(-1)?.time ?? 0)));
    if (voiceLength) setMimiStyle('voice-duration', `${voiceLength.toFixed(6)}s`);
    const mimiScalePoints = (name, points) => {
      if (!points?.length) return;
      const steps = points.map((point) => `${Number(point.time).toFixed(6) * 100}% { transform: scale(${point.value}); }`).join(' ');
      const style = document.createElement('style');
      style.textContent = `@keyframes ${name} { ${steps} }`;
      document.head.appendChild(style);
    };
    mimiScalePoints('tarotMimiAssistantLight', mimiTiming.assistant?.normalLight);
    mimiScalePoints('tarotMimiAssistantRing', mimiTiming.assistant?.normalRing);
    mimiScalePoints('tarotMimiAssistantSpLight', mimiTiming.assistant?.spLight);
    const assistantLength = Math.max(...['normalLight', 'normalRing', 'spLight'].map((key) => Number(mimiTiming.assistant?.[key]?.at(-1)?.time ?? 0)));
    if (assistantLength) setMimiStyle('assistant-duration', `${assistantLength.toFixed(6)}s`);
    const dialogPart = dialogTiming.dialog || {};
    const setDialogStyle = (name, value) => document.documentElement.style.setProperty(`--dialog-${name}`, value);
    if (dialogPart.contentsAlpha) {
      setDialogStyle('fade-delay', `${dialogPart.contentsAlpha.delay}s`);
      setDialogStyle('fade-duration', `${dialogPart.contentsAlpha.duration}s`);
    }
    const lastScaleX = (keys) => keys.length ? Number(String(keys[keys.length - 1].value).match(/x:\s*([-\d.]+)/)?.[1] ?? 0) : 0;
    if (dialogPart.titleScaleX?.length) {
      setDialogStyle('title-scale-end', String(lastScaleX(dialogPart.titleScaleX)));
      setDialogStyle('title-scale-duration', `${Number(dialogPart.titleScaleX[dialogPart.titleScaleX.length - 1].time) - Number(dialogPart.titleScaleX[0].time)}s`);
    }
    if (dialogPart.frameWobbleX?.length) {
      const times = dialogPart.frameWobbleX.map((key) => key.time);
      setDialogStyle('wobble-x-values', times.map((time, index) => `${(time / (times[times.length - 1] || 1) * 100).toFixed(4)}% ${dialogPart.frameWobbleX[index].value}`).join(', '));
      setDialogStyle('wobble-duration', `${times[times.length - 1]}s`);
    }
    if (dialogPart.titleFlicker) {
      setDialogStyle('flicker-delay', `${dialogPart.titleFlicker.delay}s`);
      setDialogStyle('flicker-duration', `${dialogPart.titleFlicker.duration}s`);
      setDialogStyle('flicker-values', dialogPart.titleFlicker.keys.map((key) => key.value).join(', '));
    }
    const errorOpen = errorTiming.errorOpen || [];
    if (errorOpen.length > 1) {
      document.documentElement.style.setProperty('--error-open-delay', `${Number(errorOpen[0].time)}s`);
      document.documentElement.style.setProperty('--error-open-duration', `${Number(errorOpen[errorOpen.length - 1].time) - Number(errorOpen[0].time)}s`);
    }
    const catalogTiming = typeof tarotCatalogTiming === 'function' ? tarotCatalogTiming() : null;
    const bookletTiming = typeof tarotBookletTiming === 'function' ? tarotBookletTiming() : null;
    const bookletVariants = typeof tarotBookletVariantTimings === 'function' ? tarotBookletVariantTimings() : {};
    window.__amphoreusBookletVariantTimings = bookletVariants;
    const sceneColors = typeof tarotSceneColors === 'function' ? tarotSceneColors() : {};
    const textureColors = typeof tarotTextureColors === 'function' ? tarotTextureColors() : {};
    const materialColors = typeof tarotMaterialColors === 'function' ? tarotMaterialColors() : {};
    const spriteSamples = typeof tarotSpriteSamples === 'function' ? tarotSpriteSamples() : {};
    const starVector = typeof tarotVector === 'function' ? tarotVector('buttonStar') : null;
    const starRings = typeof tarotStarRings === 'function' ? tarotStarRings() : {};
    const starPanelVectors = typeof tarotStarPanelVectors === 'function' ? tarotStarPanelVectors() : {};
    const buttonVectors = typeof tarotButtonVectors === 'function' ? tarotButtonVectors() : {};
    const catalogVectors = typeof tarotCatalogDecorations === 'function' ? tarotCatalogDecorations() : {};
    const coverVectors = typeof tarotCoverDecorations === 'function' ? tarotCoverDecorations() : {};
    const spriteColors = typeof tarotSpriteColors === 'function' ? tarotSpriteColors() : {};
    const rewardVectors = typeof tarotRewardVectors === 'function' ? tarotRewardVectors() : {};
    const uiLayerVectors = typeof tarotUiLayerVectors === 'function' ? tarotUiLayerVectors() : {};
    const waitingVectors = typeof tarotWaitingVectors === 'function' ? tarotWaitingVectors() : {};
    const chapterVectors = typeof tarotChapterVectors === 'function' ? tarotChapterVectors() : {};
    const chapterColors = typeof tarotChapterColors === 'function' ? tarotChapterColors() : {};
    const entranceVectors = typeof tarotEntranceVectors === 'function' ? tarotEntranceVectors() : {};
    const homeIconVariants = typeof tarotHomeIconVariants === 'function' ? tarotHomeIconVariants() : {};
    window.__amphoreusChapterVectors = chapterVectors;
    window.__amphoreusEntranceVectors = entranceVectors;
    window.__amphoreusHomeIconVariants = homeIconVariants;
    const mailHintTiming = typeof tarotMailHintTiming === 'function' ? tarotMailHintTiming() : {};
    const bottomHintTiming = typeof tarotBottomHintTiming === 'function' ? tarotBottomHintTiming() : {};
    const waitingLoopTiming = typeof tarotWaitingLoopTiming === 'function' ? tarotWaitingLoopTiming() : {};
    const buttonStates = typeof tarotButtonStates === 'function' ? tarotButtonStates() : {};
    window.__amphoreusBottomHintTiming = bottomHintTiming;
    window.__amphoreusWaitingLoopTiming = waitingLoopTiming;
    signLongPress = typeof tarotSignLongPress === 'function' ? tarotSignLongPress() : {};
    pageFramePattern = typeof tarotPageFramePatternTiming === 'function' ? tarotPageFramePatternTiming() : {};
    window.__amphoreusSignLongPress = signLongPress;
    window.__amphoreusPageFramePattern = pageFramePattern;
    window.__amphoreusButtonStates = buttonStates;
    const coverTiming = typeof tarotCoverTiming === 'function' ? tarotCoverTiming() : null;
    const bindEffPanelColors = (prefix, timing) => {
      for (const [part, rgb] of Object.entries(timing?.colors || {})) {
        if (!Array.isArray(rgb) || rgb.length !== 3) continue;
        document.documentElement.style.setProperty(`--${prefix}-eff-${part}-rgb`, rgb.map((v) => Number(v) || 0).join(' '));
      }
    };
    bindEffPanelColors('cover', coverTiming);
    bindEffPanelColors('catalog', catalogTiming);
    for (const [name, timing] of Object.entries(exitTimings)) {
      bindEffPanelColors(`${name}-exit`, timing);
    }
    const starExit = starExitTimings.all?.star;
    const starExitScale = starExitTimings.all?.starScale;
    if (starExit) {
      document.documentElement.style.setProperty('--star-exit-delay', `${starExit.delay}s`);
      document.documentElement.style.setProperty('--star-exit-duration', `${starExit.duration}s`);
    }
    if (starExitScale?.values?.length) {
      document.documentElement.style.setProperty('--star-exit-scale-delay', `${starExitScale.delay}s`);
      document.documentElement.style.setProperty('--star-exit-scale-duration', `${starExitScale.duration}s`);
      document.documentElement.style.setProperty('--star-exit-scale-start', String(starExitScale.values[0]));
      document.documentElement.style.setProperty('--star-exit-scale-end', String(starExitScale.values[starExitScale.values.length - 1]));
    }
    for (const [part, timing] of Object.entries(starExitTimings.normal || {})) {
      if (!timing) continue;
      document.documentElement.style.setProperty(`--star-exit-${part}-delay`, `${timing.delay}s`);
      document.documentElement.style.setProperty(`--star-exit-${part}-duration`, `${timing.duration}s`);
      document.documentElement.style.setProperty(`--star-exit-${part}-values`, timing.values.join(','));
      document.documentElement.style.setProperty(`--star-exit-${part}-start`, `${timing.values[0]}px`);
      document.documentElement.style.setProperty(`--star-exit-${part}-end`, `${timing.values[timing.values.length - 1]}px`);
    }
    const bookletBtnTiming = typeof tarotBookletBtnTiming === 'function' ? tarotBookletBtnTiming() : null;
    const topBtnTiming = typeof tarotTopBtnTiming === 'function' ? tarotTopBtnTiming() : null;
    const bookletRefreshTiming = typeof tarotBookletRefreshTiming === 'function' ? tarotBookletRefreshTiming() : {};
    window.__amphoreusBookletRefreshTiming = bookletRefreshTiming;
    const storyStarTiming = typeof tarotStoryStarTiming === 'function' ? tarotStoryStarTiming() : null;
    window.__amphoreusStoryStarTiming = storyStarTiming;
    if (storyStarTiming?.scale?.length > 1) {
      const points = storyStarTiming.scale;
      const duration = Number(storyStarTiming.scaleDuration) || 1;
      const start = Number(storyStarTiming.scaleDelay) || 0;
      const steps = points.map((point) => `${((Number(point.time) - start) / duration * 100).toFixed(6)}% { scale: ${point.value}; }`).join(' ');
      let style = document.getElementById('amph-story-star-scale-keyframes');
      if (!style) {
        style = document.createElement('style');
        style.id = 'amph-story-star-scale-keyframes';
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes tarotStoryStarScale { ${steps} }`;
      document.documentElement.style.setProperty('--story-flash-scale-delay', `${start}s`);
      document.documentElement.style.setProperty('--story-flash-scale-duration', `${duration}s`);
      const active = storyStarTiming.effActive || [];
      if (active.length > 1) {
        document.documentElement.style.setProperty('--story-flash-eff-off-delay', `${active[1].time}s`);
        document.documentElement.style.setProperty('--story-flash-eff-off-value', String(active[1].value));
      }
    }
    document.documentElement.style.setProperty('--source-origin-x', `${geom.originX}px`);
    document.documentElement.style.setProperty('--source-origin-y', `${geom.originY}px`);
    document.documentElement.style.setProperty('--source-book-y', `${geom.bookY}px`);
    document.documentElement.style.setProperty('--source-title-x', `${outsideGeom.titleX ?? geom.titleX}px`);
    document.documentElement.style.setProperty('--source-title-y', `${outsideGeom.titleY ?? geom.titleY}px`);
    document.documentElement.style.setProperty('--source-subtitle-x', `${outsideGeom.subtitleX ?? geom.subtitleX}px`);
    document.documentElement.style.setProperty('--source-subtitle-y', `${outsideGeom.subtitleY ?? geom.subtitleY}px`);
    document.documentElement.style.setProperty('--source-title-delay', `${titleTiming.delay}s`);
    document.documentElement.style.setProperty('--source-title-duration', `${titleTiming.duration}s`);
    document.documentElement.style.setProperty('--source-reward-y', `${outsideGeom.rewardY ?? geom.rewardY}px`);
    document.documentElement.style.setProperty('--source-reward-x', `${outsideGeom.rewardX ?? 0}px`);
    document.documentElement.style.setProperty('--source-go-y', `${geom.goY}px`);
    document.documentElement.style.setProperty('--source-close-x', `${outsideGeom.closeX ?? 0}px`);
    document.documentElement.style.setProperty('--source-close-y', `${outsideGeom.closeY ?? geom.closeY}px`);
    document.documentElement.style.setProperty('--source-content-y', `${outsideGeom.contentY ?? -20}px`);
    for (const [key, value] of Object.entries(outsideGeom)) {
      if (!key.startsWith('bottomBar')) continue;
      document.documentElement.style.setProperty(`--source-${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`, String(value));
    }
    if (starVector) document.documentElement.style.setProperty('--source-star-path', starVector);
    for (const [key, value] of Object.entries(catalogVectors)) {
      if (value) document.documentElement.style.setProperty(`--catalog-sprite-${key}`, value);
    }
    for (const [key, value] of Object.entries(coverVectors)) {
      if (!value) continue;
      document.documentElement.style.setProperty(`--cover-sprite-${key}`, value);
      if (key === 'catalogTextDeco' || key === 'catalogItemIcon') {
        document.documentElement.style.setProperty(`--catalog-sprite-${key === 'catalogTextDeco' ? 'textDeco' : 'itemIcon'}`, value);
      }
    }
    const coverDecoMeta = (key) => {
      const points = [...String(coverVectors[key] || '').matchAll(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/g)]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      if (!points.length) return null;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    };
    for (const [key, cssKey] of [['centerDeco1', 'deco1'], ['people', 'people']]) {
      const meta = coverDecoMeta(key);
      if (!meta) continue;
      document.documentElement.style.setProperty(`--cover-${cssKey}-x`, `${meta.x}%`);
      document.documentElement.style.setProperty(`--cover-${cssKey}-y`, `${meta.y}%`);
    }
    for (const [key, value] of Object.entries(spriteColors)) {
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      document.documentElement.style.setProperty(`--sprite-${key}`, value);
      document.documentElement.style.setProperty(`--sprite-${cssKey}`, value);
    }
    for (const [key, value] of Object.entries(rewardVectors)) {
      if (value) document.documentElement.style.setProperty(`--reward-sprite-${key}`, value);
    }
    for (const [key, value] of Object.entries(spriteColors)) {
      document.documentElement.style.setProperty(`--sprite-${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`, value);
    }
    for (const [key, value] of Object.entries(waitingVectors)) {
      if (!value) continue;
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      document.documentElement.style.setProperty(`--waiting-sprite-${cssKey}`, value);
      if (key.startsWith('sign')) {
        document.documentElement.style.setProperty(`--sign-sprite-${cssKey}`, value);
        document.documentElement.style.setProperty(`--sign-sprite-${key.replace(/^sign/, '')}`, value);
      }
      document.documentElement.style.setProperty(`--ui-sprite-${cssKey}`, value);
      if (key.startsWith('card')) document.documentElement.style.setProperty(`--card-sprite-${key}`, value);
    }
    for (const [key, value] of Object.entries(starPanelVectors)) {
      if (!value) continue;
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      document.documentElement.style.setProperty(`--star-panel-${key}`, value);
      document.documentElement.style.setProperty(`--star-panel-${cssKey}`, value);
    }
    for (const key of ['mainScreenFrame', 'subScreenFrame', 'starPanelCardBack', 'starPanelCardFront', 'starPanelCardCenterBack', 'starPanelCardCenterItem', 'starPanelCardCenterSun', 'starPanelCardIcon', 'cardUpDotBg', 'cardUpHalfCircle', 'catalog13CardMask', 'switchMailIcon']) {
      if (!spriteColors[key]) continue;
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      document.documentElement.style.setProperty(`--star-panel-${key}-rgb`, spriteColors[key]);
      document.documentElement.style.setProperty(`--star-panel-${cssKey}-rgb`, spriteColors[key]);
    }
    for (const [key, value] of Object.entries(uiLayerVectors)) {
      if (!value) continue;
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      document.documentElement.style.setProperty(`--ui-layer-${key}`, value);
      document.documentElement.style.setProperty(`--ui-layer-${cssKey}`, value);
    }
    for (const [key, value] of Object.entries(chapterVectors)) {
      if (!value || typeof value !== 'object') continue;
      for (const [layer, clip] of Object.entries(value)) {
        if (clip) document.documentElement.style.setProperty(`--chapter-${key}-${layer}`, clip);
      }
    }
    for (const [key, value] of Object.entries(chapterColors)) {
      if (!value || typeof value !== 'object') continue;
      for (const [layer, color] of Object.entries(value)) {
        if (color) document.documentElement.style.setProperty(`--chapter-${key}-${layer}-rgb`, color);
      }
    }
    for (const [key, value] of Object.entries(entranceVectors)) {
      if (value) document.documentElement.style.setProperty(`--entry-sprite-${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`, value);
    }
    for (const [key, value] of Object.entries(homeIconVariants)) {
      const clips = Array.isArray(value) ? value : [value];
      clips.forEach((clip, index) => {
        if (clip) document.documentElement.style.setProperty(`--home-variant-${key.toLowerCase()}-${index}`, clip);
      });
    }
    for (const [key, value] of Object.entries(starRings)) {
      document.documentElement.style.setProperty(`--ring-${key}-x`, `${value.x}px`);
      document.documentElement.style.setProperty(`--ring-${key}-y`, `${value.y}px`);
      document.documentElement.style.setProperty(`--ring-${key}-sx`, String(value.scaleX));
      document.documentElement.style.setProperty(`--ring-${key}-sy`, String(value.scaleY));
    }
    for (const [key, value] of Object.entries(sceneColors)) {
      document.documentElement.style.setProperty(`--scene-${key}`, value);
    }
    for (const [key, value] of Object.entries(textureColors)) {
      document.documentElement.style.setProperty(`--texture-${key}`, value);
    }
    for (const [key, value] of Object.entries(materialColors)) {
      document.documentElement.style.setProperty(`--material-${key}`, value);
    }
    window.__amphoreusSpriteSamples = spriteSamples;
    for (const [prefix, value] of [
      ['home-root', homeFadeTiming.root],
      ['home-screen', homeFadeTiming.screen],
      ['home-close-alpha', homeFadeTiming.close],
      ['home-reward', homeFadeTiming.reward],
      ['home-desktop', homeFadeTiming.desktop],
      ['home-bottom-bar', homeExitTimings.normal?.bottomBar],
      ['entry', coverTiming?.root],
      ['entry-title', coverTiming?.pageInfo],
      ['star', starTiming?.star],
      ['story-star', starTiming?.story],
      ['booklet-btn', bookletBtnTiming],
      ['booklet-close', bookletVariants.out?.page],
      ['booklet-direct', bookletVariants.directIn?.page],
      ['booklet-top-btn', topBtnTiming?.root],
      ['booklet-top-btn-left-x', topBtnTiming?.leftX],
      ['booklet-top-btn-right-y', topBtnTiming?.rightY],
      ['booklet-refresh-out', bookletRefreshTiming.out],
      ['booklet-refresh-in', bookletRefreshTiming.in],
      ['booklet-refresh-out-left', bookletRefreshTiming.outLeftTab],
      ['booklet-refresh-out-right', bookletRefreshTiming.outRightTab],
      ['booklet-refresh-in-left', bookletRefreshTiming.inLeftTab],
      ['booklet-refresh-in-right', bookletRefreshTiming.inRightTab],
      ['booklet-refresh-out-back', bookletRefreshTiming.outBackDeco],
      ['booklet-refresh-out-shadow', bookletRefreshTiming.outBackShadow],
      ['booklet-refresh-in-back', bookletRefreshTiming.inBackDeco],
      ['booklet-refresh-in-shadow', bookletRefreshTiming.inBackShadow],
      ['story-flash', storyStarTiming],
      ['mail-hint', mailHintTiming.icon],
      ['mail-hint-button', mailHintTiming.button],
      ['mail-hint-eff', mailHintTiming.eff],
      ['mail-hint-wave1', mailHintTiming.wave1],
      ['mail-hint-wave2', mailHintTiming.wave2],
    ]) {
      if (!value) continue;
      document.documentElement.style.setProperty(`--${prefix}-delay`, `${value.delay}s`);
      document.documentElement.style.setProperty(`--${prefix}-duration`, `${value.duration}s`);
      // Flat aliases let gates and older consumers read one stable variable name.
      document.documentElement.style.setProperty(`--${prefix}-values`, value.keys?.map((key) => key.value).join(',') || '');
    }
    for (const [prefix, timing] of [
      ['booklet-direct-tab', bookletVariants.directIn?.tab],
      ['booklet-direct-page-info', bookletVariants.directIn?.pageInfo],
      ['booklet-direct-btn-panel', bookletVariants.directIn?.btnPanel],
      ['booklet-direct-btn-reset', bookletVariants.directIn?.btnReset],
      ['booklet-direct-function-panel', bookletVariants.directIn?.functionPanel],
      ['booklet-direct-close', bookletVariants.directIn?.close],
      ['booklet-direct-back', bookletVariants.directIn?.back],
      ['booklet-close-tab', bookletVariants.out?.tab],
      ['booklet-close-page-info', bookletVariants.out?.pageInfo],
      ['booklet-close-btn-panel', bookletVariants.out?.btnPanel],
      ['booklet-close-function-panel', bookletVariants.out?.functionPanel],
      ['booklet-close-close', bookletVariants.out?.close],
      ['booklet-close-back', bookletVariants.out?.back],
    ]) {
      if (!timing) continue;
      document.documentElement.style.setProperty(`--${prefix}-delay`, `${timing.delay}s`);
      document.documentElement.style.setProperty(`--${prefix}-duration`, `${timing.duration}s`);
    }
    for (const [prefix, curve] of [
      ['booklet-direct-back-rotation', bookletVariants.directIn?.backDecoRotationZ],
      ['booklet-direct-back-x', bookletVariants.directIn?.backDecoX],
      ['booklet-direct-back-y', bookletVariants.directIn?.backDecoY],
      ['booklet-direct-back-shadow', bookletVariants.directIn?.backShadowAlpha],
      ['booklet-direct-above-page', bookletVariants.directIn?.abovePageAlpha],
      ['booklet-direct-page-frame-shadow', bookletVariants.directIn?.pageFrameShadowAlpha],
      ['booklet-direct-book-shadow', bookletVariants.directIn?.bookShadowAlpha],
    ]) {
      if (!curve?.length) continue;
      const start = Number(curve[0].time);
      const end = Number(curve[curve.length - 1].time);
      document.documentElement.style.setProperty(`--${prefix}-delay`, `${start}s`);
      document.documentElement.style.setProperty(`--${prefix}-duration`, `${end - start}s`);
      curve.forEach((point, index) => {
        document.documentElement.style.setProperty(`--${prefix}-${index}-at`, `${point.percent ?? ((Number(point.time) - start) / (end - start || 1) * 100).toFixed(4)}%`);
        document.documentElement.style.setProperty(`--${prefix}-${index}`, String(point.value));
      });
    }
    for (const [name, curve] of [['left', bookletVariants.directIn?.leftSpineScale], ['right', bookletVariants.directIn?.rightSpineScale]]) {
      if (!curve?.length) continue;
      const start = Number(curve[0].time);
      const end = Number(curve[curve.length - 1].time) || start + 1;
      const steps = curve.map((point) => `${((Number(point.time) - start) / (end - start || 1) * 100).toFixed(4)}% { scale: ${point.x} ${point.y}; }`).join(' ');
      let style = document.getElementById(`amph-booklet-${name}-spine-keyframes`);
      if (!style) {
        style = document.createElement('style');
        style.id = `amph-booklet-${name}-spine-keyframes`;
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes tarotBookletDirect${name === 'left' ? 'Left' : 'Right'}Spine { ${steps} }`;
      document.documentElement.style.setProperty(`--booklet-direct-${name}-spine-delay`, `${start}s`);
      document.documentElement.style.setProperty(`--booklet-direct-${name}-spine-duration`, `${end - start}s`);
    }
    const directPageScale = bookletVariants.directIn?.pageScale || [];
    const makeScaleKeyframes = (id, name, points) => {
      if (!points?.length) return;
      const start = Number(points[0].time);
      const span = Number(points[points.length - 1].time) - start || 1;
      const steps = points.map((point) => `${((Number(point.time) - start) / span * 100).toFixed(6)}% { transform: scale(${point.value}); }`).join(' ');
      let style = document.getElementById(id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes ${name} { ${steps} }`;
      return { start, span };
    };
    const directScaleTiming = makeScaleKeyframes('amph-booklet-direct-page-scale-keyframes', 'tarotBookletDirectPageScale', directPageScale);
    if (directPageScale.length) {
      document.documentElement.style.setProperty('--booklet-direct-page-scale-delay', `${directScaleTiming.start}s`);
      document.documentElement.style.setProperty('--booklet-direct-page-scale-duration', `${directScaleTiming.span}s`);
    }
    const initialScaleTiming = makeScaleKeyframes('amph-booklet-initial-page-scale-keyframes', 'tarotBookletInitialPageScale', bookletVariants.initialIn?.pageScale);
    if (initialScaleTiming) {
      document.documentElement.style.setProperty('--booklet-initial-page-scale-delay', `${initialScaleTiming.start}s`);
      document.documentElement.style.setProperty('--booklet-initial-page-scale-duration', `${initialScaleTiming.span}s`);
    }
    // Each homepage entrance clip carries its own Bg and DesktopPanel/Bg
    // m_Scale curve. Generate a keyframe block per variant instead of making
    // first-time/returning/resume reuse the normal opening geometry.
    const entranceScaleKeyframes = (id, name, points) => {
      if (!points?.length) return null;
      const start = Number(points[0].time);
      const span = Number(points[points.length - 1].time) - start || 1;
      const steps = points.map((point) => {
        const x = Number(String(point.value).match(/x:\s*([-\d.e]+)/)?.[1] ?? 1);
        const y = Number(String(point.value).match(/y:\s*([-\d.e]+)/)?.[1] ?? 1);
        return `${((Number(point.time) - start) / span * 100).toFixed(6)}% { scale: ${x} ${y}; }`;
      }).join(' ');
      let style = document.getElementById(id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes ${name} { ${steps} }`;
      return { start, duration: span };
    };
    const bookletSizeX = bookletBtnTiming?.sizeX;
    const bookletSizePoints = bookletBtnTiming?.sizeXValues || [];
    if (bookletSizeX?.keys?.length) {
      document.documentElement.style.setProperty('--booklet-btn-size-duration', `${bookletSizeX.duration}s`);
      document.documentElement.style.setProperty('--booklet-btn-size-delay', `${bookletSizeX.delay}s`);
    }
    bookletSizePoints.forEach((point, index) => {
      document.documentElement.style.setProperty(`--booklet-btn-size-${index}-at`, `${point.percent}%`);
      document.documentElement.style.setProperty(`--booklet-btn-size-${index}`, `${point.value}px`);
    });
    for (const [variant, value] of Object.entries(homeEntrance)) {
      const variantPrefix = variant.replace(/([A-Z])/g, '-$1').toLowerCase();
      for (const [part, sourceKey] of [['root', 'root'], ['screen', 'screen'], ['close', 'close'], ['page-info', 'pageInfo'], ['reward', 'reward'], ['desktop', 'desktop']]) {
        const timing = value[sourceKey];
        if (!timing) continue;
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-delay`, `${timing.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-duration`, `${timing.duration}s`);
      }
      for (const part of ['go-to-panel', 'new-mail-hint', 'new-mail-eff']) {
        const timing = value[part === 'go-to-panel' ? 'goToPanel' : part === 'new-mail-hint' ? 'newMailHint' : 'newMailEff'];
        if (!timing || !timing.keys?.length) continue;
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-delay`, `${timing.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-duration`, `${timing.duration}s`);
      }
      const bottomBar = value.bottomBar;
      if (bottomBar?.keys?.length) {
        document.documentElement.style.setProperty(`--${variantPrefix}-bottom-bar-delay`, `${bottomBar.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-bottom-bar-duration`, `${bottomBar.duration}s`);
      }
      if (value.backgroundAlpha?.keys?.length) {
        document.documentElement.style.setProperty(`--${variantPrefix}-background-alpha-delay`, `${value.backgroundAlpha.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-background-alpha-duration`, `${value.backgroundAlpha.duration}s`);
      }
      if (value.outsideContent?.keys?.length) {
        document.documentElement.style.setProperty(`--${variantPrefix}-outside-content-delay`, `${value.outsideContent.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-outside-content-duration`, `${value.outsideContent.duration}s`);
      }
      if (value.effOpen?.keys?.length) {
        document.documentElement.style.setProperty(`--${variantPrefix}-eff-open-delay`, `${value.effOpen.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-eff-open-rise-duration`, `${value.effOpen.duration}s`);
        const risePercent = value.effOpen.duration > 0
          ? (value.effOpen.activeTime - value.effOpen.delay) / value.effOpen.duration * 100
          : 100;
        document.documentElement.style.setProperty(`--${variantPrefix}-eff-open-rise-at`, `${risePercent}%`);
        document.documentElement.style.setProperty(`--${variantPrefix}-eff-open-off-delay`, `${value.effOpen.offDelay}s`);
      }
      if (value.bgRootEff?.keys?.length) {
        document.documentElement.style.setProperty(`--${variantPrefix}-bg-root-eff-delay`, `${value.bgRootEff.delay}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-bg-root-eff-duration`, `${value.bgRootEff.duration}s`);
        value.bgRootEff.keys.forEach((point, index) => {
          document.documentElement.style.setProperty(`--${variantPrefix}-bg-root-eff-${index}-at`, `${point.time}s`);
          document.documentElement.style.setProperty(`--${variantPrefix}-bg-root-eff-${index}`, String(point.value));
        });
      }
      for (const [part, curveName] of [['page-info-x', 'pageInfoX'], ['reward-x', 'rewardX']]) {
        const curve = value[curveName] || [];
        curve.forEach((point, index) => {
          const start = Number(curve[0]?.time ?? 0);
          const span = Number(curve[curve.length - 1]?.time ?? 0) - start || 1;
          const axis = Number(point.value) || 0;
          document.documentElement.style.setProperty(`--variant-${part}-${index}-at`, `${((Number(point.time) - start) / span * 100).toFixed(4)}%`);
          document.documentElement.style.setProperty(`--variant-${part}-${index}`, `${axis}px`);
        });
        if (curve.length) {
          document.documentElement.style.setProperty(`--${variantPrefix}-${part}-delay`, `${curve[0].time}s`);
          document.documentElement.style.setProperty(`--${variantPrefix}-${part}-duration`, `${Number(curve[curve.length - 1].time) - Number(curve[0].time)}s`);
        }
      }
      for (const [part, curveName, suffix] of [
        ['screen', 'screenScale', 'BgScale'],
        ['desktop-bg', 'desktopScale', 'DesktopBgScale'],
      ]) {
        const curve = value[curveName] || [];
        const camelName = variant.replace(/(^|-)(\w)/g, (_, __, letter) => letter.toUpperCase());
        const timing = entranceScaleKeyframes(
          `amph-home-entrance-${variantPrefix}-${part}-scale-keyframes`,
          `tarotHomeEntrance${camelName}${suffix}`,
          curve,
        );
        if (!timing) continue;
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-scale-delay`, `${timing.start}s`);
        document.documentElement.style.setProperty(`--${variantPrefix}-${part}-scale-duration`, `${Number(timing.duration.toFixed(6))}s`);
      }
    }
    const topBtnCurves = [
      ['booklet-top-btn-left-x', topBtnTiming?.leftXValues],
      ['booklet-top-btn-right-y', topBtnTiming?.rightYValues],
      ['booklet-close-tab-y', bookletVariants.out?.tabY],
      ['booklet-close-page-info-x', bookletVariants.out?.pageInfoX],
      ['booklet-direct-tab-y', bookletVariants.directIn?.tabY],
      ['booklet-direct-page-info-x', bookletVariants.directIn?.pageInfoX],
    ];
    for (const [prefix, curve] of topBtnCurves) {
      (curve || []).forEach((key) => {
        const label = key.percent === 0 ? 'start' : key.percent === 100 ? 'end' : 'mid';
        document.documentElement.style.setProperty(`--${prefix}-${label}`, `${key.value}px`);
        document.documentElement.style.setProperty(`--${prefix}-${label}-at`, `${key.percent}%`);
      });
    }
    for (const [variant, value] of [['initial', bookletVariants.initialIn], ['direct', bookletVariants.directIn], ['close', bookletVariants.out]]) {
      for (const [part, curve] of [['function-x', value?.functionX], ['function-width', value?.functionWidth]]) {
        (curve || []).forEach((key, index) => {
          document.documentElement.style.setProperty(`--booklet-${variant}-${part}-${index}-at`, `${key.percent}%`);
          document.documentElement.style.setProperty(`--booklet-${variant}-${part}-${index}`, `${key.value}px`);
        });
      }
    }
    for (const [prefix, curve] of [
      ['mail-hint-wave1-alpha', mailHintTiming.wave1Values],
      ['mail-hint-wave2-alpha', mailHintTiming.wave2Values],
      ['mail-hint-wave1-scale', mailHintTiming.wave1Scale],
      ['mail-hint-wave2-scale', mailHintTiming.wave2Scale],
    ]) {
      (curve || []).forEach((key, index) => {
        document.documentElement.style.setProperty(`--${prefix}-point-${index + 1}-at`, `${key.percent}%`);
        document.documentElement.style.setProperty(`--${prefix}-point-${index + 1}-value`, String(key.value));
      });
    }
    for (const [part, timing] of Object.entries({
      'bottom-hint-bg': bottomHintTiming.bg,
      'bottom-hint-text': bottomHintTiming.text,
      'bottom-hint-button': bottomHintTiming.button,
      'bottom-hint-multi-bg': bottomHintTiming.multiBg,
    })) {
      if (!timing?.keys?.length) continue;
      document.documentElement.style.setProperty(`--${part}-delay`, `${timing.delay}s`);
      const roundedDuration = Number(timing.duration.toFixed(6));
      document.documentElement.style.setProperty(`--${part}-duration`, `${roundedDuration}s`);
    }
    for (const [part, curve] of [
      ['bottom-hint-bg-scale', bottomHintTiming.bgScale],
      ['bottom-hint-multi-bg-scale', bottomHintTiming.multiBgScale],
    ]) {
      (curve || []).forEach((key, index) => {
        document.documentElement.style.setProperty(`--${part}-${index + 1}-at`, `${key.time}s`);
        document.documentElement.style.setProperty(`--${part}-${index + 1}`, String(key.value));
      });
    }
    if (waitingLoopTiming.duration) {
      document.documentElement.style.setProperty('--waiting-loop-duration', `${waitingLoopTiming.duration}s`);
      document.documentElement.style.setProperty('--waiting-ring-rotation', `${waitingLoopTiming.ringStart}deg`);
      document.documentElement.style.setProperty('--waiting-ring-rotation-end', `${waitingLoopTiming.ringEnd}deg`);
      document.documentElement.style.setProperty('--waiting-light-rotation', `${waitingLoopTiming.lightStart}deg`);
      document.documentElement.style.setProperty('--waiting-light-rotation-end', `${waitingLoopTiming.lightEnd}deg`);
    }
    if (signLongPress.duration) {
      const root = document.documentElement.style;
      root.setProperty('--sign-longpress-duration', `${signLongPress.duration}s`);
      root.setProperty('--sign-longpress-width-start', `${signLongPress.widthStart}px`);
      root.setProperty('--sign-longpress-width-end', `${signLongPress.widthEnd}px`);
      root.setProperty('--sign-longpress-alpha-start', String(signLongPress.alphaStart));
      root.setProperty('--sign-longpress-alpha-end', String(signLongPress.alphaEnd));
      (signLongPress.alpha || []).forEach((point, index) => {
        root.setProperty(`--sign-longpress-alpha-${index}-at`, `${(point.time / signLongPress.duration * 100).toFixed(4)}%`);
        root.setProperty(`--sign-longpress-alpha-${index}`, String(point.value));
      });
      (signLongPress.scriptPulse || []).forEach((point, index) => {
        root.setProperty(`--sign-longpress-pulse-${index}-at`, `${(point.time / signLongPress.duration * 100).toFixed(4)}%`);
        root.setProperty(`--sign-longpress-pulse-${index}`, String(point.value));
      });
    }
    for (const [flow, file] of [
      ['catalog', 'TarotBookBookletPage_FadeIn.anim'],
      ['direct', 'TarotBookBookletPage_FadeIn3.anim'],
      ['exit', 'TarotBookBookletPage_FadeOut.anim'],
    ]) {
      const point = pageFramePattern.left?.[file];
      if (!point) continue;
      document.documentElement.style.setProperty(`--page-pattern-${flow}-off`, `${point.time}s`);
      document.documentElement.style.setProperty(`--page-pattern-${flow}-alpha`, String(point.value));
    }
    for (const [state, values] of Object.entries(buttonStates)) {
      const root = document.documentElement.style;
      root.setProperty(`--button-state-${state.toLowerCase()}-rgb`, values.rgb);
      root.setProperty(`--button-state-${state.toLowerCase()}-alpha`, String(values.alpha));
      root.setProperty(`--button-state-${state.toLowerCase()}-active`, String(values.active));
      root.setProperty(`--button-state-${state.toLowerCase()}-duration`, `${values.duration}s`);
      (values.points || []).forEach((point, index) => {
        root.setProperty(`--button-state-${state.toLowerCase()}-point-${index}-at`, point.at);
        root.setProperty(`--button-state-${state.toLowerCase()}-point-${index}`, String(point.value));
      });
    }
    const mainBookEnabled = bookletVariants.directIn?.mainBookEnabled;
    if (mainBookEnabled?.keys?.length) {
      document.documentElement.style.setProperty('--booklet-direct-main-enabled-delay', `${mainBookEnabled.delay}s`);
      document.documentElement.style.setProperty('--booklet-direct-main-enabled-duration', `${mainBookEnabled.duration}s`);
    }
    const hintRotation = mailHintTiming.dotRotationValues || [];
    hintRotation.forEach((key, index) => {
      document.documentElement.style.setProperty(`--mail-hint-rotate-${index + 1}-at`, `${(key.time / 2.35 * 100).toFixed(4)}%`);
      document.documentElement.style.setProperty(`--mail-hint-rotate-${index + 1}`, `${key.value}deg`);
    });
    for (const [name, curve] of [['wave1', mailHintTiming.wave1Scale || []], ['wave2', mailHintTiming.wave2Scale || []]]) {
      if (curve.length < 2) continue;
      const t0 = Number(curve[0].time);
      const span = Number(curve[curve.length - 1].time) - t0 || 1;
      curve.forEach((point, index) => {
        document.documentElement.style.setProperty(`--mail-hint-${name}-scale-${index + 1}-at`, `${((Number(point.time) - t0) / span * 100).toFixed(4)}%`);
        document.documentElement.style.setProperty(`--mail-hint-${name}-scale-${index + 1}`, String(point.value));
      });
    }
    // Keep the previous title shorthand variables in sync with the source X curve.
    if (homeFadeCurves.pageInfoX?.length) {
      const curve = homeFadeCurves.pageInfoX;
      document.documentElement.style.setProperty('--source-title-delay', `${curve[0].time}s`);
      document.documentElement.style.setProperty('--source-title-duration', `${Number(curve[curve.length - 1].time) - Number(curve[0].time)}s`);
    }
    // Homepage title/reward keyframes come from the unpacked Unity curves.
    // Each curve carries its own start time and duration, so write both the
    // animation shorthand values and per-key CSS percentages/values.
    const homeKeyframeMap = {
      'home-screen': [homeFadeCurves.screenAlpha],
      'home-scale': [homeFadeCurves.screenScale],
      'home-title-x': [homeFadeCurves.pageInfoX],
      'home-title-alpha': [homeFadeCurves.pageInfoAlpha],
      'home-close-alpha': [homeFadeCurves.closeAlpha],
      'home-reward-x': [homeFadeCurves.rewardX],
      'home-reward-alpha': [homeFadeCurves.rewardAlpha],
    };
    for (const [prefix, curves] of Object.entries(homeKeyframeMap)) {
      curves.forEach((curve) => {
        if (!curve?.length) return;
        const start = Number(curve[0].time);
        const end = Number(curve[curve.length - 1].time);
        document.documentElement.style.setProperty(`--${prefix}-delay`, `${start}s`);
        document.documentElement.style.setProperty(`--${prefix}-duration`, `${end - start}s`);
        for (const key of curve) {
          const label = key.percent === 0 ? 'start' : key.percent === 100 ? 'end' : 'mid';
          document.documentElement.style.setProperty(`--${prefix}-${label}`, `${key.value}px`);
          document.documentElement.style.setProperty(`--${prefix}-${label}-at`, `${key.percent}%`);
        }
        const middle = curve.find((key) => key.percent > 0 && key.percent < 100);
        if (middle) {
          document.documentElement.style.setProperty(`--${prefix}-mid-value`, `${middle.value}px`);
          document.documentElement.style.setProperty(`--${prefix}-mid-at`, `${middle.percent}%`);
        }
        if (prefix === 'home-reward-alpha') {
          curve.slice(1, -1).forEach((key, index) => {
            document.documentElement.style.setProperty(`--${prefix}-point-${index + 1}-at`, `${key.percent}%`);
            document.documentElement.style.setProperty(`--${prefix}-point-${index + 1}-value`, String(key.value));
          });
        }
      });
    }
    if (homeFadeCurves.screenScale?.length) {
      const curve = homeFadeCurves.screenScale;
      const start = Number(curve[0].time);
      const end = Number(curve[curve.length - 1].time);
      document.documentElement.style.setProperty('--home-desktop-delay', `${start}s`);
      document.documentElement.style.setProperty('--home-desktop-duration', `${end - start}s`);
      for (const key of curve) {
        const label = key.percent === 0 ? 'start' : key.percent === 100 ? 'end' : 'mid';
        const scale = Number(String(key.value).match(/x:\s*([-\d.e]+)/)?.[1] ?? 1);
        document.documentElement.style.setProperty(`--home-scale-${label}`, String(scale));
      }
      curve.filter((key) => key.percent > 0 && key.percent < 100).forEach((key, index) => {
        const scale = Number(String(key.value).match(/x:\s*([-\d.e]+)/)?.[1] ?? 1);
        document.documentElement.style.setProperty(`--home-scale-mid-value${index + 1}`, String(scale));
        document.documentElement.style.setProperty(`--home-scale-mid-value${index + 1}-at`, `${key.percent}%`);
      });
    }
    if (catalogTiming) {
      for (const [key, value] of Object.entries(catalogTiming)) {
        if (!value || typeof value !== 'object' || !('delay' in value)) continue;
        document.documentElement.style.setProperty(`--catalog-${key}-delay`, `${value.delay}s`);
        document.documentElement.style.setProperty(`--catalog-${key}-duration`, `${value.duration}s`);
      }
      const pageInfoY = (catalogTiming.pageInfoValues || []).map((key) => Number(key.value) || 0);
      if (pageInfoY.length) {
        document.documentElement.style.setProperty('--catalog-pageInfo-y-start', `${pageInfoY[0]}px`);
        document.documentElement.style.setProperty('--catalog-pageInfo-y-end', `${pageInfoY[pageInfoY.length - 1]}px`);
      }
      const catalogAlpha = (catalogTiming.pageInfoAlpha?.keys || []).map((key) => Number(key.value) || 0);
      if (catalogAlpha.length) {
        document.documentElement.style.setProperty('--catalog-pageInfoAlpha-start', String(catalogAlpha[0]));
        document.documentElement.style.setProperty('--catalog-pageInfoAlpha-end', String(catalogAlpha[catalogAlpha.length - 1]));
      }
      const rootY = catalogTiming.rootYValues || [];
      rootY.forEach((key) => {
        const label = key.percent === 0 ? 'start' : key.percent === 100 ? 'end' : 'mid';
        document.documentElement.style.setProperty(`--catalog-root-y-${label}`, `${key.value}px`);
      });
      document.documentElement.style.setProperty('--catalog-root-y-mid-at', `${rootY[1]?.percent ?? 66.667}%`);
      const catalogHint = (catalogTiming.hintValues || []).map((key) => Number(key.value) || 0);
      if (catalogHint.length) {
        document.documentElement.style.setProperty('--catalog-hint-start', `${catalogHint[0]}px`);
        document.documentElement.style.setProperty('--catalog-hint-end', `${catalogHint[catalogHint.length - 1]}px`);
      }
      for (const [name, key] of [['leftTab', 'leftTab'], ['topTab', 'topTab']]) {
        const values = (catalogTiming[key]?.keys || []).map((point) => Number(point.value) || 0);
        if (!values.length) continue;
        document.documentElement.style.setProperty(`--catalog-${name}-start`, `${values[0]}px`);
        document.documentElement.style.setProperty(`--catalog-${name}-end`, `${values[values.length - 1]}px`);
      }
      const catalogPar = catalogTiming.parValues || [];
      if (catalogPar.length) {
        document.documentElement.style.setProperty('--catalog-par-start', String(catalogPar[0].value));
        document.documentElement.style.setProperty('--catalog-par-end', String(catalogPar[catalogPar.length - 1].value));
      }
      const catalogShine = catalogTiming.shineValues || [];
      if (catalogShine.length) {
        document.documentElement.style.setProperty('--catalog-shine-start', String(catalogShine[0].value));
        document.documentElement.style.setProperty('--catalog-shine-end', String(catalogShine[catalogShine.length - 1].value));
      }
    }
    // FadeOutAll carries per-layer alpha, offsets and scale keyframes that the
    // simplified exit-timing bridge does not expose. Emit source-backed CSS
    // variables and keyframes for every layer before the generic timing loop.
    const homeExitAllCurves = typeof tarotHomeExitAllCurves === 'function' ? tarotHomeExitAllCurves() : {};
    const exitScaleKeys = (id, name, points) => {
      if (!points?.length) return null;
      const start = Number(points[0].time);
      const end = Number(points[points.length - 1].time) || start + 1;
      const steps = points.map((point) => {
        const x = Number(String(point.value).match(/x:\s*([-\d.e]+)/)?.[1] ?? 1);
        const y = Number(String(point.value).match(/y:\s*([-\d.e]+)/)?.[1] ?? 1);
        return `${((Number(point.time) - start) / (end - start) * 100).toFixed(4)}% { scale: ${x} ${y}; }`;
      }).join(' ');
      let style = document.getElementById(id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        document.head.appendChild(style);
      }
      style.textContent = `@keyframes ${name} { ${steps} }`;
      return { start, duration: end - start };
    };
    const homeExitAllScales = [
      ['bg', 'tarotHomeExitAllBgScale', homeExitAllCurves.bgScale, 'amph-home-exit-all-bg-scale'],
      ['desktop-bg', 'tarotHomeExitAllDesktopBgScale', homeExitAllCurves.desktopBgScale, 'amph-home-exit-all-desktop-bg-scale'],
    ];
    for (const [part, name, points, id] of homeExitAllScales) {
      const timing = exitScaleKeys(id, name, points);
      if (!timing) continue;
      document.documentElement.style.setProperty(`--home-exit-all-${part}-scale-delay`, `${timing.start}s`);
      document.documentElement.style.setProperty(`--home-exit-all-${part}-scale-duration`, `${timing.duration}s`);
    }
    for (const [part, curve] of Object.entries(homeExitAllCurves)) {
      if (!Array.isArray(curve) || !curve.length) continue;
      const start = Number(curve[0].time);
      const end = Number(curve[curve.length - 1].time);
      const span = end - start || 1;
      document.documentElement.style.setProperty(`--home-exit-all-${part}-delay`, `${start}s`);
      document.documentElement.style.setProperty(`--home-exit-all-${part}-duration`, `${span}s`);
      curve.forEach((point, index) => {
        const value = Number(point.value) || 0;
        document.documentElement.style.setProperty(`--home-exit-all-${part}-${index}-at`, `${((Number(point.time) - start) / span * 100).toFixed(4)}%`);
        const unit = part.endsWith('X') ? 'px' : '';
        document.documentElement.style.setProperty(`--home-exit-all-${part}-${index}`, `${value}${unit}`);
      });
    }
    for (const [variant, value] of Object.entries(homeExitTimings)) {
      for (const [part, timing] of Object.entries(value)) {
        if (!timing || part === 'colors') continue;
        document.documentElement.style.setProperty(`--home-exit-${variant}-${part}-delay`, `${timing.delay}s`);
        document.documentElement.style.setProperty(`--home-exit-${variant}-${part}-duration`, `${timing.duration}s`);
        document.documentElement.style.setProperty(`--home-exit-${variant}-${part}-values`, timing.values.join(','));
        const first = timing.values?.[0];
        const last = timing.values?.[timing.values.length - 1];
        if (first !== undefined) document.documentElement.style.setProperty(`--home-exit-${variant}-${part}-start`, `${first}px`);
        if (last !== undefined) document.documentElement.style.setProperty(`--home-exit-${variant}-${part}-end`, `${last}px`);
      }
    }
    for (const [key, value] of Object.entries(exitTimings)) {
      for (const [part, timing] of Object.entries(value)) {
        if (!timing || part === 'colors') continue;
        document.documentElement.style.setProperty(`--${key}-exit-${part}-delay`, `${timing.delay}s`);
        document.documentElement.style.setProperty(`--${key}-exit-${part}-duration`, `${timing.duration}s`);
        document.documentElement.style.setProperty(`--${key}-exit-${part}-values`, timing.values.join(','));
        const first = timing.values?.[0];
        const last = timing.values?.[timing.values.length - 1];
        const unit = /^(root|topTabAlpha|pageInfoAlpha|leftTab|parAlpha|shineAlpha)$/.test(part) ? '' : 'px';
        if (first !== undefined) document.documentElement.style.setProperty(`--${key}-exit-${part}-start`, `${first}${unit}`);
        if (last !== undefined) document.documentElement.style.setProperty(`--${key}-exit-${part}-end`, `${last}${unit}`);
      }
    }
    if (coverTiming) {
      const selectCoverCurve = (key) => coverTiming[key] || {};
      for (const key of ['root', 'rootY', 'topTab', 'pageInfo', 'pageInfoAlpha', 'leftTab', 'leftTabAlpha', 'shortcutHint', 'parAlpha', 'shineAlpha']) {
        const value = selectCoverCurve(key);
        document.documentElement.style.setProperty(`--cover-fade-${key}-delay`, `${value.delay || 0}s`);
        document.documentElement.style.setProperty(`--cover-fade-${key}-duration`, `${value.duration || 0}s`);
      }
      const introY = coverTiming.pageInfoValues || [];
      if (introY.length) {
        document.documentElement.style.setProperty('--entry-title-start', `${introY[0].value}px`);
        document.documentElement.style.setProperty('--entry-title-end', `${introY[introY.length - 1].value}px`);
      }
      const hintY = coverTiming.shortcutValues || [];
      if (hintY.length) {
        document.documentElement.style.setProperty('--cover-hint-start', `${hintY[0].value}px`);
        document.documentElement.style.setProperty('--cover-hint-end', `${hintY[hintY.length - 1].value}px`);
      }
      const shine = coverTiming.shineValues || [];
      if (shine.length) {
        document.documentElement.style.setProperty('--cover-shine-start', String(shine[0].value));
        document.documentElement.style.setProperty('--cover-shine-end', String(shine[shine.length - 1].value));
      }
      for (const [name, key] of [['pageInfoAlpha', 'pageInfoAlpha'], ['leftTabAlpha', 'leftTabAlpha']]) {
        const values = (coverTiming[key]?.keys || []).map((point) => Number(point.value) || 0);
        if (!values.length) continue;
        document.documentElement.style.setProperty(`--cover-fade-${name}-start`, String(Number(values[0]) || 0));
        document.documentElement.style.setProperty(`--cover-fade-${name}-end`, String(Number(values[values.length - 1]) || 0));
      }
      const par = typeof tarotCurveValues === 'function'
        ? tarotCurveValues('TBBookletCoverPageContent_FadeIn.anim', 'Bg/EffPanel/Par', 'material._MainColor.a')
        : [];
      if (par.length) {
        document.documentElement.style.setProperty('--cover-par-start', String(par[0].value));
        document.documentElement.style.setProperty('--cover-par-end', String(par[par.length - 1].value));
      }
    }
    if (bookletTiming) {
      for (const [key, value] of Object.entries(bookletTiming)) {
        if (!value || !('delay' in value)) continue;
        document.documentElement.style.setProperty(`--booklet-${key}-delay`, `${value.delay}s`);
        document.documentElement.style.setProperty(`--booklet-${key}-duration`, `${value.duration}s`);
      }
      const rootYCurve = bookletTiming.rootY?.keys || [];
      if (rootYCurve.length) {
        document.documentElement.style.setProperty('--booklet-root-y-start', `${rootYCurve[0].value}px`);
        document.documentElement.style.setProperty('--booklet-root-y-end', `${rootYCurve[rootYCurve.length - 1].value}px`);
      }
      const scaleCurve = bookletTiming.pageScale?.keys || [];
      if (scaleCurve.length) {
        const scaleAt = (value) => Number(String(value).match(/x:\s*([-\d.e]+)/)?.[1] ?? 1);
        document.documentElement.style.setProperty('--booklet-page-scale-start', String(scaleAt(scaleCurve[0].value)));
        document.documentElement.style.setProperty('--booklet-page-scale-end', String(scaleAt(scaleCurve[scaleCurve.length - 1].value)));
      }
    }
    // Each official entrance clip shifts every FunctionList button and its
    // three icon effects. Emit per-variant variables so the same six DOM nodes
    // replay the right keys after cover opening, returning, and direct resume.
    const effStyle = (name) => {
      const styleCurve = (curve, prefix) => {
        const keys = curve?.keys || [];
        if (keys.length < 2) return [`--${prefix}-delay:${curve?.delay ?? 0}s`, `--${prefix}-duration:${curve?.duration ?? 0}s`];
        const t0 = Number(keys[0].time);
        const duration = Number(keys[keys.length - 1].time) - t0 || 1;
        const vars = [`--${prefix}-delay:${t0}s`, `--${prefix}-duration:${duration}s`];
        keys.forEach((key, index) => {
          vars.push(`--${prefix}-point-${index}-at:${((Number(key.time) - t0) / duration * 100).toFixed(4)}%`);
          vars.push(`--${prefix}-point-${index}-value:${Number(key.value) || 0}`);
        });
        return vars;
      };
      // The final `m_Color.a` point in the official Eff curve is often zero;
      // keep it as an explicit keyframe instead of collapsing to the hardcoded
      // 0% / 100% pair in `tarotButtonEff`.
      const curveStyle = (curve, prefix) => {
        const keys = curve?.keys || [];
        if (keys.length < 3) return styleCurve(curve, prefix);
        const t0 = Number(keys[0].time);
        const duration = Number(keys[keys.length - 1].time) - t0 || 1;
        const vars = [`--${prefix}-delay:${t0}s`, `--${prefix}-duration:${duration}s`];
        keys.forEach((key, index) => {
          vars.push(`--${prefix}-point-${index}-at:${((Number(key.time) - t0) / duration * 100).toFixed(4)}%`);
          vars.push(`--${prefix}-point-${index}-value:${Number(key.value) || 0}`);
        });
        return vars;
      };
      const vars = [];
      for (const [variant, sourceKey] of [['opening', 'opening'], ['first-time', 'firstTime'], ['returning', 'returning'], ['resume', 'resume']]) {
        const timing = homeEntranceButtons[sourceKey]?.[name] || {};
        vars.push(`--${variant}-reveal-delay:${timing.reveal?.delay ?? effTimings[name]?.delay ?? 0}s`);
        vars.push(`--${variant}-reveal-duration:${timing.reveal?.duration ?? effTimings[name]?.duration ?? 0}s`);
        vars.push(...curveStyle(timing.eff ?? effTimings[name] ?? {}, `${variant}-eff`));
        vars.push(...curveStyle(timing.bgHint ?? effTimings[name]?.bgHint ?? {}, `${variant}-eff-bg-hint`));
        vars.push(...curveStyle(timing.deco ?? effTimings[name]?.deco ?? {}, `${variant}-eff-deco`));
      }
      return vars.join(';');
    };
    // Each decorative loop is bound by its full unpacked clip name so multiple
    // loops on one official button never overwrite each other.
    const decorativeStyle = (name) => {
      if (name === 'BtnStar') {
        const loop = decorativeLoops.BtnStar?.find((entry) => entry.file.endsWith('Loop2.anim'));
        return loop ? `--deco-duration:${loop.duration}s` : '';
      }
      if (name === 'BtnMem') {
        const loop = decorativeLoops.BtnMem?.[0];
        const times = loop?.rotation?.times || [];
        const values = loop?.rotation?.values || [];
        if (!times.length || !values.length) return '';
        const duration = times[times.length - 1] - times[0] || 1;
        const vars = [`--deco-duration:${duration}s`];
        times.forEach((time, index) => {
          vars.push(`--deco-rotate-${index}-at:${((Number(time) - Number(times[0])) / duration * 100).toFixed(4)}%`);
          vars.push(`--deco-rotate-${index}:${values[index]}deg`);
        });
        return vars.join(';');
      }
      if (name === 'BtnPaper') {
        const loop = decorativeLoops.BtnPaper?.[0];
        const x = loop?.keys.find((curve) => curve.attribute === 'm_AnchoredPosition.x')?.values || [];
        const y = loop?.keys.find((curve) => curve.attribute === 'm_AnchoredPosition.y')?.values || [];
        const alpha = loop?.alpha || [];
        if (!x.length && !y.length && !alpha.length) return '';
        const vars = [`--deco-duration:${loop.duration}s`];
        const point = (keys, prefix) => {
          if (!keys.length) return;
          const start = Number(keys[0].time);
          const duration = Number(keys[keys.length - 1].time) - start || 1;
          keys.forEach((key, index) => {
            const at = ((Number(key.time) - start) / duration * 100).toFixed(4);
            vars.push(`--deco-${prefix}-${index}-at:${at}%`, `--deco-${prefix}-${index}:${key.value}`);
          });
        };
        point(x, 'x');
        point(y, 'y');
        point(alpha, 'alpha');
        // Child card flips and alternating alpha are separate official tracks;
        // expose them as independent CSS animations instead of one generic dot.
        (loop?.childRotations || []).forEach((child, index) => {
          const t0 = child.times[0] || 0;
          const span = child.times[child.times.length - 1] - t0 || 1;
          vars.push(`--deco-card-${index}-name:tarotDecoPaperFlip${index}`);
          vars.push(`--deco-card-${index}-duration:${span}s`);
          vars.push(`--deco-card-${index}-delay:${t0}s`);
        });
        (loop?.childAlphas || []).forEach((child, index) => {
          const t0 = child.values[0]?.time || 0;
          const span = (child.values[child.values.length - 1]?.time || t0) - t0 || 1;
          vars.push(`--deco-alpha-card-${index}-name:tarotDecoPaperAlphaCard${index}`);
          vars.push(`--deco-alpha-card-${index}-duration:${span}s`);
          vars.push(`--deco-alpha-card-${index}-delay:${t0}s`);
        });
        return vars.join(';');
      }
      if (name === 'BtnMail') {
        const scaleLoop = decorativeLoops.BtnMail?.find((entry) => entry.file.endsWith('Loop5.anim'));
        const driftLoop = decorativeLoops.BtnMail?.find((entry) => entry.file.endsWith('Loop6.anim'));
        const sx = scaleLoop?.scale?.valuesX || [];
        const st = scaleLoop?.scale?.times || [];
        const y = driftLoop?.keys.find((curve) => curve.attribute === 'm_AnchoredPosition.y')?.values || [];
        const yt = y.map((key) => key.time);
        const vars = [];
        if (sx.length) {
          vars.push(`--deco-scale-duration:${st[st.length - 1] - st[0]}s`);
          const scaleDuration = st[st.length - 1] - st[0] || 1;
          sx.forEach((value, index) => {
            vars.push(`--deco-scale-${index}:${value}`);
            vars.push(`--deco-scale-${index}-at:${((st[index] - st[0]) / scaleDuration * 100).toFixed(4)}%`);
          });
        }
        if (y.length) {
          const driftDuration = yt[yt.length - 1] - yt[0] || 1;
          vars.push(`--deco-drift-duration:${driftDuration}s`);
          y.forEach((key, index) => {
            vars.push(`--deco-drift-${index}:${key.value}px`);
            vars.push(`--deco-drift-${index}-at:${((yt[index] - yt[0]) / driftDuration * 100).toFixed(4)}%`);
          });
        }
        return vars.join(';');
      }
      return '';
    };
    const officialNav = sourceButtons.map((item) => {
      const error = errorTiming.buttons?.[item.name];
      const firstKey = (keys) => Number(keys?.[0]?.time ?? 0);
      const lastKey = (keys) => Number(keys?.[keys.length - 1]?.time ?? 0);
      const channel = (keys, index) => Number(keys?.[index]?.value ?? 1);
      return {
        ...item,
        ...labels[item.name],
        errorDelay: error?.error?.delay ?? 0,
        errorDuration: error?.error?.duration ? Number(error.error.duration.toFixed(6)) : .05,
        errorActiveDelay: firstKey(error?.errorActive?.keys),
        errorActiveDuration: lastKey(error?.errorActive?.keys) - firstKey(error?.errorActive?.keys),
        errorIconDelay: firstKey(error?.errorIconActive?.keys),
        errorIconDuration: lastKey(error?.errorIconActive?.keys) - firstKey(error?.errorIconActive?.keys),
        glitchStart: channel(error?.glitchW, 0),
        glitchEnd: channel(error?.glitchW, error?.glitchW?.length - 1),
        frameRgb: [channel(error?.frameR, 0), channel(error?.frameG, 0), channel(error?.frameB, 0)].join(' '),
        frameAlphaStart: channel(error?.frameAlpha?.keys, 0),
        frameAlphaMid: channel(error?.frameAlpha?.keys, 1),
        frameAlphaEnd: channel(error?.frameAlpha?.keys, error?.frameAlpha?.keys?.length - 1),
        frameAlphaDelay: firstKey(error?.frameAlpha?.keys),
        frameAlphaDuration: lastKey(error?.frameAlpha?.keys) - firstKey(error?.frameAlpha?.keys),
        frameAlphaMidAt: ((Number(error?.frameAlpha?.keys?.[1]?.time ?? 0) - firstKey(error?.frameAlpha?.keys)) / (lastKey(error?.frameAlpha?.keys) - firstKey(error?.frameAlpha?.keys) || 1) * 100).toFixed(4),
        errorScanEnd: error?.scanlineW?.[error.scanlineW.length - 1]?.value ?? .54,
      };
    }).filter((item) => item.zh);
    const paperCards = decorativeLoops.BtnPaper?.[0]?.childRotations?.length || 0;
    nav.innerHTML = officialNav.map((item) => `
      <button type="button" class="home-archive ${item.name}" data-arc="${item.arc}"
              style="--reveal-delay:${item.delay}s;--reveal-duration:${item.duration}s;--source-x:${item.x};--source-y:${item.y};--error-delay:${item.errorDelay}s;--error-duration:${item.errorDuration}s;--error-active-delay:${item.errorActiveDelay}s;--error-active-duration:${item.errorActiveDuration}s;--error-icon-delay:${item.errorIconDelay}s;--error-icon-duration:${item.errorIconDuration}s;--error-glitch-start:${item.glitchStart};--error-glitch-end:${item.glitchEnd};--error-frame-rgb:${item.frameRgb};--error-frame-alpha-start:${item.frameAlphaStart};--error-frame-alpha-mid:${item.frameAlphaMid};--error-frame-alpha-end:${item.frameAlphaEnd};--error-frame-alpha-delay:${item.frameAlphaDelay}s;--error-frame-alpha-duration:${item.frameAlphaDuration}s;--error-frame-alpha-mid-at:${item.frameAlphaMidAt}%;--error-scan-end:${item.errorScanEnd};--icon-anchor-x:${(() => { const c = sourceIcons[item.name]?.['m_AnchoredPosition.x']; return (c?.values?.[0] ?? 0); })()}px;--icon-anchor-y:${(() => { const c = sourceIcons[item.name]?.['m_AnchoredPosition.y']; return (c?.values?.[0] ?? 0); })()}px;--icon-drift:${(() => { const c = sourceIcons[item.name]?.['m_AnchoredPosition.y']; const v = c?.values ?? []; return (v[1] ?? v[0] ?? 0) - (v[0] ?? 0); })()}px;--icon-duration:${sourceIcons[item.name]?.['m_AnchoredPosition.y']?.duration ?? 3.266667}s;--icon-drift-x:${(() => { const c = sourceIcons[item.name]?.['m_AnchoredPosition.x']; const v = c?.values ?? []; return (v[1] ?? v[0] ?? 0) - (v[0] ?? 0); })()}px;--icon-scale-peak:${sourceIcons[item.name]?.['m_AnchoredPosition.y']?.timePeak ?? 1.45}s;--icon-rotate-start:${sourceIcons[item.name]?.rotation?.values?.[0] ?? 0}deg;--icon-rotate-peak:${sourceIcons[item.name]?.rotation?.values?.[1] ?? 0}deg;--icon-scale-x-start:${sourceIcons[item.name]?.scale?.valuesX?.[0] ?? 1};--icon-scale-x-peak:${sourceIcons[item.name]?.scale?.valuesX?.[1] ?? 1};--icon-scale-y-start:${sourceIcons[item.name]?.scale?.valuesY?.[0] ?? 1};--icon-scale-y-peak:${sourceIcons[item.name]?.scale?.valuesY?.[1] ?? 1};--icon-rotate-end:${sourceIcons[item.name]?.rotation?.values?.[2] ?? sourceIcons[item.name]?.rotation?.values?.[0] ?? 0}deg;--icon-scale-x-end:${sourceIcons[item.name]?.scale?.valuesX?.[2] ?? sourceIcons[item.name]?.scale?.valuesX?.[0] ?? 1};--icon-scale-y-end:${sourceIcons[item.name]?.scale?.valuesY?.[2] ?? sourceIcons[item.name]?.scale?.valuesY?.[0] ?? 1};${effStyle(item.name)};${decorativeStyle(item.name)}${buttonVectors[item.name] ? `;--source-glyph-path:${buttonVectors[item.name]}` : ''}">
        <span class="home-archive-icon"><span class="home-glyph"><i></i><b></b><em class="home-glyph-deco"></em><span class="home-glyph-com-deco1" aria-hidden="true"></span><span class="home-glyph-com-deco2" aria-hidden="true"></span>${item.name === 'BtnMail' ? '<span class="home-glyph-mail-sprite" aria-hidden="true"></span>' : ''}${item.name === 'BtnPaper' ? Array.from({ length: paperCards }, (_, index) => `<span class="home-deco-card" data-card="${index}"></span>`).join('') : ''}</span><span class="home-glyph-eff" aria-hidden="true"></span></span>
        <span class="home-archive-error" aria-hidden="true"></span>
        <span class="home-archive-state" aria-hidden="true"></span>
        <span class="home-archive-copy"><strong>${item.zh}</strong><small>${item.en}</small></span>
      </button>`).join('');
    nav.querySelectorAll('[data-arc]').forEach((b) => b.addEventListener('click', () => openArchive(b.dataset.arc)));
  }
  $$('.arc').forEach((b) => b.addEventListener('click', () => openArchive(b.dataset.arc)));
  $('#foot-left').textContent = '如我所书';
  $('#foot-right').textContent = `第 ${S.archive.cycle} 次演算 · 火种 ${S.archive.sparks}/12`;
  const bottomCount = $('#home-bottom-bar-count');
  if (bottomCount) bottomCount.textContent = `第 ${S.archive.cycle} 次演算`;
  const cyc = $('#home-cycle');
  if (cyc) cyc.textContent = `第 ${S.archive.cycle} 次演算 · 火种 ${S.archive.sparks}/12`;
  const coverScion = S.archive.catalog?.[0]?.scion || 'mydeimos';
  for (const id of ['#floating-card-portrait', '#open-card-portrait']) {
    const host = $(id);
    if (host) host.innerHTML = writingCardPortrait(coverScion);
  }
}

/* 游戏内入口书封：点击后展开为六件档案。 */
function openCoverBook(event) {
  // Left-top HUD re-opens the book. From home it exits with FadeOutAll;
  // from a sub-archive it restores the clean cover instead of carrying stale
  // homepage entrance state onto the hidden section.
  if (S.view === 'home') return showHomeWithExit();
  if (S.view !== 'cover') {
    openBookHome();
    return;
  }
  // The floating book cover starts the local expand/choose/confirm flow; only
  // the left-top HUD button opens the six-archive homepage directly.
  if (!event || event.currentTarget?.closest?.('.entry-hud')) {
    withCoverExit(() => {
      applyHomeEntranceVariant('first-time');
      show('home');
    });
    return;
  }
  const opened = $('#cover-open');
  const floating = $('#floating-card');
  opened?.classList.remove('hidden', 'chosen', 'opening');
  opened?.classList.add('choosing');
  floating?.classList.remove('hidden', 'taken');
  const hint = $('.cover-hint');
  if (hint) hint.textContent = '选择命路卡片';
  const menu = $('#entry-menu');
  if (menu) menu.classList.add('hidden');
  const expand = $('#entry-expand');
  if (expand) expand.setAttribute('aria-expanded', 'false');
}

function chooseCoverCard() {
  $('#cover-open').classList.remove('choosing');
  $('#cover-open').classList.add('chosen');
  $('#floating-card').classList.add('taken');
  const confirm = $('#open-confirm');
  if (confirm) confirm.classList.add('ready');
  $('.cover-hint').textContent = '在空白的书页上，写下逐火者的命运';
}

function openCoverPages() {
  const open = $('#cover-open');
  if (!open.classList.contains('chosen')) return;
  open.classList.add('opening');
  // The cover exit duration comes from TBBookletCoverPageContent_FadeOut.anim.
  const root = window.__amphoreusExitTimings?.cover?.root;
  const ms = Math.max(50, Math.round((Number(root?.duration) || 0.25) * 1000));
  setTimeout(() => {
    applyHomeEntranceVariant('resume');
    show('home');
  }, ms);
}

function openArchive(id) {
  if (S.view === 'cover') return withCoverExit(() => openArchiveTarget(id));
  return openArchiveTarget(id);
}

function withCoverExit(next) {
  const cover = $('#view-cover');
  if (!cover || cover.classList.contains('hidden')) return next();
  const timing = window.__amphoreusExitTimings?.cover?.root;
  const ms = Math.max(50, Math.round((Number(timing?.duration) || 0.25) * 1000));
  cover.classList.add('exiting');
  setTimeout(() => {
    cover.classList.remove('exiting');
    next();
  }, ms);
}

function openArchiveTarget(id) {
  if (id === 'hero') return openCatalog();
  if (id === 'path') return openPath();
  if (id === 'warden') return openWarden();
  if (id === 'me13') return openMe13();
  if (id === 'mimi') return openMimi();
  if (id === 'mail') return openMail();
  // 未登记的档案 ID 不应把用户留在空白首页，统一回退到书脊。
  return show('home');
}

function openBookHome() {
  const catalog = $('#view-catalog');
  if (catalog && !catalog.classList.contains('hidden')) {
    const timing = window.__amphoreusExitTimings?.catalog?.root;
    const ms = Math.max(50, Math.round((Number(timing?.duration) || 0.25) * 1000));
    catalog.classList.add('exiting');
    setTimeout(() => {
      catalog.classList.remove('exiting');
      showOpeningCover();
    }, ms);
    return;
  }
  showOpeningCover();
}

function showOpeningCover() {
  const cover = $('#book-cover');
  const opening = $('#cover-open');
  $('#view-cover')?.classList.remove('exiting');
  if (cover) cover.classList.remove('hidden');
  if (opening) opening.classList.remove('hidden', 'choosing', 'chosen', 'opening');
  $('#floating-card')?.classList.remove('hidden', 'taken');
  $('.cover-menu')?.classList.add('hidden');
  const hint = $('.cover-hint');
  if (hint) hint.textContent = '点击书封展开，或选择档案';
  applyHomeEntranceVariant('opening');
  show('cover');
}

/* ---------------- 目录 ---------------- */
function openCatalog() {
  const cat = S.archive.catalog;
  $('#cat-meta').textContent = cat.length + ' 卷 · 每卷五节 · 已录 ' +
    cat.reduce((n, v) => n + v.written, 0) + '/' + (cat.length * 5);
  $('#catalog').innerHTML = cat.map((v) => {
    // 未写的卷照样能翻。书是给人读的，空卷比锁卷诚实。
    const dots = [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= v.written ? 'on' : '') + '"></i>').join('');
    const oldParts = v.old.split(' ');
    const newParts = v.new.split(' ');
    return '<article class="hero-card' + (v.written ? '' : ' blank') +
      '" data-ch="' + v.chapter + '" tabindex="0" role="button">' +
      '<div class="hero-art"><span class="catalog-item-mask" aria-hidden="true"></span>' + heroArtSvg(v.scion) + '</div>' +
      '<div class="hero-copy">' +
        '<span class="catalog-card-source-page" aria-hidden="true"></span>' +
        '<span class="catalog-card-source-left" aria-hidden="true"></span>' +
        '<span class="catalog-card-source-right" aria-hidden="true"></span>' +
        '<span class="catalog-card-source-status" aria-hidden="true"></span>' +
        '<span class="no">' + String(v.chapter).padStart(2, '0') + '</span>' +
        '<h3>' + (oldParts[0] || '') + '</h3>' +
        '<h4>' + (newParts[0] || '') + '</h4>' +
        '<div class="spark">' + v.spark + '</div>' +
        '<div class="bar">' + dots + '</div>' +
      '</div>' +
    '</article>';
  }).join('');

  $$('#catalog .hero-card').forEach((c) => {
    const open = () => openVolume(Number(c.dataset.ch));
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  // 「命路」不是第二款档案：官方反复称目录为「逐火者的命录·英雄纪」。
  // 因此保留同一页标题，只把十三卷的卷名/诗行切换成命路视图。
  $('#catalog-paths').innerHTML = cat.map((v) => {
    const poem = (v.verse || []).join('\n');
    return '<article class="hero-card path-card" data-ch="' + v.chapter + '" data-chapter="' + String(v.chapter).padStart(2, '0') + '" tabindex="0" role="button">' +
      '<div class="hero-art"><span class="catalog-item-mask" aria-hidden="true"></span>' + pathCardSvg(v.scion) + '</div>' +
      '<div class="hero-copy">' +
        '<span class="no">' + String(v.chapter).padStart(2, '0') + '</span>' +
        '<h3>' + v.new + '</h3>' +
        '<div class="poem">' + poem + '</div>' +
      '</div>' +
    '</article>';
  }).join('');
  applyChapterSprites($$('#catalog-paths .hero-card'));
  $$('#catalog-paths .hero-card').forEach((c) => {
    const open = () => openVolume(Number(c.dataset.ch));
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  $$('.catalog-view').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === 'heroes');
  });
  $('#catalog').classList.remove('hidden');
  $('#catalog-paths').classList.add('hidden');
  show('catalog');
}

function showCatalogView(view) {
  const heroes = view === 'heroes';
  $('#catalog').classList.toggle('hidden', !heroes);
  $('#catalog-paths').classList.toggle('hidden', heroes);
  $$('.catalog-view').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

/* ---------------- 单卷 ---------------- */
async function openVolume(chapter, direct = false) {
  const { volume: v } = await get(`/api/archive/volume?chapter=${chapter}`);
  const cat = S.archive.catalog.find((x) => x.chapter === chapter) || {};
  S.chapter = chapter;
  $('#view-volume')?.classList.toggle('direct-volume', direct);

  const volName = `${v.new.split(' ')[0]}${v.new.split(' ')[1] || ''}`;
  $('#vol-title').textContent = `${v.chapter}-1`;
  const outerTitle = document.querySelector('.volume-head h1');
  if (outerTitle) outerTitle.textContent = volName;
  $('#vol-meta').textContent = '';

  const lines = v.verse || [];
  $('#verse').innerHTML = lines.map((l, i) => {
    const isLast = i === lines.length - 1;
    return `<span class="${isLast ? 'last' : ''}">${l}</span>`;
  }).join('\n');

  $('#epigraph').innerHTML = `
    <span class="k">神谕</span>
    ${v.prophecy || '—'}`;

  const hero = document.querySelector('#view-volume .hero-art');
  if (hero) {
    hero.innerHTML = heroArtSvg(cat.scion || '');
  }

  $('#sections').innerHTML = v.sections.map((s) => `
    <article class="sec ${s.written ? '' : 'unwritten'}">
      <span class="sec-title-deco" aria-hidden="true"></span>
      <div class="sec-head">
        <span class="rom">${s.roman}</span>
        <h3>${s.zh}</h3>
        <span class="when">${s.written ? (s.origin === 'template' ? '著录' : '亲笔') + ' · ' + s.when : '尚未写下'}</span>
      </div>
      <p>${s.written ? s.body : '这一节还没写到。世界还在往前走。'}</p>
    </article>`).join('');
  S.page = 0;
  const pageSections = $$('#sections .sec');
  const tabs = $('#volume-tabs');
  const refreshTiming = window.__amphoreusBookletRefreshTiming || {};
  const showPage = (animate = false) => {
    const stage = $('#view-volume .volume-stage');
    if (animate && stage && refreshTiming.in) {
      stage.classList.remove('booklet-refresh');
      // Restart CSS animation on every page switch.
      void stage.offsetWidth;
      stage.classList.add('booklet-refresh');
    }
    pageSections.forEach((sec, i) => sec.classList.toggle('hidden', i !== S.page));
    $('#vol-page').textContent = `${S.page + 1} / ${pageSections.length}`;
    $$('.volume-tab', tabs || document).forEach((tab, i) => {
      tab.classList.toggle('active', i === S.page);
    });
  };
  if (tabs) {
    tabs.innerHTML = v.sections.map((s, i) => `
      <button type="button" class="volume-tab" data-page="${i}" aria-label="第 ${i + 1} 节 ${s.zh}">
        <i>${s.roman}</i><span>${s.written ? '✓' : ''}</span>
      </button>`).join('');
    $$('.volume-tab', tabs).forEach((tab) => {
      tab.addEventListener('click', () => {
        S.page = Number(tab.dataset.page);
        $('#vol-prev').disabled = S.page === 0;
        $('#vol-next').disabled = S.page === pageSections.length - 1;
        showPage(true);
      });
    });
  }
  $('#vol-prev').disabled = true;
  $('#vol-next').disabled = false;
  $('#vol-prev').onclick = () => {
    S.page = Math.max(0, S.page - 1);
    $('#vol-next').disabled = false;
    $('#vol-prev').disabled = S.page === 0;
    showPage(true);
  };
  $('#vol-next').onclick = () => {
    S.page = Math.min(pageSections.length - 1, S.page + 1);
    $('#vol-prev').disabled = false;
    $('#vol-next').disabled = S.page === pageSections.length - 1;
    showPage(true);
  };
  const floatingNext = $('#vol-next-floating');
  if (floatingNext) floatingNext.onclick = () => $('#vol-next').click();
  showPage();

  show('volume');
}

/* ---------------- 逐火者的命路 ---------------- */
function openPath() {
  const chapters = S.archive.catalog.slice();
  // 官方实拍外圈按 12 枚独立命路徽章展示；昔涟另有中心卡，不占外圈。
  // CATALOG_ORDER 仍保持目录顺序，这里只覆盖命路星图的展示顺序。
  // 外圈按官方实拍顺序用满 1–12；第 13 卷仅作盘心卡，避免重复昔涟。
  const pathOrder = [7, 9, 11, 12, 3, 10, 5, 1, 8, 2, 6, 4];
  const byChapter = new Map(chapters.map((v) => [v.chapter, v]));
  const ordered = pathOrder.map((ch) => byChapter.get(ch)).filter(Boolean);
  // 官方实拍是外圈十二枚命路徽章与中心昔涟，不是十三枚等距排布。
  // 保留十三卷的可点击数据，但把第十三卷放到盘心，外圈仍由前十二卷组成。
  const outer = ordered.slice(0, 12);
  const center = byChapter.get(13) || ordered[ordered.length - 1];
  const starFallback = { delay: 1.683333, duration: 1.816667 };
  const storyTimings = window.__amphoreusStoryPanelTimings || [];
  const storyTiming = (index) => storyTimings[index] || storyTimings[0] || starFallback;
  const chapterKey = (chapter) => {
    const value = Number(chapter) || 0;
    return value === 1 ? '1' : value >= 10 ? String(value) : String(value).padStart(2, '0');
  };
  const card = (v, i, extra = '') => {
    // 官方顶部正上方也有一枚徽章，十二枚从 -90° 起顺时针均分。
    const angle = -90 + i * 360 / 12;
    const timing = storyTiming(i);
    return `<article class="path-card${extra}" data-scion="${v.scion}" data-name="${v.new}" data-chapter="${chapterKey(v.chapter)}" tabindex="0" role="button" style="--angle:${angle}deg;--path-index:${i};--story-delay:${timing.delay}s;--story-duration:${timing.duration}s">
        <i class="path-progress" aria-hidden="true"></i>
        <span class="path-card-shadow" aria-hidden="true"></span>
        <span class="path-card-mask" aria-hidden="true"></span>
        <span class="path-card-back" aria-hidden="true"></span>
        <span class="path-card-outline" aria-hidden="true"></span>
        <span class="path-card-source-frame" aria-hidden="true"></span>
        <span class="path-card-source-center" aria-hidden="true"></span>
        <span class="path-card-source-icon" aria-hidden="true"></span>
        <span class="path-card-source-diamond" aria-hidden="true"></span>
        <div class="path-art">${pathCardSvg(v.scion)}</div>
        <div class="path-copy">
          <h3>${v.new}</h3>
          <div class="old">${v.old !== v.new ? v.old : '&nbsp;'}</div>
          <div class="poem">${(v.verse || []).join('\n')}</div>
        </div>
      </article>`;
  };
  $('#paths').innerHTML = outer.map((v, i) => card(v, i)).join('') +
    (center ? card(center, 0, ' center') : '');
  applyChapterSprites($$('#paths .path-card'));

  $$('#paths .path-card').forEach((card) => {
    const open = () => {
      $('#lightbox-art').innerHTML = pathCardSvg(card.dataset.scion);
      $('#lightbox-caption').textContent = card.dataset.name;
      const v = S.archive.catalog.find((x) => x.scion === card.dataset.scion) || {};
      const meta = $('#lightbox-meta');
      if (meta) meta.textContent = `命途点亮：${Math.max(1, Number(v.chapter) || 1)}`;
      const poem = $('#lightbox-poem');
      if (poem) poem.textContent = (v.verse || []).join('\n');
      $('#path-lightbox').classList.remove('hidden');
      $('#path-lightbox').setAttribute('aria-hidden', 'false');
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  $('#lightbox-close').onclick = closeLightbox;
  $('#path-lightbox').onclick = (e) => {
    if (e.target.id === 'path-lightbox') closeLightbox();
  };
  const disc = $('.starmap-disc');
  const zoomTrack = $('.zoom-thumb');
  let zoom = 1;
  const applyZoom = () => {
    if (!disc) return;
    const discSize = disc.getBoundingClientRect().width || Math.min(620, window.innerHeight * 0.78);
    // 官方十二枚徽章中心半径约 294px；620px 盘面取 0.475，与实拍顶部 y≈96 对齐。
    const radius = discSize * 0.475 * zoom;
    disc.style.transform = `translate(-50%, -50%) scale(${zoom})`;
    $$('#paths .path-card').forEach((card, i) => {
      if (card.classList.contains('center')) {
        card.style.transform = 'translate(0, 0)';
        return;
      }
      const angle = -90 + i * 360 / 12;
      card.style.transform = `rotate(${angle}deg) translateY(${-radius}px) rotate(${-angle}deg)`;
    });
    if (zoomTrack) zoomTrack.style.left = `${50 + (zoom - 1) * 100}%`;
  };
  $('#starmap-zoom-in')?.addEventListener('click', () => { zoom = Math.min(1.4, zoom + 0.1); applyZoom(); });
  $('#starmap-zoom-out')?.addEventListener('click', () => { zoom = Math.max(0.6, zoom - 0.1); applyZoom(); });
  window.addEventListener('resize', applyZoom);
  applyZoom();
  show('path');
}

function closeLightbox() {
  const box = $('#path-lightbox');
  if (!box) return;
  box.classList.add('hidden');
  box.setAttribute('aria-hidden', 'true');
  const art = document.querySelector('#lightbox-art');
  if (art) art.innerHTML = '';
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
    const row = ['active1', 'left1', 'right1', 'active2', 'left2', 'right2', 'active3', 'left3', 'right3', 'active4'][i % 10];
    return '<div class="stage ' + cls + '" data-timeline-row="' + row + '" style="--timeline-row-scale-start:var(--timeline-' + row + '-scale-start, 1);--timeline-row-delay:var(--timeline-' + row + '-delay, 0s);--timeline-row-duration:var(--timeline-' + row + '-duration, .05s)">' +
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
  $('#mimi').innerHTML = `
    <div class="mimi-panel" aria-hidden="true">
      <span class="mimi-panel-source-bg"></span>
      <span class="mimi-talk-source-deco"></span>
      <span class="mimi-panel-outline"></span><span class="mimi-panel-bg-deco"></span>
      <span class="mimi-panel-arrow"></span><span class="mimi-panel-hint-arrow"></span>
      <span class="mimi-book-deco d1"></span><span class="mimi-book-deco d2"></span><span class="mimi-book-deco d3"></span><span class="mimi-book-deco d5"></span>
      <span class="mimi-book-deco d41"></span><span class="mimi-book-deco d42"></span><span class="mimi-book-deco d43"></span>
    </div>
    <div class="mimi-grid">${
      S.warden.mimi.map((t) => `<span><i class="mimi-choose-bg" aria-hidden="true"></i><i class="mimi-choose-deco" aria-hidden="true"></i><i class="mimi-choose-icon" aria-hidden="true"></i>${t}</span>`).join('')
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
  // Both static entry scenes are visible before the API resolves. Rendering
  // the home scene must not leave it underneath the cover view.
  $('#view-home')?.classList.add('hidden');
  renderHome();

  $$('.back').forEach((b) => b.addEventListener('click', () => {
    const to = b.dataset.go;
    if (to === 'catalog' && S.view === 'volume') { closeLightbox(); }
    if (to === 'home') openBookHome();
    else if (to === 'catalog') show('catalog');
  }));
  $$('.volume-return [data-go]').forEach((b) => b.addEventListener('click', () => {
    if (S.view === 'volume') { closeLightbox(); show('catalog'); }
  }));
  $$('.path-detail-return').forEach((b) => b.addEventListener('click', () => {
    if (S.view === 'path') closeLightbox();
  }));

  $$('#archive-tabs button').forEach((b) => b.addEventListener('click', () => {
    openArchive(b.dataset.arc);
  }));

  const entryBook = $('#entry-book');
  if (entryBook) entryBook.addEventListener('click', openCoverBook);
  const entryTitle = $('.entry-title');
  if (entryTitle) entryTitle.addEventListener('click', openCoverBook);
  const entryExpand = $('#entry-expand');
  if (entryExpand) entryExpand.addEventListener('click', () => {
    const menu = $('#entry-menu');
    if (!menu) return;
    const opening = menu.classList.toggle('hidden');
    entryExpand.setAttribute('aria-expanded', String(!opening));
  });
  const cover = $('#book-cover');
  if (cover) cover.addEventListener('click', openCoverBook);
  const opened = $('#cover-open');
  if (opened) opened.addEventListener('click', openCoverPages);
  const card = $('#floating-card');
  if (card) card.addEventListener('click', chooseCoverCard);
  const confirm = $('#open-confirm');
  if (confirm) confirm.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCoverPages();
  });
  $$('[data-open-archive]').forEach((b) => b.addEventListener('click', () => {
    openArchive(b.dataset.openArchive);
  }));

  $$('.catalog-view').forEach((b) => b.addEventListener('click', () => showCatalogView(b.dataset.view)));
  // The official long-press animation is driven by a real press-and-hold,
  // not a screenshot or a decorative always-on layer.
  const signLayer = document.getElementById('sign-longpress');
  let signTimer = null;
  const clearSign = () => {
    if (signTimer) clearTimeout(signTimer);
    signTimer = null;
    signLayer?.classList.remove('active');
  };
  if (signLayer && signLongPress.duration) {
    window.addEventListener('pointerdown', () => {
      clearSign();
      signTimer = setTimeout(() => signLayer.classList.add('active'), 160);
    });
    window.addEventListener('pointerup', clearSign);
    window.addEventListener('pointercancel', clearSign);
    window.addEventListener('blur', clearSign);
  }


  // 单个视图出错不该把整本书清空。这里逐个兜住，坏的那页只坏它自己。
  const h = location.hash.replace('#', '');
  const routes = {
    cover: () => show('cover'),
    home: () => show('home'),
    catalog: openCatalog,
    volume: () => openVolume(S.chapter || 1, true),
    path: openPath,
    warden: openWarden,
    me13: openMe13,
    mimi: openMimi,
    mail: openMail,
  };
  try {
    if (h.startsWith('vol')) await openVolume(Number(h.slice(3)) || 1, true);
    else (routes[h] || routes.cover)();
  } catch (e) {
    console.error(e);
    const sec = document.querySelector('#view-' + (h.startsWith('vol') ? 'volume' : h));
    if (sec) {
      const box = document.createElement('div');
      box.className = 'source-error source-error-inline';
      box.setAttribute('role', 'alert');
      box.innerHTML = `
        <div class="source-error-dialog-bg" aria-hidden="true"></div>
        <div class="source-error-scanline" aria-hidden="true"></div>
        <div class="source-error-panel">
          <span class="source-error-hint-bg" aria-hidden="true"></span>
          <span class="source-error-glyph" aria-hidden="true"></span>
          <span class="source-error-hint-icon" aria-hidden="true"></span>
          <p class="source-error-title">这一页没能打开：${e.message}</p>
        </div>`;
      sec.appendChild(box);
      show(sec.id.replace('view-', ''));
    }
  }
}

boot().catch((e) => {
  window.__amphoreusBootError = e?.stack || String(e);
  showSourceError('书打不开：' + e.message);
});
