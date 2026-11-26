// Manual 13.1 state graph, exercised through real DOM clicks and Escape.
// This gate exists because button components (AnimatorButton, IntroButton,
// MonoInControlButton, UINavigationButton) can silently disappear from the
// dump; when they do, the UI still renders but nothing is clickable.
import { spawn } from 'node:child_process';
import { launch } from './lib/cdp.mjs';
import { envFail, fail, pass } from './lib/gate.mjs';

const base = 'http://127.0.0.1:8080/';
const alreadyServing = await fetch(base, { signal: AbortSignal.timeout(300) }).then(r => r.ok).catch(() => false);
const server = alreadyServing ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'ignore' });
if (!alreadyServing) await new Promise(resolve => setTimeout(resolve, 400));

let browser;
try {
  const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) envFail(`page HTTP ${response.status}`);
} catch (error) {
  envFail(`8080 未就绪：${error.message}`);
}

const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (await browser.evaluate(`!!document.getElementById('stage')`)) return true;
  }
  return false;
};

try {
  browser = await launch();
  await browser.setViewport(1920, 1080, 1);
  const current = () => browser.evaluate(`new URL(location.href).searchParams.get('state')`);
  const clickHit = async name => {
    const found = await browser.evaluate(`(() => {
      const stage = document.getElementById('stage');
      const el = [...stage.querySelectorAll('.node[data-hit="1"]')]
        .find(node => (node.dataset.path || '').split('/').pop() === ${JSON.stringify(name)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    await new Promise(resolve => setTimeout(resolve, 700));
    await ready();
    return [found, await current()];
  };
  const escape = async () => {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(resolve => setTimeout(resolve, 700));
    await ready();
    return current();
  };

  await browser.navigate(`${base}?state=entrance&anim=0`);
  if (!await ready()) fail('entrance: stage never rendered');
  if (await current() !== 'entrance') fail('entrance: wrong initial state');

  const book = await clickHit('BtnEntrance1');
  if (!book[0] || book[1] !== 'catalog') fail(`entrance BtnEntrance1 -> ${book[1]} (found=${book[0]})`);

  const item = await clickHit('BtnBook');
  if (!item[0] || item[1] !== 'bookletCover') fail(`catalog BtnBook -> ${item[1]} (found=${item[0]})`);

  await browser.navigate(`${base}?state=catalog&anim=0`);
  if (!await ready()) fail('catalog: stage never rendered before BtnWiki');
  // Lua TarotBookNewMainPageBinder: FunctionList/BtnWiki -> btn_wiki ->
  // _on_btn_wiki_click -> Ui.TarotBook.Wiki.TarotBookWikiDialog.
  const wiki = await clickHit('BtnWiki');
  if (!wiki[0] || wiki[1] !== 'wikiDialog') fail(`catalog BtnWiki -> ${wiki[1]} (found=${wiki[0]})`);

  // Lua TarotBookNewMainPageBinder: FunctionList/BtnMem -> btn_mem ->
  // _on_btn_mem_click -> MimiButton:GetDefaultInteraction/TryPlayInteraction
  // -> UI/TarotBook/TarotBookMimiTalkPage.prefab.
  await browser.navigate(`${base}?state=catalog&anim=0`);
  if (!await ready()) fail('catalog: stage never rendered before BtnMem');
  const mimi = await clickHit('BtnMem');
  if (!mimi[0] || mimi[1] !== 'talk') fail(`catalog BtnMem -> ${mimi[1]} (found=${mimi[0]})`);

  await browser.navigate(`${base}?state=bookletCover&anim=0`);
  if (!await ready()) fail('bookletCover: stage never rendered before BookPro');
  const cover = await clickHit('BookPro');
  if (!cover[0] || cover[1] !== 'bookletPage') fail(`bookletCover BookPro -> ${cover[1]} (found=${cover[0]})`);

  const back = await escape();
  if (back !== 'bookletCover') fail(`bookletPage Escape -> ${back}`);
  const back2 = await escape();
  if (back2 !== 'catalog') fail(`bookletCover Escape -> ${back2}`);
  const back3 = await escape();
  if (back3 !== 'entrance') fail(`catalog Escape -> ${back3}`);

  for (const [state, target] of [['talk', 'bookletPage'], ['wikiDialog', 'bookletPage'], ['mail', 'catalog'], ['star', 'catalog'], ['reward', 'catalog']]) {
    await browser.navigate(`${base}?state=${state}&anim=0`);
    if (!await ready()) fail(`${state}: stage never rendered`);
    const to = await escape();
    if (to !== target) fail(`${state} Escape -> ${to}, expected ${target}`);
  }

  pass('navigation verified: entrance->catalog->bookletCover->bookletPage, catalog BtnWiki->wikiDialog, catalog BtnMem->talk, and Escape returns');
} catch (error) {
  fail(`navigation probe: ${error.message}`);
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGKILL');
}
