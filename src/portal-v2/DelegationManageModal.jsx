// DelegationManageModal — v2-native manage surface for a delegation.
//
// Replaces the previous "wrap legacy DelegateManage" approach. The
// legacy component handled actions cleanly but didn't support inline
// editing of the delegate's name/phone/email, which is the gap Scott
// flagged. We build it fresh here in v2 chrome with three sections:
//
//   1. Their tickets — read-only summary of every seat the delegate
//      has placed: movie + showtime + auditorium + seat + dinner.
//      Surfaces split blocks (multi-showing) inline. Eliminates the
//      "Jason texts Scott to ask what Norris picked" support burden.
//      (May 18 2026 — added when Scott flagged the Jason→Norris SMS
//      thread; sponsor portal was hiding the data despite already
//      fetching it from /api/gala/portal/[token].)
//
//   2. Edit details — three editable fields (name, phone, email)
//      with a Save button. Calls /api/gala/portal/{token}/delegate
//      action=update.
//
//   3. Actions — push tickets to guest (new May 18 2026) / resend
//      invite / copy link / reclaim seats. Push tickets is distinct
//      from resend: resend re-sends the original invite link with a
//      "go pick seats" CTA; push tickets sends a confirmation-style
//      SMS+email summarising the seats already placed.
//
// Header is the avatar + name + status pill (read-only). Footer is
// just Done — primary actions live inside the body.
//
// selfView=true hides sponsor-only actions (resend/reclaim/push) when
// the delegate is editing their own row.

import { useEffect, useMemo, useState } from 'react';
import { config } from '../config.js';
import { dinnerLabelFor, dinnerEmojiFor } from './DinnerModal.jsx';

// Lifecycle status for the Manage Invite modal header. Mirrors the
// implementation in PortalShell.jsx — see the long-form comment
// there for the rationale. Keep these two in sync; if you change
// one, change the other.
function delegationStatus(d) {
  if (!d) return 'unknown';
  const raw = (d.status || '').toLowerCase();
  if (raw === 'declined' || raw === 'revoked') return raw;
  if (raw === 'expired') return 'expired';

  const allocated = Number(d.seatsAllocated || d.seats_allocated || 0);
  const placed = Number(d.seatsPlaced || d.seats_placed || 0);
  const missingMeals = Number(d.seatsMissingDinner || d.seats_missing_dinner || 0);
  const accessed = !!(d.accessedAt || d.accessed_at);

  if (placed === 0) return accessed ? 'opened' : 'invited';
  if (placed < allocated) return 'partial';
  if (missingMeals > 0) return 'meals';
  return 'ready';
}

function initialsOf(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');
}

