// xxHash64 (seed 0), ported from the public-domain reference algorithm.
// Used only to identify TextID values in the unpacked TextMap; no game data
// is copied into the repository.
const P1 = 0x9E3779B185EBCA87n, P2 = 0xC2B2AE3D27D4EB4Fn;
const P3 = 0x165667B19E3779F9n, P4 = 0x85EBCA77C2B2AE63n, P5 = 0x27D4EB2F165667C5n;
const M = (1n << 64n) - 1n;
const rotl = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & M;
const mul = (a, b) => (a * b) & M;
function round(acc, input) {
  acc = (acc + mul(input, P2)) & M;
  acc = rotl(acc, 31);
  return mul(acc, P1);
}
function mergeRound(acc, val) {
  acc ^= round(0n, val);
  return (mul(acc, P1) + P4) & M;
}
export function xxh64(bytes, seed = 0n) {
  const buf = Buffer.from(bytes);
  const len = buf.length;
  let i = 0;
  let h;
  if (len >= 32) {
    let v1 = (seed + P1 + P2) & M, v2 = (seed + P2) & M;
    let v3 = seed & M, v4 = (seed - P1) & M;
    while (i + 32 <= len) {
      v1 = round(v1, buf.readBigUInt64LE(i));
      v2 = round(v2, buf.readBigUInt64LE(i + 8));
      v3 = round(v3, buf.readBigUInt64LE(i + 16));
      v4 = round(v4, buf.readBigUInt64LE(i + 24));
      i += 32;
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & M;
    h = mergeRound(h, v1); h = mergeRound(h, v2);
    h = mergeRound(h, v3); h = mergeRound(h, v4);
  } else {
    h = (seed + P5) & M;
  }
  h = (h + BigInt(len)) & M;
  while (i + 8 <= len) {
    h ^= round(0n, buf.readBigUInt64LE(i));
    h = (rotl(h, 27) * P1 + P4) & M;
    i += 8;
  }
  if (i + 4 <= len) {
    h ^= mul(BigInt(buf.readUInt32LE(i)), P1);
    h = (rotl(h, 23) * P2 + P3) & M;
    i += 4;
  }
  while (i < len) {
    h ^= mul(BigInt(buf[i]), P5);
    h = (rotl(h, 11) * P1) & M;
    i += 1;
  }
  h ^= h >> 33n; h = mul(h, P2);
  h ^= h >> 29n; h = mul(h, P3);
  h ^= h >> 32n;
  return h;
}
