// Shared loader for the static auditorium geometry (also used by the portal).
// Cached at module scope so multiple modals share one fetch.
let _cache = null;
export async function loadLayouts() {
  if (_cache) return _cache;
  const res = await fetch('/data/theater-layouts.json');
  if (!res.ok) throw new Error('Could not load seat layout');
  _cache = await res.json();
  return _cache;
}
export function theaterRaw(layouts, id) {
  return (layouts.theaters || []).find(t => String(t.id) === String(id)) || null;
}
