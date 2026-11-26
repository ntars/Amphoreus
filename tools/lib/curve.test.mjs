// Manual 11.3: constant / linear / step curve evaluation cases.
import { evalCurve } from './curve.mjs';
import { assert, near, pass } from './gate.mjs';

const key = (time, value, extra = {}) => ({
  time, value, inSlope: 0, outSlope: 0, inWeight: 1 / 3, outWeight: 1 / 3, weightedMode: 0, ...extra,
});
assert(near(evalCurve([key(0, 3), key(1, 3)], 0.25), 3, 1e-3), 'constant');
assert(near(evalCurve([key(0, 0), key(1, 10)], 0.25), 2.5, 1e-3), 'linear');
assert(near(evalCurve([key(0, 0), key(0.5, 0), key(0.5, 1), key(1, 1)], 0.75), 1, 1e-3), 'step');
pass('curve 3/3 cases pass');
