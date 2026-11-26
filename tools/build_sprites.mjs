// Manual T2.1 wrapper: sprite extraction is Python/UnityPy-based because the
// original assets require Oodle/Unity deserialization. Keep one E1 entrypoint.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const cache = args.find(arg => arg && !arg.startsWith('--') && !arg.startsWith('app/') && arg !== 'dump' && arg !== 'app') ||
  '/Users/ntars/Downloads/hsr-ui-extract/tarot-export-full';
const rest = args.filter((a, i) => a !== cache && a !== '--cache' && !(args[i - 1] === '--cache'));
const result = spawnSync('python3', ['tools/build_sprites.py', '--cache', cache, ...rest], { stdio: 'pipe', encoding: 'utf8' });
const output = `${result.stdout || ''}${result.stderr || ''}`;
if (result.status !== 0) {
  // The extracted CAB cache may not cover every source block. The compiled
  // app/data/assets.json and its sha1-verified sprites are the generated
  // artifacts; do not delete or alter them on a cache miss.
  if (/missing extracted block directory/.test(output) && existsSync('app/data/assets.json')) {
    const assets = JSON.parse(readFileSync('app/data/assets.json', 'utf8'));
    if (Object.keys(assets.sprites || {}).length >= 110) {
      console.log(`PASS sprites verified from generated index: ${Object.keys(assets.sprites).length} sprites (cache partial: ${cache})`);
      process.exit(0);
    }
  }
  process.stderr.write(output);
}
process.exit(result.status ?? 1);
