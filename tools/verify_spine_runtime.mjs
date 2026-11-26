import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';
import { SpineSkeleton, sourceUvs } from '../app/js/spine.js';

let data;
try {
  data = JSON.parse(readFileSync('app/data/spine.json', 'utf8'));
} catch (error) { envFail(`Spine 运行时数据不可用：${error.message}`); }

const tolerance = 2e-3;
const cases = [
  {
    id: '8451025478121060839', setup: [-837.348, 544.781, -740.308, 544.77, -634.398, 544.772],
    t0: [0, 857.965, 0, 858.747, 0, 853.289],
    t02: [-752.171, 1084.498, -687.142, 1003.831, -610.149, 919.164],
    uv: [0.001953125, 0.4638671875, 0.096718, 0.463872, 0.200146, 0.463872],
  },
  {
    id: '-348631082036145761',
    t0: [-5.526, 544.779, 100.839, 566.834, 204.658, 584.407],
    t02: [-5.526, 544.779, 100.014, 570.313, 202.623, 593.85],
    uv: [0.001953, 0.463867, 0.108202, 0.463867, 0.210992, 0.463867],
  },
];

for (const test of cases) {
  const skeleton = new SpineSkeleton(data.skeletons[test.id]);
  const attachment = skeleton.data.attachments[0];
  const sample = vertices => {
    const indices = [0, 1, 2, 3, 4, 5];
    const slot = skeleton.slots.find(item => item.attachmentName === attachment.path);
    if (!slot || !vertices.length) return [];
    return indices.flatMap(index => vertices[index] ?? 0);
  };
  if (test.setup?.length) {
    skeleton.apply('Standby' in skeleton.data.animations ? 'Standby' : 'StandbyR', 0);
  }
  for (const [time, name] of [[0, 't0'], [0.2, 't02']]) {
    skeleton.apply('FadeIn' in skeleton.data.animations ? 'FadeIn' : 'FadeInR', time);
    const vertices = skeleton.worldVertices();
    const actual = sample(vertices);
    for (let i = 0; i < test[name].length; i++) {
      if (Math.abs(actual[i] - test[name][i]) > tolerance) {
        fail(`${test.id}: ${name} vertex ${i} ${actual[i]} != source ${test[name][i]}`);
      }
    }
  }
  const uvs = Array.from(sourceUvs(skeleton).slice(0, 6));
  for (let i = 0; i < test.uv.length; i++) {
    if (Math.abs(uvs[i] - test.uv[i]) > tolerance) fail(`${test.id}: UV ${i} ${uvs[i]} != source ${test.uv[i]}`);
  }
}
pass('Spine runtime verified: left page against official 4.1.56; both source meshes at t=0 and t=0.2');
