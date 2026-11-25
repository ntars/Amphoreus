export function hermite(frame, prev, next, t) {
  const time = frame.time ?? frame.m_Time ?? 0;
  if (prev && t <= time) return prev;
  const value = frame.value ?? frame.m_Value ?? 0;
  const inSlope = frame.inSlope ?? 0;
  const outSlope = frame.outSlope ?? 0;
  const t0 = prev?.time ?? time;
  const v0 = prev?.value ?? value;
  const t1 = next?.time ?? time + 1;
  const dt = Math.max(t1 - t0, 1e-6);
  const u = Math.min(1, Math.max(0, (t - t0) / dt));
  const m0 = outSlope * dt;
  const m1 = inSlope * dt;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 +
    (-2 * u3 + 3 * u2) * value + (u3 - u2) * m1;
}

export function sampleCurve(frames, t) {
  if (!frames?.length) return 0;
  const sorted = [...frames].sort((a, b) => (a.time ?? a.m_Time) - (b.time ?? b.m_Time));
  if (t <= sorted[0].time) return sorted[0].value ?? sorted[0].m_Value ?? 0;
  if (t >= sorted.at(-1).time) return sorted.at(-1).value ?? sorted.at(-1).m_Value ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    if (t <= sorted[i].time) {
      return hermite(sorted[i], sorted[i - 1], sorted[i + 1], t);
    }
  }
  return 0;
}
