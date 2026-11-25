export function rectFromAnchors(rt, parentW, parentH) {
  const [aminX, aminY] = rt.anchorMin;
  const [amaxX, amaxY] = rt.anchorMax;
  const [px, py] = rt.pivot;
  const [sx, sy] = rt.localScale;
  const w = (amaxX - aminX) * parentW + rt.sizeDelta[0] * sx;
  const h = (amaxY - aminY) * parentH + rt.sizeDelta[1] * sy;
  const ax = aminX * parentW + rt.anchoredPosition[0] * sx;
  const ay = aminY * parentH + rt.anchoredPosition[1] * sy;
  return {
    l: ax - px * w,
    t: (parentH - ay) - (1 - py) * h,
    w,
    h,
  };
}
