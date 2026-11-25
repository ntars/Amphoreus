import { spawnSync } from 'node:child_process';

const cases = [
  ['pass', "import('./gate.mjs').then(m=>m.pass('ok'))", 0],
  ['fail', "import('./gate.mjs').then(m=>m.fail('bad'))", 1],
  ['envFail', "import('./gate.mjs').then(m=>m.envFail('env'))", 2],
];
for (const [name, code, expected] of cases) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: 'tools/lib' });
  if (result.status !== expected) {
    console.error(`FAIL gate ${name}: exit ${result.status}, expected ${expected}`);
    process.exit(1);
  }
}
console.log('PASS gate 3/3 exit codes');
