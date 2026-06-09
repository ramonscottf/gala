// SeatmapApp — Admin Seat Mover v2 (visual-parity rebuild).
//
// Slice 1: render the REAL guest SeatMap (src/portal/SeatEngine.jsx) so the
// admin chart is 100% identical to what guests see — same layout, seat-type
// colors, loveseats, screen. Picker + header show auditorium · movie · time
// (real per-auditorium show_start). Live data from the admin endpoints.
//
// Interaction (tap occupant -> dossier -> move, group highlight, hollow
// selection, cross-room move) lands in the next slice and needs a small
// SeatMap extension (occupied seats are non-clickable in the guest map).

import React, { useEffect, useMemo, useState } from 'react';
import { SeatMap, adaptTheater } from '../../portal/SeatEngine.jsx';

const NAVY = '#0a1430';
const PANEL = '#0e1838';
const RULE = 'rgba(255,255,255,0.12)';
const GOLD = '#f5b841';
const MUTED = 'rgba(255,255,255,0.62)';
const FONT_UI = "'Inter', system-ui, -apple-system, sans-serif";

const DINNER_LABELS = {
  frenchdip: 'Hot French Dip',
  chicken: 'Chicken',
  beef: 'Beef',
  veg: 'Vegetarian',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  kids: 'Kids Meal',
  gf: 'Gluten-Free',
};
const dinnerLabel = (d) => (d ? (DINNER_LABELS[d] || d) : null);

function timeLabel(showtime) {
  if (showtime?.show_start) return showtime.show_start;
  return showtime?.showing_number === 1 ? 'Early' : 'Late';
}

