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

function delegationStatus(d) {
  if (!d) return 'unknown';
  const raw = (d.status || '').toLowerCase();
  if (raw === 'claimed' || raw === 'accepted' || d.claimedAt || d.confirmedAt) return 'claimed';
  if (raw === 'declined' || raw === 'revoked') return raw;
  if (raw === 'expired') return 'expired';
  return 'invited';
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
                  {delegation?.confirmedAt
                    ? 'Confirmed by guest'
                    : delegation?.accessedAt
                    ? 'Has opened the link'
                    : 'Invite sent, not yet opened'}
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
                {isSplit && <SplitBlockPill />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myAssignments.map((a, i) => (
                  <TicketLine
                    key={`${a.theater_id}:${a.showing_number}:${a.row_label}:${a.seat_num}:${i}`}
                    assignment={a}
                    showtime={showtimeLookup.get(`${a.theater_id}:${a.showing_number}`)}
                    index={i}
                    total={myAssignments.length}
                  />
                ))}
              </div>
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
    claimed: { label: 'Claimed', color: '#7fcfa0' },
    invited: { label: 'Invited', color: 'var(--p2-gold)' },
    declined: { label: 'Declined', color: 'var(--p2-red-soft)' },
    revoked: { label: 'Revoked', color: 'var(--p2-subtle)' },
    expired: { label: 'Expired', color: 'var(--p2-red-soft)' },
    unknown: { label: 'Unknown', color: 'var(--p2-subtle)' },
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
// Layout (single row, wraps gracefully on narrow phones):
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ The Pursuit · Late Show 8:45 PM                              │
//   │ Theater 3 · F12 · 🥖 Hot French Dip                          │
//   └──────────────────────────────────────────────────────────────┘
//
// Falls back gracefully when the showtime lookup misses (stale data,
// admin reassignment): shows the raw theater id + row/seat.
function TicketLine({ assignment, showtime }) {
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

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--p2-text, #fff)' }}>
        {movieTitle}
        <span style={{ color: 'var(--p2-subtle)', fontWeight: 500 }}>
          {' · '}
          {showingLabel}
          {showStart ? ` ${showStart}` : ''}
        </span>
      </div>
      <div
        style={{
          color: 'var(--p2-subtle)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span>{theaterLabel}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '0.04em' }}>
          {seatLabel}
        </span>
        {dinnerLabel ? (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {dinnerEmoji} {dinnerLabel}
            </span>
          </>
        ) : (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ color: 'var(--p2-gold)' }}>Meal not chosen</span>
          </>
        )}
      </div>
    </div>
  );
}

function SplitBlockPill() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: 'rgba(244, 185, 66, 0.12)',
        border: '1px solid rgba(244, 185, 66, 0.4)',
        color: 'var(--p2-gold)',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      Split block
    </span>
  );
}
