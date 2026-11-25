import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function pngSize(path) {
  const b = readFileSync(path);
  if (b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`not a PNG: ${path}`);
  }
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
