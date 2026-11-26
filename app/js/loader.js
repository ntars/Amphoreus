export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadAssets() {
  const [manifest, assets] = await Promise.all([loadJson('./data/manifest.json'), loadJson('./data/assets.json')]);
  if (manifest.version !== assets.version) throw new Error('manifest/assets version mismatch');
  return assets;
}

export async function loadState(state) {
  const data = await loadJson(`./data/states/${state}.json`);
  const manifest = await loadJson('./data/manifest.json');
  if (data.schema !== 1 || manifest.version == null) throw new Error('state/manifest schema mismatch');
  return data;
}
