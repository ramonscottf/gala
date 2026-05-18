// SettingsPage — contact info editor + check-in QR as a real page.
//
// Replaces ProfileModal for in-portal use 2026-05-18 per Scott's call:
// hamburger items navigate to real pages. URL changes, back button
// works, page-level scroll. ProfileModal.jsx remains on disk for any
// other surface that still wants the popup affordance.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../config.js';

function splitName(full) {
  if (!full) return ['', ''];
  const parts = full.split(/\s+/);
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

export function SettingsPage({ identity, token, onRefresh }) {
  const navigate = useNavigate();
  const [first, last] = splitName(identity?.contactName || '');
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(last);
  const [email, setEmail] = useState(identity?.email || '');
  const [phone, setPhone] = useState(identity?.phone || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);

  const goHome = () => navigate(`/${token}`);

  async function save() {
    setBusy(true);
    setErr(null);
    setSaved(false);
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
      setSaved(true);
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
    <section className="p2-section p2-page">
      <button type="button" className="p2-back-link" onClick={goHome}>
        ← Back to your portal
      </button>

      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Your profile</div>
          <h2>Contact <span className="p2-italic-flair">info</span></h2>
        </div>
      </div>

      <div className="p2-card stripped">
        <div className="p2-card-body">
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
          {saved && !err && (
            <div className="p2-notice" style={{ marginTop: 18 }}>
              <p>Saved.</p>
            </div>
          )}

          <div className="p2-settings-actions">
            <button
              type="button"
              className="p2-btn ghost sm"
              disabled={busy}
              onClick={signOut}
            >
              Sign out
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="p2-btn sm"
                disabled={busy}
                onClick={goHome}
              >
                Back
              </button>
              <button
                type="button"
                className="p2-btn primary sm"
                disabled={busy}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div className="p2-profile-qr">
            <div className="p2-eyebrow">Trouble at the door?</div>
            <p className="p2-profile-qr-hint">
              If anything goes sideways at check-in, show this QR. Your seats
              are tied to your contact info above — this is a backup.
            </p>
            <img
              src={`${config.apiBase}/api/gala/qr?t=${encodeURIComponent(token || '')}&size=180`}
              alt="Check-in QR code"
              width={180}
              height={180}
              className="p2-profile-qr-img"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
