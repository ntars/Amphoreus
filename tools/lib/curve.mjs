// Unity weighted Bezier curve evaluation. Shared by clip compilation and the
// manual 11.10 verifier; no interpolation heuristics are added here.
export const bez = (a, b, c, d, u) => {
  const m = 1 - u;
  return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d;
};

export function evalCurve(keys, t) {
  if (!keys?.length) return 0;
  const first = keys[0];
  if (keys.length === 1 || t <= first.time) return first.value;
  const last = keys[keys.length - 1];
  if (t >= last.time) return last.value;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].time <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const dt = k1.time - k0.time;
  if (dt <= 1e-6) return k1.value;
  // Unity's non-weighted transition between two zero-slope keys is linear;
  // using cubic control weights here would flatten the middle segment.
  const w0 = (k0.weightedMode & 2) ? k0.outWeight : (k0.outSlope === 0 && k1.inSlope === 0 ? 0 : 1 / 3);
  const w1 = (k1.weightedMode & 1) ? k1.inWeight : (k0.outSlope === 0 && k1.inSlope === 0 ? 0 : 1 / 3);
  const p1x = k0.time + w0 * dt, p1y = k0.value + w0 * dt * k0.outSlope;
  const p2x = k1.time - w1 * dt, p2y = k1.value - w1 * dt * k1.inSlope;
  let lo = 0, hi = 1;
  for (let step = 0; step < 30; step++) {
    const mid = (lo + hi) / 2;
    if (bez(k0.time, p1x, p2x, k1.time, mid) < t) lo = mid; else hi = mid;
  }
  return bez(k0.value, p1y, p2y, k1.value, (lo + hi) / 2);
}
