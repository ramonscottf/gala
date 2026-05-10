// _loveseat_pairs.js
//
// Server-side loveseat pair resolution.
//
// Loveseats are physically two cushions on one fused frame. The
// canonical layout in public/data/theater-layouts.json marks them as
// segments with type='loveseat' and exactly 2 seats per segment.
//
// This helper exposes getLoveseatPartner(env, theater_id, row_label,
// seat_num) → partner seat_num (string) or null. The /pick and /assign
// endpoints use it to enforce: when one half of a pair is held,
// finalized, or assigned, the partner moves with it. The client also
// enforces this UX-side via SeatEngine.partnersFor — but the server is
// the source of truth so the rule holds even when an unauthorized
// caller hits the API directly.
//
// Caching: the layout JSON is fetched once per Worker isolate via a
// global Map. CF Workers reuse warm globals across requests so this
// is a single fetch per cold start. Layout is keyed by
// `${theater_id}:${row_label}:${seat_num}` for O(1) lookup.

let layoutCache = null;
let cachePromise = null;

async function loadLayout(env, request) {
  if (layoutCache) return layoutCache;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    // Pages Functions can fetch from the same origin via the request
    // URL. This avoids hard-coding gala.daviskids.org so previews work.
    const origin = request ? new URL(request.url).origin : 'https://gala.daviskids.org';
    const res = await fetch(`${origin}/data/theater-layouts.json`, {
      // Cloudflare's per-Worker cache speeds the warm-cache case.
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) {
      cachePromise = null;
      throw new Error(`Failed to load theater layouts: ${res.status}`);
    }
    const data = await res.json();
    const map = new Map();
    for (const theater of data.theaters || []) {
      for (const row of theater.rows || []) {
        if (row.type === 'mixed' && Array.isArray(row.segments)) {
          for (const seg of row.segments) {
            if (seg.type === 'loveseat' && Array.isArray(seg.seats) && seg.seats.length === 2) {
              const [a, b] = seg.seats.map(String);
              map.set(`${theater.id}:${row.label}:${a}`, b);
              map.set(`${theater.id}:${row.label}:${b}`, a);
            }
          }
        }
        // Some rows may declare the entire row as type='loveseat' with
        // numbers/cols arrays — pair adjacent col-pairs together. The
        // current canonical layout uses 'mixed' with explicit segments,
        // so this is a defensive code path we don't expect to hit, but
        // it keeps the helper schema-tolerant.
        if (row.type === 'loveseat' && Array.isArray(row.numbers) && Array.isArray(row.cols)) {
          for (let i = 0; i + 1 < row.numbers.length; i += 2) {
            const a = String(row.numbers[i]);
            const b = String(row.numbers[i + 1]);
            map.set(`${theater.id}:${row.label}:${a}`, b);
            map.set(`${theater.id}:${row.label}:${b}`, a);
          }
        }
      }
    }
    layoutCache = map;
    cachePromise = null;
    return map;
  })();

  return cachePromise;
}

/**
 * Returns the partner seat_num (as string) for a loveseat half, or
 * null if the seat is not paired (standard, standalone loveseat, etc).
 *
 * Soft-fails by returning null on layout fetch error — the orphan-rule
 * and per-seat checks in pick.js still run. The pair guarantee is best-
 * effort if the layout file is unavailable.
 */
export async function getLoveseatPartner(env, request, theater_id, row_label, seat_num) {
  try {
    const map = await loadLayout(env, request);
    return map.get(`${theater_id}:${row_label}:${seat_num}`) || null;
  } catch (err) {
    console.error('Loveseat layout load failed:', err.message);
    return null;
  }
}
