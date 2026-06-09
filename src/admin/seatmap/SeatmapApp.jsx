// SeatmapApp — Admin Seat Mover v2 (night-of rebuild).
//
// Phase 1: identify + MOVE. Renders the real guest SeatMap (parity), tap any
// seat to see who's there + light up their party, then move one person or the
// whole party to open seats — same room or a different auditorium — wiring the
// admin move-group endpoint. Dinner (the meal) rides along and is shown.
//
// Built alongside the live tool; /admin/seatmap (v1) stays untouched until v2
// reaches parity. Theme is intentionally plain here pending the brand pass.

import React, { useEffect, useMemo, useState } from 'react';
import { SeatMap, adaptTheater } from '../../portal/SeatEngine.jsx';

const GROUND = 'radial-gradient(ellipse 120% 60% at 50% -10%, #24508f 0%, #122a57 35%, #0b1b3c 75%, #050b1c 100%)';
const NAVY = '#070a1d';                  // deep base
const INK = '#0b1233';                   // ink-on-gold text
const PANEL = 'rgba(17,28,60,0.72)';     // navy surface over the ground
const RULE = 'rgba(255,255,255,0.12)';
const GOLD = '#ffc24d';                  // DEF gold-400
const GOLD_SOFT = '#ffd77f';
const BLUE = '#2858d6';                  // brand blue
const RED = '#CB262C';                   // canonical gala red
const MUTED = 'rgba(255,255,255,0.65)';
const FONT_UI = "'Inter', system-ui, -apple-system, sans-serif";
const FONT_DISPLAY = "'Fraunces', 'Source Serif 4', Georgia, serif";
const STRIP = 'linear-gradient(90deg, #2858d6, #CB262C, #4a7df0, #CB262C)';

