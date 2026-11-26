// Manual 9.1: six canonical RectTransform -> CSS cases.
import { rectToCssAnchors, round4 } from './rect.mjs';
import { assert, pass } from './gate.mjs';

const PW = 1920;
const PH = 1080;
const rt = (anchorMin, anchorMax, pivot, sizeDelta, anchoredPosition) => ({
  anchorMin, anchorMax, pivot, sizeDelta, anchoredPosition,
});
const cases = [
  ['full stretch', rt([0, 0], [1, 1], [0.5, 0.5], [0, 0], [0, 0]), [0, 0, PW, PH]],
  ['full stretch inset', rt([0, 0], [1, 1], [0.5, 0.5], [-40, -40], [0, 0]), [20, 20, PW - 40, PH - 40]],
  ['top right', rt([1, 1], [1, 1], [1, 1], [100, 50], [-20, -20]), [PW - 120, 20, 100, 50]],
  ['bottom left', rt([0, 0], [0, 0], [0, 0], [100, 50], [10, 10]), [10, PH - 60, 100, 50]],
  ['horizontal stretch', rt([0, 1], [1, 1], [0.5, 1], [-40, 50], [0, 0]), [20, 0, PW - 40, 50]],
  ['center anchor', rt([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [200, 100], [0, 0]), [PW / 2 - 100, PH / 2 - 50, 200, 100]],
];
for (const [name, input, want] of cases) {
  const box = rectToCssAnchors(input, PW, PH);
  const got = [box.l, box.t, box.w, box.h].map(round4);
  assert(JSON.stringify(got) === JSON.stringify(want.map(round4)), `${name}: got ${got}, want ${want}`);
}
pass(`rect ${cases.length}/${cases.length} cases pass`);
