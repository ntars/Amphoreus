export function round4(value) {
  return Math.round(value * 1e4) / 1e4;
}

// Manual 9.1 reference formula. anchoredPosition is pivot-compensated with
// sizeDelta, not the resolved width/height.
export function rectToCssAnchors(rt, parentW, parentH) {
  const [aminX, aminY] = rt.anchorMin;
  const [amaxX, amaxY] = rt.anchorMax;
  const [sdx, sdy] = rt.sizeDelta;
  const [px, py] = rt.pivot;
  const [apx, apy] = rt.anchoredPosition;
  const w = (amaxX - aminX) * parentW + sdx;
  const h = (amaxY - aminY) * parentH + sdy;
  return {
    l: round4(aminX * parentW + apx - px * sdx),
    t: round4(parentH - (aminY * parentH + apy - py * sdy) - h),
    w: round4(w),
    h: round4(h),
  };
}

// Source importer path. Layout controllers resolve rt.size during import;
// localPosition is relative to the parent pivot and must be compensated by
// the resolved extent rather than raw sizeDelta.
export function rectToCssAuthored(rt, parentW, parentH, parentPivot = [0.5, 0.5]) {
  const [aminX, aminY] = rt.anchorMin;
  const [amaxX, amaxY] = rt.anchorMax;
  const [sdx, sdy] = rt.sizeDelta;
  const [px, py] = rt.pivot;
  const w = (amaxX - aminX) * parentW + sdx;
  const h = (amaxY - aminY) * parentH + sdy;
  const [rw, rh] = Array.isArray(rt.size) ? rt.size : [w, h];
  const originX = parentW * parentPivot[0] + rt.localPosition[0];
  const originY = parentH * parentPivot[1] + rt.localPosition[1];
  return {
    l: round4(originX - px * rw),
    t: round4(originY - py * rh),
    w: round4(w),
    h: round4(h),
  };
}

// Canonical compiler entry: choose the path implied by the source record.
export function rectToCss(rt, parentW, parentH, parentPivot = [0.5, 0.5]) {
  return Array.isArray(rt.localPosition)
    ? rectToCssAuthored(rt, parentW, parentH, parentPivot)
    : rectToCssAnchors(rt, parentW, parentH);
}
