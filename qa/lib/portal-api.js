import { QA_BASE_URL, QA_TOKEN } from './config.js';

function apiUrl(path) {
  if (path.startsWith('http')) return path;
  return `${QA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiJson(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
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

export async function pickSeat(token, theaterId, seatId, action = 'finalize') {
  const { row_label, seat_num } = splitSeatId(seatId);
  return apiJson(`/api/gala/portal/${token}/pick`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      theater_id: theaterId,
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
    const key = `${row.theater_id}:${seatId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(await pickSeat(token, row.theater_id, seatId, 'unfinalize'));
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

function takenSeatIds(portal, theaterId) {
  const taken = new Set();
  const collect = (rows) => {
    (rows || []).forEach((row) => {
      if (Number(row.theater_id) === Number(theaterId)) {
        taken.add(`${row.row_label}-${row.seat_num}`);
      }
    });
  };
  collect(portal.myAssignments);
  collect(portal.myHolds);
  collect(portal.allAssignments);
  collect(portal.otherHolds);
  return taken;
}

function wouldLeaveOrphan(portal, theaterId, seatIds) {
  const taken = takenSeatIds(portal, theaterId);
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
  allowOrphan = false,
} = {}) {
  const [portal, layouts] = await Promise.all([getPortal(token), getTheaterLayouts()]);
  const showtimeTheaters = [...new Set((portal.showtimes || []).map((s) => Number(s.theater_id)))];
  const candidates = theaterId ? [Number(theaterId)] : showtimeTheaters;

  for (const candidateId of candidates) {
    const theater = (layouts.theaters || []).find((t) => Number(t.id) === Number(candidateId));
    if (!theater) continue;
    const taken = takenSeatIds(portal, candidateId);
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
        if (!allowOrphan && wouldLeaveOrphan(portal, candidateId, seatIds)) continue;
        return { theaterId: candidateId, row: row.label, seatIds, portal };
      }
    }
  }
  throw new Error(`No ${count}-seat available block found`);
}

export async function findOrphanPair({ token = QA_TOKEN, theaterId = null } = {}) {
  const [portal, layouts] = await Promise.all([getPortal(token), getTheaterLayouts()]);
  const showtimeTheaters = [...new Set((portal.showtimes || []).map((s) => Number(s.theater_id)))];
  const candidates = theaterId ? [Number(theaterId)] : showtimeTheaters;

  for (const candidateId of candidates) {
    const theater = (layouts.theaters || []).find((t) => Number(t.id) === Number(candidateId));
    if (!theater) continue;
    const taken = takenSeatIds(portal, candidateId);
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
        return { theaterId: candidateId, row: row.label, first: a, orphan: mid, second: b };
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
    const res = await pickSeat(token, block.theaterId, seatId, 'finalize');
    if (!res.ok) {
      await cleanupToken(token);
      throw new Error(`Could not place ${seatId}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
  }
  return block;
}

