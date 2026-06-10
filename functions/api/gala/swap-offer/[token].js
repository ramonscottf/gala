// /api/gala/swap-offer/[token]
//
// One-tap front-row swap experience (June 10 gala). The offer email links
// straight here — no portal hop. The token in the URL is the auth (same
// trust model as /sponsor/{token}): it resolves to a sponsor (rsvp_token)
// or a delegation (token), and the page can ONLY ever move that party's
// own seats into open seats.
//
// GET  → renders the picker: their current seats + the target auditorium's
//        live seat map (taken seats grayed). They tap exactly N open seats
//        and confirm. `?keep=1` records "keeping my seats" and shows a
//        friendly page. `?any=1` widens scope to all their seats (testing);
//        `?dst=N` overrides the target auditorium (testing).
// POST → { action:'move', seats:[{row,seat},...] } re-validates everything
//        server-side (count, availability) and updates their assignment
//        rows. On success, clears their tickets-jun10 send-log row so the
//        7:30 AM ticket cron re-issues a fresh ticket with the new seats.
//
// Default offer scope: Row A seats in the oversold Breadwinner rooms —
// Aud 3 (Showing 1) → new Aud 1, and Aud 4 (Showing 2) → new Aud 2.

import { jsonError, jsonOk } from '../_auth.js';

const OFFERS = {
  '3:1': { target: 1 },
  '4:2': { target: 2 },
};
const SEND_ID_RESP = 'swap-offer-response';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function resolveToken(db, token) {
  const sp = await db.prepare(
    `SELECT id, company, first_name, last_name, email, 'sponsor' AS kind
     FROM sponsors WHERE rsvp_token = ? AND archived_at IS NULL`
  ).bind(token).first();
  if (sp) return { kind: 'sponsor', id: sp.id, name: sp.company || `${sp.first_name || ''} ${sp.last_name || ''}`.trim(), email: sp.email, seatCol: 'sponsor_id', seatExtra: 'AND delegation_id IS NULL' };
  const dl = await db.prepare(
    `SELECT id, delegate_name, delegate_email FROM sponsor_delegations
     WHERE token = ? AND status != 'reclaimed'`
  ).bind(token).first();
  if (dl) return { kind: 'delegation', id: dl.id, name: dl.delegate_name || 'Guest', email: dl.delegate_email, seatCol: 'delegation_id', seatExtra: '' };
  return null;
}

async function loadLayouts(request, env) {
  try {
    const url = new URL('/data/theater-layouts.json', request.url);
    const res = env.ASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetch(url);
    const d = await res.json();
    const map = new Map();
    for (const t of d.theaters || []) map.set(Number(t.id), t);
    return map;
  } catch { return new Map(); }
}

async function offerSeats(db, who, { any }) {
  const rows = await db.prepare(`
    SELECT id, theater_id, showing_number, row_label, seat_num
    FROM seat_assignments WHERE ${who.seatCol} = ? ${who.seatExtra}
    ORDER BY theater_id, showing_number, row_label, CAST(seat_num AS INT)
  `).bind(who.id).all();
  let seats = rows.results || [];
  if (!any) {
    seats = seats.filter(s => OFFERS[`${s.theater_id}:${s.showing_number}`] && String(s.row_label).toUpperCase() === 'A');
  }
  if (!seats.length) return null;
  // One group: same (theater, showing) as the first offer-scope seat.
  const t = seats[0].theater_id, sh = seats[0].showing_number;
  return { theater: t, showing: sh, seats: seats.filter(s => s.theater_id === t && s.showing_number === sh) };
}

async function recordResponse(db, who, label) {
  try {
    await db.prepare(`
      INSERT INTO marketing_send_log (send_id, send_run_id, channel, recipient_email, recipient_name, status, sent_by, audience_label, sent_at)
      VALUES (?, 'swap-offer', 'Web', ?, ?, 'sent', 'swap-offer', ?, CURRENT_TIMESTAMP)
    `).bind(SEND_ID_RESP, who.email || '(no email)', who.name, label).run();
  } catch { /* best effort */ }
}

