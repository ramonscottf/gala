// DinnerPicker — Phase 1.9 H1.
//
// One-line dinner-choice <select> per finalized seat. Reads the current
// dinner_choice off the assignment row and POSTs the new value to
// /api/gala/portal/{token}/pick with action:'set_dinner' (the endpoint
// that's been there since Phase 1 — only the UI was missing).
//
// Shared between Mobile and Desktop per the Phase 1.9 hard rule: every
// feature ships to both shells from the same import. This file is the
// single source for that styling + network behavior.
//
// The five-option enum mirrors GET /api/gala/dinner exactly:
//   brisket    → Hot brisket french dip
//   turkey     → Cold turkey sandwich
//   veggie     → Veggie salad
//   kids       → Kids meal
//   glutenfree → Gluten-free
//
// Optimistic update: onChange fires synchronously with the new value
// so the parent's local state can repaint without waiting for the
// round-trip; on a failed POST the parent should call onChange again
// with the prior value to revert (we surface the error inline + bail).

import { useState } from 'react';
import { TOKENS } from '../../brand/tokens.js';

export const DINNER_OPTIONS = [
  { value: 'brisket', label: 'Hot brisket french dip' },
  { value: 'turkey', label: 'Cold turkey sandwich' },
  { value: 'veggie', label: 'Veggie salad' },
  { value: 'kids', label: 'Kids meal' },
  { value: 'glutenfree', label: 'Gluten-free' },
];

const DINNER_LABEL = Object.fromEntries(DINNER_OPTIONS.map((o) => [o.value, o.label]));

export function dinnerLabel(value) {
  return DINNER_LABEL[value] || '';
}

export default function DinnerPicker({
  assignment,
  token,
  apiBase = '',
  onChange,
  size = 'md',
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const current = assignment?.dinner_choice || '';

  const heightPx = size === 'sm' ? 28 : 34;
  const fontPx = size === 'sm' ? 11 : 12;

  const handle = async (e) => {
    const next = e.target.value || null;
    setPending(true);
    setError(null);
    if (onChange) onChange(next);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_dinner',
          theater_id: assignment.theater_id,
          row_label: assignment.row_label,
          seat_num: String(assignment.seat_num),
          dinner_choice: next,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err);
      // Revert the optimistic update so the UI stays in sync with server.
      if (onChange) onChange(current);
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
      <select
        value={current}
        onChange={handle}
        disabled={pending}
        aria-label={`Dinner for seat ${assignment?.row_label}-${assignment?.seat_num}`}
        className="dinner-select"
        style={{
          height: heightPx,
          padding: '0 26px 0 10px',
          borderRadius: 99,
          // Theme-aware. CSS class .dinner-select handles the chevron
          // SVG color (light vs dark) since inline backgroundImage can't
          // see CSS custom properties cleanly.
          border: `1px solid ${current ? TOKENS.brand.gold : 'var(--rule)'}`,
          background: current
            ? 'rgba(168,177,255,0.18)'
            : 'transparent',
          color: current ? 'var(--text-italic)' : 'var(--text-primary)',
          fontSize: fontPx,
          fontWeight: 600,
          fontFamily: TOKENS.font.ui,
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `right 8px center`,
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
          maxWidth: '100%',
        }}
      >
        <option value="" style={{ color: TOKENS.text.primary }}>
          — select dinner —
        </option>
        {DINNER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} style={{ color: TOKENS.text.primary }}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span
          style={{
            fontSize: 10,
            color: '#ff8da4',
            marginTop: 2,
            paddingLeft: 8,
          }}
        >
          {error.message}
        </span>
      )}
    </div>
  );
}
