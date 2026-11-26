// Minimal Unity YAML reader for the exported AnimationClip subset.
// Supports mappings, sequences, and the inline "- key: value" list form.
export function parseUnityYaml(text) {
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('%') || line.trimStart().startsWith('---')) continue;
    const indent = line.match(/^ */)[0].length;
    const body = line.slice(indent);
    const m = /^(-\s+)?([^:]+):\s*(.*)$/.exec(body);
    if (!m) continue;
    lines.push({ indent, list: Boolean(m[1]), key: m[2].trim(), raw: m[3].trim() });
  }
  let pos = 0;
  const value = minIndent => {
    if (pos >= lines.length || lines[pos].indent < minIndent) return '';
    return lines[pos].list ? list(lines[pos].indent) : map(lines[pos].indent);
  };
  const map = indent => {
    const out = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].list) {
      const { key, raw } = lines[pos++];
      if (raw !== '') out[key] = parseScalar(raw);
      else if (pos < lines.length && lines[pos].list && lines[pos].indent >= indent && lines[pos].indent <= indent + 2) out[key] = list(lines[pos].indent);
      else if (pos < lines.length && lines[pos].indent > indent) out[key] = map(lines[pos].indent);
      else out[key] = '';
    }
    return out;
  };
  const list = indent => {
    const out = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].list) {
      const first = lines[pos++];
      const item = {};
      if (first.raw !== '') {
        item[first.key] = parseScalar(first.raw);
      } else if (pos < lines.length && lines[pos].indent > indent + 2) {
        item[first.key] = value(indent + 4);
      } else {
        item[first.key] = '';
      }
      // Remaining fields of a "- key:" item live at indent+2.
      while (pos < lines.length && lines[pos].indent === indent + 2 && !lines[pos].list) {
        const field = lines[pos++];
        if (field.raw !== '') item[field.key] = parseScalar(field.raw);
        else if (pos < lines.length && lines[pos].list && lines[pos].indent >= indent + 2 && lines[pos].indent <= indent + 4) item[field.key] = list(lines[pos].indent);
        else if (pos < lines.length && lines[pos].indent > indent + 2) item[field.key] = map(lines[pos].indent);
        else item[field.key] = '';
      }
      out.push(item);
    }
    return out;
  };
  return map(lines[0]?.indent ?? 0);
}

function parseScalar(raw) {
  if (raw === '') return '';
  if (raw === '[]') return [];
  if (/^-?\d+\.\d+(e[-+]?\d+)?$/i.test(raw) || /^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('{') && raw.endsWith('}')) {
    return Object.fromEntries(raw.slice(1, -1).split(',').map(pair => {
      const i = pair.indexOf(':');
      return [pair.slice(0, i).trim(), parseScalar(pair.slice(i + 1).trim())];
    }));
  }
  return raw.replace(/^['"]|['"]$/g, '');
}
