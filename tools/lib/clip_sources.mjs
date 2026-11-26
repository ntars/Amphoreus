import { readFileSync, readdirSync } from 'node:fs';
import { basename, delimiter, join } from 'node:path';

const EXTRACT_ROOT = '/Users/ntars/Downloads/hsr-ui-extract';

export const SOURCE_DIRS = (process.env.TAROT_ANIM_DIRS || [
  process.env.TAROT_ANIM_DIR ||
    join(EXTRACT_ROOT, 'exports/convert-all/assets/asbres/ui/animation/tarotbook'),
  join(EXTRACT_ROOT, 'source-dump/tarot-source/assets/asbres/ui/animation/tarotbook'),
].join(delimiter)).split(delimiter).filter(Boolean);

// The export-all directory predates the final BookletPage source block and
// omits its entry/exit clips. Include the source-proven clips needed by the
// two BookletPage variants; `TAROT_ANIM_ALL=1` opts into every source clip.
export const EXTRA_CLIPS = new Set([
  'TarotBookBookletPage_FadeIn',
  'TarotBookBookletPage_FadeIn3',
  'TarotBookBookletPage_FadeOut',
]);

export function collectClipSources(dirs = SOURCE_DIRS) {
  const files = new Map();
  for (const [dirIndex, dir] of dirs.entries()) {
    for (const name of readdirSync(dir).filter(name => name.endsWith('.anim'))) {
      const stem = basename(name, '.anim');
      if (dirIndex > 0 && process.env.TAROT_ANIM_ALL !== '1' && !EXTRA_CLIPS.has(stem)) continue;
      const path = join(dir, name);
      const previous = files.get(stem);
      if (previous && readFileSync(previous, 'utf8') !== readFileSync(path, 'utf8')) {
        throw new Error(`同名动画内容冲突：${stem}: ${previous} != ${path}`);
      }
      files.set(stem, path);
    }
  }
  return files;
}
