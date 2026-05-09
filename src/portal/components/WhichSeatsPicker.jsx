// WhichSeatsPicker — V2 R11
//
// Shown after the user taps "Invite a guest" from PostPickOverview.
// Lists the seats that still need a guest. All pre-checked by
// default (most users want to invite one guest for all the seats).
// User can uncheck individual seats to split a block across multiple
// guests; tap Continue with N seats → opens DelegateForm with those
// N seats locked.
//
// Reads the current assignment rows (live) and shows ONLY the seats
// from the current post-pick block that still don't have a
// delegation. As guests get assigned, this list shrinks; the user
// returns here from the overview each time to pick the next batch.

import { useState, useMemo } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { seatLabel as fmtSeat } from '../Mobile.jsx';

export default function WhichSeatsPicker({
  placed,           // { theaterId, seatIds, movieTitle, showLabel, showTime, theaterName }
  assignmentRows,   // current rows — used to filter out already-assigned seats
  onContinue,       // (selectedSeatIds: string[]) => void
  onBack,
}) {
  const seatIds = placed?.seatIds || [];

  // Available seats = just-placed seats with no delegation yet
  const availableSeats = useMemo(() => {
    return seatIds.filter((sid) => {
      const row = (assignmentRows || []).find(
        (r) => (r.seat_id || `${r.row_label}-${r.seat_num}`) === sid,
      );
      return row && !row.delegation_id;
    });
  }, [seatIds, assignmentRows]);

  // Selected = all available, by default (the common case is "invite
  // one guest for all the rest")
  const [selected, setSelected] = useState(() => new Set(availableSeats));

  const toggle = (sid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const allChecked = selected.size === availableSeats.length && availableSeats.length > 0;
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(availableSeats));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.5,
            color: 'var(--accent-text)',
            textTransform: 'uppercase',
          }}
        >
          {placed?.showLabel} · {placed?.showTime}
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            marginTop: 4,
            letterSpacing: -0.3,
            lineHeight: 1.1,
          }}
        >
          Which seats?
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--mute)',
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          They'll get a text & email with these specific seats.
        </div>
      </div>

      {/* Select all / none control */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.4,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          SEATS · {availableSeats.length} AVAILABLE
        </div>
        <button
          type="button"
          onClick={toggleAll}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            color: BRAND.indigoLight,
          }}
        >
          {allChecked ? 'Clear all' : 'Select all'}
        </button>
      </div>

      {/* Seat checkbox list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {availableSeats.map((sid) => {
          const checked = selected.has(sid);
          return (
            <button
              key={sid}
              type="button"
              onClick={() => toggle(sid)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: 12,
                background: checked
                  ? 'rgba(168,177,255,0.10)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${checked ? 'rgba(168,177,255,0.32)' : 'var(--rule)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Checkbox checked={checked} />
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 16,
                  fontWeight: 700,
                  color: checked ? BRAND.indigoLight : 'rgba(255,255,255,0.85)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 0.3,
                }}
              >
                {fmtSeat(sid)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            padding: '12px 18px',
            borderRadius: 99,
            background: 'transparent',
            border: `1px solid var(--rule)`,
            color: 'var(--ink-on-ground)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => someChecked && onContinue(Array.from(selected))}
          disabled={!someChecked}
          style={{
            all: 'unset',
            cursor: someChecked ? 'pointer' : 'not-allowed',
            boxSizing: 'border-box',
            flex: 1,
            padding: '12px 18px',
            borderRadius: 99,
            background: someChecked
              ? 'linear-gradient(135deg,#a8b1ff,#6f75d8)'
              : 'rgba(255,255,255,0.04)',
            color: someChecked ? BRAND.navyDeep : 'rgba(255,255,255,0.4)',
            border: someChecked ? 'none' : `1px solid var(--rule)`,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.3,
            opacity: someChecked ? 1 : 0.6,
          }}
        >
          Continue with {selected.size} seat{selected.size === 1 ? '' : 's'} →
        </button>
      </div>
    </div>
  );
}

function Checkbox({ checked }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background: checked ? BRAND.indigoLight : 'transparent',
        border: `1.5px solid ${checked ? BRAND.indigoLight : 'rgba(255,255,255,0.30)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        color: BRAND.navyDeep,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {checked ? '✓' : ''}
    </span>
  );
}
