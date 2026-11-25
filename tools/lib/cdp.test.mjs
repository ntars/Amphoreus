import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { launch } from './cdp.mjs';
import { fail, pass } from './gate.mjs';

const before = new Set((await import('node:fs')).readdirSync(tmpdir()).filter(n => n.startsWith('amphoreus-')));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>cdp-test</title><div id="box" style="width:120px;height:40px"></div>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launch();
  const title = await browser.evaluate('document.title');
  if (title === 'cdp-test') fail('title should be about:blank before navigation');
  await browser.setViewport(1920, 1080, 1);
  await browser.navigate(`http://127.0.0.1:${server.address().port}/`);
  await new Promise(resolve => setTimeout(resolve, 200));
  const afterTitle = await browser.evaluate('document.title');
  const rect = await browser.evaluate("JSON.stringify(document.getElementById('box').getBoundingClientRect())");
  const parsed = JSON.parse(rect);
  const viewport = await browser.evaluate('JSON.stringify([innerWidth, innerHeight])');
  const v = JSON.parse(viewport);
  if (afterTitle !== 'cdp-test') fail('CDP title assertion failed');
  if (parsed.width !== 120 || parsed.height !== 40) fail('CDP rect assertion failed');
  if (v[0] !== 1920 || v[1] !== 1080) fail('CDP viewport assertion failed');
} catch (error) {
  fail(`CDP test error: ${error.message}`);
} finally {
  if (browser) await browser.close();
  server.close();
  await new Promise(resolve => setTimeout(resolve, 100));
}
const after = (await import('node:fs')).readdirSync(tmpdir()).filter(n => n.startsWith('amphoreus-') && !before.has(n));
if (after.length) fail(`CDP temp profile residue: ${after.join(',')}`);
pass('CDP 3/3 assertions pass, 0 temp residue');
