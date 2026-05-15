// ProfileModal — clean contact info editor.
// POST /api/gala/portal/{token}/profile

import { useState } from 'react';
import { config } from '../config.js';

function splitName(full) {
  if (!full) return ['', ''];
  const parts = full.split(/\s+/);
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

export function ProfileModal({ identity, token, onClose, onRefresh }) {
  const [first, last] = splitName(identity?.contactName || '');
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(last);
  const [email, setEmail] = useState(identity?.email || '');
  const [phone, setPhone] = useState(identity?.phone || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [signedOut, setSignedOut] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
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

  async function signOut() {
    setBusy(true);
    setErr(null);
    try {
      await fetch(`${config.apiBase}/api/auth/signout`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setSignedOut(true);
      // After a sign-out, send the user back to the public sign-in page.
      window.location.href = '/';
    }
  }

  const labelStyle = {
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--p2-gold)',
    fontWeight: 800,
    display: 'block',
    marginBottom: 8,
  };
  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--p2-rule)',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

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
          <div>
            <div className="p2-modal-eyebrow">Your profile</div>
            <div className="p2-modal-title">
              Contact <span style={{ fontStyle: 'italic', color: 'var(--p2-gold)' }}>info</span>
            </div>
          </div>
          <button
            className="p2-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          {identity?.company && (
            <div style={{ marginBottom: 18, color: 'var(--p2-muted)', fontSize: 14 }}>
              Sponsoring as <strong style={{ color: '#fff' }}>{identity.company}</strong>
              {identity.tier ? <> · {identity.tier}</> : null}
            </div>
          )}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={labelStyle}>First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label style={labelStyle}>Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          {err && (
            <div className="p2-notice red" style={{ marginTop: 18 }}>
              <p>{err}</p>
            </div>
          )}
        </div>

        <div className="p2-modal-footer">
          <button type="button" className="p2-btn ghost sm" disabled={busy} onClick={signOut}>
            Sign out
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="p2-btn sm" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="p2-btn primary sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
