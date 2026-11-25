import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { envFail, pass } from './lib/gate.mjs';
import { findChrome } from './lib/cdp.mjs';

const version = process.versions.node.split('.').map(Number);
if (version[0] < 22) envFail(`Node ${process.version} < 22`);
let python = 'unknown';
try { python = execFileSync('python3', ['-V'], { encoding: 'utf8' }).trim(); }
catch (error) { envFail(`python3 不可用：${error.message}`); }
let chrome = 'unknown';
try { chrome = findChrome(); }
catch (error) { envFail(error.message); }
if (!existsSync(`${process.env.HOME}/Downloads/hsr-ui-extract`)) {
  envFail('本机复制数据不存在：~/Downloads/hsr-ui-extract');
}
pass(`node=${process.version} python=${python} chrome=${chrome}`);
