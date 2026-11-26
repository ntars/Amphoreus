// Manual 13.6: export only Text.text values already present in dump/*.json.
// Missing long-form content stays TODO; no OCR and no invented copy.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

const states = ['entrance', 'catalog', 'bookletCover', 'bookletPage', 'talk',
  'wikiDialog', 'wikiError', 'mail', 'star', 'reward'];
mkdirSync('content/text', { recursive: true });
let total = 0;
const summary = [];
for (const state of states) {
  const file = `dump/${state}.json`;
  if (!existsSync(file)) envFail(`缺少 dump：${file}`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const entries = [];
  const visit = node => {
    for (const component of node.components || []) {
      if (component.type !== 'Text') continue;
      entries.push({
        path: node.path,
        text: component.text ?? '',
        key: component.localizationKey || null,
        source: 'dump/Text.text',
      });
    }
    (node.children || []).forEach(visit);
  };
  visit(data.root);
  writeFileSync(`content/text/${state}.json`, JSON.stringify({
    state, source: file, entries,
  }, null, 2) + '\n');
  total += entries.length;
  summary.push(`${state}=${entries.length}`);
}
if (!total) fail('所有 state 均无文本');
pass(`text exported: ${summary.join(' ')}`);
