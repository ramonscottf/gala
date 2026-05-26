import React, { useEffect, useRef, useState } from 'react';
import { loadSponsorSeats, setSeatDinner } from './api.js';

// Meal codes + labels — must match pick.js set_dinner VALID set and the
// portal's DinnerModal options exactly.
const MEAL_OPTIONS = [
  { id: '', label: 'No meal' },
  { id: 'frenchdip', label: 'Hot French Dip' },
  { id: 'salad', label: 'Chicken Salad' },
  { id: 'veggie', label: 'Vegetarian' },
  { id: 'kids', label: 'Kids Meal' },
];
const MEAL_SHORT = { frenchdip: 'French Dip', salad: 'Salad', veggie: 'Veggie', kids: 'Kids' };

// Group flat assignment rows into movie -> showing -> seats[], resolving
// (theater_id, showing_number) -> movie via the showtimes map.
function groupByMovie(assignments, showtimes) {
  const showMap = new Map();
  for (const s of showtimes) showMap.set(`${s.theater_id}:${s.showing_number}`, s);

  const movies = new Map();
  for (const a of assignments) {
    const st = showMap.get(`${a.theater_id}:${a.showing_number}`);
    const title = st?.movie_title || a.movie_title || 'Unassigned room';
    if (!movies.has(title)) movies.set(title, { title, showings: new Map() });
    const m = movies.get(title);
    const sn = a.showing_number || 1;
    if (!m.showings.has(sn)) {
      m.showings.set(sn, { showing: sn, theaterId: a.theater_id, dinnerTime: st?.dinner_time || null, seats: [] });
    }
    m.showings.get(sn).seats.push({
      row: a.row_label,
      seat: a.seat_num,
      dinner: a.dinner_choice || '',
      guest: a.delegate_name || null,
    });
  }
  for (const m of movies.values()) {
    for (const sh of m.showings.values()) {
      sh.seats.sort((p, q) =>
        String(p.row).localeCompare(String(q.row)) ||
        (parseInt(p.seat, 10) || 0) - (parseInt(q.seat, 10) || 0)
      );
    }
  }
  return [...movies.values()];
}

