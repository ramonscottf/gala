// ReceiveOverlay — first-visit gate for delegates.
//
// When a delegate opens their portal link for the first time (their
// confirmedAt is null), they see this overlay BEFORE landing in the
// normal portal view. The overlay lays out what the sponsor set up
// for them — seats, meals, contact info — and offers two CTAs:
//
//   Keep these seats  → POST action=confirm, stamps confirmedAt,
//                       overlay closes, delegate sees normal portal
//
//   Modify           → opens DelegationManageModal in selfView mode
//                       so the delegate can edit their own contact
//                       info and meals before confirming. On modal
//                       close, we stamp confirmedAt anyway (the
//                       intent to interact = the intent to confirm)
//
// Visually: full-screen take-over, navy gradient ground (same as
// celebration but no rotating rays), Fraunces serif headline,
// per-seat cards with movie / showing pill / aud pill / meal pill
// laid out beneath. CTAs at the bottom.

import { useEffect, useState } from 'react';
import { config } from '../config.js';
import { dinnerEmojiFor, dinnerLabelFor } from './DinnerModal.jsx';
import { ShowingAuditoriumPills } from './TicketGroupModal.jsx';
import { DelegationManageModal } from './DelegationManageModal.jsx';

function buildSeatPreview(portal) {
  const assignments = portal?.myAssignments || [];
  const showtimes = portal?.showtimes || [];
  const stIndex = {};
  showtimes.forEach((s) => {
    stIndex[`${s.theater_id}:${s.showing_number}`] = s;
  });
  return assignments.map((a) => {
    const st = stIndex[`${a.theater_id}:${a.showing_number || 1}`] || {};
    return {
      key: `${a.theater_id}:${a.showing_number || 1}:${a.row_label}-${a.seat_num}`,
      seatLabel: `${a.row_label}${a.seat_num}`,
      theater_id: a.theater_id,
      showing_number: a.showing_number || 1,
      movie_title: st.movie_title || 'TBD',
      poster_url: st.poster_url,
      dinner_choice: a.dinner_choice,
    };
  });
}

export function ReceiveOverlay({ portal, token, onConfirmed }) {
  const identity = portal?.identity || {};
  const seats = buildSeatPreview(portal);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  const [modifyOpen, setModifyOpen] = useState(false);

  async function confirmSeats() {
    if (pending) return;
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (onConfirmed) await onConfirmed();
    } catch (e) {
      setErr(e.message);
      setPending(false);
    }
  }

  // Reduced delegation shape suitable for DelegationManageModal in
  // selfView mode. The delegate IS this delegation, so we synthesize
  // it from identity.
  const selfDelegation = {
    id: identity.id,
    token, // their own token
    delegateName: identity.delegateName,
    email: identity.email,
    phone: identity.phone,
    seatsAllocated: identity.seatsAllocated,
    seatsPlaced: seats.length,
    status: identity.status,
    confirmedAt: identity.confirmedAt,
    accessedAt: identity.accessedAt,
  };

  return (
    <div className="p2-receive">
      <div className="p2-receive-inner">
        <div className="p2-receive-eyebrow">
          {identity.parentCompany ? `${identity.parentCompany} · DEF Gala 2026` : 'DEF Gala 2026'}
        </div>
        <h1 className="p2-receive-headline">
          Welcome, <span className="p2-italic-flair">{firstNameOf(identity.delegateName)}</span>.
        </h1>
        <p className="p2-receive-sub">
          Here's what {sponsorPossessive(identity)} set up for you. Tap{' '}
          <strong>Keep these seats</strong> to confirm, or <strong>Modify</strong> to change your
          contact info or meal choices.
        </p>

        {seats.length === 0 ? (
          <div className="p2-receive-empty">
            <p>
              No seats have been assigned to you yet. Your sponsor may still be picking your
              spot — we'll text you when it's ready.
            </p>
          </div>
        ) : (
          <div className="p2-receive-seats">
            {seats.map((s) => (
              <div key={s.key} className="p2-receive-seat-card">
                {s.poster_url && (
                  <img
                    src={s.poster_url}
                    alt=""
                    className="p2-receive-poster"
                    aria-hidden="true"
                  />
                )}
                <div className="p2-receive-seat-body">
                  <div className="p2-receive-seat-title">
                    <span className="p2-receive-seat-label">{s.seatLabel}</span>
                    <span className="p2-receive-movie">{s.movie_title}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ShowingAuditoriumPills
                      showingNumber={s.showing_number}
                      auditoriumId={s.theater_id}
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {s.dinner_choice ? (
                      <span className="p2-dinner-pill">
                        <span className="p2-dinner-pill-emoji">
                          {dinnerEmojiFor(s.dinner_choice)}
                        </span>
                        <span>{dinnerLabelFor(s.dinner_choice)}</span>
                      </span>
                    ) : (
                      <span className="p2-dinner-pill empty">
                        <span className="p2-dinner-pill-emoji">🍽️</span>
                        <span>Meal not yet picked</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(identity.email || identity.phone) && (
          <div className="p2-receive-contact">
            <div className="p2-receive-contact-label">We have you as</div>
            <div className="p2-receive-contact-body">
              <div>{identity.delegateName || 'Guest'}</div>
              <div style={{ color: 'var(--p2-muted)', fontSize: 13 }}>
                {[identity.phone, identity.email].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {err && (
          <div className="p2-notice red" style={{ marginTop: 16, maxWidth: 480 }}>
            <p>{err}</p>
          </div>
        )}

        <div className="p2-receive-actions">
          <button
            type="button"
            className="p2-btn ghost"
            disabled={pending}
            onClick={() => setModifyOpen(true)}
          >
            Modify →
          </button>
          <button
            type="button"
            className="p2-btn primary"
            disabled={pending}
            onClick={confirmSeats}
          >
            {pending ? 'Confirming…' : 'Keep these seats →'}
          </button>
        </div>
      </div>

      {modifyOpen && (
        <DelegationManageModal
          delegation={selfDelegation}
          token={token}
          selfView={true}
          onClose={() => {
            // Closing the modify modal is also an implicit confirm —
            // the delegate has interacted with their seats, the intent
            // is clear. Stamp confirmedAt so they don't see this gate
            // on subsequent visits.
            confirmSeats();
            setModifyOpen(false);
          }}
          onRefresh={async () => {
            // Refetch portal so modal sees fresh contact info next
            // time. The parent owns onConfirmed which triggers the
            // refresh chain, but for the immediate self-edit case
            // we want the modify modal to reflect saved values.
            if (onConfirmed) await onConfirmed();
          }}
        />
      )}
    </div>
  );
}

function firstNameOf(full) {
  if (!full) return 'there';
  return full.split(/\s+/)[0] || full;
}

function sponsorPossessive(identity) {
  // Returns the right phrasing: "Wicko Waypoint" or "your sponsor"
  if (identity.parentCompany) return identity.parentCompany;
  return 'your sponsor';
}
