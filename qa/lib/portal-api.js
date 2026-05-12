import { QA_BASE_URL, QA_TOKEN } from './config.js';

function apiUrl(path) {
  if (path.startsWith('http')) return path;
  return `${QA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiJson(path, options = {}) {
  const url = apiUrl(path);
  let res = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  if (!res) throw lastError;
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, body };
}

export async function getPortal(token = QA_TOKEN) {
  const res = await apiJson(`/api/gala/portal/${token}`);
  if (!res.ok) throw new Error(`Portal fetch failed: HTTP ${res.status}`);
  return res.body;
}

export async function getTheaterLayouts() {
  const res = await apiJson('/data/theater-layouts.json');
  if (!res.ok) throw new Error(`Theater layouts fetch failed: HTTP ${res.status}`);
  return res.body;
}

export function splitSeatId(seatId) {
  const dash = seatId.indexOf('-');
  return {
    row_label: seatId.slice(0, dash),
    seat_num: Number(seatId.slice(dash + 1)),
  };
}

export async function pickSeat(token, theaterId, seatId, action = 'finalize', showingNumber = null) {
  const { row_label, seat_num } = splitSeatId(seatId);
  // showing_number is required by the API after the May 11 2026 fix.
  // If a caller didn't pass one, resolve from portal showtimes — fall
  // back to 1 if the portal isn't reachable (server will then validate).
  let resolvedShowing = showingNumber;
  if (resolvedShowing == null) {
    try {
      const portal = await getPortal(token);
      const match = (portal.showtimes || []).find(
        (s) => Number(s.theater_id) === Number(theaterId),
      );
      resolvedShowing = match?.showing_number ?? 1;
    } catch {
      resolvedShowing = 1;
    }
  }
  return apiJson(`/api/gala/portal/${token}/pick`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      theater_id: theaterId,
      showing_number: resolvedShowing,
      row_label,
      seat_num,
    }),
  });
}

export async function cleanupToken(token = QA_TOKEN) {
  const portal = await getPortal(token);
  const mine = [...(portal.myAssignments || []), ...(portal.myHolds || [])];
  const seen = new Set();
  const results = [];
  for (const row of mine) {
    const seatId = `${row.row_label}-${row.seat_num}`;
    // Key by (theater, showing, seat) so cleanup handles both showings
    // when a token holds seats at multiple showings of the same auditorium.
    const showing = row.showing_number ?? 1;
    const key = `${row.theater_id}:${showing}:${seatId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(await pickSeat(token, row.theater_id, seatId, 'unfinalize', showing));
  }
  return results;
}

function rowSeats(row) {
  if (row.type === 'blocked') return [];
  if (row.type === 'mixed') {
    return (row.segments || [])
      .filter((segment) => segment.type !== 'blocked' && segment.type !== 'gap')
      .flatMap((segment) => segment.seats || []);
  }
  return row.numbers || [];
}

function takenSeatIds(portal, theaterId, showingNumber = null) {
  const taken = new Set();
  const collect = (rows) => {
    (rows || []).forEach((row) => {
      if (Number(row.theater_id) !== Number(theaterId)) return;
      if (showingNumber != null && Number(row.showing_number ?? 1) !== Number(showingNumber)) return;
      taken.add(`${row.row_label}-${row.seat_num}`);
    });
  };
  collect(portal.myAssignments);
  collect(portal.myHolds);
  collect(portal.allAssignments);
  collect(portal.otherHolds);
  return taken;
}

function wouldLeaveOrphan(portal, theaterId, seatIds, showingNumber = null) {
  const taken = takenSeatIds(portal, theaterId, showingNumber);
  seatIds.forEach((seatId) => taken.add(seatId));
  const rows = new Map();
  for (const seatId of taken) {
    const { row_label, seat_num } = splitSeatId(seatId);
    if (!rows.has(row_label)) rows.set(row_label, []);
    rows.get(row_label).push(seat_num);
  }
  for (const numbers of rows.values()) {
    numbers.sort((a, b) => a - b);
    for (let i = 0; i < numbers.length - 1; i += 1) {
      if (numbers[i + 1] - numbers[i] === 2) return true;
    }
  }
  return false;
}

