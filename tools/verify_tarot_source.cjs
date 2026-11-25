#!/usr/bin/env node
/* Source-chain gate for the unpacked TarotBook UI. Checks that the exported CSS
   data still covers the official prefab graph and animation bindings; it does
   not inspect screenshots or compare rendered pixels. */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'web/codex-source.json');
const cssPath = path.join(__dirname, '..', 'web/codex.css');
const jsPath = path.join(__dirname, '..', 'web/codex.js');
const htmlPath = path.join(__dirname, '..', 'web/codex.html');
const capturePath = path.join(__dirname, 'capture_screenshots.cjs');
const exporterPath = path.join(__dirname, 'export_tarot_source.cjs');
const generatedBridgePath = path.join(__dirname, '..', 'web/codex-source.js');
const fontPath = path.join(__dirname, '..', 'web/assets/fonts/RPG_CN.ttf');
const fontNoticePath = path.join(__dirname, '..', 'web/assets/fonts/NOTICE.md');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const capture = fs.readFileSync(capturePath, 'utf8');
const exporter = fs.readFileSync(exporterPath, 'utf8');
const bridgeTemplate = fs.readFileSync(path.join(__dirname, '..', 'web/codex-source.js.template'), 'utf8');
const generatedBridge = fs.readFileSync(generatedBridgePath, 'utf8');
const fontBytes = fs.readFileSync(fontPath);
const fontNotice = fs.readFileSync(fontNoticePath, 'utf8');
const typographyPath = path.join(__dirname, 'tarot_typography.json');
const typographySource = JSON.parse(fs.readFileSync(typographyPath, 'utf8'));
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };

expect(generatedBridge === bridgeTemplate.replace('__TAROT_SOURCE__', JSON.stringify(data)), 'web/codex-source.js is stale; rerun tools/export_tarot_source.cjs');
expect(fontBytes.length === 11810340, `RPG_CN.ttf size changed: ${fontBytes.length}`);
expect(crypto.createHash('sha256').update(fontBytes).digest('hex') === '12a6bf115b2632e3c9abfa4a036fc4d4ef6e749afb77df3611a0f213209d3bfb', 'RPG_CN.ttf SHA-256 mismatch');
expect(fontNotice.includes('not this font') && fontNotice.includes('a60ee0514450445babc56c0457b749b9c1889690217c4fddb05635b214515f10') && fontNotice.includes('12a6bf115b2632e3c9abfa4a036fc4d4ef6e749afb77df3611a0f213209d3bfb'), 'font notice must preserve the third-party license boundary, source hash, and rebuilt hash');
expect(css.includes('@font-face') && css.includes('src: url("/assets/fonts/RPG_CN.ttf") format("truetype")') && css.includes('--sans: "RPG CN"') && css.includes('--serif: "RPG CN"'), 'official RPG_CN font must be loaded and selected by both UI font stacks');
expect(JSON.stringify(data.typography) === JSON.stringify(typographySource), 'web/codex-source.json typography is stale; rerun tools/export_tarot_source.cjs');
const typographyStyles = data.typography?.styles || [];
const textStyle = (name, key) => typographyStyles.find((style) => style.name === name && style.textKey === key);
const titleText = textStyle('TitleText', '如我所书');
const hintText = textStyle('HintText', 'DevUI_TipContent');
const countText = textStyle('CountText', '主界面');
const statusText = textStyle('TitleText', 'DevUI_TimeTitle');
const captionText = textStyle('Text', '前往查看');
expect(typographyStyles.length >= 12 && data.typography?.generatedFrom?.localizedTextScript === '2163569534093517469', 'LocalizedText extraction must cover the readable TarotBook text components');
expect(titleText?.fontSize === 16 && titleText?.alignmentName === 'upper-center' && titleText?.lineSpacing === 1, 'TitleText/如我所书 style must retain source size, alignment and line spacing');
expect(titleText?.color?.rgba?.[0] === 0.990566 && titleText?.color?.rgba?.[1] === 0.875436 && titleText?.color?.rgba?.[2] === 0.630785 && titleText?.color?.rgba?.[3] === 0.901961, 'TitleText/如我所书 source canvas color changed');
expect(hintText?.fontSize === 22 && countText?.fontSize === 20 && Math.abs(countText?.color?.rgba?.[3] - 0.451) < 0.001 && statusText?.fontSize === 24 && captionText?.fontSize === 20, 'key TarotBook LocalizedText sizes/colors must remain source-derived');
expect(exporter.includes("const TYPOGRAPHY = path.join(__dirname, 'tarot_typography.json')") && exporter.includes('typography: loadTypography()'), 'exporter must embed validated LocalizedText source data');
expect(bridgeTemplate.includes('function tarotTypography()') && js.includes('applyTarotTypography()') && js.includes('--tarot-${prefix}-size') && css.includes('var(--tarot-title-size') && css.includes('var(--tarot-hint-size') && css.includes('var(--tarot-count-size'), 'LocalizedText styles must reach runtime CSS variables');

