// DinnerModal — single-seat meal picker, v2 chrome.
//
// Opens when a sponsor taps the dinner pill on any seat row (inside
// TicketGroupModal or TicketDetailModal). Four options matching the
// 2026 menu (frenchdip / salad / veggie / kids). Writes back through
// /api/gala/portal/{token}/pick action=set_dinner.
//
// Design: each option is a tappable tile with the emoji, label, and
// short description. Selected state shows a gold ring + filled
// background. Below the options, a save bar with cancel + save.
// Auto-saves on tap optionally — but explicit save is the safer
// pattern here because some users hesitate and shouldn't commit to
// "veggie" by accidental tap-through.

import { useEffect, useState } from 'react';
import { config } from '../config.js';

export const DINNER_OPTIONS = [
  {
    id: 'frenchdip',
    emoji: '🥖',
    label: 'Hot French Dip',
    desc: 'Roast beef on a toasted roll with au jus.',
  },
  {
    id: 'salad',
    emoji: '🥗',
    label: 'Chicken Salad',
    desc: 'Green salad with grilled chicken. Gluten free.',
  },
  {
    id: 'veggie',
    emoji: '🌱',
    label: 'Vegetarian',
    desc: 'Chef\u2019s seasonal vegetable plate.',
  },
  {
    id: 'kids',
    emoji: '🧒',
    label: 'Kids Meal',
    desc: 'Kid-friendly plate for younger guests.',
  },
];

export function dinnerLabelFor(id) {
  const o = DINNER_OPTIONS.find((d) => d.id === id);
  return o ? o.label : null;
}

export function dinnerEmojiFor(id) {
  const o = DINNER_OPTIONS.find((d) => d.id === id);
  return o ? o.emoji : null;
}

export function DinnerModal({ seat, token, onClose, onRefresh }) {
  const [choice, setChoice] = useState(seat?.raw?.dinner_choice || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_dinner',
          theater_id: seat.theater_id,
          showing_number: seat.showing_number,
          row_label: seat.row,
          seat_num: seat.num,
          dinner_choice: choice,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearChoice() {
    setChoice(null);
  }

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped">
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Dinner</div>
            <div className="p2-modal-title">
              Seat{' '}
              <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>
                {seat.seatLabel}
              </span>
            </div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          <p
            style={{
              color: 'var(--p2-muted)',
              fontSize: 14,
              margin: 0,
              marginBottom: 18,
            }}
          >
            Pick a meal for this seat. {seat.guest_name ? `For ${seat.guest_name}.` : ''} You can
            change it anytime before the night of the gala.
          </p>

          <div className="p2-dinner-grid">
            {DINNER_OPTIONS.map((opt) => {
              const active = choice === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`p2-dinner-tile${active ? ' active' : ''}`}
                  onClick={() => setChoice(opt.id)}
                >
                  <span className="p2-dinner-emoji" aria-hidden="true">
                    {opt.emoji}
                  </span>
                  <span className="p2-dinner-label">{opt.label}</span>
                  <span className="p2-dinner-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {choice && (
            <button
              type="button"
              onClick={clearChoice}
              style={{
                marginTop: 14,
                background: 'transparent',
                border: 'none',
                color: 'var(--p2-subtle)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '4px 0',
              }}
            >
              Clear my pick
            </button>
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 16 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button type="button" className="p2-btn ghost sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="p2-btn primary sm"
            disabled={busy}
            onClick={save}
          >
            {busy ? 'Saving…' : choice ? 'Save meal' : 'Save (no meal)'}
          </button>
        </div>
      </div>
    </div>
  );
}
