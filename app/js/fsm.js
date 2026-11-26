// Source-defined P0 state graph from manual 13.1. No inferred transitions.
// catalog -> wikiDialog is bound in Lua: TarotBookNewMainPageBinder maps
// BtnWiki -> btn_wiki -> _on_btn_wiki_click -> Ui.TarotBook.Wiki.TarotBookWikiDialog.
// catalog -> talk is bound in Lua: FunctionList/BtnMem -> btn_mem ->
// _on_btn_mem_click -> MimiButton:GetDefaultInteraction / TryPlayInteraction,
// which loads UI/TarotBook/TarotBookMimiTalkPage.prefab.
const TRANSITIONS = {
  entrance: { 'click:book': 'catalog' },
  catalog: {
    'click:item': 'bookletCover', esc: 'entrance', 'click:mail': 'mail',
    'click:star': 'star', 'click:reward': 'reward',
    'click:term': 'wikiDialog', 'click:mimi': 'talk',
  },
  bookletCover: { 'click:cover': 'bookletPage', esc: 'catalog' },
  // Manual 13.1 also lists bookletPage click:term / click:mimi. The booklet prefab
  // has no Wiki/Mimi button node, so those two edges stay declared but unreachable
  // from DOM; the reachable, source-proven entries are the catalog buttons below.
  bookletPage: { 'click:term': 'wikiDialog', 'click:mimi': 'talk', esc: 'bookletCover' },
  wikiDialog: { error: 'wikiError', talk: 'talk', esc: 'bookletPage' },
  wikiError: { retry: 'wikiDialog', esc: 'bookletPage' },
  talk: { esc: 'bookletPage' },
  mail: { esc: 'catalog' },
  star: { esc: 'catalog' },
  reward: { esc: 'catalog' },
};
export const STATES = Object.keys(TRANSITIONS);

export function targetOf(from, event) {
  return TRANSITIONS[from]?.[event] || null;
}

export function navigate(from, event, pushState = true) {
  const to = targetOf(from, event);
  if (!to) return from;
  const url = new URL(location.href);
  url.searchParams.set('state', to);
  if (pushState) history.pushState({ state: to }, '', url);
  return to;
}

export function eventForNode(node, state) {
  const path = node.dataset.path || '';
  const leaf = path.split('/').at(-1) || '';
  if (!node.dataset.hit) return null;
  if (state === 'entrance' && /BtnEntrance|Book|BtnSwitch/i.test(leaf)) return 'click:book';
  if (state === 'catalog') {
    if (/Mail/i.test(leaf)) return 'click:mail';
    if (/Star/i.test(leaf)) return 'click:star';
    if (/Reward|Quest/i.test(leaf)) return 'click:reward';
    // Lua binder: Root/PanelContent/DesktopPanel/FunctionList/BtnWiki -> btn_wiki
    if (/^BtnWiki$/.test(leaf)) return 'click:term';
    // Lua binder: Root/PanelContent/DesktopPanel/FunctionList/BtnMem -> btn_mem
    if (/^BtnMem$/.test(leaf)) return 'click:mimi';
    return 'click:item';
  }
  if (state === 'bookletCover' && /Cover|Book/i.test(leaf)) return 'click:cover';
  if (state === 'bookletPage') {
    if (/Wiki|Term/i.test(leaf)) return 'click:term';
    if (/Mimi|Talk/i.test(leaf)) return 'click:mimi';
  }
  if (state === 'wikiDialog' && /Error/i.test(leaf)) return 'error';
  if (state === 'wikiError' && /Retry|Close/i.test(leaf)) return 'retry';
  return null;
}