export function SeatmapApp() {
  const [showtimes, setShowtimes] = useState([]);
  const [layouts, setLayouts] = useState(null);
  const [curKey, setCurKey] = useState(null); // "theater:showing"
  const [data, setData] = useState(null); // { assignments, holds }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Load showtimes + layouts once.
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

  const [curT, curSh] = useMemo(() => {
    if (!curKey) return [null, null];
    const [t, s] = curKey.split(':');
    return [Number(t), Number(s)];
  }, [curKey]);

  const current = useMemo(
    () => showtimes.find((s) => `${s.theater_id}:${s.showing_number}` === curKey) || null,
    [showtimes, curKey]
  );

  // Load assignments whenever the room changes.
  useEffect(() => {
    if (!curT || !curSh) return;
    let alive = true;
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/gala/admin/seatmap?theater_id=${curT}&showing_number=${curSh}`);
        if (!res.ok) throw new Error(`seatmap ${res.status}`);
        const j = await res.json();
        if (!alive) return;
        setData({ assignments: j.assignments || j.data?.assignments || [], holds: j.holds || j.data?.holds || [] });
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      }
    })();
    return () => { alive = false; };
  }, [curT, curSh]);

  const theater = useMemo(() => {
    if (!layouts || !curT) return null;
    const t = (layouts.theaters || []).find((x) => x.id === curT);
    return t ? adaptTheater(t) : null;
  }, [layouts, curT]);

  // Occupied seats render with the guest "taken" tint (assignedOther).
  const occupied = useMemo(() => {
    const set = new Set();
    (data?.assignments || []).forEach((a) => set.add(`${a.row}-${a.num}`));
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

  // ── Tap interaction: identify the occupant of a seat and light up their party.
  const bySeat = useMemo(() => {
    const m = new Map();
    (data?.assignments || []).forEach((a) => m.set(`${a.row}-${a.num}`, a));
    return m;
  }, [data]);

  const [occupant, setOccupant] = useState(null);
  useEffect(() => { setOccupant(null); }, [curKey]); // close dossier on room change

  // The tapped occupant's whole party IN THIS ROOM: same delegation for a
  // delegated guest, else the sponsor's own (non-delegated) seats.
  const groupSeats = useMemo(() => {
    if (!occupant) return [];
    return (data?.assignments || []).filter((a) =>
      occupant.delegation_id
        ? a.delegation_id === occupant.delegation_id
        : (a.sponsor_id === occupant.sponsor_id && !a.delegation_id)
    );
  }, [occupant, data]);

  const highlighted = useMemo(
    () => new Set(groupSeats.map((a) => `${a.row}-${a.num}`)),
    [groupSeats]
  );

  const onSeatActivate = (id) => setOccupant(bySeat.get(id) || null);

  // Distinct dinners across the party (most parties share one).
  const groupDinners = useMemo(() => {
    const s = new Set();
    groupSeats.forEach((a) => { if (a.dinner) s.add(a.dinner); });
    return [...s];
  }, [groupSeats]);

  return (
    <div style={{ minHeight: '100vh', background: NAVY, color: '#fff', fontFamily: FONT_UI, padding: '14px 12px 80px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '.01em' }}>
            Seat Mover <span style={{ color: GOLD }}>v2</span>
          </h1>
          <span style={{ fontSize: 12, color: MUTED }}>preview · live tool unchanged</span>
        </div>

        {err && (
          <div style={{ background: '#3a1620', border: '1px solid #7a2e3e', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
            {err.includes('401') ? 'Session expired — reload and log in again.' : `Error: ${err}`}
          </div>
        )}

        {loading ? (
          <div style={{ color: MUTED, padding: 24 }}>Loading…</div>
        ) : (
          <>
            {/* Picker */}
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTED, marginBottom: 6 }}>
                Auditorium
              </span>
              <select
                value={curKey || ''}
                onChange={(e) => setCurKey(e.target.value)}
                style={{ width: '100%', padding: '12px 12px', borderRadius: 10, background: PANEL, color: '#fff', border: `1px solid ${RULE}`, fontSize: 15, appearance: 'auto', fontFamily: FONT_UI }}
              >
                {showtimes.map((s) => (
                  <option key={`${s.theater_id}:${s.showing_number}`} value={`${s.theater_id}:${s.showing_number}`}>
                    Auditorium {s.theater_id} · {s.movie_title} · {timeLabel(s)}
                  </option>
                ))}
              </select>
            </label>

            {/* Header */}
            {current && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 14px', background: PANEL, borderRadius: 12, border: `1px solid ${RULE}` }}>
                {current.poster_url && (
                  <img src={current.poster_url} alt="" aria-hidden="true"
                    style={{ width: 44, aspectRatio: '2/3', objectFit: 'cover', borderRadius: 6, border: `1px solid ${RULE}`, flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Auditorium {current.theater_id}</div>
                  <div style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {current.movie_title} · {timeLabel(current)}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12, color: MUTED }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{occupied.size}<span style={{ fontSize: 12, color: MUTED }}>/{seatCount}</span></div>
                  seated
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: MUTED, marginBottom: 8 }}>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#3b82f6', marginRight: 6, verticalAlign: 'middle' }} />Open</span>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.25)', marginRight: 6, verticalAlign: 'middle' }} />Taken</span>
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: GOLD, marginRight: 6, verticalAlign: 'middle' }} />Selected party</span>
              <span style={{ color: 'rgba(255,255,255,0.42)' }}>· tap any seat</span>
            </div>

            {/* The real guest chart */}
            <div style={{ background: PANEL, borderRadius: 12, border: `1px solid ${RULE}`, padding: 10, overflowX: 'auto' }}>
              {theater ? (
                <SeatMap
                  theater={theater}
                  scale={16}
                  showLetters
                  showSeatNumbers
                  allowZoom
                  allowLasso={false}
                  assignedOther={new Set([...occupied, ...holds])}
                  adminClickable
                  onSeatActivate={onSeatActivate}
                  highlighted={highlighted}
                />
              ) : (
                <div style={{ color: MUTED, padding: 24, textAlign: 'center' }}>
                  {data ? 'Could not load auditorium layout.' : 'Loading seats…'}
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
              Tap any seat to see who's there and light up their whole party. Tap-to-move and cross-room moves are the next build.
            </p>
          </>
        )}
      </div>

      {/* Dossier — who's in the tapped seat */}
      {occupant && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: '0 12px' }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <div style={{ background: PANEL, border: `1px solid ${RULE}`, borderRadius: '16px 16px 0 0', padding: 16, boxShadow: '0 -12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: GOLD, marginBottom: 4 }}>
                    {occupant.delegation_id ? 'Delegate guest' : (occupant.tier ? `${occupant.tier} sponsor` : 'Guest')}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>
                    {occupant.guest_name || occupant.company || 'Unnamed guest'}
                  </div>
                  {occupant.company && occupant.guest_name && occupant.company !== occupant.guest_name && (
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{occupant.company}</div>
                  )}
                </div>
                <button onClick={() => setOccupant(null)} aria-label="Close"
                  style={{ background: 'transparent', border: `1px solid ${RULE}`, color: '#fff', borderRadius: 999, width: 32, height: 32, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Seats ({groupSeats.length || 1})</div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{groupSeats.length ? groupSeats.map((a) => `${a.row}${a.num}`).join(', ') : `${occupant.row}${occupant.num}`}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Dinner</div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{groupDinners.length ? groupDinners.map(dinnerLabel).join(', ') : '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                Move party → <span style={{ color: 'rgba(255,255,255,0.38)' }}>coming in the next build</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
