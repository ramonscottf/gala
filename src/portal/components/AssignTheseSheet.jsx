// AssignTheseSheet — Phase 1.9.1.
//
// Lightweight multi-seat assignment sheet shown when the sponsor taps
// "Assign these to guests" on PostPickSheet. Lists the just-placed
// seats with a per-seat dropdown of existing delegations + an inline
// "+ Invite a new guest" affordance that opens DelegateForm.
//
// Distinct from Mobile.jsx SeatAssignSheet (which is per-seat from
// TicketManage). They coexist; AssignTheseSheet is the right-after-
// pick batch flow.
//
// Save fans out to POST /assign per seat with a chosen delegation.
// Skip dismisses without changes.

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Btn, Icon } from '../../brand/atoms.jsx';

export default function AssignTheseSheet({
  placed,
  delegations = [],
  token,
  apiBase = '',
  onSaved,
  onSkip,
  onInviteNew,
}) {
  // assignments: { 'D-5': delegationId|null }
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    (placed?.seatIds || []).forEach((id) => {
      init[id] = '';
    });
    return init;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!placed) return null;

  const setSeat = (seatId, value) => {
    setAssignments((prev) => ({ ...prev, [seatId]: value }));
  };

  const save = async () => {
    const toAssign = Object.entries(assignments).filter(([, v]) => v && v !== '');
    if (!toAssign.length) {
      // Nothing chosen — treat as skip
      if (onSkip) onSkip();
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Group by delegationId so we can fire one /assign per group.
      const byDelegation = new Map();
      toAssign.forEach(([seatId, delegationId]) => {
        const k = String(delegationId);
        if (!byDelegation.has(k)) byDelegation.set(k, []);
        byDelegation.get(k).push(seatId);
      });
      const calls = [...byDelegation.entries()].map(([delegationId, seats]) =>
        fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theater_id: placed.theaterId,
            seat_ids: seats,
            delegation_id: Number(delegationId),
          }),
        })
      );
      const responses = await Promise.all(calls);
      for (const r of responses) {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setError(e?.message || 'Could not save assignments');
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.6,
            color: 'var(--accent-text)',
            textTransform: 'uppercase',
          }}
        >
          {placed.movieTitle}
          {placed.showLabel ? ` · ${placed.showLabel}` : ''}
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink-on-ground)',
            marginTop: 4,
          }}
        >
          {placed.theaterName}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...placed.seatIds].sort().map((seatId) => (
          <div
            key={seatId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: 12,
              background: 'var(--surface)',
              border: `1px solid var(--rule)`,
            }}
          >
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(168,177,255,0.18)',
                color: 'var(--accent-italic)',
                fontSize: 13,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 0.4,
                minWidth: 56,
                textAlign: 'center',
              }}
            >
              {seatId.replace('-', '')}
            </span>
            <select
              value={assignments[seatId] || ''}
              onChange={(e) => setSeat(seatId, e.target.value)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--surface)',
                border: `1px solid var(--rule)`,
                color: 'var(--ink-on-ground)',
                fontSize: 12,
                fontWeight: 600,
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              <option value="" style={{ color: BRAND.ink }}>
                Pick guest…
              </option>
              {delegations.map((d) => (
                <option key={d.id} value={d.id} style={{ color: BRAND.ink }}>
                  {d.delegateName || `Delegation ${d.id}`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {onInviteNew && (
        <button
          onClick={onInviteNew}
          style={{
            all: 'unset',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            padding: '8px 14px',
            borderRadius: 99,
            border: `1.5px dashed rgba(244,185,66,0.4)`,
            background: 'rgba(244,185,66,0.06)',
            color: 'var(--accent-text)',
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="plus" size={12} stroke={2.4} /> Invite a new guest
        </button>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(215,40,70,0.12)',
            color: '#ff8da4',
            fontSize: 12,
            border: `1px solid rgba(215,40,70,0.3)`,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn kind="secondary" size="lg" onClick={onSkip}>
          Skip for now
        </Btn>
        <Btn
          kind="primary"
          size="lg"
          full
          disabled={pending}
          onClick={save}
          icon={<Icon name="check" size={16} />}
        >
          {pending ? 'Saving…' : 'Save assignments'}
        </Btn>
      </div>
    </div>
  );
}
