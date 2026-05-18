// TicketGroupModal — when a sponsor has multiple seats for the same
// showing (e.g. 3 Star Wars Late seats), the home page collapses them
// to a single ticket card. Tapping that card opens this modal, which
// lays out all seats in the group with per-seat actions plus a
// "text my seats" action covering the whole group.

import { useState, useEffect, useRef } from 'react';
import { config } from '../config.js';
import { DinnerModal, dinnerEmojiFor, dinnerLabelFor } from './DinnerModal.jsx';

function formatShowing(s) {
  return s === 1 ? 'Early showing · 4:30 PM' : s === 2 ? 'Late showing · 7:15 PM' : '';
}

export function TicketGroupModal({
  group,
  portal,
  token,
  onClose,
  onRefresh,
  onOpenSeat,
  onEditSeats,
  onInviteSeat,
  onChangeSeat,
  onReleaseSeat,
  onMoveGroup,
  onReleaseGroup,
  onGiftSeat,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [smsNote, setSmsNote] = useState(null);
  const [dinnerSeat, setDinnerSeat] = useState(null);
  // overflowSeat: which seat's ⋯ menu is open (null when closed).
  const [overflowSeat, setOverflowSeat] = useState(null);
  // groupMenu: whether the footer "Manage group ▼" menu is open.
  const [groupMenu, setGroupMenu] = useState(false);
  const overflowRef = useRef(null);
  const groupMenuRef = useRef(null);

  // Click-outside to close overflow + group menu.
  useEffect(() => {
    function onDocClick(e) {
      if (overflowSeat && overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowSeat(null);
      }
      if (groupMenu && groupMenuRef.current && !groupMenuRef.current.contains(e.target)) {
        setGroupMenu(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [overflowSeat, groupMenu]);

  const identity = portal?.identity || {};
  const canTextSelf = identity.kind === 'sponsor' && !!identity.phone;
  const delegations = portal?.childDelegations || [];

  async function textMySeats() {
    setBusy(true);
    setErr(null);
    setSmsNote(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'self' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSmsNote(`Sent to ${j.to || identity.phone}.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
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
            <div className="p2-modal-eyebrow">Group ticket</div>
            <div className="p2-modal-title">{group.movie_title}</div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 18 }}>
            {group.poster_url && (
              <img
                src={group.poster_url}
                alt={`${group.movie_title} poster`}
                style={{
                  width: 96,
                  aspectRatio: '2 / 3',
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--p2-rule)',
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ShowingAuditoriumPills
                showingNumber={group.showing_number}
                auditoriumId={group.theater_id}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="p2-chip">
                  {group.seats.length} {group.seats.length === 1 ? 'seat' : 'seats'}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--p2-gold)',
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            Seats in this group
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.seats.map((s) => {
              const dinner = s.raw?.dinner_choice;
              const hasDelegate = !!(s.raw?.delegation_id || s.guest_name);
              const canInvite = !hasDelegate && onInviteSeat;
              const canChange = !!onChangeSeat;
              return (
                <div key={s.id} className="p2-group-seat-row">
                  <span
                    style={{
                      fontFamily: 'Fraunces, Georgia, serif',
                      fontSize: 22,
                      color: 'var(--p2-gold)',
                      fontWeight: 600,
                      minWidth: 56,
                      flexShrink: 0,
                    }}
                  >
                    {s.seatLabel}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: hasDelegate ? 'rgba(255,255,255,0.92)' : 'var(--p2-subtle)',
                      minWidth: 0,
                      fontStyle: hasDelegate ? 'normal' : 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.guest_name || 'Yours (no guest)'}
                  </span>
                  <div className="p2-group-seat-actions">
                    {/* ⋯ overflow comes FIRST in the cluster — secondary
                        utility actions (release, future advanced) live
                        here so primary actions read cleanly. */}
                    {onReleaseSeat && (
                      <div
                        style={{ position: 'relative' }}
                        ref={overflowSeat === s.id ? overflowRef : null}
                      >
                        <button
                          type="button"
                          className="p2-overflow-btn"
                          onClick={() =>
                            setOverflowSeat((cur) => (cur === s.id ? null : s.id))
                          }
                          aria-label={`More actions for ${s.seatLabel}`}
                          aria-expanded={overflowSeat === s.id}
                        >
                          ⋯
                        </button>
                        {overflowSeat === s.id && (
                          <div className="p2-overflow-popover" role="menu">
                            <button
                              type="button"
                              className="p2-overflow-item danger"
                              onClick={() => {
                                setOverflowSeat(null);
                                onReleaseSeat(s);
                              }}
                              role="menuitem"
                            >
                              <span aria-hidden="true">🗑️</span>
                              <span>Release this seat</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {canChange && (
                      <button
                        type="button"
                        className="p2-chip-btn"
                        onClick={() => onChangeSeat(s)}
                        aria-label={`Change seat ${s.seatLabel}`}
                      >
                        <span aria-hidden="true">↻</span>
                        <span>Change</span>
                      </button>
                    )}
                    {onGiftSeat && (
                      <button
                        type="button"
                        className="p2-chip-btn"
                        onClick={() => onGiftSeat(s)}
                        aria-label={
                          hasDelegate
                            ? `Reassign ${s.seatLabel}`
                            : `Gift ${s.seatLabel} to a guest`
                        }
                      >
                        <span aria-hidden="true">🎁</span>
                        <span>{hasDelegate ? 'Reassign' : 'Gift'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={`p2-dinner-pill${dinner ? '' : ' empty'}`}
                      onClick={() => setDinnerSeat(s)}
                      aria-label={dinner ? `Change meal: ${dinnerLabelFor(dinner)}` : 'Pick dinner'}
                    >
                      {dinner ? (
                        <>
                          <span className="p2-dinner-pill-emoji">{dinnerEmojiFor(dinner)}</span>
                          <span>{dinnerLabelFor(dinner)}</span>
                        </>
                      ) : (
                        <>
                          <span className="p2-dinner-pill-emoji">🍽️</span>
                          <span>Pick dinner</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {canTextSelf && (
            <div style={{ marginTop: 22 }}>
              <button
                className="p2-btn ghost sm"
                type="button"
                disabled={busy}
                onClick={textMySeats}
              >
                📱 Text all my seats to me
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--p2-subtle)' }}>
                Sends every confirmed seat (across all groups) to {identity.phone}.
              </div>
            </div>
          )}

          {smsNote && (
            <div className="p2-notice success" style={{ marginTop: 18 }}>
              <p>{smsNote}</p>
            </div>
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 18 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button type="button" className="p2-btn ghost sm" onClick={onClose}>
            Close
          </button>
          {(() => {
            const remaining = Math.max(
              0,
              (portal?.seatMath?.total || 0) -
                (portal?.seatMath?.placed || 0) -
                (portal?.seatMath?.delegated || 0)
            );
            const canMove = !!onMoveGroup && group.seats.length >= 2;
            const canReleaseGroup = !!onReleaseGroup && group.seats.length >= 2;
            const hasGroupActions = canMove || canReleaseGroup;
            return (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {hasGroupActions && (
                  <div style={{ position: 'relative' }} ref={groupMenuRef}>
                    <button
                      type="button"
                      className="p2-btn ghost sm"
                      onClick={() => setGroupMenu((v) => !v)}
                      aria-expanded={groupMenu}
                    >
                      Manage group {groupMenu ? '▾' : '▸'}
                    </button>
                    {groupMenu && (
                      <div className="p2-overflow-popover p2-group-menu" role="menu">
                        {canMove && (
                          <button
                            type="button"
                            className="p2-overflow-item"
                            onClick={() => {
                              setGroupMenu(false);
                              onMoveGroup(group);
                            }}
                            role="menuitem"
                          >
                            <span aria-hidden="true">⇄</span>
                            <span>
                              Move all {group.seats.length} seats
                            </span>
                          </button>
                        )}
                        {canReleaseGroup && (
                          <button
                            type="button"
                            className="p2-overflow-item danger"
                            onClick={() => {
                              setGroupMenu(false);
                              onReleaseGroup(group);
                            }}
                            role="menuitem"
                          >
                            <span aria-hidden="true">🗑️</span>
                            <span>Release whole group</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {remaining > 0 && (
                  <button type="button" className="p2-btn primary sm" onClick={onEditSeats}>
                    + Add more seats
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {dinnerSeat && (
        <DinnerModal
          seat={dinnerSeat}
          token={token}
          onClose={() => setDinnerSeat(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

// Pairs the showing-time pill and the auditorium pill side-by-side.
// Showing pill is time-of-day aware: Early = blue, Late = red.
// Auditorium pill is gold. Two distinct visual roles, consistent
// pill language throughout the portal.
export function ShowingAuditoriumPills({ showingNumber, auditoriumId }) {
  const isLate = showingNumber === 2;
  const showingLabel = isLate ? 'Late · 7:15 PM' : 'Early · 4:30 PM';
  return (
    <div className="p2-pill-pair">
      <span className={`p2-showtime-pill ${isLate ? 'late' : 'early'}`}>
        <span className="p2-showtime-pill-dot" aria-hidden="true" />
        {showingLabel}
      </span>
      <span className="p2-aud-pill">
        <span className="p2-aud-pill-icon" aria-hidden="true">🎬</span>
        Auditorium {auditoriumId}
      </span>
    </div>
  );
}
