// Manual 13.5: only lightweight local UI progress is persisted. No original
// asset identifiers or dump mappings are ever written to localStorage.
const KEY = 'amphoreus.save.v1';

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data && typeof data === 'object' ? { ...data, v: 1 } : { v: 1 };
  } catch {
    return { v: 1 };
  }
}

export function save(patch) {
  const next = { ...load(), ...patch, v: 1, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
