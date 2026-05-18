// DelegationManageModal — v2-native manage surface for a delegation.
//
// Replaces the previous "wrap legacy DelegateManage" approach. The
// legacy component handled actions cleanly but didn't support inline
// editing of the delegate's name/phone/email, which is the gap Scott
// flagged. We build it fresh here in v2 chrome with two sections:
//
//   1. Edit details — three editable fields (name, phone, email)
//      with a Save button. Calls /api/gala/portal/{token}/delegate
//      action=update.
//
//   2. Actions — resend invite / copy link / reclaim seats. Same
//      semantics as the legacy component, smaller chrome.
//
// Header is the avatar + name + status pill (read-only). Footer is
// just Done — primary actions live inside the body.
//
// selfView=true hides sponsor-only actions (resend/reclaim) when the
// delegate is editing their own row.

import { useEffect, useState } from 'react';
import { config } from '../config.js';

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