function page(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>
:root{--navy:#0b1b3c;--blue:#1f4484;--red:#CB262C;}
*{box-sizing:border-box}body{margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0b1b3c}
.wrap{max-width:560px;margin:0 auto;padding:16px 12px 40px}
.head{background:var(--navy);border-radius:14px 14px 0 0;padding:20px 20px 16px;color:#fff}
.head .kicker{color:#9db4e8;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin:0 0 4px}
.head h1{margin:0;font-size:21px;line-height:1.2}
.strip{height:5px;background:linear-gradient(90deg,var(--blue),var(--red))}
.card{background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;padding:18px 16px}
.btn{display:block;width:100%;border:0;border-radius:10px;padding:15px;font-size:16px;font-weight:800;cursor:pointer;text-align:center;text-decoration:none}
.btn-go{background:var(--blue);color:#fff}.btn-go[disabled]{background:#94a3b8}
.btn-keep{background:#fff;color:var(--navy);border:2px solid #cbd5e1;margin-top:10px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 0}
.chip{background:var(--red);color:#fff;border-radius:7px;padding:5px 11px;font-weight:800;font-size:14px}
.screen{background:#0b1b3c;color:#9db4e8;text-align:center;border-radius:6px;font-size:10px;letter-spacing:.3em;padding:4px;margin:14px 0 10px}
.srow{display:flex;align-items:center;gap:4px;margin:3px 0}
.rl{width:16px;font-size:11px;font-weight:800;color:#64748b;flex:none}
.smap{overflow-x:auto;padding-bottom:6px}
.seat{width:27px;height:27px;flex:none;border-radius:6px 6px 3px 3px;border:0;font-size:9px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.seat.open{background:#3b82f6}.seat.taken{background:#cbd5e1;color:#64748b;cursor:default}
.seat.sel{background:#f0a830;color:#0b1b3c;outline:2px solid #0b1b3c}
.seat.gap{background:transparent;cursor:default}
.legend{display:flex;gap:14px;font-size:12px;color:#475569;margin:8px 0 2px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.count{font-weight:800;color:var(--navy);margin:10px 0 8px;font-size:15px}
.note{color:#475569;font-size:13px;line-height:1.5}
.ok{background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:12px;font-size:14px;margin:0 0 12px}
.err{background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:12px;font-size:14px;margin:0 0 12px;display:none}
</style></head><body><div class="wrap"><div class="head"><p class="kicker">Lights, Camera, Take Action!</p><h1>${esc(title)}</h1></div><div class="strip"></div><div class="card">${inner}</div></div></body></html>`;
}

export async function onRequestGet({ request, env, params }) {
  const db = env.GALA_DB;
  if (!db) return new Response('Service unavailable', { status: 500 });
  const url = new URL(request.url);
  const who = await resolveToken(db, params.token);
  if (!who) return new Response(page('Link not recognized', `<p class="note">This link doesn't match an active booking. Reply to your gala email and we'll sort it out.</p>`), { headers: { 'Content-Type': 'text/html' }, status: 404 });

  if (url.searchParams.get('keep') === '1') {
    await recordResponse(db, who, 'keep');
    return new Response(page('You\'re all set', `<div class="ok">Perfect — your seats stay exactly where they are.</div><p class="note">We can't wait to see you tonight, ${esc(who.name)}. Dinner, movie, and the silent auction (closes 7:30 PM) — it's going to be a great night.</p>`), { headers: { 'Content-Type': 'text/html' } });
  }

  const grp = await offerSeats(db, who, { any: url.searchParams.get('any') === '1' });
  if (!grp) {
    return new Response(page('Nothing to move', `<p class="note">Hi ${esc(who.name)} — this offer applies to front-row seats in the Breadwinner auditoriums, and your booking isn't in that group. Your seats are all set as-is. See you tonight!</p>`), { headers: { 'Content-Type': 'text/html' } });
  }

  const offer = OFFERS[`${grp.theater}:${grp.showing}`] || {};
  const dst = Number(url.searchParams.get('dst')) || offer.target || (grp.showing === 1 ? 1 : 2);
  const layouts = await loadLayouts(request, env);
  const layout = layouts.get(dst);
  if (!layout) return new Response(page('Temporarily unavailable', `<p class="note">The seat map for the new auditorium isn't loading. Reply to your gala email and we'll move you by hand.</p>`), { headers: { 'Content-Type': 'text/html' }, status: 500 });

  const takenRes = await db.prepare(
    `SELECT row_label, seat_num FROM seat_assignments WHERE theater_id = ? AND showing_number = ?`
  ).bind(dst, grp.showing).all();
  const taken = (takenRes.results || []).map(r => `${String(r.row_label).toUpperCase()}${r.seat_num}`);

  const showRes = await db.prepare(`
    SELECT m.title, st.dinner_time, st.show_start FROM showtimes st
    JOIN movies m ON m.id = st.movie_id
    WHERE st.theater_id = ? AND st.showing_number = ?
  `).bind(dst, grp.showing).first() || {};

  const n = grp.seats.length;
  const chips = grp.seats.map(s => `<span class="chip">${esc(s.row_label)}${esc(s.seat_num)}</span>`).join('');
  const model = {
    n, dst, showing: grp.showing,
    taken,
    rows: (layout.rows || []).map(r => ({ label: r.label, numbers: r.numbers, cols: r.cols })),
    minCol: layout.minCol, maxCol: layout.maxCol,
  };

  const inner = `
  <p class="note" style="margin-top:0">Hi ${esc(who.name)} — your current seats for <strong>The Breadwinner</strong> (${esc(showRes.show_start || '')}):</p>
  <div class="chips">${chips}</div>
  <p class="note" style="margin:14px 0 0"><strong>We opened Auditorium ${dst} for the same movie and showtime.</strong> Would you like to select ${n} new seat${n === 1 ? '' : 's'} in this auditorium? Tap ${n === 1 ? 'a seat' : 'your seats'} below.</p>
  <div class="legend"><span><i style="background:#3b82f6"></i>Open</span><span><i style="background:#f0a830"></i>Your pick</span><span><i style="background:#cbd5e1"></i>Taken</span></div>
  <div class="screen">SCREEN</div>
  <div class="smap" id="map"></div>
  <p class="count" id="count"></p>
  <div class="err" id="err"></div>
  <button class="btn btn-go" id="go" disabled>Select your seats above</button>
  <a class="btn btn-keep" href="?keep=1">No thanks — my seats are fine where they are</a>
  <script>
  const M = ${JSON.stringify(model)};
  const taken = new Set(M.taken);
  const sel = new Set();
  const map = document.getElementById('map');
  for (const row of M.rows) {
    const div = document.createElement('div'); div.className = 'srow';
    const lab = document.createElement('span'); lab.className = 'rl'; lab.textContent = row.label; div.appendChild(lab);
    let prevCol = (M.minCol || 1) - 1;
    for (let i = 0; i < (row.numbers || []).length; i++) {
      const col = row.cols ? row.cols[i] : prevCol + 1;
      for (let g = prevCol + 1; g < col; g++) { const sp = document.createElement('span'); sp.className = 'seat gap'; div.appendChild(sp); }
      prevCol = col;
      const num = row.numbers[i];
      const id = row.label + num;
      const b = document.createElement('button');
      b.className = 'seat ' + (taken.has(id) ? 'taken' : 'open');
      b.textContent = num; b.dataset.id = id; b.dataset.row = row.label; b.dataset.num = num;
      if (!taken.has(id)) b.onclick = () => {
        if (sel.has(id)) { sel.delete(id); b.classList.remove('sel'); }
        else { if (sel.size >= M.n) return; sel.add(id); b.classList.add('sel'); }
        upd();
      };
      div.appendChild(b);
    }
    map.appendChild(div);
  }
  const go = document.getElementById('go'), count = document.getElementById('count'), err = document.getElementById('err');
  function upd() {
    count.textContent = sel.size + ' of ' + M.n + ' selected';
    go.disabled = sel.size !== M.n;
    go.textContent = sel.size === M.n ? ('Move me to ' + [...sel].join(', ') + ' \\u2192') : 'Select your seats above';
  }
  upd();
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Moving\\u2026'; err.style.display = 'none';
    const seats = [...sel].map(id => {
      const b = map.querySelector('[data-id="' + id + '"]');
      return { row: b.dataset.row, seat: b.dataset.num };
    });
    const res = await fetch(location.pathname + location.search, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', dst: M.dst, seats })
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.ok) {
      document.querySelector('.card').innerHTML = '<div class="ok">\\uD83C\\uDF89 Done! Your new seats in Auditorium ' + M.dst + ': <strong>' + d.seats.join(', ') + '</strong></div><p class="note">A fresh ticket with your new seats is on its way. Same movie, same time \\u2014 better view. See you tonight!</p>';
    } else {
      err.textContent = (d.error || 'Something went wrong') + ' \\u2014 the map may have changed, refresh to try again.';
      err.style.display = 'block'; go.disabled = false; upd();
    }
  };
  </script>`;

  return new Response(page(`We opened a new auditorium, ${who.name.split(' ')[0]}`, inner), { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env, params }) {
  const db = env.GALA_DB;
  if (!db) return jsonError('Service unavailable', 500);
  const who = await resolveToken(db, params.token);
  if (!who) return jsonError('Link not recognized', 404);

  let body; try { body = await request.json(); } catch { return jsonError('Bad request', 400); }
  if (body.action !== 'move' || !Array.isArray(body.seats)) return jsonError('Bad request', 400);

  const url = new URL(request.url);
  const grp = await offerSeats(db, who, { any: url.searchParams.get('any') === '1' });
  if (!grp) return jsonError('No movable seats on this booking', 400);
  const offer = OFFERS[`${grp.theater}:${grp.showing}`] || {};
  const dst = Number(body.dst) || offer.target;
  if (!dst) return jsonError('No target auditorium', 400);
  if (body.seats.length !== grp.seats.length) return jsonError(`Pick exactly ${grp.seats.length} seats`, 400);

  // Validate every requested seat is real-in-layout-agnostic terms: free in DB.
  for (const s of body.seats) {
    const row = String(s.row || '').toUpperCase().slice(0, 2);
    const num = String(parseInt(s.seat, 10));
    if (!row || num === 'NaN') return jsonError('Invalid seat', 400);
    const clash = await db.prepare(
      `SELECT id FROM seat_assignments WHERE theater_id = ? AND showing_number = ? AND row_label = ? AND seat_num = ?`
    ).bind(dst, grp.showing, row, num).first();
    if (clash) return jsonError(`Seat ${row}${num} was just taken`, 409);
  }

  // Move: update each of their rows to the new spot, pairing in order.
  const moved = [];
  for (let i = 0; i < grp.seats.length; i++) {
    const from = grp.seats[i];
    const to = body.seats[i];
    const row = String(to.row).toUpperCase().slice(0, 2);
    const num = String(parseInt(to.seat, 10));
    await db.prepare(`
      UPDATE seat_assignments
      SET theater_id = ?, row_label = ?, seat_num = ?, assigned_by = 'swap-offer', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(dst, row, num, from.id).run();
    moved.push(`${row}${num}`);
  }

  await recordResponse(db, who, `moved to Aud ${dst}: ${moved.join(' ')}`);

  // Re-issue their ticket: clear tickets-jun10 log row(s) so the 7:30 AM
  // cron sends a fresh ticket with the new seats.
  if (who.email) {
    await db.prepare(
      `DELETE FROM marketing_send_log WHERE send_id = 'tickets-jun10' AND lower(recipient_email) = lower(?)`
    ).bind(who.email).run();
  }

  return jsonOk({ ok: true, seats: moved, auditorium: dst });
}