const DINNER_LABELS = {
  frenchdip: 'Hot French Dip', chicken: 'Chicken', beef: 'Beef',
  veg: 'Vegetarian', vegetarian: 'Vegetarian', vegan: 'Vegan',
  kids: 'Kids Meal', gf: 'Gluten-Free',
};
const dinnerLabel = (d) => (d ? (DINNER_LABELS[d] || d) : null);
const timeLabel = (s) => (s?.show_start ? s.show_start : (s?.showing_number === 1 ? 'Early' : 'Late'));
const seatId = (a) => `${a.row}-${a.num}`;
const sortBySeat = (arr, rowOf, numOf) =>
  [...arr].sort((a, b) => {
    const ra = rowOf(a), rb = rowOf(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return (parseInt(numOf(a), 10) || 0) - (parseInt(numOf(b), 10) || 0);
  });

async function loadRoom(t, sh) {
  const res = await fetch(`/api/gala/admin/seatmap?theater_id=${t}&showing_number=${sh}`);
  if (!res.ok) throw new Error(`seatmap ${res.status}`);
  const j = await res.json();
  return {
    assignments: j.assignments || j.data?.assignments || [],
    holds: j.holds || j.data?.holds || [],
  };
}

export function SeatmapApp() {
  const [showtimes, setShowtimes] = useState([]);
  const [layouts, setLayouts] = useState(null);
  const [curKey, setCurKey] = useState(null); // "theater:showing"
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0); // force refetch after a move
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // view-mode dossier
  const [occupant, setOccupant] = useState(null);

  // move mode
  const [mode, setMode] = useState('view'); // 'view' | 'move'
  const [moveParty, setMoveParty] = useState([]); // source assignments
  const [moveSrcKey, setMoveSrcKey] = useState(null);
  const [moveDestKey, setMoveDestKey] = useState(null);
  const [moveData, setMoveData] = useState(null); // dest room data when cross-room
  const [targets, setTargets] = useState([]); // ordered dest seat ids
  const [busy, setBusy] = useState(false);
  const [moveMsg, setMoveMsg] = useState(null);

  // ── initial load: showtimes + layouts
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [stRes, lyRes] = await Promise.all([
          fetch('/api/gala/admin/showtimes'),
          fetch('/data/theater-layouts.json'),
        ]);
        if (!stRes.ok) throw new Error(`showtimes ${stRes.status}`);
        if (!lyRes.ok) throw new Error(`layouts ${lyRes.status}`);
        const st = await stRes.json();
        const ly = await lyRes.json();
        if (!alive) return;
        const list = (st.showtimes || st.data?.showtimes || []).filter(
          (s) => (ly.theaters || []).some((t) => t.id === s.theater_id)
        );
        setShowtimes(list);
        setLayouts(ly);
        if (list.length) setCurKey(`${list[0].theater_id}:${list[0].showing_number}`);
        setLoading(false);
      } catch (e) {
        if (alive) { setErr(String(e.message || e)); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const parseKey = (k) => {
    if (!k) return [null, null];
    const [t, s] = k.split(':');
    return [Number(t), Number(s)];
  };
  const [curT, curSh] = useMemo(() => parseKey(curKey), [curKey]);
  const current = useMemo(
    () => showtimes.find((s) => `${s.theater_id}:${s.showing_number}` === curKey) || null,
    [showtimes, curKey]
  );

  // ── current room assignments (view)
  useEffect(() => {
    if (!curT || !curSh) return;
    let alive = true;
    setData(null);
    (async () => {
      try {
        const d = await loadRoom(curT, curSh);
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      }
    })();
    return () => { alive = false; };
  }, [curT, curSh, tick]);

  const theaterFor = (t) => {
    if (!layouts || !t) return null;
    const x = (layouts.theaters || []).find((y) => y.id === t);
    return x ? adaptTheater(x) : null;
  };
  const theater = useMemo(() => theaterFor(curT), [layouts, curT]);

  const occupied = useMemo(() => {
    const set = new Set();
    (data?.assignments || []).forEach((a) => set.add(seatId(a)));
    return set;
  }, [data]);
  const holds = useMemo(() => {
    const set = new Set();
    (data?.holds || []).forEach((h) => {
      const m = String(h).match(/^([A-Za-z]+)(\d+)$/);
      if (m) set.add(`${m[1]}-${m[2]}`);
    });
    return set;
  }, [data]);
  const seatCount = theater
    ? (theater.rows || []).reduce((n, r) => n + (r.seats || []).filter(Boolean).length, 0)
    : 0;

  const bySeat = useMemo(() => {
    const m = new Map();
    (data?.assignments || []).forEach((a) => m.set(seatId(a), a));
    return m;
  }, [data]);

  const partyOf = (anchor, assignments) =>
    (assignments || []).filter((a) =>
      anchor.delegation_id
        ? a.delegation_id === anchor.delegation_id
        : (a.sponsor_id === anchor.sponsor_id && !a.delegation_id)
    );

  const groupSeats = useMemo(
    () => (occupant ? partyOf(occupant, data?.assignments) : []),
    [occupant, data]
  );
  const highlighted = useMemo(
    () => new Set(groupSeats.map(seatId)),
    [groupSeats]
  );
  const groupDinners = useMemo(() => {
    const s = new Set();
    groupSeats.forEach((a) => { if (a.dinner) s.add(a.dinner); });
    return [...s];
  }, [groupSeats]);

  useEffect(() => { if (mode === 'view') setOccupant(null); }, [curKey]); // close dossier on room change (view only)

  const onSeatActivate = (id) => setOccupant(bySeat.get(id) || null);

  // ── MOVE MODE ──────────────────────────────────────────────────────────────
  const [destT, destSh] = useMemo(() => parseKey(moveDestKey), [moveDestKey]);
  const destShowtime = useMemo(
    () => showtimes.find((s) => `${s.theater_id}:${s.showing_number}` === moveDestKey) || null,
    [showtimes, moveDestKey]
  );
  const destTheater = useMemo(() => theaterFor(destT), [layouts, destT]);
  const sameRoom = moveDestKey === moveSrcKey;
  const destData = sameRoom ? data : moveData;

  // load dest room data when moving cross-room
  useEffect(() => {
    if (mode !== 'move' || sameRoom || !destT || !destSh) return;
    let alive = true;
    setMoveData(null);
    (async () => {
      try {
        const d = await loadRoom(destT, destSh);
        if (alive) setMoveData(d);
      } catch (e) {
        if (alive) setMoveMsg(String(e.message || e));
      }
    })();
    return () => { alive = false; };
  }, [mode, sameRoom, destT, destSh]);

  const destOccupied = useMemo(() => {
    const set = new Set();
    (destData?.assignments || []).forEach((a) => set.add(seatId(a)));
    (destData?.holds || []).forEach((h) => {
      const m = String(h).match(/^([A-Za-z]+)(\d+)$/);
      if (m) set.add(`${m[1]}-${m[2]}`);
    });
    return set;
  }, [destData]);

  const partyIds = useMemo(() => new Set(moveParty.map(seatId)), [moveParty]);
  const N = moveParty.length;

  const enterMove = (party) => {
    if (!party.length) return;
    setMoveParty(party);
    setMoveSrcKey(curKey);
    setMoveDestKey(curKey);
    setMoveData(null);
    setTargets([]);
    setMoveMsg(null);
    setMode('move');
  };
  const cancelMove = () => {
    setMode('view');
    setMoveParty([]); setTargets([]); setMoveData(null); setMoveMsg(null);
  };
  const toggleTarget = (ids, action) => {
    setTargets((prev) => {
      let next = [...prev];
      if (action === 'remove') return next.filter((id) => !ids.includes(id));
      for (const id of ids) {
        if (partyIds.has(id) && sameRoom) continue; // can't target own source seat
        if (!next.includes(id)) next.push(id);
      }
      while (next.length > N) next.shift();
      return next;
    });
  };

  const confirmMove = async () => {
    if (targets.length !== N || busy) return;
    setBusy(true); setMoveMsg(null);
    try {
      const srcSorted = sortBySeat(moveParty, (a) => a.row, (a) => a.num);
      const tgtSorted = sortBySeat(targets, (id) => id.split('-')[0], (id) => id.split('-')[1]);
      const moves = srcSorted.map((p, i) => {
        const [tr, tn] = tgtSorted[i].split('-');
        return { from: { row_label: p.row, seat_num: p.num }, to: { row_label: tr, seat_num: tn } };
      });
      const [sT, sSh] = parseKey(moveSrcKey);
      const body = { theater_id: sT, showing_number: sSh, moves };
      if (!sameRoom) { body.to_theater_id = destT; body.to_showing_number = destSh; }
      const res = await fetch('/api/gala/admin/move-group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `move failed (${res.status})`);
      // landed — jump the view to the destination room and refetch
      setMode('view'); setMoveParty([]); setTargets([]); setMoveData(null); setOccupant(null);
      if (moveDestKey !== curKey) setCurKey(moveDestKey);
      setTick((x) => x + 1);
    } catch (e) {
      setMoveMsg(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const partyName = moveParty[0]
    ? (moveParty[0].guest_name || moveParty[0].company || 'this party')
    : 'this party';

  // ── RENDER ──────────────────────────────────────────────────────────────────
  const Picker = ({ value, onChange, label }) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, marginBottom: 6 }}>{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '12px', borderRadius: 10, background: PANEL, color: '#fff', border: `1px solid ${RULE}`, fontSize: 15, fontFamily: FONT_UI }}>
        {showtimes.map((s) => (
          <option key={`${s.theater_id}:${s.showing_number}`} value={`${s.theater_id}:${s.showing_number}`}>
            Auditorium {s.theater_id} · {s.movie_title} · {timeLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );

  const Header = ({ st, right }) => st && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 14px', background: PANEL, borderRadius: 12, border: `1px solid ${RULE}` }}>
      {st.poster_url && <img src={st.poster_url} alt="" aria-hidden="true" style={{ width: 44, aspectRatio: '2/3', objectFit: 'cover', borderRadius: 6, border: `1px solid ${RULE}`, flexShrink: 0 }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Auditorium {st.theater_id}</div>
        <div style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.movie_title} · {timeLabel(st)}</div>
      </div>
      {right && <div style={{ marginLeft: 'auto', textAlign: 'right' }}>{right}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: GROUND, color: '#fff', fontFamily: FONT_UI, padding: '14px 12px 120px' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: STRIP, zIndex: 60 }} aria-hidden="true" />
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>Seat Mover <span style={{ color: GOLD }}>v2</span></h1>
          <span style={{ fontSize: 12, color: MUTED }}>preview · live tool unchanged</span>
        </div>

        {err && <div style={{ background: '#3a1620', border: '1px solid #7a2e3e', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{err.includes('401') ? 'Session expired — reload and log in again.' : `Error: ${err}`}</div>}

        {loading ? (
          <div style={{ color: MUTED, padding: 24 }}>Loading…</div>
        ) : mode === 'move' ? (
          <>
            <div style={{ background: 'rgba(245,184,65,0.12)', border: `1px solid ${GOLD}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: GOLD }}>Moving {partyName} — {N} seat{N === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                From Aud {parseKey(moveSrcKey)[0]} · {sortBySeat(moveParty, (a) => a.row, (a) => a.num).map((a) => `${a.row}${a.num}`).join(', ')}
                {groupDinners.length ? ` · ${groupDinners.map(dinnerLabel).join(', ')}` : ''}
              </div>
            </div>

            <Picker label="Move to auditorium" value={moveDestKey} onChange={(v) => { setMoveDestKey(v); setTargets([]); }} />
            <Header st={destShowtime} />

            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Pick <b>{N}</b> open seat{N === 1 ? '' : 's'} — <span style={{ color: targets.length === N ? '#34d399' : GOLD }}>{targets.length}/{N} chosen</span>
            </div>

            <div style={{ background: PANEL, borderRadius: 12, border: `1px solid ${RULE}`, padding: 10, overflowX: 'auto' }}>
              {destTheater && destData ? (
                <SeatMap
                  theater={destTheater}
                  scale={16}
                  showLetters showSeatNumbers allowZoom allowLasso={false}
                  assignedOther={destOccupied}
                  highlighted={sameRoom ? partyIds : new Set()}
                  highlightColor={GOLD}
                  selected={new Set(targets)}
                  selectedStyle="hollow"
                  onSelect={toggleTarget}
                />
              ) : <div style={{ color: MUTED, padding: 24, textAlign: 'center' }}>Loading destination…</div>}
            </div>

            {moveMsg && <div style={{ background: '#3a1620', border: '1px solid #7a2e3e', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 13 }}>{moveMsg}</div>}
          </>
        ) : (
          <>
            <Picker label="Auditorium" value={curKey} onChange={setCurKey} />
            <Header st={current} right={<div style={{ fontSize: 12, color: MUTED }}><div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{occupied.size}<span style={{ fontSize: 12, color: MUTED }}>/{seatCount}</span></div>seated</div>} />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: MUTED, marginBottom: 8 }}>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: BLUE, marginRight: 6, verticalAlign: 'middle' }} />Open</span>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.25)', marginRight: 6, verticalAlign: 'middle' }} />Taken</span>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: GOLD, marginRight: 6, verticalAlign: 'middle' }} />Selected party</span>
              <span style={{ color: 'rgba(255,255,255,0.42)' }}>· tap any seat</span>
            </div>

            <div style={{ background: PANEL, borderRadius: 12, border: `1px solid ${RULE}`, padding: 10, overflowX: 'auto' }}>
              {theater ? (
                <SeatMap
                  theater={theater}
                  scale={16}
                  showLetters showSeatNumbers allowZoom allowLasso={false}
                  assignedOther={new Set([...occupied, ...holds])}
                  adminClickable
                  onSeatActivate={onSeatActivate}
                  highlighted={highlighted}
                  highlightColor={GOLD}
                />
              ) : <div style={{ color: MUTED, padding: 24, textAlign: 'center' }}>{data ? 'Could not load auditorium layout.' : 'Loading seats…'}</div>}
            </div>

            <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Tap any seat to see who's there and light up their party. Then move them — same room or another auditorium.</p>
          </>
        )}
      </div>

      {/* Dossier (view mode) */}
      {mode === 'view' && occupant && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: '0 12px' }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <div style={{ background: PANEL, border: `1px solid ${RULE}`, borderRadius: '16px 16px 0 0', padding: 16, boxShadow: '0 -12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: GOLD, marginBottom: 4 }}>
                    {occupant.delegation_id ? 'Delegate guest' : (occupant.tier ? `${occupant.tier} sponsor` : 'Guest')}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>{occupant.guest_name || occupant.company || 'Unnamed guest'}</div>
                  {occupant.company && occupant.guest_name && occupant.company !== occupant.guest_name && (
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{occupant.company}</div>
                  )}
                </div>
                <button onClick={() => setOccupant(null)} aria-label="Close" style={{ background: 'transparent', border: `1px solid ${RULE}`, color: '#fff', borderRadius: 999, width: 32, height: 32, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12, fontSize: 13 }}>
                <div><div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Seats ({groupSeats.length || 1})</div><div style={{ fontWeight: 700, marginTop: 2 }}>{groupSeats.length ? groupSeats.map((a) => `${a.row}${a.num}`).join(', ') : `${occupant.row}${occupant.num}`}</div></div>
                <div><div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Meal</div><div style={{ fontWeight: 700, marginTop: 2 }}>{groupDinners.length ? groupDinners.map(dinnerLabel).join(', ') : '—'}</div></div>
              </div>
              <button onClick={() => enterMove(groupSeats.length ? groupSeats : [occupant])}
                style={{ marginTop: 14, width: '100%', padding: '13px', borderRadius: 12, background: GOLD, color: '#0a1430', border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                Move party ({groupSeats.length || 1}) →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm bar (move mode) */}
      {mode === 'move' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: '0 12px 12px', background: 'linear-gradient(180deg, transparent, rgba(10,20,48,0.9) 40%)' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', gap: 10 }}>
            <button onClick={cancelMove} disabled={busy}
              style={{ flex: '0 0 auto', padding: '14px 18px', borderRadius: 12, background: PANEL, color: '#fff', border: `1px solid ${RULE}`, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirmMove} disabled={busy || targets.length !== N}
              style={{ flex: 1, padding: '14px', borderRadius: 12, background: (targets.length === N && !busy) ? GOLD : 'rgba(245,184,65,0.35)', color: '#0a1430', border: 'none', fontSize: 15, fontWeight: 800, cursor: (targets.length === N && !busy) ? 'pointer' : 'not-allowed' }}>
              {busy ? 'Moving…' : `Confirm move (${targets.length}/${N}) →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
