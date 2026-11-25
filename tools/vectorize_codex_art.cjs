const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const potrace = require('potrace');
const ROOT = process.env.AMPHOREUS_ROOT || path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'web/assets/codex/svg');
const SRC = path.join(ROOT, 'web/assets/codex');
const WIKI = path.join(SRC, 'wiki');
const PAGE = path.join(SRC, 'page');

// 模板:如我所书 中的书页 Photoshop 素材。转成矢量后仍保留官方纸张轮廓和页边纹样。
const pageAssets = [
  ['page-left.png', 'page-left', '#e9e3db'],
  ['page-right.png', 'page-right', '#e9e3db'],
  ['left-deco.png', 'deco-left', '#c1ad7d'],
  ['right-deco.png', 'deco-right', '#c1ad7d'],
  ['underline.png', 'underline', '#c1ad7d'],
  ['left-deco.png', 'left-deco', '#c1ad7d'],
  ['right-deco.png', 'right-deco', '#c1ad7d'],
];

const files = [
  ['hero.png','hero','#c1ad7d'],['path.png','path','#c1ad7d'],
  ['mimi.png','mimi','#c1ad7d'],['warden.png','warden','#c1ad7d'],
  ['me13.png','me13','#c1ad7d'],['mail.png','mail','#c1ad7d'],
  ...['tribbie','cerydra','nightveil','danheng','helektra','hyacine',
      'phainon','anaxa','aglaea','mydeimos','castorice','cipher','cyrene']
      .map(k => [`wiki/${k}.png`, `avatar-${k}`, '#c1ad7d']),
  ...['tribbie','cerydra','nightveil','danheng','helektra','hyacine',
      'phainon','anaxa','aglaea','mydeimos','castorice','cipher','cyrene']
      .map(k => [`path-${k}.png`, `path-${k}`, '#c1ad7d']),
];

function traceOne(rel, name, color, i) {
  return new Promise((resolve, reject) => {
    potrace.posterize(path.join(SRC, rel), {
      steps: 6,
      rangeDistribution: 'equal',
      optCurve: true,
      turdSize: 4,
      color,
      background: 'transparent',
    }, (err, svg, instance) => {
      if (err) return reject(err);
      // <img src="*.svg"> 不会继承页面 CSS 的 currentColor，SVG 必须自带颜色。
      if (/currentColor/.test(svg) || !svg.includes(`fill="${color}"`)) {
        return reject(new Error(`${name}: unexpected SVG fill`));
      }
      fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
      console.log(i + 1, '/', files.length, name, svg.length);
      resolve();
    });
  });
}

function tracePage(file, name, color) {
  const source = path.join(PAGE, file);
  if (!fs.existsSync(source)) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    potrace.posterize(source, {
      steps: 2,
      rangeDistribution: 'equal',
      optCurve: true,
      turdSize: 20,
      color,
      background: 'transparent',
    }, (err, svg) => {
      if (err) return reject(err);
      fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
      resolve(svg.length);
    });
  });
}

// 英雄头像是浅底彩色图。直接 posterize 会把浅色区域描成透明，叠在深色卡片上
// 就成为黑剪影；先压成“深线为黑、浅底为白”的灰度图，再用 Potrace 取线。
async function traceAvatar(rel, name, color) {
  // 优先用公开 wiki 转录的官方英雄纪插画；旧目录只作为本地素材回退。
  const wikiPath = path.join(WIKI, path.basename(rel));
  const source = fs.existsSync(wikiPath) ? wikiPath : path.join(SRC, rel);
  const img = await Jimp.read(source);
  const gray = new Jimp(img.bitmap.width, img.bitmap.height, 0xffffffff);
  for (let y = 0; y < img.bitmap.height; y++) {
    for (let x = 0; x < img.bitmap.width; x++) {
      const c = Jimp.intToRGBA(img.getPixelColor(x, y));
      const lum = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
      // 源图大部分是浅米色；把中段亮度压深，保留高光为纸面，避免大片剪影。
      const v = Math.round(255 * Math.max(0, Math.min(1, (lum - 0.30) / 0.62)));
      gray.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
  }
  return new Promise((resolve, reject) => {
    const tracer = new potrace.Potrace({
      threshold: 190,
      color,
      background: 'transparent',
      turdsize: 2,
      opttolerance: 0.2,
    });
    tracer.loadImage(gray, (err) => {
      if (err) return reject(err);
      const svg = tracer.getSVG();
      if (/currentColor/.test(svg) || !svg.includes(`fill="${color}"`)) {
        return reject(new Error(`${name}: unexpected SVG fill`));
      }
      fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
      resolve(svg.length);
    });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const nonAvatars = files.filter(([, name]) => !name.startsWith('avatar-'));
  for (let i = 0; i < nonAvatars.length; i++) {
    await traceOne(...nonAvatars[i], i);
  }
  const avatars = files.filter(([, name]) => name.startsWith('avatar-'));
  for (let i = 0; i < avatars.length; i++) {
    const [rel, name, color] = avatars[i];
    const length = await traceAvatar(rel, name, color);
    console.log(i + 1, '/', avatars.length, name, length);
  }
  for (const [file, name, color] of pageAssets) {
    const length = await tracePage(file, name, color);
    if (length) console.log('page', name, length);
  }
})().catch(e => { console.error(e); process.exit(1); });
