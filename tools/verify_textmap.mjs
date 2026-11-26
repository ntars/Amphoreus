// Gate for the official localization table extraction (tools/extract_textmap.py).
// The table is a runtime text source; it must stay outside the repository and
// remain reproducible from the read-only game copy.
import { readFileSync } from 'node:fs';
import { fail, pass, envFail } from './lib/gate.mjs';

let data;
try {
  data = JSON.parse(readFileSync('dump/_textmap.json', 'utf8'));
} catch (error) {
  envFail(`TextMap dump unavailable: ${error.message}`);
}
if (data.schema !== 'textmap/1') fail(`schema ${data.schema}`);
if (!data.source || !/^[0-9a-f]{64}$/.test(data.source.sha256 || '')) fail('source sha256 missing');
if (!(data.count >= 370000)) fail(`count ${data.count} < 370000`);
if (!(data.conflicts <= 400)) fail(`conflicts ${data.conflicts} > 400`);

// Five sibling UI strings from UIText_TarotBook_StoryTemplatePage_*: if the
// hash->text index is desynchronized these all shift together.
const expected = {
  3656770492: '回到目录',
  2314004923: '本节完',
  3065615277: '点击书页继续',
  2331500738: '上一节',
  2965043345: '下一节',
};
for (const [hash, text] of Object.entries(expected)) {
  if (data.records[hash] !== text) fail(`TextMap ${hash} -> ${data.records[hash]}, expected ${text}`);
}

// The same hash space resolves TarotBook chapter rows in the config blob.
if (data.records['1938603257'] !== '1' || data.records['3803705552'] !== '1-1') {
  fail('TarotBook chapter ids missing from TextMap');
}
pass(`textmap verified: ${data.count} records, ${data.conflicts} 32-bit collisions`);
