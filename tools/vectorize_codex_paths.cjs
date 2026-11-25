const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const ROOT = process.env.AMPHOREUS_ROOT || path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'web/assets/codex/svg');
const SRC = path.join(ROOT, 'web/assets/codex/thumbs');
const keys = ['tribbie','cerydra','nightveil','danheng','helektra','hyacine','phainon','anaxa','aglaea','mydeimos','castorice','cipher','cyrene'];
function traceOne(k,i) {
  return new Promise((resolve,reject) => {
    potrace.posterize(path.join(SRC, `path-${k}.png`), {
      // 命路卡是窄长图。五层 posterize 会把大面积纸面拆成数百万个路径点，
      // 单张 SVG 可达 18 MB；三层保留主要明暗，路径量降到可用范围。
      steps: 3, rangeDistribution: 'equal', optCurve: true,
      turdSize: 40, color: '#c1ad7d', background: 'transparent',
    }, (err, svg) => {
      if (err) return reject(err);
      if (/currentColor/.test(svg) || !svg.includes('fill="#c1ad7d"')) {
        return reject(new Error(`${k}: unexpected SVG fill`));
      }
      fs.writeFileSync(path.join(OUT, `path-${k}.svg`), svg);
      console.log(i+1,'/',keys.length,k,svg.length);
      resolve();
    });
  });
}
(async()=>{for(let i=0;i<keys.length;i++) await traceOne(keys[i],i);})().catch(e=>{console.error(e);process.exit(1)});
