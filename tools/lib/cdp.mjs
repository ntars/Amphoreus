import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export function findChrome() {
  const path = CANDIDATES.find(existsSync);
  if (!path) throw new Error('找不到 Chrome，用 CHROME_PATH 指定');
  return path;
}

export async function launch({ headless = true } = {}) {
  if (typeof WebSocket === 'undefined') throw new Error('需要 Node >= 22（内置 WebSocket）');
  const profile = mkdtempSync(join(tmpdir(), 'amphoreus-'));
  const child = spawn(findChrome(), [
    headless ? '--headless=new' : '--new-window',
    '--no-sandbox', '--remote-debugging-port=0', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--user-data-dir=${profile}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome 启动超时')), 20000);
    child.stderr.on('data', chunk => {
      buf += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const sock = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  sock.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result);
      return;
    }
    if (msg.method && listeners.has(msg.method)) {
      for (const cb of listeners.get(msg.method)) cb(msg.params);
    }
  });
  await new Promise((resolve, reject) => {
    sock.addEventListener('open', resolve, { once: true });
    sock.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => {
      pending.delete(mid);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(mid, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    sock.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  return {
    on(method, cb) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(cb);
    },
    send: (method, params) => send(method, params, sessionId),
    async setViewport(width, height, deviceScaleFactor = 1) {
      await send('Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor, mobile: false }, sessionId);
    },
    async navigate(url) {
      await send('Page.navigate', { url }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 250));
    },
    async evaluate(expression) {
      const result = await send('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''));
      return result.result.value;
    },
    async close() {
      try { sock.close(); } catch {}
      try { child.kill('SIGKILL'); } catch {}
      try { rmSync(profile, { recursive: true, force: true }); }
      catch (error) { console.warn(`临时目录未清理：${profile}: ${error.message}`); }
    },
  };
}