const homeVariantSprites = {
  BtnStar: ['buttonStar2'],
  BtnBook: ['buttonBook1', 'book2', 'buttonBook4', 'buttonBook5', 'buttonBook6'],
  BtnMail: ['buttonMail2', 'buttonMail3', 'buttonMail4'],
  BtnMem: ['buttonMem2', 'buttonMem3', 'buttonMem4', 'buttonMem5', 'buttonMem6'],
  BtnPaper: ['buttonPaper2', 'buttonPaper3', 'buttonPaper4'],
  BtnWiki: ['buttonWiki2'],
};
const homeVariantsBody = bridgeTemplate.match(/function tarotHomeIconVariants\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
expect(homeVariantsBody, 'missing tarotHomeIconVariants bridge');
for (const [button, keys] of Object.entries(homeVariantSprites)) {
  const expectedArray = keys.map((key) => `tarotVector('${key}')`).join(', ');
  expect(homeVariantsBody.includes(`${button}: [${expectedArray}]`), `${button} must preserve all official icon variants in source order`);
  for (const key of keys) {
    expect(data.vectors?.[key]?.startsWith('polygon('), `homepage variant ${button}/${key} must export an official sprite polygon`);
  }
}
expect(exporter.includes("book2: silhouettePath('TarotBookMainIconBook2.png'"), 'book2 variant must stay tied to TarotBookMainIconBook2.png');

const vectorKeys = Object.keys(data.vectors || {});
const referencedVectors = new Set([...bridgeTemplate.matchAll(/tarotVector\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]));
for (const key of vectorKeys) {
  if (/^chapter\d+/.test(key)) referencedVectors.add(key);
}
const missingVectorRefs = [...referencedVectors].filter((key) => !Object.hasOwn(data.vectors || {}, key));
expect(missingVectorRefs.length === 0, `bridge references missing vectors: ${missingVectorRefs.join(', ')}`);
for (const key of referencedVectors) {
  expect(data.vectors?.[key]?.startsWith('polygon('), `referenced vector ${key} must be a non-empty source polygon`);
}

const cardAliasTarget = (key) => {
  const match = key.match(/^card(07|09|10|1)(Banner|Circle|BackCircle|Deco|Symbol|SpSymbol|SymbolActive|SpSymbolActive|Character)$/);
  if (!match) return null;
  const numeral = match[1] === '1' ? '01' : match[1];
  const layer = match[2][0].toLowerCase() + match[2].slice(1);
  return `chapter${numeral}${layer}`;
};
const aliasVectors = [];
const unexpectedUnusedVectors = [];
for (const key of vectorKeys.filter((name) => !referencedVectors.has(name))) {
  const target = cardAliasTarget(key);
  if (target && data.vectors[key] === data.vectors?.[target]) {
    aliasVectors.push({ key, target });
  } else {
    unexpectedUnusedVectors.push(key);
  }
}
expect(unexpectedUnusedVectors.length === 0, `unexpected unused vectors: ${unexpectedUnusedVectors.join(', ')}`);
expect(aliasVectors.length === 33, `expected 33 exact card sprite aliases, found ${aliasVectors.length}`);
expect(data.colors?.entranceGlow?.css, 'entranceGlow must preserve its official sampled material color');
expect(bridgeTemplate.includes("backgroundGlow: tarotVector('entranceGlow')"), 'entranceGlow silhouette must reach the entry vector bridge');
expect(css.includes('var(--entry-sprite-background-glow') && js.includes('tarotEntranceVectors'), 'entranceGlow silhouette must drive the CSS entry glow');

const h = data.layout.hierarchy;
const panelCount = Object.keys(h.panels || {}).length;
expect(h.root.includes('Outside'), 'missing root/Outside');
expect(h.outside.includes('PageInfo') && h.outside.includes('RewardPanel'), 'missing Outside panels');
expect(h.functionList.length === 6, 'FunctionList must have six official buttons');
for (const name of ['BtnBook', 'BtnStar', 'BtnPaper', 'BtnWiki', 'BtnMem', 'BtnMail']) {
  expect(h.functionList.some((n) => n.name === name), `missing ${name}`);
  expect(js.includes(name), `runtime missing ${name}`);
}
expect(h.frame.some((n) => n.name === 'StarPatternBg'), 'missing StarPatternBg');
expect(h.frame.some((n) => n.name === 'StarMask'), 'missing StarMask');
expect(h.starPanel.some((n) => n.name === 'StarOutcircle'), 'missing StarOutcircle');
expect(h.starRings?.length >= 9, 'missing official star ring transforms');
expect(h.starRings?.find((n) => n.name === 'InnerCircle1')?.scale[0] === 1.01, 'InnerCircle1 source scale must be preserved');
const mainFade = data.animations.find((clip) => clip.file === 'TarotBookRealMainPage_FadeIn.anim');
expect(mainFade?.curves.some((c) => c.path === 'Outside/PageInfo' && c.attribute === 'm_AnchoredPosition.x'), 'missing PageInfo animation curve');
expect(mainFade?.curves.some((c) => c.path.endsWith('/BtnMail') && c.attribute === 'm_Alpha'), 'missing BtnMail animation curve');
const iconLoop = data.animations.find((clip) => clip.file === 'TarotBookRealMainPageIcon_Loop1.anim');
expect(iconLoop?.curves.some((c) => c.path === 'Icon1' && c.attribute === 'm_AnchoredPosition.y'), 'missing Icon1 loop curve');
expect(css.includes('--icon-drift') && css.includes('--icon-duration'), 'runtime CSS must use source-derived icon loop timing');
expect(js.includes('tarotIconTimings') && js.includes('--icon-drift'), 'runtime must bind source-derived icon loop timing');
expect(js.includes('--icon-anchor-x:') && js.includes('--icon-anchor-y:') && css.includes('calc(50% + var(--icon-anchor-x') && css.includes('calc(22px + var(--icon-anchor-y'), 'icon loop anchor origins must drive the state/error ring position');
for (const clip of ['TarotBookRealMainPageIcon_Loop2.anim', 'TarotBookRealMainPageIcon_Loop3.anim', 'TarotBookRealMainPageIcon_Loop4.anim', 'TarotBookRealMainPageIcon_Loop5.anim', 'TarotBookRealMainPageIcon_Loop6.anim']) {
  expect(data.animations.some((item) => item.file === clip), `missing decorative loop clip ${clip}`);
}
expect(bridgeTemplate.includes('TAROT_DECORATIVE_LOOPS') && bridgeTemplate.includes('TarotBookMainIconStar/Deco1') && bridgeTemplate.includes('tarotDecorativeLoopTimings'), 'decorative loop clips must be bridged with full prefab paths');
expect(js.includes('decorativeLoops.BtnStar') && js.includes('decorativeLoops.BtnMem') && js.includes('decorativeLoops.BtnPaper') && js.includes('decorativeLoops.BtnMail'), 'runtime must bind decorative loops by button');
expect(css.includes('tarotDecoSpin') && css.includes('tarotDecoMemSwing') && css.includes('tarotDecoPaperMove') && css.includes('tarotDecoMailScale') && css.includes('tarotDecoMailDrift'), 'decorative loop curves must reach CSS');
expect(js.includes('home-glyph-deco'), 'decorative loop target must exist in rendered glyph');
expect(js.includes('--deco-rotate-${index}-at') && css.includes('var(--deco-rotate-1-at'), 'decorative rotation keyframes must use literal source-derived percentages');
expect(css.includes('var(--deco-x-1-at') && css.includes('var(--deco-alpha-2-at') && css.includes('var(--deco-scale-4-at'), 'paper/mail decorative keyframes must consume source-derived variables');
expect(css.includes('var(--deco-drift-6') && css.includes('var(--deco-scale-5-at') && js.includes('--deco-drift-${index}-at'), 'mail drift/scale keyframes must consume all source points');
expect(css.includes('var(--home-screen-duration') && css.includes('var(--home-screen-delay') && js.includes("['home-screen', homeFadeTiming.screen]"), 'screen fade must consume source timing');
expect(css.includes('var(--reveal-duration') && /@keyframes tarotButtonReveal\s*\{\s*0%\s*\{\s*opacity:\s*0;\s*\}\s*100%\s*\{\s*opacity:\s*1/.test(css), 'button reveal must use full source-derived alpha window');
expect(css.includes('--source-x') && css.includes('--source-y'), 'missing source-derived button geometry');
for (const token of ['--source-origin-x', '--source-origin-y', '--source-book-y', '--source-close-y']) {
  expect(css.includes(token), `missing source-derived geometry token ${token}`);
}
expect(js.includes("'--source-title-delay'"), 'missing source-derived title timing token');
expect(js.includes('tarotSubtitleTiming') && js.includes('tarotHomeGeometry'), 'runtime missing source-derived panel/title bindings');
expect(bridgeTemplate.includes('tarotHomeFadeTiming') && bridgeTemplate.includes('Bg/ScreenBg') && bridgeTemplate.includes('Outside/BtnClose') && bridgeTemplate.includes('Outside/RewardPanel'), 'homepage fade curves must be bridged');
expect(css.includes('var(--home-close-alpha-delay') && js.includes("['home-close-alpha', homeFadeTiming.close]"), 'homepage close fade must consume source timing');
expect(css.includes('var(--home-title-x-mid-value') && css.includes('var(--home-reward-alpha-duration') && js.includes('homeFadeCurves.pageInfoX') && js.includes('homeFadeCurves.rewardAlpha'), 'homepage title/reward curves must drive CSS keyframes');
expect(css.includes('var(--home-reward-alpha-point-4-at') && js.includes("prefix === 'home-reward-alpha'"), 'all reward alpha keyframes must be source-derived');
expect(css.includes('var(--home-title-x-mid-at') && css.includes('var(--home-reward-x-mid-at'), 'homepage title/reward position keyframes must use source percentages');
expect(data.animations.length === 76 && data.animations.some((clip) => clip.file === 'TarotBookRealMainPage_FadeIn_Error.anim') && data.animations.some((clip) => clip.file === 'TarotBookBookletTopBtn_FadeIn.anim'), 'all official TarotBook clips plus hint, waiting, selectable-state and long-press clips must be exported');
expect(data.animations.some((clip) => clip.file === 'TarotBookMailHintLoop.anim' && clip.curves.some((c) => c.path === 'DotHint' && c.collection === 'm_EulerCurves')), 'mail hint loop rotation must be exported');
expect(data.animations.some((clip) => clip.file === 'TarotBookBottomGoToHintFadeIn.anim' && clip.curves.some((c) => c.path === 'HintPanel/Bg' && c.collection === 'm_ScaleCurves')) && data.animations.some((clip) => clip.file === 'TarotBookWaitingLoop.anim' && clip.curves.some((c) => c.path === 'Ring/RingRotate' && c.collection === 'm_EulerCurves')), 'bottom hint and waiting-loop curves must be exported');
expect(bridgeTemplate.includes('function tarotBottomHintTiming') && bridgeTemplate.includes('function tarotWaitingLoopTiming') && js.includes('bottom-hint-bg-scale') && css.includes('tarotBottomHintBgScale') && css.includes('tarotWaitingRing'), 'bottom hint and waiting-loop curves must drive generated CSS animations');
for (const state of ['Normal', 'Disabled', 'Highlighted', 'Pressed', 'Selected']) {
  expect(data.animations.some((clip) => clip.file === `${state}.anim`), `missing official button state ${state}`);
}
expect(bridgeTemplate.includes('function tarotButtonStates') && js.includes('button-state-${state.toLowerCase()}-rgb') && css.includes('button-state-highlighted-rgb') && css.includes('button-state-pressed-rgb') && css.includes('home-archive-state') && css.includes('tarotButtonStatePulse'), 'official selectable-state curves must drive homepage button states');
expect(data.animations.some((clip) => clip.file === 'TarotBookSignLongPressNew.anim' && clip.curves.some((c) => c.attribute === 'm_SizeDelta.x')) && bridgeTemplate.includes('function tarotSignLongPress') && js.includes('sign-longpress-width-end') && css.includes('tarotSignLongPressWidth'), 'official long-press curves must drive the signing overlay');
expect(bridgeTemplate.includes('function tarotPageFramePatternTiming') && js.includes('page-pattern-${flow}-off') && css.includes('page-frame-pattern') && css.includes('tarotPageFramePatternOff'), 'official PageFrame Pattern alpha curves must drive the booklet page detail');
expect((bridgeTemplate.includes("screenScale: tarotCurveValues(clip, 'Bg', 'm_Scale')") || bridgeTemplate.includes("screenScale: (tarotCurve(clip, 'Bg', '')?.keys ?? [])")) && css.includes('tarotHomeScale') && js.includes('--home-scale-mid-value${index'), 'homepage background scale must consume source transform curve');
expect(bridgeTemplate.includes("screenScale: (tarotCurve(clip, 'Bg', '')?.keys ?? [])") && bridgeTemplate.includes("desktopScale: (tarotCurve(clip, 'Root/PanelContent/DesktopPanel/Bg', '')?.keys ?? [])"), 'all four homepage entrance variants must export raw Bg/DesktopPanel scale vectors');
expect(js.includes('entranceScaleKeyframes') && js.includes('tarotHomeEntrance${camelName}${suffix}') && css.includes('tarotHomeEntranceFirstTimeBgScale') && css.includes('tarotHomeEntranceReturningDesktopBgScale') && css.includes('tarotHomeEntranceResumeBgScale'), 'per-variant entrance scale curves must drive generated CSS keyframes');
for (const clip of ['TBBookletCoverPageContent_FadeIn.anim', 'TarotBookStarPanelPage_FadeIn.anim', 'TarotBookBookletBtn_FadeIn.anim', 'TarotBookStoryStarShow.anim']) {
  expect(data.animations.some((item) => item.file === clip), `missing animation clip ${clip}`);
}
for (const token of ["['entry', coverTiming?.root]", "['entry-title', coverTiming?.pageInfo]", "['star', starTiming?.star]", "['story-flash', storyStarTiming]", "['booklet-btn', bookletBtnTiming]"]) {
  expect(js.includes(token), `missing runtime timing token ${token}`);
}
expect(css.includes('tarotEntryBookRise') && css.includes('tarotStoryStarFlash'), 'cover/star timings must reach CSS');
expect(css.includes('tarotStarPanelReveal') && css.includes('tarotStoryStarReveal') && js.includes('--path-index'), 'path star timings must reach CSS');
expect(bridgeTemplate.includes('tarotStarPanelExitTimings') && js.includes('__amphoreusStarExitTimings') && js.includes('--star-exit-${part}-start'), 'path-page FadeOut curves must be bridged to runtime');
expect(css.includes('tarotStarPanelExitScale') && css.includes('var(--star-exit-scale-end') && css.includes('var(--star-exit-pageInfo-end') && js.includes('classList.add(\'exiting\')'), 'path-page exit curves must drive CSS and view state');
expect(js.includes('tarotStarRings') && css.includes('--ring-Circle1-x') && css.includes('--ring-InnerCircle1-sx'), 'star ring transforms must reach runtime CSS');
expect(data.vectors?.starItemCircle, 'missing source-derived star item circle polygon');
expect(data.materials?.starCircle1?.css && data.materials?.starCircle6?.css, 'missing star panel circle material colors');
expect(data.colors?.starItemCircle?.css, 'missing official star item circle color');
expect(bridgeTemplate.includes('tarotStarPanelVectors') && js.includes('tarotStarPanelVectors') && js.includes('--star-panel-${key}'), 'star panel vector must reach runtime CSS');
expect(css.includes('.home-book-source-circle') && css.includes('var(--star-panel-itemCircle') && css.includes('var(--material-starCircle6'), 'star panel sprite/material evidence must drive homepage CSS');
const screenCardKeys = ['mainScreenFrame', 'mainScreenFrame2', 'subScreenFrame', 'starPanelCardBack', 'starPanelCardFront', 'starPanelCardCenterBack', 'starPanelCardCenterItem', 'starPanelCardCenterSun', 'starPanelCardIcon', 'cardUpDotBg', 'cardUpHalfCircle', 'cardUpPattern', 'catalog13CardMask', 'switchMailIcon', 'switchMailOutline2', 'switchMailOutline3'];
expect(screenCardKeys.every((key) => data.vectors?.[key]?.startsWith('polygon(')), 'screen frame and star-panel card silhouettes must all be source-derived polygons');
expect(bridgeTemplate.includes("frame: tarotVector('mainScreenFrame')") && bridgeTemplate.includes("cardCenterSun: tarotVector('starPanelCardCenterSun')") && bridgeTemplate.includes("switchMailOutline3: tarotVector('switchMailOutline3')") && js.includes('--star-panel-${key}'), 'screen frame/card sprite accessors must reach runtime CSS');
expect(css.includes('.home-book-source-frame') && css.includes('var(--star-panel-frame,') && css.includes('var(--star-panel-sub-frame') && css.includes('.hint-switch-mail') && css.includes('var(--star-panel-switch-mail-icon'), 'official screen frames and mail switch icon must drive homepage CSS');
expect(css.includes('.path-card-source-frame') && css.includes('.path-card-source-center') && css.includes('.path-card-source-icon') && css.includes('var(--star-panel-card-back') && css.includes('var(--star-panel-card-front') && css.includes('var(--star-panel-card-center-back') && css.includes('var(--star-panel-card-center-item') && css.includes('var(--star-panel-card-center-sun'), 'official star-panel card silhouettes must drive path cards');
expect(js.includes('class="path-card-source-frame"') && html.includes('class="home-book-source-frame"') && html.includes('class="hint-switch-mail"'), 'new source-backed layers must exist in rendered markup');
const catalogClip = data.animations.find((clip) => clip.file === 'TBBookletCatalogContent_FadeIn.anim');
expect(catalogClip?.curves.some((c) => c.path === 'Root' && c.attribute === 'm_Alpha'), 'missing catalog FadeIn alpha curve');
const bookletClip = data.animations.find((clip) => clip.file === 'TarotBookBookletPage_FadeIn.anim');
expect(bookletClip?.curves.some((c) => c.path.endsWith('/BookPage') && c.attribute === 'm_Alpha'), 'missing booklet page alpha curve');
const geometry = data.layout.hierarchy.geometry || {};
const saneRect = (rect) => {
  if (!rect) return false;
  const nums = [...(rect.size || []), ...(rect.anchors || []), ...(rect.pivot || []), ...(rect.anchoredPosition || [])];
  return nums.every((value) => Number.isFinite(value) && Math.abs(value) <= 8192);
};
expect(Object.values(geometry).every(saneRect), 'RectTransform geometry contains implausible legacy values');
expect(geometry.DesktopPanel?.anchors?.join(',') === '0.07,0.07,0.93,0.93', 'DesktopPanel must use the verified 7%-93% anchors');
expect(geometry.BtnClose?.size?.join(',') === '100,100' && geometry.BtnClose?.anchors?.join(',') === '1,1,1,1', 'BtnClose must use the verified top-right rect');
expect(geometry.RewardPanel?.size?.join(',') === '178,400', 'RewardPanel must use the verified size');
const buttonGrid = data.layout.hierarchy.functionList.map((item) => `${item.name}:${item.x},${item.y}`).join('|');
expect(buttonGrid === 'BtnBook:98,27|BtnStar:0,27|BtnMem:-98,27|BtnPaper:98,-27|BtnWiki:0,-27|BtnMail:-98,-27', 'official six-button grid must stay unchanged');
expect(css.includes('tarotCatalogEnter') && css.includes('tarotBookletPageEnter'), 'catalog/booklet CSS must use source-derived timing');
expect(bridgeTemplate.includes('tarotCurveValues') && bridgeTemplate.includes('rootYValues'), 'catalog root Y keyframes must be exported');
expect(css.includes('var(--catalog-root-y-start') && css.includes('var(--catalog-root-y-mid-at') && js.includes('--catalog-root-y-'), 'catalog CSS must consume source Y keyframes');
expect(css.includes('tarotCatalogPageInfo') && js.includes('--catalog-pageInfo-y-start') && js.includes('--catalog-pageInfoAlpha-start') && css.includes('var(--catalog-pageInfoAlpha-start'), 'catalog PageInfo curves must drive heading lift and alpha');
expect(bridgeTemplate.includes('closeAlpha: tarotCurveValues') && js.includes("'home-close-alpha'") && css.includes('tarotHomeCloseAlpha') && css.includes('var(--home-close-alpha-start'), 'homepage BtnClose alpha curve must drive the close button');
const scene = data.materials?.scene || {};
for (const key of ['sky', 'skyCloud', 'stone', 'glow']) {
  expect(scene[key]?.css, `missing ${key} material color`);
}
expect(js.includes('tarotSceneColors') && css.includes('--scene-skyCloud'), 'scene materials must reach runtime CSS');
expect(js.includes('tarotMaterialColors') && css.includes('--material-starLineWarm') && css.includes('--material-starLineGold'), 'star panel material colors must reach CSS');
expect(data.vectors?.buttonStar, 'missing source-derived button star polygon');
for (const key of ['catalogBgDeco', 'catalogItem', 'catalogCorner', 'catalogBgDeco13', 'catalogItem13', 'coverCenterDeco1', 'coverCenterDeco2', 'coverCloud', 'coverFire', 'coverPeople', 'mainRing', 'catalogTextDeco', 'catalogItemIcon']) {
  expect(data.vectors?.[key], `missing source-derived ${key} polygon`);
}
for (const key of ['buttonBook', 'buttonWiki', 'buttonPaper', 'buttonMem', 'buttonMail']) {
  expect(data.vectors?.[key], `missing source-derived ${key} polygon`);
}
for (const key of ['rewardButton', 'rewardTextBg', 'mailHintBg', 'mailHintDeco', 'mailHintStar']) {
  expect(data.vectors?.[key], `missing source-derived ${key} polygon`);
}
for (const key of ['rewardButton', 'rewardText', 'mailHintBg', 'mailHintDeco']) {
  expect(data.colors?.[key]?.css, `missing official sprite color ${key}`);
}
expect(bridgeTemplate.includes('tarotRewardVectors') && bridgeTemplate.includes('tarotMailHintTiming'), 'reward vectors and mail-hint timing must be bridged');
expect(js.includes('tarotRewardVectors') && js.includes('--reward-sprite-${key}') && css.includes('var(--reward-sprite-button'), 'reward sprite vectors must reach runtime CSS');
expect(js.includes('tarotMailHintTiming') && js.includes('--mail-hint-rotate-${index + 1}-at') && css.includes('tarotMailHintRotate') && css.includes('tarotMailHintWave'), 'mail hint curves must drive CSS animation');
expect(css.includes('var(--source-reward-y') && css.includes('var(--home-exit-all-reward-delay'), 'reward panel must consume source geometry and exit timing');
expect(js.includes('tarotVector') && js.includes('--source-star-path') && css.includes('var(--source-star-path'), 'source star polygon must reach runtime CSS');
expect(bridgeTemplate.includes('TAROT_BUTTON_ORDER') && bridgeTemplate.includes('m_AnchoredPosition.x') && bridgeTemplate.includes('m_AnchoredPosition.y') && js.includes('m_AnchoredPosition.y') && css.includes('var(--icon-drift-x'), 'official icon loop curves must map to buttons');
expect(data.animations.some((clip) => clip.file === 'TBBookletCoverPageContent_FadeOut.anim') && data.animations.some((clip) => clip.file === 'TBBookletCatalogContent_FadeOut.anim'), 'official fade-out clips must be exported');
expect(data.animations.some((clip) => clip.file === 'TarotBookBookletPageRefresh_FadeIn.anim') && data.animations.some((clip) => clip.file === 'TarotBookBookletPageRefresh_FadeOut.anim'), 'booklet refresh clips must be exported');
expect(bridgeTemplate.includes('tarotBookletRefreshTiming') && css.includes('var(--booklet-refresh-in-duration') && css.includes('booklet-refresh') && js.includes('showPage(true)'), 'booklet refresh timing must drive page switching');
expect(bridgeTemplate.includes('topTabAlpha') && bridgeTemplate.includes('pageInfoAlpha') && bridgeTemplate.includes('hint:'), 'all major fade-out curves must be exported');
expect(js.includes('--icon-rotate-start') && js.includes('--icon-scale-x-peak') && css.includes('rotate(var(--icon-rotate-peak') && js.includes('effStyle'), 'Loop1 rotation/scale and per-button Eff keyframes must reach CSS');
expect(bridgeTemplate.includes('tarotHomeExitTimings') && js.includes('showHomeWithExit') && css.includes('tarotHomeExitAll'), 'homepage FadeOut curves must drive view transitions');
expect(js.includes("v.classList.remove('exiting')") && js.includes("home.classList.add('exiting')"), 'homepage exit class must be applied then cleared');
expect(js.includes("home?.classList.toggle('exiting', isHomeExit)") && js.includes('if (!home || !isHomeExit) return show(\'home\');'), 'hidden homepage must not replay the FadeOutAll exit during navigation');

expect(/if \(S\.view !== 'cover'\) \{\s*openBookHome\(\);\s*return;\s*\}/.test(js), 'opening the book from any non-cover view must restore cover state before homepage');
expect(js.includes('function applyHomeEntranceVariant') && /setTimeout\(\(\) => \{[\s\S]*?applyHomeEntranceVariant\('returning'\);\s*show\('home'\);\s*\}, ms\)/.test(js), 'homepage returning variant must be applied after the official exit completes');
expect(bridgeTemplate.includes("shineValues: tarotCurveValues(clip, 'Bg/EffPanel/Shine', 'material._MainColor.a')") && css.includes('--entry-title-start') && js.includes('--cover-shine-start'), 'cover FadeIn curves must reach CSS');
expect(bridgeTemplate.includes("pageScale: tarotTiming(clip, 'Root/PanelContent/MainBookPanel/PagePanel/BookPage', 'm_Scale')") && bridgeTemplate.includes('initialIn:') && css.includes('tarotBookletInitialPageScale') && js.includes('amph-booklet-initial-page-scale-keyframes'), 'booklet page scale curve must reach CSS');
expect(css.includes('var(--booklet-functionPanel-delay') && css.includes('var(--booklet-top-btn-delay'), 'booklet tab/footer reveal must consume source timings');
const topBtnClip = data.animations.find((clip) => clip.file === 'TarotBookBookletTopBtn_FadeIn.anim');
expect(topBtnClip?.curves.some((c) => c.path === 'Root' && c.attribute === 'm_Alpha'), 'top-button alpha curve must be exported');
expect(topBtnClip?.curves.some((c) => c.path === 'LeftTabArea' && c.attribute === 'm_AnchoredPosition.x'), 'top-button left tab X curve must be exported');
expect(topBtnClip?.curves.some((c) => c.path === 'RightTabArea' && c.attribute === 'm_AnchoredPosition.y'), 'top-button right tab Y curve must be exported');
expect(bridgeTemplate.includes('tarotTopBtnTiming') && js.includes("['booklet-top-btn', topBtnTiming?.root]"), 'top-button curves must be bridged to runtime');
expect(css.includes('tarotBookletTopBtnLeft') && css.includes('--booklet-top-btn-left-x-start') && css.includes('--booklet-top-btn-right-y-start'), 'top-button curves must drive volume tab CSS');
expect(css.includes('tarotBookletPageLift') && js.includes('--booklet-root-y-start'), 'booklet root Y curve must drive page lift');
expect(css.includes('var(--cover-exit-root-duration') && css.includes('var(--cover-exit-root-start') && css.includes('tarotCoverExitRoot') && js.includes('__amphoreusExitTimings') && !js.includes('setTimeout(() => show(\'home\'), 420)'), 'cover exit must consume source timing, not hardcoded 420ms');
expect(js.includes('function withCoverExit') && js.includes('cover.classList.add(\'exiting\')') && css.includes('body:has(#view-cover.exiting:not(.hidden)) .entry-hud') && css.includes('tarotCoverExitTopTab') && css.includes('tarotCoverExitEff'), 'cover FadeOut sublayers must drive the navigation exit');
expect(html.includes('entry-shortcut-hint') && css.includes('tarotCoverShortcut') && css.includes('tarotCoverExitHint') && js.includes("'shortcutHint'") && js.includes('--cover-hint-start'), 'cover shortcut hint must consume its own FadeIn/FadeOut curve');
expect(bridgeTemplate.includes('tarotHomeEntranceTimings') && js.includes('__amphoreusHomeEntranceTimings') && js.includes('dataset.homeEntrance'), 'all homepage entrance clips must be bridged and selected by app state');
expect(css.includes('entrance-first-time') && css.includes('entrance-returning') && css.includes('entrance-resume') && css.includes('var(--first-time-page-info-delay') && css.includes('var(--returning-close-delay') && css.includes('var(--resume-page-info-delay'), 'homepage entrance variants must consume their own official timings');
expect(js.includes('tarotButtonVectors') && js.includes('--source-glyph-path') && css.includes('var(--source-glyph-path'), 'source button polygons must reach runtime CSS');
expect(['buttonBook', 'buttonStar', 'buttonPaper', 'buttonWiki', 'buttonMail', 'buttonMem'].every((key) => data.vectors[key]?.startsWith('polygon(') && data.colors[key]?.css), 'all six official nav glyph vectors and colors must be exported');
expect(bridgeTemplate.includes("BtnMem: tarotVector('buttonMem')") && js.includes('const buttonVectors') && js.includes('--sprite-${cssKey}'), 'all six official nav glyphs and colors must be bridged');
expect(bridgeTemplate.includes('tarotBookletVariantTimings') && js.includes('__amphoreusBookletVariantTimings'), 'remaining booklet FadeOut/FadeIn3 clips must be bridged to runtime');
expect(js.includes("['booklet-close', bookletVariants.out?.page]") && js.includes("['booklet-direct', bookletVariants.directIn?.page]") && css.includes('tarotBookletClose') && css.includes('tarotBookletDirectEnter'), 'volume exit and direct entry must consume their own official clips');
expect(bridgeTemplate.includes("btnReset: tarotTiming(inClip, 'Root/PanelContent/MainBookPanel/BtnPanel/BtnReset', 'm_Alpha')") && js.includes("['booklet-direct-btn-reset', bookletVariants.directIn?.btnReset]") && css.includes('--booklet-direct-function-panel-delay'), 'direct booklet controls must use FadeIn3 alpha timings');
expect(data.materials?.starBg?.css && data.materials?.starDeco?.css && bridgeTemplate.includes('if (value.css)') && css.includes('var(--material-starBg') && css.includes('var(--material-starDeco'), 'all raw star materials must be exported as CSS-ready colors and consumed');
expect(css.includes('.disc-source-light') && css.includes('var(--ring-StarLight-x') && css.includes('var(--material-starCircle1') && js.includes('tarotStarRings'), 'StarLight prefab offset and official star ring material must drive starmap glow');
expect(bridgeTemplate.includes('rotation,') && bridgeTemplate.includes('storyPanels,') && js.includes('__amphoreusStoryPanelTimings') && js.includes('--story-delay:'), 'story panel and star rotation curves must be bridged to path CSS');
expect(js.includes('@keyframes tarotStarPanelRotate') && js.includes('style.textContent') && css.includes('var(--story-duration') && !css.includes('var(--path-index, 0) * 120ms'), 'path cards must use generated rotation keyframes and per-panel official timing');
expect(js.includes('tarotCatalogDecorations') && css.includes('var(--catalog-sprite-background)') && css.includes('var(--catalog-sprite-corner)'), 'catalog sprite polygons must reach runtime CSS');
expect(data.layout?.hierarchy?.outsideGeometry?.BtnClose && data.layout?.hierarchy?.pageInfoGeometry?.Title, 'outside/pageInfo prefab geometry must be exported');
expect(data.layout?.hierarchy?.bottomBarGeometry?.TimeText && data.layout?.hierarchy?.bottomBarGeometry?.CountText, 'BottomBar prefab child geometry must be exported');
expect(bridgeTemplate.includes('bottomBar: tarotTiming(clip, \'Bg/ScreenBg/BottomBar\', \'m_Alpha\')') && bridgeTemplate.includes('bottomBarX: Number(bottom.x'), 'BottomBar entrance timings and geometry must be bridged');
expect(bridgeTemplate.includes("bottomBar: tarotReverseTiming(clip, 'Bg/ScreenBg/BottomBar', 'm_Alpha')") && js.includes('homeExitTimings.normal?.bottomBar') && js.includes('--home-exit-${variant}-${part}-values'), 'BottomBar exit timing must drive runtime CSS');
expect(html.includes('home-bottom-bar') && css.includes('.home-bottom-bar {') && css.includes('--first-time-bottom-bar-delay') && css.includes('--returning-bottom-bar-delay') && css.includes('tarotHomeBottomBarExit'), 'BottomBar layer must consume official entrance/exit windows');
expect(js.includes('tarotOutsideGeometry') && css.includes('var(--source-close-y') && css.includes('var(--source-close-x') && css.includes('var(--source-content-y') && css.includes('var(--source-subtitle-x'), 'outside geometry must reach runtime CSS');
for (const key of ['catalogBackground', 'catalogText', 'coverCenter', 'coverFire', 'buttonStar', 'buttonStarWhite', 'buttonBook', 'buttonPaper', 'buttonWiki', 'buttonMem', 'buttonMail', 'rewardButton', 'rewardText', 'mailHintBg', 'mailHintDeco']) expect(data.colors?.[key]?.css, `missing official sprite color ${key}`);
expect(js.includes('tarotSpriteColors') && css.includes('var(--sprite-catalogBackground)'), 'sprite colors must reach runtime CSS');
expect(css.includes('var(--sprite-buttonStar') && css.includes('var(--sprite-buttonStarWhite'), 'official star sprite colors must reach glyph CSS');
expect(css.includes('var(--sprite-buttonMem') && css.includes('var(--sprite-buttonMail'), 'official button sprite colors must reach per-button CSS');
expect(css.includes('var(--sprite-button-paper'), 'official paper button sprite colour must reach per-button CSS');
expect(css.includes('.home-star {') && css.includes('var(--sprite-buttonStarWhite') && css.includes('var(--material-starLineWarm') && js.includes('tarotMaterialColors'), 'official star sprite and material colours must drive background stars');
expect(css.includes('.home-archive.BtnBook .home-glyph i { background: var(--sprite-button-book'), 'official book sprite colour must reach button CSS');
expect(css.includes('.home-archive.BtnWiki .home-glyph i { background: var(--sprite-button-wiki'), 'official wiki sprite colour must reach button CSS');
expect(js.includes('tarotCoverDecorations') && css.includes('var(--cover-sprite-cloud)') && css.includes('var(--catalog-sprite-background13)') && css.includes('var(--cover-sprite-mainRing)') && css.includes('var(--catalog-sprite-textDeco)') && css.includes('var(--catalog-sprite-itemIcon)'), 'cover/catalog sprite vectors must reach runtime CSS');
expect(css.includes('.entry-top-tab') && css.includes('tarotCoverTopTab') && css.includes('var(--cover-fade-topTab-duration') && bridgeTemplate.includes('topTab: tarotTiming(clip, \'Root/TopTabArea\', \'m_AnchoredPosition.y\')'), 'cover TopTabArea timing must drive the cover top tab');
expect(css.includes('tarotCatalogExitRoot') && css.includes('var(--catalog-exit-topTab-duration') && css.includes('tarotCatalogExitHint') && css.includes('tarotCatalogExitEff') && js.includes('__amphoreusExitTimings') && js.includes("catalog.classList.add('exiting')"), 'catalog FadeOut curves must drive the navigation exit');
expect(css.includes('clip-path: polygon('), 'missing source-derived vector silhouettes');
for (const name of ['card07Banner', 'card07Symbol', 'card09Banner', 'card09Symbol', 'card10Banner', 'card10Symbol', 'card1Banner', 'card1Symbol', 'entranceBg', 'entranceIcon', 'replayIcon', 'crystalMini', 'buttonStar2', 'buttonBook1', 'buttonMail2', 'buttonMem2', 'buttonPaper2', 'buttonWiki2', 'card07SymbolActive', 'card09SymbolActive', 'card10SymbolActive', 'card1SymbolActive', 'endFinishBg', 'dataStoryInnerOutline', 'roundDecoL', 'cornerOutlineRight', 'autoBg', 'book2']) {
  expect(typeof data.vectors[name] === 'string' && data.vectors[name].startsWith('polygon('), `missing official vector ${name}`);
}
expect(bridgeTemplate.includes('function tarotChapterVectors') && bridgeTemplate.includes('function tarotEntranceVectors') && bridgeTemplate.includes('function tarotHomeIconVariants'), 'official chapter/entrance/icon variants must be bridged');
expect(js.includes('--chapter-${key}-${layer}') && js.includes('--entry-sprite-${key.replace(/[A-Z]/g') && js.includes('--home-variant-${key.toLowerCase()}-${index}'), 'runtime must bind official chapter/entrance/icon variants');
expect(css.includes('var(--chapter-07-banner') && css.includes('var(--chapter-10-symbol') && css.includes('var(--entry-sprite-background') && css.includes('var(--home-variant-btnbook-0'), 'official chapter/entrance/icon vectors must reach CSS');
expect(css.includes('--chapter-attr-symbol-active') && css.includes('var(--entry-sprite-end-finish-bg') && css.includes('var(--entry-sprite-open-crystal-shadow'), 'remaining official decorative vectors must reach CSS');
expect(js.includes('data-chapter=') && css.includes('[data-chapter]'), 'chapter variants must be scoped to official chapter keys');
expect(typeof data.textures?.bookletPage?.css === 'string' && typeof data.textures?.mimiTalkPage?.css === 'string' && typeof data.textures?.realMainPage?.css === 'string' && typeof data.textures?.questRewardPage?.css === 'string', 'official page atlas measurements must be exported');
expect(css.includes('--texture-booklet-page') && css.includes('--texture-mimi-talk-page') && css.includes('--texture-real-main-page') && css.includes('--texture-quest-reward-page'), 'official page atlas measurements must reach CSS');
expect(js.includes('Object.entries(textureColors)'), 'runtime must bind texture measurements');

for (const clip of ['TarotBookGuideTalkDialogFadeIn.anim', 'TarotBookGuideTalkDialogFadeOut.anim', 'TarotBookVoiceLoop.anim', 'TarotBookAssistantIconLoop_Normal.anim', 'TarotBookAssistantIconLoop_SP.anim']) {
  expect(data.animations.some((item) => item.file === clip), `missing official Mimi loop/guide clip ${clip}`);
}
expect(bridgeTemplate.includes('TarotBookGuideTalkDialogFadeIn.anim') && bridgeTemplate.includes('TarotBookVoiceLoop.anim') && bridgeTemplate.includes('TarotBookAssistantIconLoop_SP.anim') && bridgeTemplate.includes('guide: {') && bridgeTemplate.includes('voice: {') && bridgeTemplate.includes('assistant: {'), 'Mimi guide/voice/assistant clips must be bridged');
expect(js.includes('tarotMimiGuideGlow') && js.includes('tarotMimiVoiceIcon1') && js.includes('tarotMimiAssistantSpLight') && css.includes('var(--mimi-guide-bg-alpha-duration') && css.includes('var(--mimi-voice-duration') && css.includes('var(--mimi-assistant-duration'), 'Mimi guide/voice/assistant curves must reach CSS');

expect(bridgeTemplate.includes('function tarotTimelineTiming') && bridgeTemplate.includes('TarotBookTimelineInfoItem_FadeIn.anim'), 'TimelineInfoItem clip must be bridged');
expect(data.animations.some((item) => item.file === 'TarotBookTimelineInfoItem_FadeIn.anim' && item.curves.some((curve) => curve.path === 'Main/DataList/Active1/Root')), 'TimelineInfoItem row curves must be exported');
expect(js.includes('data-timeline-row=') && js.includes('--timeline-row-delay') && css.includes('tarotTimelineRowReveal'), 'TimelineInfoItem curves must reach the pipeline stages');


expect(!/0%,\s*0%\s*\{\s*opacity/.test(css), 'duplicate keyframe selectors must not remain');
expect(!/screenshot-freeze/.test(css + js), 'screenshot-freeze must not remain');
expect(css.includes('body:has(#view-home:not(.hidden)) .chrome') && css.includes('body:has(#view-home:not(.hidden)) .book-foot'), 'homepage must hide non-game chrome');
expect(css.includes('body:has(#view-home:not(.hidden)) .home-uid') && css.includes('body:has(#view-home:not(.hidden)) .home-author'), 'homepage must hide non-game overlay labels');
expect(css.includes('body:has(#view-home:not(.hidden)) .home-rule') && css.includes('body:has(#view-home:not(.hidden)) .home-load'), 'homepage must hide non-game webpage controls');
expect(css.includes('.home-archive.BtnPaper .home-glyph i { background: var(--sprite-button-paper'), 'official paper button sprite colour must reach CSS');
expect(css.includes('.home-archive.BtnMem .home-glyph i { background: var(--sprite-button-mem'), 'official mem button sprite colour must reach CSS');
expect(css.includes('.home-archive.BtnMail .home-glyph i { background: var(--sprite-button-mail'), 'official mail button sprite colour must reach CSS');
expect(data.textures?.petal?.colors?.length && data.textures?.glow?.colors?.length && bridgeTemplate.includes('function tarotTextureColors') && js.includes('tarotTextureColors') && js.includes('--texture-${key}') && css.includes('var(--texture-petal') && css.includes('var(--texture-glow'), 'unpacked leaf/glow texture colors must drive runtime CSS particles');
expect(bridgeTemplate.includes("children: ['Icon1/Icon4', 'Icon2', 'Icon2/Icon3']") && js.includes('childRotations') && js.includes('home-deco-card') && css.includes('tarotDecoPaperFlip0'), 'Loop4 child card flips/alpha tracks must drive the paper button');
expect(bridgeTemplate.includes('pageInfoXValues') && js.includes('__amphoreusPathEntranceTimings') && js.includes('--path-page-info-x-${index}-at') && css.includes('tarotPathPageInfoX') && css.includes('var(--path-back-duration') && css.includes('var(--path-page-duration'), 'path page/root/back/header entrance curves must drive runtime CSS');
expect(bridgeTemplate.includes('rewardX: Number(TAROT_SOURCE.layout.hierarchy.panels?.BtnReward?.x') && js.includes('--source-reward-x') && css.includes('var(--source-reward-x'), 'BtnReward official X coordinate must drive the homepage reward panel');
expect(bridgeTemplate.includes("curve.collection === 'm_ScaleCurves'") && js.includes('tarotStoryStarScale') && js.includes('--story-flash-scale-duration') && css.includes('var(--story-flash-scale-duration') && css.includes('tarotStoryStarEffOff'), 'story star scale and eff-active curves must generate runtime CSS animations');
expect(bridgeTemplate.includes('sizeX: tarotTiming(clip, \'Root\', \'m_SizeDelta.x\')') && js.includes('--booklet-btn-size-duration') && css.includes('tarotBookletBtnSize'), 'booklet button official SizeDelta curve must drive confirm button width');
expect(bridgeTemplate.includes('const initialClip = \'TarotBookBookletPage_FadeIn.anim\'') && bridgeTemplate.includes('coverScale: scaleX(initialClip') && js.includes('tarotBookletInitialPageScale') && css.includes('tarotBookletInitialPageScale'), 'initial booklet cover/catalog/page scale curves must use their own official clip');
expect(bridgeTemplate.includes('initialIn:') && bridgeTemplate.includes('scaleXY(initialClip') && js.includes('amph-booklet-initial-page-scale-keyframes'), 'initial booklet spine and page scale must generate runtime keyframes');
expect(bridgeTemplate.includes('functionWidth: functionWidth(initialClip)') && bridgeTemplate.includes('functionX: functionX(initialClip)') && js.includes("['initial', bookletVariants.initialIn]") && js.includes("['function-x', value?.functionX]") && css.includes('tarotBookletFunctionPanel'), 'initial FunctionPanel width/X curves must drive volume footer');
expect(bridgeTemplate.includes('values: tarotCurveValues(clip, path, \'m_Alpha\')') && js.includes('tarotStoryPanelProgress') && js.includes('class="path-progress"') && css.includes('.path-card > .path-progress') && css.includes('animation: tarotStoryPanelProgress'), 'StoryStarPanel Progress alpha must drive a separate CSS layer');
expect(bridgeTemplate.includes("errorOpen: keysFor('Root/ErrorBg/EffErrorOpen', 'm_IsActive')") && js.includes('--error-open-delay') && css.includes('tarotErrorOpen'), 'ErrorBg EffErrorOpen activation must gate the source-error scanline');
expect(bridgeTemplate.includes('function tarotEffPanelRgb(clipName)') && bridgeTemplate.includes('colors: tarotEffPanelRgb(clip)') && js.includes('bindEffPanelColors') && css.includes('var(--cover-eff-par-rgb') && css.includes('var(--catalog-eff-shine-rgb'), 'cover/catalog EffPanel material RGB curves must drive runtime gradients');
expect(css.includes('body:has(#view-home.exiting:not(.hidden)) .home-load') && css.includes('var(--home-exit-all-goToPanel-duration') && css.includes('body:has(#view-home.exiting:not(.hidden)) .home-bottom-bar') && css.includes('var(--home-exit-all-bottomBar-duration'), 'GoToPanel and BottomBar exit alphas must consume FadeOutAll rather than the normal FadeOut');
expect(bridgeTemplate.includes('function tarotHomeExitAllCurves()') && bridgeTemplate.includes("tarotCurve(clip, path, '')") && js.includes('tarotHomeExitAllCurves()') && js.includes('amph-home-exit-all-bg-scale') && css.includes('tarotHomeExitAllBgScale') && css.includes('tarotHomeExitRewardX'), 'FadeOutAll per-layer alpha, offset and scale curves must drive the homepage exit');
expect(js.includes("if (!value || !('delay' in value)) continue;") && css.includes('var(--home-scale-mid-value1-at'), 'non-timing bridge metadata must not be written as animation timings, and home scale percentages must be source-derived');
expect(js.includes('--cover-par-end') && css.includes('tarotCoverPar') && css.includes('tarotCoverShine') && !/0%,\s*0%\s*\{\s*opacity/.test(css), 'cover/catalog EffPanel alpha curves must drive runtime shimmer');
expect(bridgeTemplate.includes('outBackDeco') && bridgeTemplate.includes('inBackShadow') && js.includes("['booklet-refresh-in-back', bookletRefreshTiming.inBackDeco]") && css.includes('tarotBookletBackRefresh') && css.includes('tarotBookletBackReturn'), 'page refresh back-decoration curves must drive volume wings');
expect(bridgeTemplate.includes('errorActive: curveFor') && bridgeTemplate.includes('errorIconActive: curveFor') && bridgeTemplate.includes('glitchW: keysFor') && js.includes('--error-active-delay:') && css.includes('tarotErrorIconActive') && css.includes('var(--error-glitch-start'), 'Error icon activation, frame color/alpha and glitch width must remain CSS-visible');
expect(bridgeTemplate.includes('scanline: {') && js.includes('--error-scan-end') && css.includes('--error-open-delay'), 'ErrorBg scanline ST keyframes must stay bridged with its activation gate');
expect(js.includes('curveStyle(timing.eff') && css.includes('var(--eff-point-4-at') && css.includes('var(--eff-bg-hint-point-2-at') && css.includes('var(--eff-deco-point-2-at') && css.includes('entrance-resume:not(.hidden)) .home-glyph-eff'), 'all five official Eff points and per-variant resume state must drive button shine');
expect(js.includes('variantPrefix = variant.replace') && js.includes('--variant-${part}-${index}-at') && css.includes('tarotEntrancePageInfoX') && css.includes('tarotEntranceRewardX') && css.includes('var(--first-time-page-info-x-duration') && css.includes('var(--returning-reward-x-delay'), 'homepage entrance variants must consume their own position curves');
expect(bridgeTemplate.includes('goToPanel: tarotTiming') && bridgeTemplate.includes('newMailEff: tarotTiming') && js.includes("['go-to-panel', 'new-mail-hint', 'new-mail-eff']") && css.includes('var(--returning-go-to-panel-delay') && css.includes('var(--returning-new-mail-eff-delay'), 'variant-specific GoToPanel/NewMailHint windows must drive homepage chrome');
expect(bridgeTemplate.includes('tarotEulerValues') && bridgeTemplate.includes('backDecoRotationZ') && bridgeTemplate.includes('backDecoY') && js.includes("['booklet-direct-back-rotation'") && js.includes("['booklet-direct-back-y'") && css.includes('tarotBookletDirectBackRotation') && css.includes('tarotBookletDirectFrameShadow') && css.includes('--booklet-direct-back-y-2-at'), 'direct booklet back-frame Euler/alpha/Y curves must drive volume CSS');
expect(bridgeTemplate.includes('particleOpen:') && js.includes('--path-particle-open-delay') && css.includes('tarotStarParticleOpen'), 'path ParticleOpen activation curve must drive star particles');
expect(bridgeTemplate.includes("bgHint: read('m_Color.a'") && js.includes('-eff-bg-hint') && css.includes('tarotEffHint') && css.includes('tarotEffDeco'), 'per-button Eff/BgHint/Deco alpha curves must drive icon shine');
expect(bridgeTemplate.includes('function tarotHomeEntranceButtonTimings') && js.includes('homeEntranceButtons[sourceKey]?.[name]') && css.includes('first-time-reveal-delay') && css.includes('returning-eff-delay'), 'homepage button/eff curves must follow the four official entrance variants');
expect(bridgeTemplate.includes("tarotCurve(clip, 'Bg/EffOpen', 'm_IsActive')") && bridgeTemplate.includes("tarotCurve(clip, 'Bg/ScreenBg/RevertMask/BgRoot/EffLoop', '_TargetAlpha')") && js.includes('effOpen?.keys') && js.includes('bgRootEff?.keys') && css.includes('tarotHomeEffOpen') && css.includes('tarotHomeEffLoop') && css.includes('--first-time-bg-root-eff-delay') && css.includes('--returning-eff-open-delay'), 'homepage EffOpen/BgRoot effect curves must drive the four entrance flashes');
expect(bridgeTemplate.includes("outsideContent: tarotTiming(clip, 'Outside/Content', 'm_Alpha')") && js.includes('outsideContent?.keys') && css.includes('tarotOutsideContentAlpha') && css.includes('--returning-outside-content-delay'), 'homepage Outside/Content alpha must drive the returning status layer');
expect(bridgeTemplate.includes("backgroundAlpha: tarotTiming(clip, 'Bg', 'm_Alpha')") && js.includes('backgroundAlpha?.keys') && css.includes('tarotHomeBackgroundAlpha') && css.includes('--first-time-background-alpha-delay'), 'first-time homepage background alpha must drive the canvas opacity');
expect(bridgeTemplate.includes("hintValues: tarotCurveValues(clip, 'ShortCutHintFullScreenPanel(Clone)'") && bridgeTemplate.includes("parValues: tarotCurveValues(clip, 'Bg/EffPanel/Par'") && js.includes('--catalog-hint-start') && js.includes('--catalog-shine-end') && css.includes('tarotCatalogShortcut') && css.includes('tarotCatalogPar') && css.includes('tarotCatalogShine'), 'catalog shortcut hint and EffPanel curves must drive CSS');
expect(bridgeTemplate.includes("leftTab: tarotTiming(clip, 'Root/LeftTabArea', 'm_AnchoredPosition.y')") && bridgeTemplate.includes("topTab: tarotTiming(clip, 'Root/TopTabArea', 'm_AnchoredPosition.y')") && css.includes('tarotCatalogLeftTab') && css.includes('tarotCatalogTopTab') && css.includes('--catalog-leftTab-start') && css.includes('--catalog-topTab-start'), 'catalog LeftTabArea/TopTabArea curves must drive CSS tabs');
expect(bridgeTemplate.includes('bookShadowAlpha: tarotCurveValues') && bridgeTemplate.includes('leftSpineScale:') && bridgeTemplate.includes('rightSpineScale:') && bridgeTemplate.includes('pageScale: scaleX(inClip') && js.includes("tarotBookletDirect${name === 'left' ? 'Left' : 'Right'}Spine") && js.includes('amph-booklet-direct-page-scale-keyframes') && css.includes('tarotBookletDirectBookShadow') && css.includes('tarotBookletDirectLeftSpine') && css.includes('tarotBookletDirectRightSpine') && css.includes('tarotBookletDirectPageScale'), 'direct booklet book-shadow, spine and page scale curves must drive generated CSS animations');
expect(bridgeTemplate.includes("mainBookEnabled: tarotTiming(inClip, 'Root/PanelContent/MainBookPanel', 'm_Enabled')") && js.includes('mainBookEnabled?.keys') && css.includes('tarotBookletMainEnabled') && css.includes('--booklet-direct-main-enabled-delay'), 'direct booklet MainBookPanel activation must drive the book stage visibility');
expect(bridgeTemplate.includes('wave1Scale: tarotEulerValues(loop, \'Wave1\', \'x\')') && bridgeTemplate.includes('wave2Scale: tarotEulerValues(loop, \'Wave2\', \'x\')') && js.includes('mail-hint-wave1-scale') && css.includes('var(--mail-hint-wave1-scale-1') && css.includes('var(--mail-hint-wave2-scale-1'), 'mail-hint Wave1/Wave2 scale curves must drive the two ripple animations');
expect(bridgeTemplate.includes("pageInfoAlpha: tarotTiming(clip, 'Root/PageInfo', 'm_Alpha')") && bridgeTemplate.includes("leftTabAlpha: tarotTiming(clip, 'Root/LeftTabArea', 'm_Alpha')") && js.includes('--cover-fade-${name}-start') && css.includes('var(--cover-fade-pageInfoAlpha-start') && css.includes('tarotCoverLeftTab'), 'cover PageInfo and LeftTabArea curves must drive the HUD reveal');
expect(bridgeTemplate.includes('effectRotation,') && bridgeTemplate.includes('tarotStarPanelTiming') && js.includes('amph-star-effect-rotation-keyframes') && css.includes('tarotStarPanelEffectRotate') && css.includes('--star-effect-rotation-delay'), 'star effect Euler curve must drive its own generated animation');
const errorClip = data.animations.find((clip) => clip.file === 'TarotBookRealMainPage_FadeIn_Error.anim');
expect(errorClip?.curves.some((c) => c.path === 'Root/ErrorBg' && c.attribute === 'm_Alpha'), 'Error background alpha curve must be exported');
expect(errorClip?.curves.some((c) => c.path === 'Root/ErrorBg' && c.attribute === 'm_IsActive'), 'Error background activation curve must be exported');
expect(errorClip?.curves.some((c) => c.path === 'Root/ErrorBg/Scanline' && c.attribute === 'material._MaskTex_ST.w'), 'Error scanline material curve must be exported');
expect(errorClip?.curves.some((c) => c.path === 'Root/PanelContent/DesktopPanel/FunctionList/BtnMail/Root/IconPanel/Error' && c.attribute === 'm_Alpha'), 'Error per-button icon curve must be exported');
expect(bridgeTemplate.includes('function tarotErrorTiming()') && bridgeTemplate.includes('TAROT_BUTTON_ORDER') && bridgeTemplate.includes('scanlineW: keysFor'), 'Error clip must be bridged for all official buttons');
expect(js.includes('__amphoreusErrorTiming') && js.includes('--error-delay:') && js.includes('--error-scan-end:') && js.includes('home-archive-error'), 'Error button timings must reach runtime markup');
expect(css.includes('tarotErrorButton') && css.includes('tarotErrorBackground') && css.includes('tarotErrorScan') && css.includes('var(--error-scan-end'), 'Error clip must drive pure-CSS fallback state');
expect(js.includes('showSourceError') && js.includes('source-error') && !js.includes("box.style.cssText = 'color") && !js.includes("'<div style=\"padding:60px 40px"), 'generic inline HTML error fallbacks must be replaced by source-backed CSS');
const helperOrder = ['function applyChapterSprites', 'function showSourceError', 'function renderHome', 'function openCatalog', 'async function boot'].map((token) => js.indexOf(token));
expect(helperOrder.every((index) => index >= 0) && helperOrder.every((index, i) => i === 0 || index > helperOrder[i - 1]) && /^let signLongPress = \{\};/m.test(js) && /^let pageFramePattern = \{\};/m.test(js), 'boot-shared helpers and source timing state must stay at module scope before their consumers');
expect(html.includes('<div class="home-stage">') && css.includes('.home-stage {\n  position: absolute;') && css.includes('transform-origin: 0 0;') && css.includes('width: min(100vw, 177.7778vh);') && css.includes('height: min(100vh, 56.25vw);') && css.includes('scale: min(calc(100vw / 1280px), calc(100vh / 720px));'), 'the 1280x720 homepage stage must fit desktop viewports uniformly without mutating source animations');
expect(!capture.includes('screenshot-freeze') && capture.includes('cover choosing state') && capture.includes('cover chosen state') && capture.includes('catalogue with twelve visible cards'), 'screenshot capture must wait for real interaction states instead of an inert freeze query');
const requiredVectors = ['waitingIcon', 'waitingLight', 'signDecoLine', 'signLightLine', 'signLineOutline'];
expect(requiredVectors.every((key) => data.vectors[key]?.startsWith('polygon(')), 'official waiting/sign sprite outlines must be exported as vectors');
expect(['cardBack', 'cardOutline', 'cardSelectOutline', 'cardStar', 'cardBg', 'cardIcon', 'cardMask', 'cardShadow', 'cardLightStar', 'cardLightIcon'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['cardBg', 'cardBack', 'cardIcon', 'cardLightStar'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes("cardBack: tarotVector('cardBack')") && bridgeTemplate.includes("cardShadow: tarotVector('cardShadow')") && js.includes('--card-sprite-') && js.includes('--sprite-${cssKey}') && css.includes('clip-path: var(--card-sprite-cardOutline') && css.includes('clip-path: var(--card-sprite-cardShadow') && css.includes('clip-path: var(--card-sprite-cardBg') && css.includes('clip-path: var(--card-sprite-cardLightStar'), 'official star-panel card layers must reach path cards');
expect(data.vectors.closeIcon?.startsWith('polygon(') && data.vectors.buttonDecoIcon?.startsWith('polygon(') && js.includes('--ui-sprite-') && css.includes('clip-path: var(--ui-sprite-close-icon') && css.includes('clip-path: var(--ui-sprite-button-deco-icon'), 'official close/button decoration outlines must reach CSS');
expect(['coverPagePattern', 'catalogBg', 'signPageBg', 'endPageDeco'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['coverPagePattern', 'catalogBg', 'signPageBg', 'endPageDeco'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('coverPagePattern: tarotVector') && bridgeTemplate.includes('signPageBg: tarotVector') && js.includes('--waiting-sprite-') && css.includes('cover-official-pattern') && css.includes('catalog-official-bg') && css.includes('sign-longpress-page-bg') && html.includes('cover-official-pattern') && html.includes('catalog-official-bg') && html.includes('sign-longpress-page-bg'), 'official page background vectors must reach CSS');
expect(['catalogItemMask', 'catalogItem13Mask'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['catalogItemMask', 'catalogItem13Mask'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('catalogItemMask: tarotVector') && css.includes('catalog-item-mask') && css.includes('--waiting-sprite-catalog-item13-mask') && js.includes('class="catalog-item-mask"'), 'official catalog item masks must reach CSS');
expect(['confirmBg', 'confirmCircle', 'buttonPattern'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['confirmBg', 'confirmCircle', 'buttonPattern'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('confirmBg: tarotVector') && css.includes('.open-confirm > .confirm-pattern') && css.includes('--waiting-sprite-confirm-bg') && html.includes('confirm-circle'), 'official confirm button decorations must reach CSS');
expect(data.vectors.bookDecoItem?.startsWith('polygon(') && data.colors?.bookDecoItem?.css && bridgeTemplate.includes('bookDecoItem: tarotVector') && css.includes('floating-card-book-deco') && css.includes('--waiting-sprite-book-deco-item') && html.includes('floating-card-book-deco'), 'official floating book decoration must reach CSS');
expect(['signCenterIcon', 'signCenterStar', 'signDotPattern'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['signCenterIcon', 'signCenterStar', 'signDotPattern'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('signCenterIcon: tarotVector') && css.includes('sign-longpress-center-icon') && css.includes('--waiting-sprite-sign-dot-pattern') && html.includes('sign-longpress-center-star'), 'official long-press center decorations must reach CSS');
expect(['errorDialogBg', 'errorHintBg', 'errorHintIcon', 'errorIconEff'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['errorDialogBg', 'errorHintBg', 'errorHintIcon', 'errorIconEff'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('errorDialogBg: tarotVector') && css.includes('source-error-dialog-bg') && css.includes('--waiting-sprite-error-icon-eff') && js.includes('source-error-hint-icon'), 'official error dialog vectors must reach CSS');
expect(['buttonComDeco1', 'buttonComDeco2', 'buttonLargePattern', 'mailStarIcon'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['buttonComDeco1', 'buttonComDeco2', 'buttonLargePattern', 'mailStarIcon'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('buttonComDeco1: tarotVector') && css.includes('home-glyph-com-deco1') && css.includes('--waiting-sprite-button-large-pattern') && js.includes('home-glyph-com-deco2'), 'official common button/mail decorations must reach CSS');
expect(data.animations.length >= 76 && ['TarotBookMailDialog_FadeIn.anim', 'TarotBookMainEntranceErrorDialog_FadeIn.anim', 'TarotBookMainEntranceErrorDialog_Loop.anim', 'TarotBookWikiDialog_Normal_FadeIn.anim', 'TarotBookGuideBtnTypeRect.anim', 'CardItemShow.anim', 'Checked.anim'].every((file) => data.animations.some((clip) => clip.file === file)) && bridgeTemplate.includes('function tarotDialogTiming') && js.includes('window.__amphoreusDialogTiming') && css.includes('tarotDialogReveal'), 'remaining official dialog/timeline/card clips and dialog timings must reach CSS');
expect(data.vectors.autoIcon?.startsWith('polygon(') && data.vectors.autoIconGlow?.startsWith('polygon(') && data.vectors.autoIconOutline?.startsWith('polygon(') && data.vectors.autoShadow?.startsWith('polygon(') && data.vectors.checkIcon?.startsWith('polygon(') && data.vectors.checkOutline?.startsWith('polygon(') && data.vectors.waitProgress?.startsWith('polygon(') && data.vectors.mailHintPanel?.startsWith('polygon(') && data.vectors.mainDecoRect?.startsWith('polygon(') && data.vectors.entranceBtnLine?.startsWith('polygon(') && data.vectors.selectFrame?.startsWith('polygon(') && data.vectors.openBookHintTextBg?.startsWith('polygon(') && data.vectors.textUnderLine?.startsWith('polygon(') && data.colors?.autoIcon?.css && data.colors?.autoIconGlow?.css && data.colors?.autoIconOutline?.css && data.colors?.autoShadow?.css && data.colors?.checkIcon?.css && data.colors?.checkOutline?.css && data.colors?.waitProgress?.css && data.colors?.mailHintPanel?.css && data.colors?.mainDecoRect?.css && data.colors?.entranceBtnLine?.css && data.colors?.selectFrame?.css && data.colors?.openBookHintTextBg?.css && data.colors?.textUnderLine?.css && bridgeTemplate.includes('autoIconGlow: tarotVector') && css.includes('load-auto-glow') && css.includes('wait-progress') && css.includes('entry-select-frame') && html.includes('expand-text-bg'), 'high-relevance autogen TarotBook sprites must reach CSS');
expect(data.vectors.chartCataTabDeco?.startsWith('polygon(') && data.vectors.chartCataTabOutline?.startsWith('polygon(') && data.vectors.chartTabBgShadow?.startsWith('polygon(') && data.vectors.chartTabDecoIcon?.startsWith('polygon(') && data.vectors.chartTabFinishIcon?.startsWith('polygon(') && data.vectors.chartTabLockIcon?.startsWith('polygon(') && data.vectors.chartTabOutline?.startsWith('polygon(') && data.vectors.chartTabOutlineR?.startsWith('polygon(') && data.vectors.chartTabPattern?.startsWith('polygon(') && data.vectors.questRewardTabLine?.startsWith('polygon(') && data.vectors.questRewardTabLineCopy?.startsWith('polygon(') && data.vectors.questRewardTabOutline?.startsWith('polygon(') && data.vectors.pageNextBtnOutline?.startsWith('polygon(') && data.vectors.talkTabFrame?.startsWith('polygon(') && data.vectors.collectRewardDecoCenter?.startsWith('polygon(') && data.vectors.collectRewardDecoCenterBg?.startsWith('polygon(') && data.vectors.collectRewardDecoCenterBgCircle?.startsWith('polygon(') && data.vectors.rewardItemBg?.startsWith('polygon(') && data.vectors.rewardItemOutline?.startsWith('polygon(') && data.vectors.reviewBtnBg?.startsWith('polygon(') && data.vectors.reviewBtnIcon?.startsWith('polygon(') && data.vectors.unloadBtnBg?.startsWith('polygon(') && data.colors?.chartCataTabDeco?.css && data.colors?.chartCataTabOutline?.css && data.colors?.chartTabBgShadow?.css && data.colors?.chartTabDecoIcon?.css && data.colors?.chartTabFinishIcon?.css && data.colors?.chartTabLockIcon?.css && data.colors?.chartTabOutline?.css && data.colors?.chartTabOutlineR?.css && data.colors?.chartTabPattern?.css && data.colors?.questRewardTabLine?.css && data.colors?.questRewardTabLineCopy?.css && data.colors?.questRewardTabOutline?.css && data.colors?.pageNextBtnOutline?.css && data.colors?.talkTabFrame?.css && data.colors?.collectRewardDecoCenter?.css && data.colors?.collectRewardDecoCenterBg?.css && data.colors?.collectRewardDecoCenterBgCircle?.css && data.colors?.rewardItemBg?.css && data.colors?.rewardItemOutline?.css && data.colors?.reviewBtnBg?.css && data.colors?.reviewBtnIcon?.css && data.colors?.unloadBtnBg?.css && bridgeTemplate.includes('chartCataTabOutline: tarotVector') && css.includes('catalog-tab-outline') && css.includes('reward-item-bg') && css.includes('volume-next-outline') && html.includes('rule-icon'), 'official tab/reward/page sprites must reach CSS');
expect(data.vectors.mimiBookDeco1?.startsWith('polygon(') && data.vectors.mimiBookDeco3?.startsWith('polygon(') && data.vectors.mimiBookDeco41?.startsWith('polygon(') && data.vectors.mimiBookDeco42?.startsWith('polygon(') && data.vectors.mimiBookDeco43?.startsWith('polygon(') && data.vectors.mimiTalkBtnChooseBg?.startsWith('polygon(') && data.vectors.mimiTalkChooseDeco?.startsWith('polygon(') && data.vectors.mimiTalkChooseIcon?.startsWith('polygon(') && data.vectors.mimiTalkPanelArrow?.startsWith('polygon(') && data.vectors.mimiTalkPanelBgDeco?.startsWith('polygon(') && data.vectors.mimiTalkPanelHintArrow?.startsWith('polygon(') && data.vectors.mimiTalkPanelOutline?.startsWith('polygon(') && data.colors?.mimiBookDeco1?.css && data.colors?.mimiBookDeco3?.css && data.colors?.mimiBookDeco41?.css && data.colors?.mimiBookDeco42?.css && data.colors?.mimiBookDeco43?.css && data.colors?.mimiTalkBtnChooseBg?.css && data.colors?.mimiTalkChooseDeco?.css && data.colors?.mimiTalkChooseIcon?.css && data.colors?.mimiTalkPanelArrow?.css && data.colors?.mimiTalkPanelBgDeco?.css && data.colors?.mimiTalkPanelHintArrow?.css && data.colors?.mimiTalkPanelOutline?.css && bridgeTemplate.includes('mimiTalkPanelOutline: tarotVector') && css.includes('mimi-panel-outline') && css.includes('mimi-choose-icon') && js.includes('mimi-panel-outline'), 'official MimiTalk sprites must reach CSS');
expect(bridgeTemplate.includes('function tarotMimiTiming') && js.includes('window.__amphoreusMimiTiming') && css.includes('tarotMimiPanelReveal') && css.includes('tarotMimiSlide') && data.animations.some((clip) => clip.file === 'TarotBookMimiTalkPage_FadeIn2.anim'), 'official MimiTalk page and unlock timings must reach CSS');
expect(data.vectors.signBgLight?.startsWith('polygon(') && data.vectors.signBgPattern?.startsWith('polygon(') && data.vectors.signDecoIcon?.startsWith('polygon(') && data.vectors.signLineBg?.startsWith('polygon(') && data.vectors.signLineEffect?.startsWith('polygon(') && data.vectors.signLineOutlineGlow?.startsWith('polygon(') && data.vectors.signCenterStarLight?.startsWith('polygon(') && data.vectors.signPressCircle2?.startsWith('polygon(') && data.colors?.signBgLight?.css && data.colors?.signBgPattern?.css && data.colors?.signDecoIcon?.css && data.colors?.signLineBg?.css && data.colors?.signLineEffect?.css && data.colors?.signLineOutlineGlow?.css && data.colors?.signCenterStarLight?.css && data.colors?.signPressCircle2?.css && bridgeTemplate.includes('signBgLight: tarotVector') && css.includes('sign-longpress-bg-pattern') && css.includes('sign-line-outline-glow') && css.includes('--waiting-sprite-sign-press-circle2') && html.includes('sign-line-effect'), 'official signing background/line vectors must reach CSS');
expect(['coverPageBg', 'coverPageDecoItem', 'endPageBorder', 'energyHintPattern', 'energyHintDecoPattern', 'catalogSideDeco', 'toastIcon'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['coverPageBg', 'coverPageDecoItem', 'endPageBorder', 'energyHintPattern', 'energyHintDecoPattern', 'catalogSideDeco', 'toastIcon'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('coverPageBg: tarotVector') && css.includes('cover-official-bg') && css.includes('catalog-side-deco') && css.includes('hint-deco-pattern') && css.includes('home-toast-mark') && css.includes('home-end-page-border') && html.includes('hint-bg-detail'), 'remaining official book/mail/toast vectors must reach CSS');

// Catalog paper is directly backed by the unpacked ChartCatalog/ChartBook sprites.
expect(['chartCatalogPaperBgLeft', 'chartCatalogPaperBgRight', 'chartBookPaperBg'].every((key) => data.vectors[key]?.startsWith('polygon(')) && ['chartCatalogPaperBgLeft', 'chartCatalogPaperBgRight', 'chartBookPaperBg'].every((key) => data.colors?.[key]?.css) && bridgeTemplate.includes('chartCatalogPaperBgLeft: tarotVector') && css.includes('var(--sprite-chart-catalog-paper-bg-right') && css.includes('var(--sprite-chart-catalog-paper-bg-left') && css.includes('var(--sprite-chart-book-paper-bg'), 'official catalog paper colors must reach the catalog page CSS');
expect(bridgeTemplate.includes('function tarotWaitingVectors()') && js.includes('const waitingVectors') && js.includes('--waiting-sprite-') && js.includes('--sign-sprite-'), 'waiting/sign vectors must reach runtime CSS variables');
expect(css.includes('clip-path: var(--waiting-sprite-icon') && css.includes('clip-path: var(--waiting-sprite-light') && css.includes('clip-path: var(--sign-sprite-signDecoLine') && css.includes('clip-path: var(--sign-sprite-signLightLine'), 'waiting/sign silhouettes must be rendered by clip-path without images');
expect(bridgeTemplate.includes('const scriptPulse = values(\'path_2180234471\', \'script_3127566275\')') && js.includes('--sign-longpress-pulse-') && css.includes('tarotSignLongPressPulse'), 'long-press script pulse must stay hashed in source and reach CSS');
expect(h.geometry && Object.keys(h.geometry).length >= 30 && ['Title', 'IconPanel', 'RewardPanel', 'BtnGo', 'BtnClose'].every((name) => h.geometry[name]), 'RectTransform geometry must include named layout anchors');
expect(!/baseline\/|\.png|\.jpg|\.webp|\.svg/i.test(css), 'runtime CSS must stay image-free');

console.log(JSON.stringify({
  prefabNodes: Object.entries(h)
    .filter(([key]) => key !== 'panels')
    .reduce((n, [, list]) => n + (Array.isArray(list) ? list.length : 0), 0) + panelCount,
  panelNodes: panelCount,
  animationCurves: data.animations.reduce((n, clip) => n + clip.curves.length, 0),
  animationClips: data.animations.length,
  silhouettes: Object.keys(data.silhouettes).length,
  spriteRoles: {
    exportedVectors: vectorKeys.length,
    referencedVectors: referencedVectors.size,
    exactCardAliases: aliasVectors.length,
    alphaOnlySprites: vectorKeys.filter((key) => data.vectors[key] === null).length,
    missingReferences: missingVectorRefs.length,
  },
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
const earlyFailureCount = failures.length;

const chapterKeys = ['1', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
for (const chapter of chapterKeys) {
  for (const layer of ['banner', 'circle', 'backCircle', 'deco', 'symbol', 'spSymbol']) {
    const key = `chapter${chapter}${layer}`;
    expect(data.vectors?.[key] || data.vectors?.[key + 'Active'], `missing official chapter ${chapter} ${layer} polygon`);
    expect(data.colors?.[key]?.css || data.colors?.[key + 'Active']?.css, `missing official chapter ${chapter} ${layer} color`);
  }
}
expect(bridgeTemplate.includes('function tarotChapterVectors') && bridgeTemplate.includes('function tarotChapterColors'), 'chapter sprite/color accessors must be bridged');
expect(js.includes('window.__amphoreusChapterVectors') && js.includes('applyChapterSprites'), 'chapter sprites must be bound per rendered card');
expect(css.includes('.path-card[data-chapter] > .path-card-outline') && css.includes('--chapter-attr-symbol-active'), 'chapter sprites must drive per-card CSS layers');

const chartPaperKeys = ['chartBookPaperBg', 'chartBookPaperBgLeft', 'chartBookPaperBgShadowR', 'chartBookPaperTopPatternLeft', 'chartBookPaperTopPatternRight', 'chartCatalogPaperBgLeft', 'chartCatalogPaperBgRight', 'chartTitleDeco'];
for (const key of chartPaperKeys) {
  expect(data.vectors?.[key]?.startsWith('polygon('), `missing official ${key} polygon`);
  expect(data.colors?.[key]?.css, `missing official ${key} color`);
  expect(bridgeTemplate.includes(`${key}: tarotVector('${key}')`), `chart paper ${key} must be bridged`);
}
expect(css.includes('--waiting-sprite-chart-book-paper-bg') && css.includes('--waiting-sprite-chart-catalog-paper-bg-left') && css.includes('--waiting-sprite-chart-title-deco'), 'chart paper/title vectors must reach CSS');

const guideKeys = ['guideClickFrame', 'guideClickGlow', 'guideClickInnerGlow', 'guideClickSolidBg', 'guideArrow', 'guideArrowTexture', 'guideTalkFrame', 'guideLight'];
for (const key of guideKeys) {
  expect(data.vectors?.[key]?.startsWith('polygon('), `missing official ${key} polygon`);
  expect(data.colors?.[key]?.css, `missing official ${key} color`);
  expect(bridgeTemplate.includes(`${key}: tarotVector('${key}')`), `guide sprite ${key} must be bridged`);
}
expect(css.includes('--waiting-sprite-guide-click-frame') && css.includes('--waiting-sprite-guide-click-inner-glow') && css.includes('--waiting-sprite-guide-talk-frame') && css.includes('--waiting-sprite-guide-arrow'), 'guide frame/arrow vectors must reach CSS');

const starItemKeys = ['starItemEmptyStar', 'starItemLightStar', 'starItemOutline4px', 'starLightItemOutline'];
for (const key of starItemKeys) {
  expect(data.vectors?.[key]?.startsWith('polygon('), `missing official ${key} polygon`);
  expect(data.colors?.[key]?.css, `missing official ${key} color`);
}
expect(bridgeTemplate.includes('emptyStar: tarotVector(\'starItemEmptyStar\')') && bridgeTemplate.includes('lightOutline: tarotVector(\'starLightItemOutline\')'), 'star item vectors must be bridged');
expect(css.includes('--star-panel-empty-star') && css.includes('--star-panel-light-star') && css.includes('--star-panel-outline4px') && css.includes('--star-panel-light-outline'), 'star item vectors must reach CSS');

const rewardOrnamentKeys = ['collectRewardDeco', 'collectRewardDecoCenterCircle', 'collectRewardMask', 'collectRewardNumbg', 'rewardAvatarMask', 'crystalItemGlow', 'crystalItemIcon', 'crystalItemImgmask', 'comHintPanelBg', 'comToastStarDeco'];
for (const key of rewardOrnamentKeys) {
  expect(data.vectors?.[key]?.startsWith('polygon('), `missing official ${key} polygon`);
  expect(data.colors?.[key]?.css, `missing official ${key} color`);
  expect(bridgeTemplate.includes(`${key}: tarotVector('${key}')`), `reward ornament ${key} must be bridged`);
}
expect(css.includes('--waiting-sprite-collect-reward-deco') && css.includes('--waiting-sprite-reward-avatar-mask') && css.includes('--waiting-sprite-crystal-item-icon') && css.includes('--waiting-sprite-com-hint-panel-bg') && css.includes('--waiting-sprite-com-toast-star-deco'), 'reward/crystal ornament vectors must reach CSS');

const uiLayerKeys = [
  'rewardButtonBgRing', 'diamondPattern', 'titleDecoItem', 'buttonDecoItem',
  'storyBgOutline', 'storyFinishIcon', 'storyHintIcon', 'storyLeftDeco',
  'storyRightDeco', 'chartCataTabBg', 'chartTabBg', 'roundBrownDecoL',
  'roundBrownDecoR', 'energyOrb', 'mainSwitchIcon', 'mainMailIcon',
  'mimiBookDeco2', 'mimiBookDeco5', 'mimiTalkDeco', 'mimiTalkPanelBg',
  'nextPageBg', 'openBookCardBg', 'rewardDecoRect', 'rewardDecoRect2',
  'rewardDecoRect3', 'signLightStar',
];
for (const key of uiLayerKeys) {
  const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
  expect(data.vectors?.[key]?.startsWith('polygon('), `missing official UI layer ${key} polygon`);
  expect(data.colors?.[key]?.css, `missing official UI layer ${key} color`);
  expect(bridgeTemplate.includes(`${key}: tarotVector('${key}')`), `UI layer ${key} must be bridged`);
  expect(css.includes(`var(--ui-layer-${cssKey}`), `UI layer ${key} must drive a CSS clip path`);
}
expect(data.colors?.commonBrownPattern?.css && data.colors?.commonRedPattern?.css, 'round-button texture color samples must be exported');
expect(bridgeTemplate.includes('function tarotUiLayerVectors()') && js.includes('tarotUiLayerVectors') && js.includes("setProperty(`--ui-layer-${key}`") && js.includes("setProperty(`--ui-layer-${cssKey}`"), 'UI layer silhouettes must reach runtime CSS variables');
for (const token of [
  'catalog-tab-cata-bg', 'catalog-tab-bg', 'catalog-card-source-page',
  'catalog-card-source-left', 'catalog-card-source-right', 'catalog-card-source-status',
  'path-card-source-diamond', 'reward-source-ring', 'reward-source-bow',
  'reward-source-tick', 'home-glyph-mail-sprite', 'hint-energy-orb',
  'mimi-panel-source-bg', 'mimi-talk-source-deco', 'mimi-book-deco d2',
  'mimi-book-deco d5', 'volume-next-source', 'open-source-card-bg',
  'floating-card-source-bg', 'load-switch-icon', 'expand-source-deco',
  'sign-longpress-light-star',
]) {
  expect(css.includes(`.${token.split(' ')[0]}`), `missing CSS target for ${token}`);
  expect(js.includes(token) || html.includes(token), `missing rendered markup for ${token}`);
}
if (failures.length > earlyFailureCount) {
  console.error(JSON.stringify({ lateFailures: failures.slice(earlyFailureCount) }, null, 2));
}
if (failures.length) process.exitCode = 1;
