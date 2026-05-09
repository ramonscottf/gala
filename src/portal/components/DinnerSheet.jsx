// DinnerSheet — V2 IA, Phase 6
//
// Bottom sheet that opens when the user taps the dinner pill on a
// TicketCardV2 row. Shows the 5 meal options as colored tiles. Tap
// → POST /pick set_dinner with the chosen value. Pre-lock only;
// after T-7 the parent suppresses the sheet (pill becomes a 🔒
// read-only label).

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';

const DINNER_TILES = [
  { value: 'brisket', label: 'Hot brisket french dip', short: 'Brisket', emoji: '🍖', tint: 'rgba(244,185,66,0.18)', fg: BRAND.gold },
  { value: 'turkey', label: 'Cold turkey sandwich', short: 'Turkey', emoji: '🥪', tint: 'rgba(168,177,255,0.18)', fg: BRAND.indigoLight },
  { value: 'veggie', label: 'Veggie salad', short: 'Veggie', emoji: '🥗', tint: 'rgba(127,207,160,0.18)', fg: '#7fcfa0' },
  { value: 'kids', label: 'Kids meal', short: 'Kids', emoji: '🧒', tint: 'rgba(215,40,70,0.18)', fg: BRAND.red },
  { value: 'glutenfree', label: 'Gluten-free', short: 'GF', emoji: '🌾', tint: 'rgba(255,255,255,0.10)', fg: '#fff' },
];

export default function DinnerSheet({
  seat, // { theaterId, row_label, seat_num, label, dinner_choice, ownerName }
  token,
  apiBase = '',
  onSaved,
  onClose,
}) {
  const [pending, setPending] = useState(null); // value being saved | null
  const [error, setError] = useState(null);

  if (!seat) return null;
  const seatLabel = seat.label || `${seat.row_label}${seat.seat_num}`;
  const current = seat.dinner_choice || null;

  const choose = async (value) => {
    setPending(value);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_dinner',
          theater_id: seat.theaterId,
          row_label: seat.row_label,
          seat_num: String(seat.seat_num),
          dinner_choice: value,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e.message || 'Could not save');
      setPending(null);
    }
  };

  const clear = async () => {
    setPending('__clear__');
    setError(null);
    try {
      await fetch(`${apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_dinner',
          theater_id: seat.theaterId,
          row_label: seat.row_label,
          seat_num: String(seat.seat_num),
          dinner_choice: null,
        }),
      });
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e.message || 'Could not clear');
      setPending(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ marginBottom: 4 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -0.4,
          }}
        >
          Dinner for {seatLabel}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
          {seat.ownerName ? `${seat.ownerName} · ` : ''}
          {current ? 'Tap another to change' : 'Pick one'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DINNER_TILES.map((t) => {
          const active = current === t.value;
          const isPending = pending === t.value;
          return (
            <button
              key={t.value}
              onClick={() => !active && choose(t.value)}
              disabled={!!pending}
              style={{
                all: 'unset',
                cursor: pending || active ? 'default' : 'pointer',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: 12,
                background: active ? t.tint : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? t.fg + '66' : 'var(--rule)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: pending && !isPending && !active ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: t.tint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {t.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: active ? t.fg : 'var(--ink-on-ground)',
                  }}
                >
                  {t.label}
                </div>
              </div>
              {active && (
                <span
                  style={{
                    color: t.fg,
                    fontSize: 18,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
              )}
              {isPending && (
                <span style={{ color: 'var(--mute)', fontSize: 11, flexShrink: 0 }}>
                  Saving…
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <button
          onClick={clear}
          disabled={!!pending}
          style={{
            all: 'unset',
            cursor: pending ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
            padding: 10,
            marginTop: 4,
            borderRadius: 10,
            background: 'transparent',
            border: `1px dashed var(--rule)`,
            color: 'var(--mute)',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            opacity: pending ? 0.4 : 1,
          }}
        >
          Clear dinner choice
        </button>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(215,40,70,0.12)',
            color: '#ff8da4',
            fontSize: 12,
            border: `1px solid rgba(215,40,70,0.30)`,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
