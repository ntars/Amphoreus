#!/usr/bin/env node
/* 用无头 Chrome 按真实点击流程截图 /book。
   只生成验证证据，不参与运行时；/book 仍然零图片资源。 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, args.out || 'docs/screenshots');
const prefix = args.prefix || 'final-';
const baseUrl = args.url || 'http://127.0.0.1:8760/book';
const flow = args.flow || 'all';
const [width, height] = (args.viewport || '1280x720').split('x').map(Number);
const port = Number(args.port || (9300 + process.pid % 500));
const chrome = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : (process.env.CHROME_BIN || 'google-chrome'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no Chrome page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
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
  return { ws, send };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-prefers-reduced-motion', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/amphoreus-capture-${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  const cleanup = () => { try { proc.kill('SIGTERM'); } catch {} };
  process.on('exit', cleanup);

  let conn;
  for (let i = 0; i < 50; i++) {
    try { conn = await connect(); break; } catch { await sleep(200); }
  }
  if (!conn) throw new Error('Chrome CDP did not start');
  const { ws, send } = conn;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });

  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    if (result.error) throw new Error(JSON.stringify(result.error));
    const file = path.join(outDir, prefix + name + '.png');
    fs.writeFileSync(file, Buffer.from(result.result.data, 'base64'));
    console.log(file);
  };
  const click = async (selector) => {
    const expr = `(()=>{const e=document.querySelector(${JSON.stringify(selector)});` +
      `if(!e)return false; e.click(); return true;})()`;
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (!r.result?.result?.value) throw new Error(`missing selector: ${selector}`);
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result?.exceptionDetails) {
      throw new Error(result.result.exceptionDetails.text || 'runtime evaluation failed');
    }
    return result.result?.result?.value;
  };
  const waitFor = async (expression, label, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${label}`);
  };

  await send('Page.navigate', { url: baseUrl });
  await sleep(1500);
  await waitFor(
    `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);return visible.join(',')==='view-cover';})()`,
    'initial cover view',
  );
  await shot('cover');
  await click('#book-cover');
  await waitFor(
    `(()=>{const opened=document.querySelector('#cover-open');const slot=opened?.querySelector('.open-slot');const card=document.querySelector('#floating-card');return !!opened&&opened.classList.contains('choosing')&&getComputedStyle(opened).display!=='none'&&getComputedStyle(slot).display!=='none'&&getComputedStyle(card).display!=='none';})()`,
    'cover choosing state',
  );
  await sleep(200);
  await shot('cover-choosing');
  await click('#floating-card');
  await waitFor(
    `(()=>{const opened=document.querySelector('#cover-open');const slot=opened?.querySelector('.open-slot');return !!opened&&opened.classList.contains('chosen')&&getComputedStyle(opened).display!=='none'&&getComputedStyle(slot).display==='none';})()`,
    'cover chosen state',
  );
  await sleep(200);
  await shot('cover-chosen');

  if (flow === 'all' || flow === 'home') {
    await click('#open-confirm');
    await waitFor(
      `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);return visible.join(',')==='view-home';})()`,
      'home view',
    );
    await sleep(500);
    await shot('home');
    await click('#archive-tabs button[data-arc=hero]');
    await waitFor(
      `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);const cards=[...document.querySelectorAll('#catalog .hero-card')].filter((el)=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0);return visible.join(',')==='view-catalog'&&cards.length===12;})()`,
      'catalogue with twelve visible cards',
    );
    await sleep(300);
    await shot('catalog');
    await evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await sleep(300);
    await shot('catalog-bottom');
    await evaluate('window.scrollTo(0, 0)');
    await click('#catalog .hero-card[data-ch="1"]');
    await waitFor(
      `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);return visible.join(',')==='view-volume';})()`,
      'volume view',
    );
    await sleep(300);
    await shot('volume');
    await click('#archive-tabs button[data-arc=path]');
    await waitFor(
      `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);return visible.join(',')==='view-path'&&document.querySelectorAll('#paths .path-card').length===13;})()`,
      'path view',
    );
    await sleep(300);
    await shot('path');
    await click('#paths .path-card');
    await waitFor(
      `(()=>{const box=document.querySelector('#path-lightbox');return !!box&&!box.classList.contains('hidden')&&box.getAttribute('aria-hidden')==='false';})()`,
      'path detail',
    );
    await sleep(200);
    await shot('path-detail');
    await click('#lightbox-close');
    await sleep(300);

    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await send('Page.navigate', { url: baseUrl + '#catalog' });
    await sleep(1200);
    await waitFor(
      `(()=>{const visible=[...document.querySelectorAll('.spread')].filter((el)=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none').map((el)=>el.id);return visible.join(',')==='view-catalog'&&document.documentElement.scrollWidth<=innerWidth+1;})()`,
      'mobile catalogue without horizontal overflow',
    );
    await shot('mobile');
  }
  ws.close();
  cleanup();
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
