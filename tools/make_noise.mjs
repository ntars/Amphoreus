import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const size = 256;
const bytes = Buffer.alloc((size * size + 1) * 3);
let seed = 0x5eed1234;
const next = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed;
};
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 3 + 1;
    const value = next() & 255;
    bytes[offset] = value;
    bytes[offset + 1] = value;
    bytes[offset + 2] = value;
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, crcBuf]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('app/assets', { recursive: true });
writeFileSync('app/assets/noise-256.png', png);
console.log(`generated app/assets/noise-256.png ${png.length} bytes`);
