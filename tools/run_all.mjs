import { spawn, spawnSync } from 'node:child_process';

const geometryStates = [
  'entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward',
];
const gates = [
  ['verify_docs.mjs'],
  ['audit_gates.mjs'],
  ['audit_no_screenshots.mjs'],
  ['agent/lint_tasks.mjs', 'tasks.json'],
  ['migrate_dump.mjs', '--check'],
  ['lib/unityyaml.test.mjs'],
  ['lib/rect.test.mjs'],
  ['lib/curve.test.mjs'],
  ['build_sprite_index.mjs'],
  ['build_fonts.mjs'],
  ['build_materials.mjs'],
  ['build_text.mjs'],
  ['verify_textmap.mjs'],
  ['verify_separation.mjs'],
  ['diagnose_fidelity.mjs'],
  ['verify_clips.mjs'],
  ['verify_animations.mjs'],
  ['verify_masks.mjs'],
  ['verify_spine.mjs'],
  ['verify_spine_runtime.mjs'],
  ['verify_spine_state_refs.mjs'],
  ['probe_spine.mjs'],
  ['verify_states.mjs'],
  ...geometryStates.map(state => ['verify_geometry.mjs', '--state', state, '--strict']),
  ['verify_materials.mjs'],
  ['verify_assets.mjs'],
  ['smoke_matrix.mjs'],
  ['probe_interaction.mjs'],
  ['probe_nav.mjs'],
  ['probe_delivery.mjs'],
  ['probe_text.mjs'],
];
const existing = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = existing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore', env: process.env });
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(500) });
      if (response.ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}
// Rebuild generated clip CSS before gates so a prior single-clip test cannot
// leave the full verifier with an empty stylesheet.
const clipBuild = spawnSync(process.execPath, ['tools/build_clips.mjs', '--all', '--compile-css'], { stdio: 'ignore' });
if (clipBuild.status !== 0) { server?.kill('SIGKILL'); console.error('ENVFAIL clip CSS build failed'); process.exit(2); }
if (!await waitForServer()) {
  server?.kill('SIGKILL');
  console.error('ENVFAIL 本地预览服务无法启动');
  process.exit(2);
}
let failed = 0;
for (const gate of gates) {
  console.log(`\n=== ${gate.join(' ')} ===`);
  const result = spawnSync(process.execPath, [`tools/${gate[0]}`, ...gate.slice(1)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
server?.kill('SIGKILL');
if (failed) {
  console.error(`${failed} gate(s) failed`);
  process.exit(1);
}
console.log('all gates pass');