export async function findSeatBlock({
  token = QA_TOKEN,
  count = 2,
  theaterId = null,
  showingNumber = null,
  allowOrphan = false,
} = {}) {
  const [portal, layouts] = await Promise.all([getPortal(token), getTheaterLayouts()]);
  // Build (theater, showing) candidates. If a specific theater is requested
  // and a specific showing, that's the only candidate. Otherwise enumerate
  // every (theater, showing) tuple that has a showtime.
  const tuples = [];
  (portal.showtimes || []).forEach((s) => {
    const t = Number(s.theater_id);
    const n = Number(s.showing_number ?? 1);
    if (theaterId != null && Number(theaterId) !== t) return;
    if (showingNumber != null && Number(showingNumber) !== n) return;
    tuples.push({ theaterId: t, showingNumber: n });
  });

  for (const { theaterId: candidateId, showingNumber: candidateShowing } of tuples) {
    const theater = (layouts.theaters || []).find((t) => Number(t.id) === Number(candidateId));
    if (!theater) continue;
    const taken = takenSeatIds(portal, candidateId, candidateShowing);
    for (const row of theater.rows || []) {
      const numbers = rowSeats(row)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      for (let i = 0; i <= numbers.length - count; i += 1) {
        const slice = numbers.slice(i, i + count);
        const contiguous = slice.every((n, idx) => idx === 0 || n === slice[idx - 1] + 1);
        if (!contiguous) continue;
        const seatIds = slice.map((n) => `${row.label}-${n}`);
        if (seatIds.some((seatId) => taken.has(seatId))) continue;
        if (!allowOrphan && wouldLeaveOrphan(portal, candidateId, seatIds, candidateShowing)) continue;
        return {
          theaterId: candidateId,
          showingNumber: candidateShowing,
          row: row.label,
          seatIds,
          portal,
        };
      }
    }
  }
  throw new Error(`No ${count}-seat available block found`);
}

export async function findOrphanPair({
  token = QA_TOKEN,
  theaterId = null,
  showingNumber = null,
} = {}) {
  const [portal, layouts] = await Promise.all([getPortal(token), getTheaterLayouts()]);
  const tuples = [];
  (portal.showtimes || []).forEach((s) => {
    const t = Number(s.theater_id);
    const n = Number(s.showing_number ?? 1);
    if (theaterId != null && Number(theaterId) !== t) return;
    if (showingNumber != null && Number(showingNumber) !== n) return;
    tuples.push({ theaterId: t, showingNumber: n });
  });

  for (const { theaterId: candidateId, showingNumber: candidateShowing } of tuples) {
    const theater = (layouts.theaters || []).find((t) => Number(t.id) === Number(candidateId));
    if (!theater) continue;
    const taken = takenSeatIds(portal, candidateId, candidateShowing);
    for (const row of theater.rows || []) {
      const numbers = rowSeats(row)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      for (const n of numbers) {
        const a = `${row.label}-${n}`;
        const mid = `${row.label}-${n + 1}`;
        const b = `${row.label}-${n + 2}`;
        if (!numbers.includes(n + 1) || !numbers.includes(n + 2)) continue;
        if (taken.has(a) || taken.has(mid) || taken.has(b)) continue;
        return {
          theaterId: candidateId,
          showingNumber: candidateShowing,
          row: row.label,
          first: a,
          orphan: mid,
          second: b,
        };
      }
    }
  }
  throw new Error('No orphan-test pair found');
}

export async function ensureFreshState(token = QA_TOKEN) {
  await cleanupToken(token);
  const portal = await getPortal(token);
  if ((portal.myAssignments || []).length || (portal.myHolds || []).length) {
    throw new Error('Token still has seats after cleanup');
  }
  return portal;
}

export async function ensurePlacedState(token = QA_TOKEN, count = 2) {
  await cleanupToken(token);
  const block = await findSeatBlock({ token, count });
  for (const seatId of block.seatIds) {
    const res = await pickSeat(token, block.theaterId, seatId, 'finalize', block.showingNumber);
    if (!res.ok) {
      await cleanupToken(token);
      throw new Error(`Could not place ${seatId}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
  }
  return block;
}
