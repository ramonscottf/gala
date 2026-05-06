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
import { TOKENS, FONT_DISPLAY, FONT_MONO } from '../../brand/tokens.js';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: TOKENS.text.tertiary,
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
            fontWeight: 600,
            color: TOKENS.text.primary,
            marginTop: 4,
            letterSpacing: '-0.01em',
          }}
        >
          {placed.theaterName}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: TOKENS.surface.card,
          border: `1px solid ${TOKENS.rule}`,
          borderRadius: TOKENS.radius.lg,
          overflow: 'hidden',
        }}
      >
        {[...placed.seatIds].sort().map((seatId, i, arr) => (
          <div
            key={seatId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderBottom: i < arr.length - 1 ? `1px solid ${TOKENS.rule}` : 'none',
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                color: TOKENS.text.primary,
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
                minWidth: 48,
              }}
            >
              {seatId.replace('-', '')}
            </span>
            <select
              value={assignments[seatId] || ''}
              onChange={(e) => setSeat(seatId, e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: TOKENS.radius.md,
                background: TOKENS.surface.card,
                border: `1px solid ${TOKENS.ruleStrong}`,
                color: TOKENS.text.primary,
                fontSize: 13,
                fontWeight: 500,
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              <option value="">Pick guest…</option>
              {delegations.map((d) => (
                <option key={d.id} value={d.id}>
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
            padding: '7px 12px',
            borderRadius: TOKENS.radius.md,
            border: `1px dashed ${TOKENS.ruleStrong}`,
            background: 'transparent',
            color: TOKENS.brand.red,
            fontSize: 13,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="plus" size={12} stroke={2} /> Invite a new guest
        </button>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.surface.card,
            color: TOKENS.brand.red,
            fontSize: 12,
            border: `1px solid ${TOKENS.brand.red}`,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn kind="secondary" size="lg" onClick={onSkip}>
          Skip
        </Btn>
        <Btn
          kind="primary"
          size="lg"
          full
          disabled={pending}
          onClick={save}
          icon={<Icon name="check" size={14} />}
        >
          {pending ? 'Saving…' : 'Save assignments'}
        </Btn>
      </div>
    </div>
  );
}
