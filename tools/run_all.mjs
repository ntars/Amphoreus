import { spawnSync } from 'node:child_process';

const gates = [
  'audit_no_screenshots.mjs',
  'verify_geometry.mjs',
  'verify_clips.mjs',
  'verify_states.mjs',
  'verify_assets.mjs',
];
let failed = 0;
for (const gate of gates) {
  console.log(`\n=== ${gate} ===`);
  const result = spawnSync(process.execPath, [`tools/${gate}`], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
if (failed) {
  console.error(`${failed} gate(s) failed`);
  process.exit(1);
}
console.log('all gates pass');