function SeatCardMenu({ onViewChart, onCopy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const pick = (fn) => (e) => { e.stopPropagation(); setOpen(false); if (fn) fn(); };
  return (
    <div className="gs-seatmenu" ref={ref}>
      <button
        type="button"
        className="gs-seatmenu-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Seat actions"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <span aria-hidden="true">&#8943;</span>
      </button>
      {open && (
        <ul className="gs-seatmenu-list" role="menu">
          <li role="none">
            <button type="button" role="menuitem" className="gs-seatmenu-item" onClick={pick(onViewChart)}>
              View in seating chart
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="gs-seatmenu-item" onClick={pick(onCopy)}>
              Copy seat list
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// One seat = id chip + inline meal dropdown that writes through set_dinner.
function SeatChip({ token, theaterId, showing, seat, onChanged, onToast }) {
  const [value, setValue] = useState(seat.dinner || '');
  const [saving, setSaving] = useState(false);

  const change = async (next) => {
    const prev = value;
    setValue(next);          // optimistic
    setSaving(true);
    try {
      await setSeatDinner(token, {
        theater_id: theaterId,
        showing_number: showing,
        row_label: seat.row,
        seat_num: seat.seat,
        dinner_choice: next,
      });
      onChanged?.(next);
      const label = MEAL_SHORT[next] || 'No meal';
      onToast?.({ kind: 'success', text: `${seat.row}${seat.seat} -> ${label}` });
    } catch (e) {
      setValue(prev);        // revert on failure
      onToast?.({ kind: 'error', text: `Meal change failed: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`gs-seatchip ${saving ? 'is-saving' : ''}`}>
      <div className="gs-seatchip-top">
        <span className="gs-seatchip-id">{seat.row}{seat.seat}</span>
        {seat.guest ? <span className="gs-seatchip-guest">{seat.guest}</span> : null}
      </div>
      <select
        className="gs-seatchip-meal-select"
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => change(e.target.value)}
        aria-label={`Meal for seat ${seat.row}${seat.seat}`}
      >
        {MEAL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function SponsorSeats({ sponsor, onToast }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    if (!sponsor.rsvp_token || (sponsor.seats_assigned || 0) === 0) {
      setState({ loading: false, error: null, data: { myAssignments: [], showtimes: [], childDelegationAssignments: [] } });
      return undefined;
    }
    setState({ loading: true, error: null, data: null });
    loadSponsorSeats(sponsor.rsvp_token)
      .then(d => { if (!cancelled) setState({ loading: false, error: null, data: d }); })
      .catch(e => { if (!cancelled) setState({ loading: false, error: e.message || 'Could not load seats', data: null }); });
    return () => { cancelled = true; };
  }, [sponsor.rsvp_token, sponsor.seats_assigned]);

  if (state.loading) {
    return (<><div className="gs-section-h">Seats &amp; movies selected</div><div className="gs-seats-loading">Loading selections...</div></>);
  }
  if (state.error) {
    return (<><div className="gs-section-h">Seats &amp; movies selected</div><div className="gs-seats-empty">Couldn't load selections: {state.error}</div></>);
  }

  const { myAssignments, showtimes, childDelegationAssignments } = state.data;
  const token = sponsor.rsvp_token;
  const groups = groupByMovie(myAssignments, showtimes);
  const guestSeatCount = (childDelegationAssignments || []).length;

  if (groups.length === 0 && guestSeatCount === 0) {
    return (<><div className="gs-section-h">Seats &amp; movies selected</div><div className="gs-seats-empty">No seats placed yet.</div></>);
  }

  const copySeats = (movieTitle, showing) => {
    const lines = showing.seats.map(s => `${s.row}${s.seat}`).join(', ');
    try {
      navigator.clipboard.writeText(`${movieTitle} - Showing ${showing.showing}: ${lines}`);
      onToast?.({ kind: 'success', text: 'Seat list copied' });
    } catch {
      onToast?.({ kind: 'error', text: 'Could not copy' });
    }
  };

  return (
    <>
      <div className="gs-section-h">Seats &amp; movies selected</div>
      <div className="gs-seatcards">
        {groups.map(m => (
          <div className="gs-seatcard" key={m.title}>
            <div className="gs-seatcard-head">
              <span className="gs-seatcard-title">{m.title}</span>
            </div>
            {[...m.showings.values()].sort((a, b) => a.showing - b.showing).map(sh => (
              <div className="gs-seatshow" key={sh.showing}>
                <div className="gs-seatshow-head">
                  <span className="gs-seatshow-label">
                    Showing {sh.showing}
                    <span className="gs-seatshow-room"> &middot; Theater {sh.theaterId}</span>
                    {sh.dinnerTime ? <span className="gs-seatshow-room"> &middot; dinner {sh.dinnerTime}</span> : null}
                  </span>
                  <span className="gs-seatshow-count">{sh.seats.length} seat{sh.seats.length !== 1 ? 's' : ''}</span>
                  <SeatCardMenu
                    onViewChart={() => window.open(`/admin/seating.html?theater=${sh.theaterId}&showing=${sh.showing}`, '_blank')}
                    onCopy={() => copySeats(m.title, sh)}
                  />
                </div>
                <div className="gs-seatchips">
                  {sh.seats.map((s, i) => (
                    <SeatChip
                      key={`${s.row}${s.seat}-${i}`}
                      token={token}
                      theaterId={sh.theaterId}
                      showing={sh.showing}
                      seat={s}
                      onChanged={(next) => { s.dinner = next; }}
                      onToast={onToast}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {guestSeatCount > 0 && (
        <div className="gs-seats-guestnote">
          + {guestSeatCount} seat{guestSeatCount !== 1 ? 's' : ''} assigned to guests they invited
        </div>
      )}
    </>
  );
}
