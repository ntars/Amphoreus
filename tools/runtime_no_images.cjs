#!/usr/bin/env node
/* 运行时零图片验收：按真实点击流程遍历 /book DOM 与网络请求。
   只检查渲染结果；图片素材目录存在与否不影响运行时判定。 */
const { spawn } = require('child_process');
const path = require('path');

const port = Number(process.env.AMPHOREUS_CDP_PORT || (9500 + process.pid % 400));
const baseUrl = process.env.AMPHOREUS_URL || 'http://127.0.0.1:8760/book';
const chrome = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'google-chrome'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome CDP did not start');
}

(async () => {
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/amphoreus-runtime-no-images-${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  const cleanup = () => { try { proc.kill('SIGTERM'); } catch {} };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { cleanup(); process.exit(130); });
  process.on('exit', cleanup);

  const ws = await connect();
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const requests = [];
  const exceptions = [];
  const interactionFailures = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Network.requestWillBeSent') {
      requests.push(msg.params.request.url);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const details = msg.params.exceptionDetails;
      exceptions.push(details.exception?.description || details.text || 'unknown runtime exception');
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const click = async (selector) => evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error(${JSON.stringify(selector)});e.click();return true})()`
  );

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await sleep(1200);

  const snapshots = [];
  const snapshot = async (name) => snapshots.push({
    name,
    offenders: await evaluate(`(()=>{
      const bad=[];
      for(const el of document.querySelectorAll('*')){
        if(el.tagName==='IMG'||el.tagName==='IMAGE') bad.push(el.tagName.toLowerCase());
        const cs=getComputedStyle(el);
        for(const prop of ['backgroundImage','borderImageSource','maskImage','webkitMaskImage','listStyleImage']){
          const value=cs[prop];
          if(value&&value.includes('url(')) bad.push(el.tagName.toLowerCase()+'#'+el.id+'.'+el.className+':'+prop);
        }
      }
      return bad;
    })()`),
  });
  const readVisibleView = () => evaluate(`(()=>{
    const visible = [...document.querySelectorAll('.spread')]
      .filter((el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none')
      .map((el) => el.id);
    return {
      visible,
      hash: location.hash,
      bootError: window.__amphoreusBootError || '',
      catalogCards: document.querySelectorAll('#catalog .hero-card').length,
    };
  })()`);
  const readCoverState = () => evaluate(`(()=>{
    const opened = document.querySelector('#cover-open');
    const card = document.querySelector('#floating-card');
    const slot = opened?.querySelector('.open-slot');
    const box = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        opacity: Number(style.opacity),
      };
    };
    return {
      openClass: opened?.className || '',
      cardClass: card?.className || '',
      open: box(opened),
      card: box(card),
      slot: box(slot),
      hint: document.querySelector('.cover-hint')?.textContent || '',
    };
  })()`);

  await snapshot('cover');
  const coverState = await readCoverState();
  const readSourceBindings = () => evaluate(`(()=>{
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const titleStyle = getComputedStyle(document.querySelector('.home-title') || document.body);
    const fontFaces = [...document.fonts].map((face) => ({
      family: face.family,
      status: face.status,
      style: face.style,
      weight: face.weight,
    }));
    const rotation = document.getElementById('amph-star-rotation-keyframes')?.textContent || '';
    const effectRotation = document.getElementById('amph-star-effect-rotation-keyframes')?.textContent || '';
    const star = document.querySelector('#view-path .starmap-disc');
    const starStyle = star ? getComputedStyle(star) : null;
    const card = document.querySelector('#paths .path-card');
    const confirm = document.getElementById('open-confirm');
    const confirmStyle = confirm ? getComputedStyle(confirm) : null;
    const leftSpine = document.querySelector('#view-volume .paper-binding.left');
    const spineStyle = document.getElementById('amph-booklet-left-spine-keyframes')?.textContent || '';
    const inspectSpine = () => {
      if (!leftSpine) return '';
      const volume = document.querySelector('#view-volume');
      const hadHidden = volume?.classList.contains('hidden');
      const hadDirect = volume?.classList.contains('direct-volume');
      volume?.classList.remove('hidden');
      volume?.classList.add('direct-volume');
      const computed = getComputedStyle(leftSpine).animationName;
      if (!hadDirect) volume?.classList.remove('direct-volume');
      if (hadHidden) volume?.classList.add('hidden');
      return computed;
    };
    return {
      fontFaces,
      fontReady: document.fonts.status,
      rpgFontCheck: document.fonts.check('16px "RPG CN"'),
      bodyFont: bodyStyle.fontFamily,
      titleFont: titleStyle.fontFamily,
      rotationPoints: ['0.000000% { transform: rotateZ(-15deg); }', 'rotateZ(-4.410021deg)', 'rotateZ(0deg)'].filter((v) => rotation.includes(v)).length,
      effectRotationPoints: ['0.000000% { transform: rotateZ(-15deg); }', 'rotateZ(-4.410021deg)', 'rotateZ(0deg)'].filter((v) => effectRotation.includes(v)).length,
      pathBackDelay: rootStyle.getPropertyValue('--path-back-delay').trim(),
      pathPageDelay: rootStyle.getPropertyValue('--path-page-delay').trim(),
      pathInfoX0: rootStyle.getPropertyValue('--path-page-info-x-0').trim(),
      storyDelay: card?.style.getPropertyValue('--story-delay').trim() || '',
      storyDuration: card?.style.getPropertyValue('--story-duration').trim() || '',
      starAnimations: starStyle?.animationName || '',
      starLightTransform: (() => {
        const light = document.querySelector('.disc-source-light');
        const path = document.querySelector('#view-path');
        if (!light || !path) return '';
        const classes = [...path.classList];
        path.classList.remove('hidden');
        const transform = getComputedStyle(light).transform;
        path.className = classes.join(' ');
        return transform;
      })(),
      confirmAnimations: confirmStyle?.animationName || '',
      bookletSizeDuration: rootStyle.getPropertyValue('--booklet-btn-size-duration').trim(),
      homeCloseAlphaStart: rootStyle.getPropertyValue('--home-close-alpha-start').trim(),
      homeCloseAlphaEnd: rootStyle.getPropertyValue('--home-close-alpha-end').trim(),
      homeCloseAnimation: (() => {
        const el = document.querySelector('.home-close');
        if (!el) return '';
        const home = document.querySelector('#view-home');
        const hadHidden = home?.classList.contains('hidden');
        home?.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) home?.classList.add('hidden');
        return name;
      })(),
      outsideGeometryBindings: ['--source-close-x', '--source-close-y', '--source-content-y']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      homeGeometryStyle: (() => {
        const home = document.querySelector('#view-home');
        if (!home) return '';
        const classes = [...home.classList];
        home.classList.remove('hidden');
        home.classList.add('entrance-opening');
        const rules = [...document.styleSheets].flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
          } catch {
            return [];
          }
        });
        const style = rules.find((text) => text.startsWith('body:has(#view-home:not(.hidden)) .home-close') && text.includes('--source-close-x'));
        home.className = classes.join(' ');
        const status = rules.find((text) => text.startsWith('.home-status {') && text.includes('--source-content-y'));
        return [style || '', status || ''].join('|');
      })(),
      coverDecoPositions: (() => {
        return ['--cover-deco1-x', '--cover-deco1-y', '--cover-people-x', '--cover-people-y']
          .map((name) => rootStyle.getPropertyValue(name).trim())
          .join('/');
      })(),
      coverDecoClipPaths: (() => {
        const center = document.querySelector('.cover-deco-center');
        const people = document.querySelector('.cover-deco-people');
        if (!center || !people) return '';
        return [getComputedStyle(center).clipPath.length, getComputedStyle(people).clipPath.length].join('/');
      })(),
      firstTimePageInfoDelay: rootStyle.getPropertyValue('--first-time-page-info-delay').trim(),
      returningGoToDelay: rootStyle.getPropertyValue('--returning-go-to-panel-delay').trim(),
      particleOpenDelay: rootStyle.getPropertyValue('--path-particle-open-delay').trim(),
      directBackRotation: rootStyle.getPropertyValue('--booklet-direct-back-rotation-0').trim(),
      directBackYPointCount: [0,1,2,3,4].filter((i) => rootStyle.getPropertyValue('--booklet-direct-back-y-' + i).trim()).length,
      firstTimeBtnBook: document.querySelector('.home-archive.BtnBook')?.style.getPropertyValue('--first-time-reveal-delay').trim() || '',
      returningBtnMail: document.querySelector('.home-archive.BtnMail')?.style.getPropertyValue('--returning-eff-delay').trim() || '',
      iconAnchors: ['BtnBook', 'BtnStar', 'BtnMem', 'BtnPaper', 'BtnWiki', 'BtnMail']
        .map((name) => {
          const el = document.querySelector('.home-archive.' + name);
          if (!el) return 'none';
          const style = el.style;
          const x = style.getPropertyValue('--icon-anchor-x').trim();
          const y = style.getPropertyValue('--icon-anchor-y').trim();
          const state = el.querySelector('.home-archive-state');
          const computed = state ? getComputedStyle(state) : null;
          return name + ':' + x + '/' + y + '/' + (computed?.left || '') + '/' + (computed?.top || '');
        })
        .join('|'),
      openingEffOpenDelay: rootStyle.getPropertyValue('--opening-eff-open-delay').trim(),
      firstTimeBgRootDelay: rootStyle.getPropertyValue('--first-time-bg-root-eff-delay').trim(),
      returningEffOpenOff: rootStyle.getPropertyValue('--returning-eff-open-off-delay').trim(),
      returningOutsideContentDelay: rootStyle.getPropertyValue('--returning-outside-content-delay').trim(),
      catalogHintStart: rootStyle.getPropertyValue('--catalog-hint-start').trim(),
      catalogParEnd: rootStyle.getPropertyValue('--catalog-par-end').trim(),
      catalogLeftTabStart: rootStyle.getPropertyValue('--catalog-leftTab-start').trim(),
      catalogTopTabStart: rootStyle.getPropertyValue('--catalog-topTab-start').trim(),
      catalogPageInfoAlphaStart: rootStyle.getPropertyValue('--catalog-pageInfoAlpha-start').trim(),
      catalogPageInfoAlphaEnd: rootStyle.getPropertyValue('--catalog-pageInfoAlpha-end').trim(),
      catalogLeftTabAnimation: (() => {
        const el = document.querySelector('.catalog-left-tab');
        const view = document.querySelector('#view-catalog');
        if (!el) return '';
        const hadHidden = view?.classList.contains('hidden');
        view?.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) view?.classList.add('hidden');
        return name;
      })(),
      catalogExitAnimation: (() => {
        const view = document.querySelector('#view-catalog');
        if (!view) return '';
        const classes = [...view.classList];
        const bodyClasses = [...document.body.classList];
        view.classList.remove('hidden');
        view.classList.add('exiting');
        const style = document.createElement('style');
        style.textContent = 'body.catalog-exit-probe { animation: tarotCatalogExitRoot var(--catalog-exit-root-duration, .25s) linear var(--catalog-exit-root-delay, 0s) both; }';
        document.head.appendChild(style);
        document.body.classList.add('catalog-exit-probe');
        const name = getComputedStyle(document.body).animationName;
        document.body.className = bodyClasses.join(' ');
        style.remove();
        view.className = classes.join(' ');
        return name;
      })(),
      coverExitAnimation: (() => {
        const view = document.querySelector('#view-cover');
        const hud = document.querySelector('.entry-hud');
        if (!view || !hud) return '';
        const viewClasses = [...view.classList];
        const bodyClasses = [...document.body.classList];
        view.classList.remove('hidden');
        view.classList.add('exiting');
        const style = document.createElement('style');
        style.textContent = 'body.cover-exit-probe { animation: tarotCoverExitRoot var(--cover-exit-root-duration, .25s) linear var(--cover-exit-root-delay, 0s) both; }';
        document.head.appendChild(style);
        document.body.classList.add('cover-exit-probe');
        const root = getComputedStyle(document.body).animationName;
        const topTab = getComputedStyle(document.querySelector('.entry-top-tab')).animationName;
        document.body.className = bodyClasses.join(' ');
        style.remove();
        view.className = viewClasses.join(' ');
        return root + '/' + topTab;
      })(),
      coverExitVariableValues: ['--cover-exit-root-start', '--cover-exit-root-end', '--cover-exit-rootY-start', '--cover-exit-rootY-end', '--cover-exit-topTab-start', '--cover-exit-topTab-end', '--cover-exit-parAlpha-start', '--cover-exit-parAlpha-end']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      catalogExitVariableValues: ['--catalog-exit-root-start', '--catalog-exit-root-end', '--catalog-exit-rootY-start', '--catalog-exit-rootY-end', '--catalog-exit-topTab-start', '--catalog-exit-topTab-end', '--catalog-exit-hint-start', '--catalog-exit-hint-end', '--catalog-exit-parAlpha-start', '--catalog-exit-parAlpha-end']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      mailHintStarClip: rootStyle.getPropertyValue('--reward-sprite-hintStar').trim(),
      rewardTextClip: rootStyle.getPropertyValue('--reward-sprite-text').trim(),
      coverExitVariableSnapshot: Object.entries(window.__amphoreusExitTimings?.cover || {})
        .map(([part, timing]) => part + ':' + (timing?.values?.join(',') || ''))
        .join('|'),
      mailWave1Scale: rootStyle.getPropertyValue('--mail-hint-wave1-scale-1').trim(),
      mailWave2Scale: rootStyle.getPropertyValue('--mail-hint-wave2-scale-1').trim(),
      mailWave2Animation: (() => {
        const el = document.querySelector('.home-mail-hint .hint-wave.wave2');
        if (!el) return '';
        const home = document.querySelector('#view-home');
        const hadHidden = home?.classList.contains('hidden');
        home?.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) home?.classList.add('hidden');
        return name;
      })(),
      coverTitleAlphaStart: rootStyle.getPropertyValue('--cover-fade-pageInfoAlpha-start').trim(),
      coverTitleAlphaEnd: rootStyle.getPropertyValue('--cover-fade-pageInfoAlpha-end').trim(),
      coverLeftTabAnimation: (() => {
        const el = document.querySelector('.entry-left-tab');
        const view = document.querySelector('#view-cover');
        if (!el) return '';
        const hadHidden = view?.classList.contains('hidden');
        view?.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) view?.classList.add('hidden');
        return name;
      })(),
      coverTopTabAnimation: (() => {
        const el = document.querySelector('.entry-top-tab');
        const view = document.querySelector('#view-cover');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) view.classList.add('hidden');
        return name;
      })(),
      coverShortcutHintAnimation: (() => {
        const el = document.querySelector('.entry-shortcut-hint');
        const view = document.querySelector('#view-cover');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) view.classList.add('hidden');
        return name;
      })(),
      errorButtonAnimation: (() => {
        const el = document.querySelector('.home-archive.BtnMail .home-archive-error');
        const view = document.querySelector('#view-home');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        const name = getComputedStyle(el).animationName;
        if (hadHidden) view.classList.add('hidden');
        return name;
      })(),
      errorButtonDelay: document.querySelector('.home-archive.BtnMail')?.style.getPropertyValue('--error-delay').trim() || '',
      screenCardBindings: (() => {
        const rootKeys = ['--star-panel-frame', '--star-panel-frame2', '--star-panel-sub-frame', '--star-panel-card-back', '--star-panel-card-front', '--star-panel-card-center-back', '--star-panel-card-center-item', '--star-panel-card-center-sun', '--star-panel-card-icon', '--star-panel-switch-mail-icon'];
        const root = rootKeys.filter((name) => rootStyle.getPropertyValue(name).trim().startsWith('polygon(')).length;
        const card = document.querySelector('#paths .path-card');
        const frame = document.querySelector('.home-book-source-frame');
        const mail = document.querySelector('.home-mail-hint .hint-switch-mail');
        const clip = (el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false;
        return [root, clip(frame), clip(mail), card ? ['frame', 'center', 'icon'].filter((kind) => clip(card.querySelector('.path-card-source-' + kind))).length : 0].join('/');
      })(),
      uiLayerBindings: (() => {
        const keys = [
          'rewardButtonBgRing', 'diamondPattern', 'titleDecoItem', 'buttonDecoItem',
          'storyBgOutline', 'storyFinishIcon', 'storyHintIcon', 'storyLeftDeco',
          'storyRightDeco', 'chartCataTabBg', 'chartTabBg', 'roundBrownDecoL',
          'roundBrownDecoR', 'energyOrb', 'mainSwitchIcon', 'mainMailIcon',
          'mimiBookDeco2', 'mimiBookDeco5', 'mimiTalkDeco', 'mimiTalkPanelBg',
          'nextPageBg', 'openBookCardBg', 'rewardDecoRect', 'rewardDecoRect2',
          'rewardDecoRect3', 'signLightStar',
        ];
        const root = keys.filter((key) => {
          const name = '--ui-layer-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
          return rootStyle.getPropertyValue(name).trim().startsWith('polygon(');
        }).length;
        const selectors = [
          '.catalog-tab-cata-bg', '.catalog-tab-bg', '.catalog-title-deco > i:first-child',
          '.catalog-title-deco > i:last-child', '.reward-source-ring', '.reward-source-bow.left',
          '.reward-source-bow.right', '.reward-source-tick', '.home-glyph-mail-sprite',
          '.hint-energy-orb', '.open-source-card-bg', '.floating-card-source-bg',
          '.load-switch-icon', '.expand-source-deco', '.volume-next-source',
          '.mimi-panel-source-bg', '.mimi-talk-source-deco', '.mimi-book-deco.d2',
          '.mimi-book-deco.d5', '.sign-longpress-light-star',
        ];
        const nodes = selectors.map((selector) => document.querySelector(selector)).filter(Boolean);
        const clipped = nodes.filter((el) => getComputedStyle(el).clipPath.startsWith('polygon(')).length;
        return root + '/' + nodes.length + '/' + clipped;
      })(),
      errorButtonDuration: document.querySelector('.home-archive.BtnMail')?.style.getPropertyValue('--error-duration').trim() || '',
      errorScanEnd: document.querySelector('.home-archive.BtnMail')?.style.getPropertyValue('--error-scan-end').trim() || '',
      errorFrameRgb: document.querySelector('.home-archive.BtnMail')?.style.getPropertyValue('--error-frame-rgb').trim() || '',
      errorGlitch: (() => {
        const el = document.querySelector('.home-archive.BtnMail');
        if (!el) return '';
        return [el.style.getPropertyValue('--error-glitch-start').trim(), el.style.getPropertyValue('--error-glitch-end').trim()].join('/');
      })(),
      errorFrameAnimation: (() => {
        const el = document.querySelector('.home-archive.BtnMail .home-archive-error');
        const view = document.querySelector('#view-home');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        const names = getComputedStyle(el, '::before').animationName;
        if (hadHidden) view.classList.add('hidden');
        return names;
      })(),
      buttonEffPoints: (() => {
        const el = document.querySelector('.home-archive.BtnBook');
        if (!el) return '';
        return [4].map((i) => el.style.getPropertyValue('--opening-eff-point-' + i + '-at').trim()).join('/');
      })(),
      errorIconAnimation: (() => {
        const el = document.querySelector('.home-archive.BtnMail .home-archive-error');
        const view = document.querySelector('#view-home');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        const names = getComputedStyle(el, '::before').animationName;
        if (hadHidden) view.classList.add('hidden');
        return names;
      })(),
      errorTimingValues: ['buttons.BtnMail.error.delay', 'buttons.BtnMail.error.duration', 'buttons.BtnMail.scanlineW']
        .map((key) => key.split('.').reduce((value, part) => value?.[part], window.__amphoreusErrorTiming))
        .map((value, index) => index === 2 ? (value?.at(-1)?.value ?? '') : String(value ?? ''))
        .join('/'),
      errorOpenBinding: [
        rootStyle.getPropertyValue('--error-open-delay').trim(),
        rootStyle.getPropertyValue('--error-open-duration').trim(),
        window.__amphoreusErrorTiming?.errorOpen?.at(-1)?.value,
      ].join('/'),
      effPanelRgb: ['--cover-eff-par-rgb', '--cover-eff-shine-rgb', '--catalog-eff-par-rgb', '--catalog-eff-shine-rgb', '--cover-exit-eff-par-rgb']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      bottomBarAnimation: (() => {
        const el = document.querySelector('.home-bottom-bar');
        const view = document.querySelector('#view-home');
        if (!el || !view) return '';
        const hadHidden = view.classList.contains('hidden');
        view.classList.remove('hidden');
        view.classList.add('entrance-returning');
        const names = getComputedStyle(el).animationName;
        const delay = getComputedStyle(el).animationDelay;
        const duration = getComputedStyle(el).animationDuration;
        view.className = view.className.replace('entrance-returning', '').trim();
        if (hadHidden) view.classList.add('hidden');
        return names + '|' + delay + '|' + duration;
      })(),
      bottomBarDelay: rootStyle.getPropertyValue('--returning-bottom-bar-delay').trim(),
      bottomBarDuration: rootStyle.getPropertyValue('--returning-bottom-bar-duration').trim(),
      bottomBarExitValues: window.__amphoreusHomeExitTimings?.normal?.bottomBar?.values?.join(',') || '',
      bottomBarGeometryBindings: ['--source-bottom-bar-time-x', '--source-bottom-bar-time-y', '--source-bottom-bar-count-x']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      homeExitAllValues: [
        '--home-exit-all-root-0', '--home-exit-all-root-1',
        '--home-exit-all-pageInfoX-0', '--home-exit-all-pageInfoX-1',
        '--home-exit-all-reward-0', '--home-exit-all-reward-1',
        '--home-exit-all-rewardX-0', '--home-exit-all-rewardX-1',
        '--home-exit-all-bgRootEff-0', '--home-exit-all-bgRootEff-1',
      ].map((name) => rootStyle.getPropertyValue(name).trim()).join('/'),
      entranceScaleVariables: [
        '--opening-screen-scale-delay', '--opening-screen-scale-duration',
        '--first-time-screen-scale-delay', '--first-time-screen-scale-duration',
        '--returning-screen-scale-delay', '--returning-screen-scale-duration',
        '--resume-screen-scale-delay', '--resume-screen-scale-duration',
        '--first-time-desktop-bg-scale-delay', '--first-time-desktop-bg-scale-duration',
        '--returning-desktop-bg-scale-delay', '--returning-desktop-bg-scale-duration',
      ].map((name) => rootStyle.getPropertyValue(name).trim()).join('/'),
      entranceScaleKeyframes: [
        'amph-home-entrance-opening-screen-scale-keyframes',
        'amph-home-entrance-first-time-screen-scale-keyframes',
        'amph-home-entrance-returning-screen-scale-keyframes',
        'amph-home-entrance-resume-screen-scale-keyframes',
        'amph-home-entrance-first-time-desktop-bg-scale-keyframes',
      ].map((id) => document.getElementById(id)?.textContent || '').join('|'),
      entranceScaleAnimations: (() => {
        const view = document.querySelector('#view-home');
        if (!view) return '';
        const rules = [...document.styleSheets].flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
          } catch {
            return [];
          }
        });
        return ['opening', 'first-time', 'returning', 'resume'].map((variant) => {
          const bg = rules.find((text) => text.startsWith('body:has(#view-home.entrance-' + variant + ':not(.hidden)) #view-home'));
          const desktop = rules.find((text) => text.startsWith('body:has(#view-home.entrance-' + variant + ':not(.hidden)) .home-nav'));
          return (bg || '') + '|' + (desktop || '');
        }).join('/');
      })(),
      homeExitAllScaleKeyframes: [
        'amph-home-exit-all-bg-scale', 'amph-home-exit-all-desktop-bg-scale',
      ].map((id) => document.getElementById(id)?.textContent || '').join('|'),
      homeExitAllAnimation: (() => {
        const view = document.querySelector('#view-home');
        const reward = document.querySelector('.home-reward');
        if (!view || !reward) return '';
        const hadHidden = view.classList.contains('hidden');
        const oldClasses = view.className;
        view.classList.remove('hidden', 'entrance-opening', 'entrance-first-time', 'entrance-returning', 'entrance-resume');
        view.classList.add('exiting');
        const names = getComputedStyle(view).animationName + '|' + getComputedStyle(reward).animationName;
        view.className = oldClasses;
        if (hadHidden) view.classList.add('hidden');
        return names;
      })(),
      bookletLeftSpineAnimation: inspectSpine(),
      bookletLeftSpineKeyframes: spineStyle,
      bookletDirectPageScaleKeyframes: document.getElementById('amph-booklet-direct-page-scale-keyframes')?.textContent || '',
      bookletInitialPageScaleKeyframes: document.getElementById('amph-booklet-initial-page-scale-keyframes')?.textContent || '',
      bookletInitialPageScaleAnimation: (() => {
        const el = document.querySelector('#view-volume .volume-stage');
        if (!el) return '';
        const volume = document.querySelector('#view-volume');
        const hadHidden = volume?.classList.contains('hidden');
        volume?.classList.remove('hidden', 'direct-volume');
        const names = getComputedStyle(el).animationName;
        if (hadHidden) volume?.classList.add('hidden');
        return names;
      })(),
      bookletFunctionWidth: ['--booklet-initial-function-width-0', '--booklet-initial-function-width-1', '--booklet-initial-function-width-2']
        .map((name) => rootStyle.getPropertyValue(name).trim())
        .join('/'),
      bookletFunctionAnimation: (() => {
        const el = document.querySelector('#view-volume .volume-foot');
        if (!el) return '';
        const volume = document.querySelector('#view-volume');
        const hadHidden = volume?.classList.contains('hidden');
        volume?.classList.remove('hidden', 'direct-volume');
        const names = getComputedStyle(el).animationName;
        if (hadHidden) volume?.classList.add('hidden');
        return names;
      })(),
      storyProgress: (() => {
        const el = document.querySelector('#paths .path-card > .path-progress');
        if (!el) return '';
        const path = document.querySelector('#view-path');
        const hadHidden = path?.classList.contains('hidden');
        path?.classList.remove('hidden');
        const names = getComputedStyle(el).animationName;
        if (hadHidden) path?.classList.add('hidden');
        const delay = getComputedStyle(el).animationDelay;
        const duration = getComputedStyle(el).animationDuration;
        return names + '|' + delay + '|' + duration;
      })(),
      bookletDirectPageScaleAnimation: (() => {
        const el = document.querySelector('#view-volume .volume-stage');
        if (!el) return '';
        const volume = document.querySelector('#view-volume');
        const hadHidden = volume?.classList.contains('hidden');
        const hadDirect = volume?.classList.contains('direct-volume');
        volume?.classList.remove('hidden');
        volume?.classList.add('direct-volume');
        const name = getComputedStyle(el).animationName;
        if (!hadDirect) volume?.classList.remove('direct-volume');
        if (hadHidden) volume?.classList.add('hidden');
        return name;
      })(),
    };
  })()`);
  const coverBindings = await readSourceBindings();
  await click('#book-cover');
  await sleep(300);
  const choosingState = await readCoverState();
  await click('#floating-card');
  await sleep(300);
  const chosenState = await readCoverState();
  await click('#open-confirm');
  await sleep(600);
  const homeState = await readVisibleView();
  await snapshot('home');
  // Official path cards are created lazily by the path view; visit it once so
  // CSS bindings can be checked, then the hero tab must actually show catalog.
  await click('#archive-tabs button[data-arc=path]');
  await sleep(250);
  const pathState = await readVisibleView();
  await click('#archive-tabs button[data-arc=hero]');
  await sleep(250);
  const catalogState = await readVisibleView();
  const catalogCardState = await evaluate(`(()=>{
    const cards = [...document.querySelectorAll('#catalog .hero-card')];
    const visible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return !card.classList.contains('hidden')
        && getComputedStyle(card).display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    });
    const first = visible[0];
    const rect = first?.getBoundingClientRect();
    return {
      rendered: cards.length,
      visible: visible.length,
      width: Math.round(rect?.width || 0),
      height: Math.round(rect?.height || 0),
    };
  })()`);
  if (exceptions.length) interactionFailures.push('runtime:exceptions:' + exceptions.join(' | '));
  if (homeState.visible.join(',') !== 'view-home' || homeState.hash !== '#home') interactionFailures.push('runtime:cover-confirm-navigation');
  if (!choosingState.openClass.includes('choosing') || choosingState.open?.display === 'none' || choosingState.slot?.display === 'none' || choosingState.card?.display === 'none') interactionFailures.push('runtime:cover-choosing-state');
  if (!chosenState.openClass.includes('chosen') || chosenState.slot?.display !== 'none' || chosenState.open?.display === 'none') interactionFailures.push('runtime:cover-chosen-state');
  if (pathState.visible.join(',') !== 'view-path' || pathState.hash !== '#path') interactionFailures.push('runtime:path-navigation');
  if (catalogState.visible.join(',') !== 'view-catalog' || catalogState.hash !== '#catalog') interactionFailures.push('runtime:catalog-navigation');
  // The data contains thirteen records, but the official catalogue grid omits
  // the centre-only thirteenth card and shows the twelve outer entries.
  if (catalogCardState.rendered !== 13 || catalogCardState.visible !== 12 || catalogCardState.width <= 0 || catalogCardState.height <= 0) interactionFailures.push('runtime:catalog-cards-visible');
  // Snapshot official card bindings from the path view before returning to
  // home for the bottom-hint and close-button computed-style checks.
  await click('#archive-tabs button[data-arc=path]');
  await sleep(250);
  const pageBackgroundBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const layers = [
      ['.cover-scene > .cover-official-pattern', '--waiting-sprite-cover-page-pattern'],
      ['.catalog-official-bg', '--waiting-sprite-catalog-bg'],
      ['.sign-longpress-page-bg', '--waiting-sprite-sign-page-bg'],
    ];
    return ['coverPagePattern', 'catalogBg', 'signPageBg', 'endPageDeco'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length + '/' + layers.map(([selector, token]) => {
      const el = document.querySelector(selector);
      const clip = el ? getComputedStyle(el).clipPath : 'missing';
      return pick(token).startsWith('polygon(') && clip.startsWith('polygon(');
    }).filter(Boolean).length;
  })()`);
  const signLineBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['signBgLight', 'signBgPattern', 'signDecoIcon', 'signLineBg', 'signLineEffect', 'signLineOutlineGlow', 'signCenterStarLight', 'signPressCircle2'];
    const sprites = keys.filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const layers = ['.sign-longpress-bg-light', '.sign-longpress-bg-pattern', '.sign-line-bg', '.sign-line-effect', '.sign-line-glow'].map((sel) => document.querySelector(sel));
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  const buttonDecorationBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const layers = ['.home-archive .home-glyph-com-deco1', '.home-archive .home-glyph-com-deco2', '.home-archive .home-archive-icon'].map((sel) => document.querySelector(sel));
    const sprites = ['buttonComDeco1', 'buttonComDeco2', 'buttonLargePattern', 'mailStarIcon'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const clips = layers.map((el) => el ? getComputedStyle(el, el.classList.contains('home-archive-icon') ? '::after' : null).clipPath : 'missing');
    return sprites + '/' + clips.filter((clip) => clip.startsWith('polygon(')).length;
  })()`);
  const finalSpriteBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['coverPageBg', 'coverPageDecoItem', 'endPageBorder', 'energyHintPattern', 'energyHintDecoPattern', 'catalogSideDeco', 'toastIcon'];
    const sprites = keys.filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const layers = ['.home-toast-mark', '.home-end-page-border', '.home-mail-hint .hint-bg-detail', '.home-mail-hint .hint-deco-pattern'].map((sel) => document.querySelector(sel));
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  await click('#archive-tabs button[data-arc=mimi]');
  await sleep(350);
  const mimiTimingBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const values = ['--mimi-panel-delay', '--mimi-panel-duration', '--mimi-panel-scale-start', '--mimi-panel-scale-delay', '--mimi-panel-scale-duration', '--mimi-slide-delay', '--mimi-slide-duration'].map(pick);
    const timing = window.__amphoreusMimiTiming || {};
    const guideValues = ['--mimi-guide-bg-alpha-delay', '--mimi-guide-bg-alpha-duration', '--mimi-guide-icon-alpha-delay', '--mimi-guide-text-alpha-delay'].map(pick);
    const durationValues = ['--mimi-voice-duration', '--mimi-assistant-duration'].map(pick);
    const animations = ['.mimi-panel-bg-deco', '.mimi-panel-arrow', '.mimi-panel-outline', '.mimi-choose-icon', '.mimi-choose-deco', '.mimi-choose-bg'].map((sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).animationName : ''; });
    return values.join('/') + '/' + [timing.page?.talkPanelAlpha?.delay, timing.page?.talkPanelAlpha?.duration, timing.unlock?.slideAlpha?.delay, timing.unlock?.slideAlpha?.duration].join('/') + '/' + guideValues.join('/') + '/' + durationValues.join('/') + '/' + animations.map((n) => n.includes('tarotMimi') && n.includes('none') === false ? 'ok' : 'x').join('/');
  })()`);
  await click('#archive-tabs button[data-arc=me13]');
  await sleep(300);
  const timelineBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['active1', 'left1', 'right1', 'active2', 'left2', 'right2', 'active3', 'left3', 'right3', 'active4'];
    const vars = keys.filter((key) => pick('--timeline-' + key + '-delay') && pick('--timeline-' + key + '-duration')).length;
    const stages = [...document.querySelectorAll('#pipeline .stage[data-timeline-row]')];
    const animated = stages.filter((el) => getComputedStyle(el).animationName.includes('tarotTimelineRowReveal')).length;
    return vars + '/' + animated + '/' + stages.length;
  })()`);
  const mimiBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['mimiBookDeco1', 'mimiBookDeco3', 'mimiBookDeco41', 'mimiBookDeco42', 'mimiBookDeco43', 'mimiTalkBtnChooseBg', 'mimiTalkChooseDeco', 'mimiTalkChooseIcon', 'mimiTalkPanelArrow', 'mimiTalkPanelBgDeco', 'mimiTalkPanelHintArrow', 'mimiTalkPanelOutline'];
    const sprites = keys.filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const layers = ['.mimi-panel-outline', '.mimi-panel-bg-deco', '.mimi-book-deco.d1', '.mimi-choose-bg', '.mimi-choose-icon'].map((sel) => document.querySelector(sel));
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  const tabBindingKeys = ['chartCataTabDeco', 'chartCataTabOutline', 'chartTabBgShadow', 'chartTabDecoIcon', 'chartTabFinishIcon', 'chartTabLockIcon', 'chartTabOutline', 'chartTabOutlineR', 'chartTabPattern', 'questRewardTabLine', 'questRewardTabLineCopy', 'questRewardTabOutline', 'pageNextBtnOutline', 'talkTabFrame', 'collectRewardDecoCenter', 'collectRewardDecoCenterBg', 'collectRewardDecoCenterBgCircle', 'rewardItemBg', 'rewardItemOutline', 'reviewBtnBg', 'reviewBtnIcon', 'unloadBtnBg'];
  const tabBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ${JSON.stringify(tabBindingKeys)};
    const sprites = keys.filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const layers = ['.catalog-tab-outline', '.rule-bg', '.load-auto-bg', '.reward-item-bg', '.review-btn-bg', '.volume-next-outline'].map((sel) => document.querySelector(sel));
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  const autogenBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['autoIcon', 'autoIconGlow', 'autoIconOutline', 'autoShadow', 'checkIcon', 'checkOutline', 'waitProgress', 'mailHintPanel', 'mainDecoRect', 'entranceBtnLine', 'selectFrame', 'openBookHintTextBg', 'textUnderLine'];
    const sprites = keys.filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    const layers = ['.load-auto-glow', '.reward-check-icon', '.hint-wait .wait-progress', '.entry-select-frame', '.expand-text-bg', '.home-mail-hint .hint-panel'].map((sel) => document.querySelector(sel));
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  const chapterSpriteBindings = await evaluate(`(()=>{
    const keys = ['banner', 'circle', 'backCircle', 'deco', 'symbol', 'spSymbol'];
    const cards = [...document.querySelectorAll('#paths .path-card')];
    const outer = cards.filter((el) => !el.classList.contains('center'));
    const cssKey = (key) => '--chapter-attr-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    const sprites = cards.flatMap((card) => keys.map((key) => card.style.getPropertyValue(cssKey(key)).trim())).filter((v) => v.startsWith('polygon(')).length;
    const layers = cards.filter((card) => {
      const style = getComputedStyle(card);
      const csBefore = getComputedStyle(card, '::before');
      const csAfter = getComputedStyle(card, '::after');
      return ['path-card-mask', 'path-card-back', 'path-card-outline'].every((cls) => getComputedStyle(card.querySelector('.' + cls)).clipPath.startsWith('polygon(')) || [csBefore.clipPath, csAfter.clipPath].every((clip) => clip.startsWith('polygon('));
    }).length;
    return sprites + '/' + layers + '/' + outer.length;
  })()`);
  const entranceSpriteBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const keys = ['background', 'background-glow', 'deco-bottom', 'deco-circle', 'deco-top', 'icon', 'replay', 'replay-outline', 'finish', 'download-arrow', 'download-base', 'crystal', 'reward-deco', 'reward-get', 'end-finish-bg', 'entrance-water-shadow', 'entrance-icon1', 'entrance-icon2', 'menu-gradient', 'open-crystal-shadow', 'entrance-bg-t2', 'entrance-deco-bot-t2', 'entrance-deco-circle-t2', 'entrance-deco-top-t2', 'data-story-inner-outline', 'data-story-bg', 'data-story-outline-l', 'data-story-outline-r', 'round-deco-l', 'round-deco-r', 'corner-outline-right', 'img-shadow', 'cover-cloud1', 'cover-people1', 'hint-star-deco2', 'auto-bg', 'book2'];
    const sprites = keys.filter((key) => pick('--entry-sprite-' + key).startsWith('polygon(')).length;
    const line = document.querySelector('.entry-entrance-line');
    const variants = ['--home-variant-btnstar-0', '--home-variant-btnbook-0', '--home-variant-btnmail-0', '--home-variant-btnmem-0', '--home-variant-btnpaper-0', '--home-variant-btnwiki-0'];
    const iconVariants = variants.filter((key) => pick(key).startsWith('polygon(')).length;
    const glyphLayers = ['BtnStar', 'BtnBook', 'BtnMail', 'BtnMem', 'BtnPaper', 'BtnWiki'].filter((name) => {
      const el = document.querySelector('.home-archive.' + name + ' .home-glyph em');
      return el && getComputedStyle(el, '::after').clipPath.startsWith('polygon(');
    }).length;
    return sprites + '/' + (line && getComputedStyle(line).clipPath.startsWith('polygon(') ? 1 : 0) + '/' + iconVariants + '/' + glyphLayers;
  })()`);
  const dialogTimingBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const values = ['--dialog-fade-delay', '--dialog-fade-duration', '--dialog-title-scale-end', '--dialog-title-scale-duration', '--dialog-wobble-duration'].map(pick);
    const timing = window.__amphoreusDialogTiming?.dialog;
    return values.join('/') + '/' + [timing?.contentsAlpha?.duration, timing?.titleScaleX?.at(-1)?.time, timing?.frameWobbleX?.at(-1)?.time].join('/');
  })()`);
  const errorDecorationBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const sprites = ['errorDialogBg', 'errorHintBg', 'errorHintIcon', 'errorIconEff'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    return sprites + '/' + [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } }).some((rule) => rule.selectorText?.includes('.source-error-dialog-bg'));
  })()`);
  const signDecorationBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const layers = ['.sign-longpress-center-icon', '.sign-longpress-center-star', '.sign-longpress-dot-pattern'].map((sel) => document.querySelector(sel));
    const sprites = ['signCenterIcon', 'signCenterStar', 'signDotPattern'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length;
    return sprites + '/' + layers.map((el) => el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false).filter(Boolean).length;
  })()`);
  const floatingBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const el = document.querySelector('#floating-card .floating-card-book-deco');
    return root.getPropertyValue('--waiting-sprite-book-deco-item').trim().startsWith('polygon(') + '/' + (el ? getComputedStyle(el).clipPath.startsWith('polygon(') : false);
  })()`);
  const confirmBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const btn = document.querySelector('#open-confirm');
    const pattern = btn?.querySelector('.confirm-pattern');
    const circle = btn?.querySelector('.confirm-circle');
    const clips = [btn, pattern, circle].map((el) => el ? getComputedStyle(el).clipPath : 'missing');
    return ['confirmBg', 'confirmCircle', 'buttonPattern'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length + '/' + (clips.every((clip) => clip.startsWith('polygon(')));
  })()`);
  const catalogMaskBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const mask = document.querySelector('#catalog .hero-card .catalog-item-mask');
    const clip = mask ? getComputedStyle(mask).clipPath : 'missing';
    return ['catalogItemMask', 'catalogItem13Mask'].filter((key) => pick('--waiting-sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('polygon(')).length + '/' + (clip.startsWith('polygon('));
  })()`);
  const cardOutlineBindings = await evaluate(`(()=>{const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const card = document.querySelector('#paths .path-card');
    const back = card?.querySelector('.path-card-back');
    const outline = card?.querySelector('.path-card-outline');
    const star = card ? getComputedStyle(card, '::after').clipPath : '';
    const clips = [back, outline].map((el) => el ? getComputedStyle(el).clipPath : 'missing');
    const extra = [card?.querySelector('.path-card-shadow'), card?.querySelector('.path-card-mask')].map((el) => el ? getComputedStyle(el).clipPath : 'missing');
    const sprites = ['cardBack', 'cardOutline', 'cardSelectOutline', 'cardStar', 'cardBg', 'cardIcon', 'cardMask', 'cardShadow', 'cardLightStar', 'cardLightIcon'].filter((key) => pick('--card-sprite-' + key).startsWith('polygon(')).length;
    const colors = ['cardBg', 'cardBack', 'cardIcon', 'cardLightStar'].filter((key) => pick('--sprite-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())).startsWith('rgb(')).length;
    return sprites + '/' + colors + '/' + (clips.concat(extra).every((clip) => clip.startsWith('polygon(')) && star.startsWith('polygon('));
  })()`);
  await click('#archive-tabs button[data-arc=hero]');
  await sleep(250);
  const bottomHintBindings = await evaluate(`(()=>{
    const rootStyle = getComputedStyle(document.documentElement);
    const hint = document.querySelector('.home-bottom-hint');
    const bg = document.querySelector('.hint-panel-bg');
    const ring = document.querySelector('.wait-ring');
    const light = document.querySelector('.wait-light');
    const state = document.querySelector('.home-archive-state');
    const keys = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    });
    const keyframes = (name) => keys.find((rule) => rule.type === CSSRule.KEYFRAMES_RULE && rule.name === name)?.cssText || '';
    const pick = (name) => rootStyle.getPropertyValue(name).trim();
    const camelToKebab = (name) => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    const pickOutline = (name) => {
      const candidates = ['--waiting-sprite-' + name, '--waiting-sprite-' + camelToKebab(name), '--sign-sprite-' + name, '--sign-sprite-' + camelToKebab(name), '--sign-sprite-' + name.replace(/^sign/, '')];
      return candidates.map(pick).find((value) => value.startsWith('polygon(')) || '';
    };
    return {
      bgAnimation: bg ? getComputedStyle(bg).animationName : '',
      hintAnimation: (() => {
        if (!hint) return '';
        const view = document.querySelector('#view-home');
        const oldClasses = view?.className;
        view?.classList.remove('hidden', 'exiting');
        const name = getComputedStyle(hint).animationName;
        if (oldClasses !== undefined) view.className = oldClasses;
        return name;
      })(),
      ringAnimation: ring ? getComputedStyle(ring).animationName : '',
      lightAnimation: light ? getComputedStyle(light).animationName : '',
      bgScale: pick('--bottom-hint-bg-scale-1') + '/' + pick('--bottom-hint-bg-scale-2'),
      multiScale: pick('--bottom-hint-multi-bg-scale-1') + '/' + pick('--bottom-hint-multi-bg-scale-2') + '/' + pick('--bottom-hint-multi-bg-scale-3'),
      alphaWindows: ['bg', 'text', 'button', 'multi-bg'].map((part) => pick('--bottom-hint-' + part + '-delay') + '/' + pick('--bottom-hint-' + part + '-duration')).join('|'),
      scaleKeyframes: keyframes('tarotBottomHintBgScale') + keyframes('tarotBottomHintMultiBgScale'),
      rotationKeyframes: keyframes('tarotWaitingRing') + keyframes('tarotWaitingLight'),
      rotationDuration: pick('--waiting-loop-duration'),
      buttonStateRgb: ['normal', 'highlighted', 'pressed', 'selected', 'disabled'].map((name) => pick('--button-state-' + name + '-rgb')).join('|'),
      buttonStateAlpha: ['highlighted', 'pressed'].map((name) => pick('--button-state-' + name + '-alpha')).join('|'),
      buttonStateActive: ['normal', 'highlighted', 'pressed', 'selected', 'disabled'].map((name) => pick('--button-state-' + name + '-active')).join('|'),
      buttonStateDuration: pick('--button-state-highlighted-duration'),
      buttonStateAnimation: state ? getComputedStyle(state).animationName : '',
      buttonStatePointCount: ['0', '1', '2', '3', '4'].filter((index) => pick('--button-state-highlighted-point-' + index + '-at')).length,
      buttonStatePoint4: pick('--button-state-highlighted-point-3'),
      signDuration: pick('--sign-longpress-duration'),
      signWidth: pick('--sign-longpress-width-start') + '/' + pick('--sign-longpress-width-end'),
      signAlpha: pick('--sign-longpress-alpha-0-at') + '/' + pick('--sign-longpress-alpha-1-at') + '/' + pick('--sign-longpress-alpha-1'),
      signPulse: ['0', '1', '2', '3'].filter((index) => pick('--sign-longpress-pulse-' + index + '-at')).length + '/' + pick('--sign-longpress-pulse-2'),
      outlineBindings: ['icon', 'light', 'signDecoLine', 'signLightLine', 'signLineOutline'].map(pickOutline).filter((value) => value.startsWith('polygon(')).length + '/' + (ring ? getComputedStyle(ring).clipPath.startsWith('polygon(') : false) + '/' + (light ? getComputedStyle(light).clipPath.startsWith('polygon(') : false),
      outlineKeyframes: keyframes('tarotSignLongPressPulse'),
      closeIconBindings: (() => {
        const close = document.querySelector('.home-close');
        const view = document.querySelector('#view-home');
        const hadHidden = view?.classList.contains('hidden');
        view?.classList.remove('hidden');
        const before = close ? getComputedStyle(close, '::before').clipPath : '';
        const after = close ? getComputedStyle(close, '::after').clipPath : '';
        if (hadHidden) view?.classList.add('hidden');
        return pick('--ui-sprite-close-icon').startsWith('polygon(') + '/' + pick('--ui-sprite-button-deco-icon').startsWith('polygon(') + '/' + before.startsWith('polygon(') + '/' + after.startsWith('polygon(');
      })(),
      navGlyphBindings: ['BtnBook', 'BtnStar', 'BtnPaper', 'BtnWiki', 'BtnMail', 'BtnMem'].map((name) => {
        const button = document.querySelector('.home-archive.' + name);
        const glyph = button?.querySelector('.home-glyph i');
        const inlinePath = button?.style.getPropertyValue('--source-glyph-path').trim() || '';
        const color = glyph ? getComputedStyle(glyph).backgroundColor : '';
        const clip = glyph ? getComputedStyle(glyph).clipPath : '';
        return name + ':' + (inlinePath.startsWith('polygon(') && clip.startsWith('polygon(') && /rgb\\(/.test(color) ? 'ok' : 'bad:' + inlinePath.slice(0, 8) + ':' + clip.slice(0, 8) + ':' + color);
      }).join('|'),
      pagePattern: ['catalog', 'direct', 'exit'].map((flow) => pick('--page-pattern-' + flow + '-off') + '/' + pick('--page-pattern-' + flow + '-alpha')).join('|'),
    };
  })()`);
  for (const arc of ['hero', 'path', 'mimi', 'warden', 'me13', 'mail']) {
    await click(`#archive-tabs button[data-arc=${arc}]`);
    await sleep(350);
    await snapshot(arc);
  }
  await click('#archive-tabs button[data-arc=hero]');
  await sleep(300);
  await click('#catalog .hero-card[data-ch="1"]');
  await sleep(500);
  await snapshot('volume');
  await click('#archive-tabs button[data-arc=path]');
  await sleep(400);
  const pathBindings = await readSourceBindings();
  await click('#paths .path-card');
  await sleep(400);
  await snapshot('path-detail');
  await send('Page.navigate', { url: `${baseUrl.split('#')[0]}#vol1` });
  await sleep(1200);
  // Mobile layout smoke: the game UI must not introduce horizontal page scroll.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const mobileOverflow = await evaluate(`(()=>{
    const doc = document.documentElement;
    return {
      docScrollWidth: doc.scrollWidth,
      innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  await sleep(5500);
  await snapshot('direct-volume');
  const directBindings = await readSourceBindings();
  await click('#archive-tabs button[data-arc=path]');
  await sleep(400);
  const storyBindings = await readSourceBindings();

  // The homepage is a fixed 1280×720 game canvas. Fit the full composition
  // uniformly inside each desktop viewport and keep page scrolling at zero.
  // A hash-only navigation does not relaunch boot(), and the prior path route
  // would remain visible. Use a cache-busted document URL to exercise a real
  // direct-entry load of the homepage.
  await send('Page.navigate', { url: `${baseUrl.split('#')[0]}?runtime-fit=1#home` });
  await sleep(1200);
  const desktopFit = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    desktopFit.push(await evaluate(`(()=>{
      const stage = document.querySelector('#view-home .home-stage');
      const view = document.querySelector('#view-home');
      const rect = stage?.getBoundingClientRect();
      const navTargets = [...document.querySelectorAll('#view-home .home-archive')].map((nav) => {
        const box = nav.querySelector('.home-archive-icon')?.getBoundingClientRect();
        const hit = box
          ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest?.('.home-archive') === nav
          : false;
        return { name: nav.className, hit };
      });
      const navHit = navTargets.length === 6 && navTargets.every((target) => target.hit);
      const style = view ? getComputedStyle(view) : null;
      return {
        width: innerWidth,
        height: innerHeight,
        stage: rect ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        } : null,
        navHit,
        navTargets,
        scale: style?.scale || 'missing',
        docScrollWidth: document.documentElement.scrollWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
      };
    })()`));
  }
  const desktopFitFailures = desktopFit.flatMap((state) => {
    const label = `${state.width}x${state.height}`;
    if (!state.stage) return [label + ':stage'];
    const expectedScale = Math.min(state.width / 1280, state.height / 720);
    const expectedWidth = 1280 * expectedScale;
    const expectedHeight = 720 * expectedScale;
    const expectedLeft = (state.width - expectedWidth) / 2;
    const expectedTop = (state.height - expectedHeight) / 2;
    const failures = [];
    if (Math.abs(state.stage.width - expectedWidth) > 1) failures.push(label + ':fit-width');
    if (Math.abs(state.stage.height - expectedHeight) > 1) failures.push(label + ':fit-height');
    if (Math.abs(state.stage.left - expectedLeft) > 1) failures.push(label + ':center-x');
    if (Math.abs(state.stage.top - expectedTop) > 1) failures.push(label + ':center-y');
    if (!state.navHit) failures.push(label + ':home-nav-hit-target');
    if (state.docScrollWidth > state.width + 1 || state.docScrollHeight > state.height + 1) failures.push(label + ':document-overflow');
    if (state.bodyScrollWidth > state.width + 1 || state.bodyScrollHeight > state.height + 1) failures.push(label + ':body-overflow');
    return failures;
  });

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(350);
  const mobileHomeLayout = await evaluate(`(()=>{
    const stage = document.querySelector('#view-home .home-stage');
    const rect = stage?.getBoundingClientRect();
    const visible = [...document.querySelectorAll('.spread')]
      .filter((el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none')
      .map((el) => el.id);
    return {
      visible,
      stageWidth: rect?.width || 0,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth,
    };
  })()`);
  if (mobileHomeLayout.visible.join(',') !== 'view-home') desktopFitFailures.push('mobile-home:view');
  if (mobileHomeLayout.stageWidth > mobileHomeLayout.innerWidth + 1) desktopFitFailures.push('mobile-home:stage-width');
  if (mobileHomeLayout.docScrollWidth > mobileHomeLayout.innerWidth + 1 || mobileHomeLayout.bodyScrollWidth > mobileHomeLayout.innerWidth + 1) desktopFitFailures.push('mobile-home:horizontal-overflow');

  const imageRequests = requests.filter((u) => /\.(?:png|jpe?g|webp|svg|gif|bmp|avif)(?:\?|$)/i.test(u));
  const sourceBindings = {
    ...coverBindings,
    screenCardBindings: pathBindings.screenCardBindings,
    storyProgress: storyBindings.storyProgress,
    storyDelay: pathBindings.storyDelay,
    storyDuration: pathBindings.storyDuration,
    starAnimations: pathBindings.starAnimations,
    bookletLeftSpineAnimation: directBindings.bookletLeftSpineAnimation,
    bottomHintBindings: { ...bottomHintBindings, timelineBindings, chapterSpriteBindings, entranceSpriteBindings, cardOutlineBindings, pageBackgroundBindings, catalogMaskBindings, confirmBindings, floatingBindings, signDecorationBindings, errorDecorationBindings, buttonDecorationBindings, signLineBindings, finalSpriteBindings, dialogTimingBindings, autogenBindings, tabBindings, mimiBindings, mimiTimingBindings },
  };
  const failures = interactionFailures
    .concat(desktopFitFailures)
    .concat(snapshots.filter((s) => s.offenders.length).map((s) => s.name + ':' + s.offenders.join(',')));
  const rpgFace = sourceBindings.fontFaces.find((face) => face.family.replaceAll('"', '') === 'RPG CN');
  if (!rpgFace || rpgFace.status !== 'loaded') failures.push('font:official-rpg-cn-load');
  const expectedIconAnchors = 'BtnBook:-9.19px/-2.94px|BtnStar:-32px/67.3px|BtnMem:9.7px/1.1px|BtnPaper:-26.12px/18.01px|BtnWiki:-14.55px/20.619995px|BtnMail:-4.4299927px/20.309998px';
  const iconAnchorValues = sourceBindings.iconAnchors.split('|').map((entry) => entry.split('/').slice(0, 2).join('/')).join('|');
  if (iconAnchorValues !== expectedIconAnchors) failures.push('source:icon-loop-anchors');
  if (!/^BtnBook:-9\.19px\/-2\.94px\/calc\(50% - 9\.19px\)\/19\.06px\|/.test(sourceBindings.iconAnchors)) failures.push('runtime:icon-anchor-state-ring');
  if (sourceBindings.fontReady !== 'loaded' || !sourceBindings.rpgFontCheck) failures.push('font:rpg-cn-ready');
  if (!sourceBindings.bodyFont.includes('"RPG CN"') || !sourceBindings.titleFont.includes('"RPG CN"')) failures.push('font:rpg-cn-computed');
  if (sourceBindings.rotationPoints !== 3) failures.push('source:star-rotation-keyframes');
  if (sourceBindings.effectRotationPoints !== 3) failures.push('source:star-effect-rotation-keyframes');
  if (sourceBindings.pathBackDelay !== '3.316667s') failures.push('source:path-back-delay');
  if (sourceBindings.pathPageDelay !== '3.516667s') failures.push('source:path-page-delay');
  if (sourceBindings.pathInfoX0 !== '-80px') failures.push('source:path-info-x');
  if (!sourceBindings.storyDelay || !sourceBindings.storyDuration) failures.push('source:story-panel-timings');
  if (!sourceBindings.starAnimations.includes('tarotStarPanelRotate')) failures.push('source:star-rotation-animation');
  if (!sourceBindings.starLightTransform.includes('matrix')) failures.push('runtime:star-light-layer');
  if (!sourceBindings.bookletSizeDuration) failures.push('source:booklet-button-size');
  if (sourceBindings.homeCloseAlphaStart !== '0px' || sourceBindings.homeCloseAlphaEnd !== '1px') failures.push('source:home-close-alpha');
  if (sourceBindings.homeCloseAnimation !== 'tarotHomeCloseAlpha') failures.push('runtime:home-close-alpha');
  if (sourceBindings.outsideGeometryBindings !== '0px/72px/-20px') failures.push('source:outside-geometry');
  if (!sourceBindings.homeGeometryStyle.split('|')[0].includes('var(--source-close-x')) failures.push('runtime:home-close-x');
  if (!sourceBindings.homeGeometryStyle.split('|')[1].includes('var(--source-content-y')) failures.push('runtime:home-status-content-y');
  if (!sourceBindings.coverDecoPositions.startsWith('85%') || !sourceBindings.coverDecoPositions.includes('/50%')) failures.push('source:cover-deco-centroids');
  if (!/^\d+\/\d+$/.test(sourceBindings.coverDecoClipPaths) || sourceBindings.coverDecoClipPaths.split('/').some((n) => Number(n) < 100)) failures.push('runtime:cover-deco-clip-paths');
  if (sourceBindings.firstTimePageInfoDelay !== '2.833333s') failures.push('source:homepage-first-time-title');
  if (sourceBindings.returningGoToDelay !== '1.583333s') failures.push('source:homepage-returning-goto');
  if (sourceBindings.particleOpenDelay !== '1.616667s') failures.push('source:path-particle-open');
  if (sourceBindings.directBackRotation !== '11.876') failures.push('source:booklet-direct-back-rotation');
  if (sourceBindings.directBackYPointCount !== 5) failures.push('source:booklet-direct-back-y-keyframes');
  if (sourceBindings.firstTimeBtnBook !== '2.916667s') failures.push('source:first-time-button-reveal');
  if (sourceBindings.returningBtnMail !== '1.2s') failures.push('source:returning-button-eff');
  if (sourceBindings.openingEffOpenDelay !== '0s') failures.push('source:homepage-eff-open');
  if (sourceBindings.firstTimeBgRootDelay !== '2.633333s') failures.push('source:homepage-bg-root-eff');
  if (sourceBindings.returningEffOpenOff !== '2.25s') failures.push('source:homepage-eff-open-off');
  if (sourceBindings.returningOutsideContentDelay !== '1.5s') failures.push('source:homepage-outside-content');
  if (sourceBindings.catalogHintStart !== '-50.93px') failures.push('source:catalog-shortcut-hint');
  if (sourceBindings.catalogParEnd !== '0.09803922') failures.push('source:catalog-eff-panel');
  if (sourceBindings.catalogLeftTabStart !== '55px' || sourceBindings.catalogTopTabStart !== '80px') failures.push('source:catalog-tab-positions');
  if (sourceBindings.catalogPageInfoAlphaStart !== '0' || sourceBindings.catalogPageInfoAlphaEnd !== '1') failures.push('source:catalog-page-info-alpha');
  if (sourceBindings.catalogLeftTabAnimation !== 'tarotCatalogLeftTab, tarotCatalogLeftTabAlpha') failures.push('runtime:catalog-tab-animation');
  if (!sourceBindings.catalogExitAnimation.includes('tarotCatalogExitRoot')) failures.push('runtime:catalog-exit-animation');
  if (!sourceBindings.coverExitAnimation.startsWith('tarotCoverExitRoot/') || !sourceBindings.coverExitAnimation.includes('tarotCoverExitTopTab')) failures.push('runtime:cover-exit-animation');
  if (sourceBindings.coverExitVariableValues !== '1/0/0px/80px/0px/80px/0.09803922/0') failures.push('source:cover-exit-values');
  if (sourceBindings.catalogExitVariableValues !== '1/0/0px/80px/0px/80px/0px/-50.93px/0.09803922/0') failures.push('source:catalog-exit-values');
  if (!sourceBindings.mailHintStarClip.startsWith('polygon(')) failures.push('source:mail-hint-star-silhouette');
  if (!sourceBindings.rewardTextClip.startsWith('polygon(')) failures.push('source:reward-text-silhouette');
  if (sourceBindings.mailWave1Scale !== '0.8' || sourceBindings.mailWave2Scale !== '0.8') failures.push('source:mail-hint-wave-scale');
  if (sourceBindings.mailWave2Animation !== 'tarotMailHintWave2') failures.push('runtime:mail-hint-wave2-animation');
  if (sourceBindings.coverTitleAlphaStart !== '0' || sourceBindings.coverTitleAlphaEnd !== '1') failures.push('source:cover-title-alpha');
  if (sourceBindings.coverLeftTabAnimation !== 'tarotCoverLeftTab') failures.push('runtime:cover-left-tab-animation');
  if (!sourceBindings.coverTopTabAnimation.includes('tarotCoverTopTab')) failures.push('runtime:cover-top-tab-animation');
  if (!sourceBindings.coverShortcutHintAnimation.includes('tarotCoverShortcut')) failures.push('runtime:cover-shortcut-hint-animation');
  if (!sourceBindings.errorButtonAnimation.startsWith('tarotErrorButton, tarotErrorIconActive')) failures.push('runtime:error-button-animation');
  if (sourceBindings.errorButtonDelay !== '2.266667s' || sourceBindings.errorButtonDuration !== '1.316666s') failures.push('source:error-button-window');
  if (sourceBindings.errorScanEnd !== '0.54' || !sourceBindings.errorTimingValues.startsWith('2.266667/1.316666/')) failures.push('source:error-clip-binding');
  if (sourceBindings.errorFrameRgb !== '0.11894803 0.13186125 0.254717' || sourceBindings.errorGlitch !== '2.19/0.17') failures.push('source:error-frame-material');
  if (!sourceBindings.errorFrameAnimation.includes('tarotErrorFrameFade')) failures.push('runtime:error-frame-animation');
  if (!sourceBindings.errorIconAnimation.startsWith('tarotErrorIconActive')) failures.push('runtime:error-icon-activation');
  if (!sourceBindings.buttonEffPoints || sourceBindings.buttonEffPoints.endsWith('/')) failures.push('source:button-eff-final-point');
  if (sourceBindings.errorOpenBinding !== '0s/12.016666s/1') failures.push('source:error-open-activation');
  if (sourceBindings.effPanelRgb !== '1 1 1/1 1 1/1 1 1/1 1 1/1 1 1') failures.push('source:eff-panel-rgb');
  if (!sourceBindings.bottomBarAnimation.startsWith('tarotButtonReveal, tarotHomeBottomBarExit') || !sourceBindings.bottomBarAnimation.includes('0.5s')) failures.push('runtime:bottom-bar-animation');
  if (sourceBindings.bottomBarDelay !== '0.5s' || sourceBindings.bottomBarDuration !== '0.05s') failures.push('source:bottom-bar-entrance');
  if (sourceBindings.bottomHintBindings.bgScale !== '0.06671286/1') failures.push('source:bottom-hint-bg-scale');
  if (sourceBindings.bottomHintBindings.multiScale !== '0.06671286/1/1') failures.push('source:bottom-hint-multi-bg-scale');
  if (sourceBindings.bottomHintBindings.alphaWindows !== '0.016667s/0.166666s|0.166667s/0.316666s|0.333333s/0.25s|0.083333s/0.533334s') failures.push('source:bottom-hint-alpha-windows');
  if (!/0?\.06671286/.test(sourceBindings.bottomHintBindings.scaleKeyframes)) failures.push('runtime:bottom-hint-scale-keyframes');
  if (!sourceBindings.bottomHintBindings.hintAnimation.includes('tarotBottomHintReveal') || !sourceBindings.bottomHintBindings.bgAnimation.includes('tarotBottomHintBgScale')) failures.push('runtime:bottom-hint-animation');
  if (sourceBindings.bottomHintBindings.rotationDuration !== '0.833333s' || !sourceBindings.bottomHintBindings.rotationKeyframes.includes('-360deg')) failures.push('source:waiting-loop-rotation');
  if (!sourceBindings.bottomHintBindings.ringAnimation.includes('tarotWaitingRing') || !sourceBindings.bottomHintBindings.lightAnimation.includes('tarotWaitingLight')) failures.push('runtime:waiting-loop-animation');
  if (sourceBindings.bottomHintBindings.buttonStateRgb !== '1 1 1|0.35555357 0.5172652 0.8867924|0.036489844 0.06850811 0.18867922|1 1 1|1 1 1') failures.push('source:button-state-rgb');
  if (sourceBindings.bottomHintBindings.buttonStateAlpha !== '0.16470589|0.16470589') failures.push('source:button-state-alpha');
  if (sourceBindings.bottomHintBindings.buttonStateActive !== '0|1|1|1|0') failures.push('source:button-state-active');
  if (sourceBindings.bottomHintBindings.buttonStateDuration !== '0.333333s') failures.push('source:button-state-duration');
  if (sourceBindings.bottomHintBindings.buttonStatePointCount !== 5 || sourceBindings.bottomHintBindings.buttonStatePoint4 !== '0.40108052') failures.push('source:button-state-pulse');
  if (sourceBindings.bottomHintBindings.signDuration !== '3.166667s' || sourceBindings.bottomHintBindings.signWidth !== '0px/800px') failures.push('source:sign-longpress-size');
  if (sourceBindings.bottomHintBindings.signAlpha !== '0.0000%/10.5263%/0.64705884') failures.push('source:sign-longpress-alpha');
  if (sourceBindings.bottomHintBindings.signPulse !== '4/80') failures.push('source:sign-longpress-pulse');
  if (sourceBindings.bottomHintBindings.outlineBindings !== '5/true/true') failures.push('source:official-outline-clip-paths');
  if (!sourceBindings.bottomHintBindings.outlineKeyframes.includes('--sign-longpress-pulse-2')) failures.push('runtime:sign-pulse-keyframes');
  if (sourceBindings.bottomHintBindings.closeIconBindings !== 'true/true/true/true') failures.push('source:official-close-icon-outline');
  if (sourceBindings.bottomHintBindings.pageBackgroundBindings !== '4/3') failures.push('source:official-page-backgrounds');
  if (sourceBindings.bottomHintBindings.catalogMaskBindings !== '2/true') failures.push('source:official-catalog-masks');
  if (sourceBindings.bottomHintBindings.confirmBindings !== '3/true') failures.push('source:official-confirm-decoration');
  if (sourceBindings.bottomHintBindings.floatingBindings !== 'true/true') failures.push('source:official-floating-book-decoration');
  if (sourceBindings.bottomHintBindings.signDecorationBindings !== '3/3') failures.push('source:official-sign-decorations');
  if (sourceBindings.bottomHintBindings.errorDecorationBindings !== '4/true') failures.push('source:official-error-decorations');
  if (sourceBindings.bottomHintBindings.buttonDecorationBindings !== '4/3') failures.push('source:official-button-decorations');
  if (sourceBindings.bottomHintBindings.signLineBindings !== '8/5') failures.push('source:official-sign-line-layers');
  if (sourceBindings.bottomHintBindings.finalSpriteBindings !== '7/4') failures.push('source:official-final-sprite-layers');
  if (sourceBindings.bottomHintBindings.dialogTimingBindings !== '0s/0.333333s/1/0.5s/0.666667s/0.333333/0.5/0.666667') failures.push('source:official-dialog-timing-layers');
  if (sourceBindings.bottomHintBindings.autogenBindings !== '13/6') failures.push('source:official-autogen-sprites');
  if (sourceBindings.bottomHintBindings.tabBindings !== '22/6') failures.push('source:official-tab-reward-sprites');
  if (sourceBindings.bottomHintBindings.mimiBindings !== '12/5') failures.push('source:official-mimitalk-sprites');
  if (!String(sourceBindings.bottomHintBindings.mimiTimingBindings).startsWith('1.566667s/0.416666s/0/1.366667s/1.133333s/0.25s/0.833333s/1.566667/0.416666/0.25/0.833333/0.233333s/0.166667s/0s/0.416667s/1.433333s/4.833334s')) failures.push('source:official-mimitalk-timings');
  if (!String(sourceBindings.bottomHintBindings.mimiTimingBindings).endsWith('ok/ok/ok/ok/ok/ok')) failures.push('runtime:official-mimitalk-guide-voice-assistant-layers');
  if (sourceBindings.bottomHintBindings.timelineBindings !== '10/8/8') failures.push('source:official-timeline-info-reveals');
  if (sourceBindings.bottomHintBindings.chapterSpriteBindings !== '78/13/12') failures.push('source:official-chapter-card-variants');
  if (!sourceBindings.screenCardBindings.startsWith('10/true/true/')) failures.push('source:screen-frame-and-mail-sprite-bindings');
  if (!sourceBindings.screenCardBindings.endsWith('/3')) failures.push('runtime:star-panel-card-sprite-layers');
  const uiLayerBindings = String(sourceBindings.uiLayerBindings || '').split('/').map(Number);
  if (uiLayerBindings[0] !== 26 || uiLayerBindings[1] < 16 || uiLayerBindings[1] !== uiLayerBindings[2]) failures.push('source:official-ui-layer-vector-bindings');
  if (sourceBindings.bottomHintBindings.cardOutlineBindings !== '10/4/true') failures.push('source:official-card-outlines');
  if (sourceBindings.bottomHintBindings.entranceSpriteBindings !== '37/1/6/6') failures.push('source:official-entrance-and-icon-variants');
  if (!/^(BtnBook|BtnStar|BtnPaper|BtnWiki|BtnMail|BtnMem):ok(?:\|(BtnBook|BtnStar|BtnPaper|BtnWiki|BtnMail|BtnMem):ok){5}$/.test(sourceBindings.bottomHintBindings.navGlyphBindings)) failures.push('source:six-official-nav-glyphs');
  if (sourceBindings.bottomHintBindings.pagePattern !== '0.833333s/0|1.133333s/0|0s/0') failures.push('source:page-frame-pattern');
  if (sourceBindings.bottomBarExitValues !== '1,0,1') failures.push('source:bottom-bar-exit');
  if (sourceBindings.bottomBarGeometryBindings !== '-9/26/-68') failures.push('source:bottom-bar-geometry');
  if (sourceBindings.homeExitAllValues !== '1/0/0px/-38.232px/1/0.4605627/0px/-44.444447px/1/0.11430234') failures.push('source:home-exit-all-values');
  if (sourceBindings.entranceScaleVariables !== '0s/0.85s/2.5s/0.85s/0.5s/0.85s/0s/1s/2.5s/0.85s/0.5s/0.85s') failures.push('source:home-entrance-scale-windows');
  const scaleBlocks = sourceBindings.entranceScaleKeyframes.split('|');
  if (scaleBlocks.length !== 5 || scaleBlocks.slice(0, 3).some((text) => !text.includes('scale: 1.2 1.2') || !text.includes('scale: 1 1')) || !scaleBlocks[3].includes('scale: 1 1') || !scaleBlocks[4].includes('scale: 1.2 1.2')) failures.push('source:home-entrance-scale-keyframes');
  const scaleAnimations = sourceBindings.entranceScaleAnimations.split('/');
  if (scaleAnimations.length !== 4 || !scaleAnimations[1].includes('tarotHomeEntranceFirstTimeBgScale') || !scaleAnimations[1].includes('tarotHomeEntranceFirstTimeDesktopBgScale') || !scaleAnimations[2].includes('tarotHomeEntranceReturningBgScale') || !scaleAnimations[3].includes('tarotHomeEntranceResumeBgScale')) failures.push('runtime:home-entrance-scale-animations');
  if (!sourceBindings.homeExitAllScaleKeyframes.includes('scale: 1.1 1.1') || !sourceBindings.homeExitAllScaleKeyframes.includes('scale: 1.2 1.2')) failures.push('source:home-exit-all-scale-keyframes');
  if (!sourceBindings.homeExitAllAnimation.includes('tarotHomeExitAll|') || !sourceBindings.homeExitAllAnimation.includes('tarotHomeExitRewardX')) failures.push('runtime:home-exit-all-animation');
  if (!sourceBindings.bookletLeftSpineKeyframes.includes('@keyframes tarotBookletDirectLeftSpine')) failures.push('source:booklet-direct-left-spine');
  if (!sourceBindings.bookletDirectPageScaleKeyframes.includes('0.000000% { transform: scale(0.99); }')) failures.push('source:booklet-direct-page-scale-keyframes');
  if (!sourceBindings.bookletDirectPageScaleAnimation.includes('tarotBookletDirectPageScale')) failures.push('runtime:booklet-direct-page-scale');
  if (!sourceBindings.bookletInitialPageScaleKeyframes.includes('0.000000% { transform: scale(0.99); }')) failures.push('source:booklet-initial-page-scale-keyframes');
  if (!sourceBindings.bookletInitialPageScaleAnimation.includes('tarotBookletInitialPageScale')) failures.push('runtime:booklet-initial-page-scale');
  if (sourceBindings.bookletFunctionWidth !== '-64px/-32.323578px/0px' || !sourceBindings.bookletFunctionAnimation.includes('tarotBookletFunctionPanel')) failures.push('source:booklet-function-panel');
  if (!sourceBindings.storyProgress.startsWith('tarotStoryPanelProgress|1.68333s|1.81667s')) failures.push('source:story-progress-alpha');
  if (sourceBindings.bookletLeftSpineAnimation !== 'tarotBookletMainEnabled, tarotBookletDirectLeftSpine') failures.push('runtime:booklet-direct-left-spine-computed');
  if (imageRequests.length) failures.push('network:' + imageRequests.join(','));
  if (mobileOverflow.docScrollWidth > mobileOverflow.innerWidth + 1 || mobileOverflow.bodyScrollWidth > mobileOverflow.innerWidth + 1) failures.push('layout:mobile-horizontal-overflow');
  console.log(JSON.stringify({
    views: snapshots.map((s) => s.name),
    requests: requests.length,
    sourceBindings,
    mobileOverflow,
    homeLayout: { desktop: desktopFit, mobile: mobileHomeLayout },
    failures,
  }, null, 2));
  ws.close();
  cleanup();
  if (failures.length) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
