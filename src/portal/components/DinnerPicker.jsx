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
// The four-option enum mirrors GET /api/gala/dinner exactly:
//   frenchdip  → Hot French Dip Sandwich
//   salad      → Green Salad with Grilled Chicken (Gluten Free)
//   veggie     → Vegetarian
//   kids       → Kids Meal
//
// Phase 5.8 (May 10 2026) — Kara's revised menu. Drops the cold-turkey
// option entirely; renames brisket→frenchdip and glutenfree→salad
// (the GF option is now a distinct grilled-chicken salad, not a
// "gluten-free version of the others"); veggie label changes from
// "Veggie salad" to "Vegetarian." The veggie+kids IDs are preserved
// so any in-flight test selections (we wiped this morning, so none
// in production) wouldn't dangle. Server validator in pick.js and
// dinner.js mirror this set.
//
// Optimistic update: onChange fires synchronously with the new value
// so the parent's local state can repaint without waiting for the
// round-trip; on a failed POST the parent should call onChange again
// with the prior value to revert (we surface the error inline + bail).

import { useState } from 'react';
import { BRAND, FONT_UI } from '../../brand/tokens.js';

export const DINNER_OPTIONS = [
  { value: 'frenchdip', label: 'Hot French Dip Sandwich' },
  { value: 'salad', label: 'Green Salad with Grilled Chicken (Gluten Free)' },
  { value: 'veggie', label: 'Vegetarian' },
  { value: 'kids', label: 'Kids Meal' },
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
  onSaved,
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
          showing_number: assignment.showing_number,
          row_label: assignment.row_label,
          seat_num: String(assignment.seat_num),
          dinner_choice: next,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onSaved) await onSaved(next).catch(() => {});
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
          border: `1px solid ${current ? BRAND.indigoLight : 'var(--rule)'}`,
          background: current
            ? 'rgba(168,177,255,0.18)'
            : 'transparent',
          color: current ? 'var(--accent-italic)' : 'var(--ink-on-ground)',
          fontSize: fontPx,
          fontWeight: 600,
          fontFamily: FONT_UI,
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
        <option value="" style={{ color: BRAND.ink }}>
          — select dinner —
        </option>
        {DINNER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} style={{ color: BRAND.ink }}>
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
