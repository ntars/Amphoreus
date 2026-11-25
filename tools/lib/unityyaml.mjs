// Minimal Unity YAML reader for the exported AnimationClip subset.
// It intentionally supports only the shapes emitted by convert-all.
export function parseUnityYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('%') || line.trimStart().startsWith('---')) continue;
    const indent = line.match(/^ */)[0].length;
    const m = /^(-\s+)?([^:]+):\s*(.*)$/.exec(line.slice(indent));
    if (!m) continue;
    const isList = Boolean(m[1]);
    const key = m[2].trim();
    const raw = m[3].trim();
    while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).value;
    let value;
    if (raw === '') value = isList ? [] : {};
    else if (/^\d+$/.test(raw)) value = Number(raw);
    else if (/^-?\d+\.\d+(e[-+]?\d+)?$/i.test(raw)) value = Number(raw);
    else if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (raw.startsWith('{') && raw.endsWith('}')) {
      value = Object.fromEntries(raw.slice(1, -1).split(',').map(pair => {
        const [k, ...rest] = pair.split(':');
        return [k.trim(), parseScalar(rest.join(':').trim())];
      }));
    } else value = raw;
    if (isList) {
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push(value);
      if (value && typeof value === 'object') stack.push({ indent, value });
    } else {
      parent[key] = value;
      if (value && typeof value === 'object') stack.push({ indent, value });
    }
  }
  return root;
}

function parseScalar(raw) {
  if (raw === '') return '';
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw.replace(/^['"]|['"]$/g, '');
}