export function DelegationManageModal({
  delegation,
  token,
  onClose,
  onRefresh,
  selfView = false,
  // May 18 2026 — sponsor-portal "see what your guest picked" data.
  // assignments is the full childDelegationAssignments array from the
  // portal payload; we filter to this delegation's rows below.
  // showtimes is the joined showtimes+movies list used to map
  // (theater_id, showing_number) → movie title + start time.
  assignments,
  showtimes,
  // Phase X (2026-05-22) — assign-seats-on-edit. The sponsor's placed-
  // but-undelegated seats, same shape PortalShell builds for InviteModal
  // ({ key, seatId, theaterId, label, movie, showing, showingLabel }).
  // When present (sponsor view), an "Assign seats" section lets the
  // sponsor hand specific already-placed seats to THIS existing guest —
  // the seat picker that previously only existed in the Invite flow.
  assignableSeats = null,
  // Phase C — edit on behalf. When these callbacks are wired (sponsor
  // view only, never selfView), the per-ticket ✏️/🍽️ icons appear
  // and the "Move all seats together" CTA shows up below the list
  // when applicable. Each callback receives the seat or group shape
  // that the respective modal needs.
  onEditSeat,
  onEditMeal,
  onMoveGroup,
}) {
  const initialName = delegation?.delegateName || '';
  const initialEmail = delegation?.email || '';
  const initialPhone = delegation?.phone || '';

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [pending, setPending] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReclaim, setConfirmReclaim] = useState(false);
  const [pushedAt, setPushedAt] = useState(null);
  // Assign-seats-on-edit: which assignable seat keys are selected to
  // hand to this guest, keyed by the `key` field (theater:row-num so it
  // never collides across auditoriums).
  const [pickedSeats, setPickedSeats] = useState(() => new Set());

  // Filter the full child-delegation-assignments list down to just
  // this delegation's seats. Stable-sort by showing → theater → row →
  // seat so the rendered order matches the rest of the portal.
  const myAssignments = useMemo(() => {
    if (!delegation?.id || !Array.isArray(assignments)) return [];
    return assignments
      .filter((a) => Number(a.delegation_id) === Number(delegation.id))
      .slice()
      .sort((a, b) => {
        const s = (a.showing_number || 1) - (b.showing_number || 1);
        if (s) return s;
        const t = (a.theater_id || 0) - (b.theater_id || 0);
        if (t) return t;
        const r = String(a.row_label || '').localeCompare(String(b.row_label || ''));
        if (r) return r;
        return String(a.seat_num || '').localeCompare(String(b.seat_num || ''), undefined, { numeric: true });
      });
  }, [assignments, delegation?.id]);

  // Build a lookup from (theater_id, showing_number) → showtime row
  // so each assignment can pull its movie title + start time. The
  // showtimes payload is keyed that way on the server.
  const showtimeLookup = useMemo(() => {
    const m = new Map();
    (showtimes || []).forEach((s) => {
      m.set(`${s.theater_id}:${s.showing_number}`, s);
    });
    return m;
  }, [showtimes]);

  // Split-block detector: are this delegation's seats spread across
  // more than one (movie × showing)? If yes, surface a pill so the
  // sponsor sees it at a glance.
  const isSplit = useMemo(() => {
    if (myAssignments.length < 2) return false;
    const key = (a) => `${a.theater_id}:${a.showing_number}`;
    return new Set(myAssignments.map(key)).size > 1;
  }, [myAssignments]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const status = delegationStatus(delegation);
  const isDirty =
    name.trim() !== initialName.trim() ||
    email.trim() !== initialEmail.trim() ||
    phone.trim() !== initialPhone.trim();

  const portalUrl = delegation?.token
    ? `https://gala.daviskids.org/sponsor/${delegation.token}`
    : '';

  async function save() {
    if (!isDirty || pending) return;
    if (!name.trim()) {
      setErr('Name cannot be empty.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setErr('At least phone or email is required so they can be reached.');
      return;
    }
    setPending('save');
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          delegation_id: delegation.id,
          delegate_name: name.trim(),
          delegate_email: email.trim(),
          delegate_phone: phone.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSavedAt(Date.now());
      if (onRefresh) await onRefresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPending(null);
    }
  }

  async function resend() {
    setPending('resend');
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', delegation_id: delegation.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPending(null);
    }
  }

  async function reclaim() {
    if (!confirmReclaim) {
      setConfirmReclaim(true);
      return;
    }
    setPending('reclaim');
    setErr(null);
    try {
      const res = await fetch(
        `${config.apiBase}/api/gala/portal/${token}/delegate?delegation_id=${delegation.id}`,
        { method: 'DELETE' }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (onRefresh) await onRefresh();
      onClose();
    } catch (e) {
      setErr(e.message);
      setConfirmReclaim(false);
    } finally {
      setPending(null);
    }
  }

  async function copyLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr('Could not copy. Long-press the link to copy manually.');
    }
  }

  async function pushTickets() {
    if (pending) return;
    if (myAssignments.length === 0) {
      setErr('Nothing to push — no seats placed yet.');
      return;
    }
    setPending('push');
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push_tickets', delegation_id: delegation.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPushedAt(Date.now());
      if (onRefresh) await onRefresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPending(null);
    }
  }

  async function assignSeats() {
    if (pending) return;
    const all = Array.isArray(assignableSeats) ? assignableSeats : [];
    const chosen = all.filter((s) => pickedSeats.has(s.key));
    if (chosen.length === 0) {
      setErr('Tap one or more seats to hand to this guest first.');
      return;
    }
    setPending('assign');
    setErr(null);
    // /assign takes one theater_id + seat_ids[] per call. Group by it.
    const byTheater = new Map();
    for (const s of chosen) {
      if (!byTheater.has(s.theaterId)) byTheater.set(s.theaterId, []);
      byTheater.get(s.theaterId).push(s.seatId);
    }
    try {
      for (const [tid, seatIds] of byTheater) {
        const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theater_id: tid,
            seat_ids: seatIds,
            delegation_id: delegation.id,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      }
      setPickedSeats(new Set());
      if (onRefresh) await onRefresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPending(null);
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
            <div className="p2-modal-eyebrow">
              {selfView ? 'Your contact info' : 'Manage invite'}
            </div>
            <div className="p2-modal-title">{name || 'Guest'}</div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          {!selfView && (
            <div className="p2-deleg-header">
              <div className="p2-avatar" style={{ width: 48, height: 48, fontSize: 14 }}>
                {initialsOf(name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {delegation?.seatsPlaced ?? 0} of {delegation?.seatsAllocated ?? 0} placed
                </div>
                <div className="p2-ticket-meta" style={{ marginTop: 2 }}>
                  {(() => {
                    // Subtitle mirrors the lifecycle state in the pill
                    // so the two reinforce each other. Plain-English
                    // sentence for each state — sponsor never has to
                    // guess what "INVITED" or "PICKING" means.
                    const placed = Number(delegation?.seatsPlaced || 0);
                    const allocated = Number(delegation?.seatsAllocated || 0);
                    switch (status) {
                      case 'invited':  return 'Invite sent — hasn’t opened yet';
                      case 'opened':   return 'Opened the link — hasn’t picked seats yet';
                      case 'partial':  return `Picked ${placed} of ${allocated} seats so far`;
                      case 'meals':    return 'All seats picked — still choosing meals';
                      case 'ready':    return 'All seats and meals locked in';
                      case 'declined': return 'Declined the invite';
                      case 'revoked':  return 'Invite revoked';
                      case 'expired':  return 'Invite expired';
                      default:         return delegation?.accessedAt ? 'Has opened the link' : 'Invite sent, not yet opened';
                    }
                  })()}
                </div>
              </div>
              <DelegationStatusInline status={status} />
            </div>
          )}

          {!selfView && myAssignments.length > 0 && (
            <div className="p2-deleg-section">
              <div
                className="p2-deleg-section-title"
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <span>Their tickets</span>
                {isSplit && <span className="p2-split-block-pill">Split block</span>}
              </div>
              <div className="p2-deleg-ticket-list">
                {myAssignments.map((a, i) => {
                  const show = showtimeLookup.get(`${a.theater_id}:${a.showing_number}`);
                  // Build the seat shape SwapSeatModal expects. The
                  // currentSeat object is denormalized — modal uses
                  // .row/.num/.seatLabel for display and .theater_id /
                  // .showing_number for the API target.
                  const seatForSwap = onEditSeat ? {
                    row: a.row_label,
                    num: a.seat_num,
                    seatLabel: `${a.row_label}${a.seat_num}`,
                    theater_id: a.theater_id,
                    showing_number: a.showing_number,
                    movie_title: show?.movie_title,
                    poster_url: show?.poster_url || show?.thumbnail_url,
                  } : null;
                  // DinnerModal seat shape uses .row/.num and .raw
                  // for current dinner_choice display.
                  const seatForMeal = onEditMeal ? {
                    row: a.row_label,
                    num: a.seat_num,
                    theater_id: a.theater_id,
                    showing_number: a.showing_number,
                    guest_name: delegation.delegateName,
                    raw: { dinner_choice: a.dinner_choice },
                  } : null;
                  return (
                    <TicketLine
                      key={`${a.theater_id}:${a.showing_number}:${a.row_label}:${a.seat_num}:${i}`}
                      assignment={a}
                      showtime={show}
                      onSwap={onEditSeat && seatForSwap ? () => onEditSeat(seatForSwap) : null}
                      onChangeMeal={onEditMeal && seatForMeal ? () => onEditMeal(seatForMeal) : null}
                    />
                  );
                })}
              </div>
              {onMoveGroup && !isSplit && myAssignments.length >= 2 && (
                <button
                  type="button"
                  className="p2-btn ghost sm"
                  style={{ marginTop: 12, width: '100%' }}
                  onClick={() => {
                    // Build the group shape MoveGroupModal expects.
                    const first = myAssignments[0];
                    const show = showtimeLookup.get(`${first.theater_id}:${first.showing_number}`);
                    onMoveGroup({
                      id: `deleg-${delegation.id}-${first.theater_id}-${first.showing_number}`,
                      theater_id: first.theater_id,
                      showing_number: first.showing_number,
                      movie_title: show?.movie_title,
                      poster_url: show?.poster_url || show?.thumbnail_url,
                      seats: myAssignments.map((a) => ({
                        row: a.row_label,
                        num: a.seat_num,
                        seatLabel: `${a.row_label}${a.seat_num}`,
                      })),
                    });
                  }}
                >
                  ↔ Move all {myAssignments.length} seats together
                </button>
              )}
            </div>
          )}

          {/* Assign seats — hand the sponsor's already-placed, not-yet-
              given seats to THIS guest. Same picker the Invite flow uses,
              now available when editing an existing guest. Grouped by
              showtime to mirror the Invite modal's layout. */}
          {!selfView && Array.isArray(assignableSeats) && assignableSeats.length > 0 && (
            <div className="p2-deleg-section">
              <div className="p2-deleg-section-title">Assign seats</div>
              <div className="p2-ticket-meta" style={{ marginBottom: 10 }}>
                Tap the seats you've already placed to hand to {name || 'this guest'}.
              </div>
              {Object.entries(
                assignableSeats.reduce((acc, s) => {
                  const k = `${s.showing}:${s.movie}`;
                  (acc[k] = acc[k] || { label: `${s.movie} · ${s.showingLabel || ''}`.trim(), seats: [] }).seats.push(s);
                  return acc;
                }, {})
              ).map(([k, grp]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <div className="p2-ticket-meta" style={{ marginBottom: 6, fontWeight: 600 }}>
                    {grp.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {grp.seats.map((s) => {
                      const on = pickedSeats.has(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          className={`p2-seat-chip${on ? ' selected' : ''}`}
                          aria-pressed={on}
                          style={{
                            cursor: 'pointer',
                            border: on ? '1.5px solid var(--p2-gold)' : '1px solid var(--p2-rule)',
                            background: on ? 'rgba(255,194,77,0.14)' : 'transparent',
                            color: on ? 'var(--p2-gold)' : 'var(--p2-subtle)',
                          }}
                          onClick={() =>
                            setPickedSeats((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.key)) next.delete(s.key);
                              else next.add(s.key);
                              return next;
                            })
                          }
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="p2-btn primary sm"
                style={{ marginTop: 4, width: '100%' }}
                onClick={assignSeats}
                disabled={pickedSeats.size === 0 || pending === 'assign'}
              >
                {pending === 'assign'
                  ? 'Assigning…'
                  : pickedSeats.size > 0
                  ? `Assign ${pickedSeats.size} seat${pickedSeats.size === 1 ? '' : 's'} to ${name || 'guest'}`
                  : 'Tap seats above to assign'}
              </button>
            </div>
          )}

          <div className="p2-deleg-section">
            <div className="p2-deleg-section-title">
              {selfView ? 'How can we reach you?' : 'Edit details'}
            </div>
            <div className="p2-deleg-field">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Their full name"
              />
            </div>
            <div className="p2-deleg-field">
              <label>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(801) 555-0100"
              />
            </div>
            <div className="p2-deleg-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="they@example.com"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                className="p2-btn primary sm"
                onClick={save}
                disabled={!isDirty || pending === 'save'}
              >
                {pending === 'save' ? 'Saving…' : isDirty ? 'Save changes' : 'No changes'}
              </button>
              {savedAt && Date.now() - savedAt < 4000 && (
                <span style={{ fontSize: 12, color: 'var(--p2-gold)' }}>Saved ✓</span>
              )}
            </div>
          </div>

          {!selfView && (
            <div className="p2-deleg-section">
              <div className="p2-deleg-section-title">Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myAssignments.length > 0 && (
                  <button
                    type="button"
                    className="p2-btn ghost"
                    onClick={pushTickets}
                    disabled={pending === 'push'}
                  >
                    {pending === 'push'
                      ? 'Sending…'
                      : pushedAt && Date.now() - pushedAt < 4000
                      ? '✓ Tickets pushed'
                      : '🎟️ Push tickets to guest'}
                  </button>
                )}
                <button
                  type="button"
                  className="p2-btn ghost"
                  onClick={resend}
                  disabled={pending === 'resend'}
                >
                  {pending === 'resend' ? 'Sending…' : '🔗 Resend invite (with current details)'}
                </button>
                <button type="button" className="p2-btn ghost" onClick={copyLink}>
                  {copied ? '✓ Link copied' : '📋 Copy their portal link'}
                </button>
                <button
                  type="button"
                  className={`p2-btn ${confirmReclaim ? 'danger' : 'ghost-danger'}`}
                  onClick={reclaim}
                  disabled={pending === 'reclaim'}
                >
                  {pending === 'reclaim'
                    ? 'Reclaiming…'
                    : confirmReclaim
                    ? '⚠️ Confirm: reclaim seats and revoke invite'
                    : '🗑️ Reclaim seats'}
                </button>
                {confirmReclaim && (
                  <button
                    type="button"
                    onClick={() => setConfirmReclaim(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--p2-subtle)',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '2px 0',
                      alignSelf: 'flex-start',
                      fontFamily: 'inherit',
                    }}
                  >
                    Nevermind, keep the invite
                  </button>
                )}
              </div>
            </div>
          )}

          {err && (
            <div className="p2-notice red" style={{ marginTop: 14 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button type="button" className="p2-btn ghost sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DelegationStatusInline({ status }) {
  const map = {
    invited:  { label: 'Invited',  color: 'var(--p2-gold)' },
    opened:   { label: 'Opened',   color: '#9ec5ff' },
    partial:  { label: 'Picking',  color: '#ffb86b' },
    meals:    { label: 'Meals',    color: '#ffb86b' },
    ready:    { label: 'Ready',    color: '#7fcfa0' },
    // legacy alias — if any old code still emits 'claimed', render as Ready.
    claimed:  { label: 'Ready',    color: '#7fcfa0' },
    declined: { label: 'Declined', color: 'var(--p2-red-soft)' },
    revoked:  { label: 'Revoked',  color: 'var(--p2-subtle)' },
    expired:  { label: 'Expired',  color: 'var(--p2-red-soft)' },
    unknown:  { label: 'Unknown',  color: 'var(--p2-subtle)' },
  };
  const m = map[status] || map.unknown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: m.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: m.color }} />
      {m.label}
    </span>
  );
}

// Compact one-line ticket summary inside the Manage Invite modal.
// Layout (responsive — meta row wraps on narrow phones):
//
//   ┌──┐  The Pursuit                              ✏️ 🍽️
//   │  │  Late Show · 8:45 PM
//   └──┘  Theater 3 · F12 · [🥖 Hot French Dip]
//
// When editing callbacks are wired (onSwap / onChangeMeal), small icon
// buttons appear on the right of the title row. The trailing buttons
// open SwapSeatModal / DinnerModal in on-behalf mode via PortalShell.
//
// Poster thumbnail uses thumbnail_url → poster_url → 2-letter movie
// initials chip. Falls back to "Aud {N}" labelling when the showtime
// lookup misses (stale data, admin reassignment).
function TicketLine({ assignment, showtime, onSwap, onChangeMeal }) {
  const movieTitle = showtime?.movie_title || `Theater ${assignment.theater_id}`;
  const showStart = showtime?.show_start || null;
  const showingNum = assignment.showing_number || showtime?.showing_number || 1;
  const showingLabel = showingNum === 1 ? 'Early Show' : 'Late Show';
  const seatLabel = `${assignment.row_label}${assignment.seat_num}`;
  const theaterLabel = showtime
    ? `Theater ${assignment.theater_id}`
    : `Aud ${assignment.theater_id}`;

  const dinnerId = assignment.dinner_choice;
  const dinnerLabel = dinnerLabelFor(dinnerId);
  const dinnerEmoji = dinnerEmojiFor(dinnerId);

  // Prefer the smaller thumbnail when available — it's already sized
  // for chip-scale rendering. Fall back to the full poster.
  const posterUrl = showtime?.thumbnail_url || showtime?.poster_url || null;
  const movieInitials = movieTitle
    .split(/\s+/)
    .filter((w) => w && w[0] && /[A-Za-z0-9]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

  const editable = !!(onSwap || onChangeMeal);

  return (
    <div className="p2-deleg-ticket">
      <div
        className={`p2-deleg-ticket-poster${posterUrl ? '' : ' empty'}`}
        style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}
        aria-hidden="true"
      >
        {!posterUrl && movieInitials}
      </div>
      <div className="p2-deleg-ticket-body">
        <div className="p2-deleg-ticket-titlerow">
          <div className="p2-deleg-ticket-title" title={movieTitle}>{movieTitle}</div>
          {editable && (
            <div className="p2-deleg-ticket-actions">
              {onSwap && (
                <button
                  type="button"
                  className="p2-deleg-ticket-action"
                  onClick={onSwap}
                  title="Swap this seat"
                  aria-label={`Swap seat ${seatLabel}`}
                >
                  ✏️
                </button>
              )}
              {onChangeMeal && (
                <button
                  type="button"
                  className="p2-deleg-ticket-action"
                  onClick={onChangeMeal}
                  title="Change meal"
                  aria-label={`Change meal for ${seatLabel}`}
                >
                  🍽️
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p2-deleg-ticket-showing">
          {showingLabel}
          {showStart ? ` · ${showStart}` : ''}
        </div>
        <div className="p2-deleg-ticket-meta">
          <span>{theaterLabel}</span>
          <span className="p2-deleg-ticket-meta-sep">·</span>
          <span className="p2-deleg-ticket-seat">{seatLabel}</span>
          <span className="p2-deleg-ticket-meta-sep">·</span>
          {dinnerLabel ? (
            <span className="p2-dinner-pill-static">
              <span aria-hidden="true">{dinnerEmoji}</span>
              <span>{dinnerLabel}</span>
            </span>
          ) : (
            <span className="p2-dinner-pill-static empty">
              <span aria-hidden="true">🍽️</span>
              <span>Meal not chosen</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
