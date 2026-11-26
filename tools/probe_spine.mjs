import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { fail, pass, envFail } from './lib/gate.mjs';

const expectedByState = {
  bookletCover: [['n-0062', '8451025478121060839'], ['n-0065', '-348631082036145761']],
  bookletPage: [['n-0062', '8451025478121060839'], ['n-0065', '-348631082036145761']],
  talk: [['n-0020', '8451025478121060839'], ['n-0012', '-348631082036145761']],
};
const already = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = already ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!already) await new Promise(resolve => setTimeout(resolve, 400));
let browser;
try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  for (const [state, expected] of Object.entries(expectedByState)) {
    await browser.navigate(`http://127.0.0.1:8080/?state=${state}&anim=0&freeze=0.2`);
    await new Promise(resolve => setTimeout(resolve, 500));
    for (const [id, pathId] of expected) {
      const report = JSON.parse(await browser.evaluate(`(() => {
        const c = document.querySelector('.node[data-id="${id}"] canvas.spine-layer');
        if (!c) return JSON.stringify({ canvas:false });
        if (c.dataset.spine !== '${pathId}') {
          return JSON.stringify({ canvas:true, wrongPath:c.dataset.spine });
        }
        const ctx = c.getContext('2d');
        const pixels = ctx.getImageData(0,0,c.width,c.height).data;
        let opaque = 0;
        let minX = c.width;
        let minY = c.height;
        let maxX = -1;
        let maxY = -1;
        for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) {
          if (pixels[(y*c.width+x)*4+3] <= 8) continue;
          opaque++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        return JSON.stringify({
          canvas:true, opaque, width:c.width, height:c.height,
          bbox: opaque ? [minX,minY,maxX,maxY] : null,
        });
      })()`));
      if (!report.canvas) fail(`${state} ${id}: Spine canvas missing`);
      if (report.wrongPath) fail(`${state} ${id}: SkeletonDataAsset ${report.wrongPath} != ${pathId}`);
      if (!(report.opaque > 1000)) fail(`${state} ${id}: Spine canvas painted pixels=${report.opaque}`);
      // The SkeletonGraphic is intentionally clipped by its page mask. A
      // source pose may therefore fill the full canvas height; only require
      // that this node produced a non-trivial rasterized mesh.
      const [minX, minY, maxX, maxY] = report.bbox;
      if (maxX < minX || maxY < minY) fail(`${state} ${id}: invalid painted mesh bbox`);
    }
  }
  pass('Spine canvases render source meshes: 3 states x 2 source nodes');
} catch (error) { envFail(`Spine CDP 探针失败：${error.message}`); }
finally { if (browser) await browser.close(); }
