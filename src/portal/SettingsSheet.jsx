// SettingsSheet — opened from the AppBar avatar tap. Three sections:
//   - Profile  → POST /api/gala/portal/{token}/profile (new endpoint)
//   - Help     → tel:/mailto: links to Sherry + the gala inbox
//   - Sign out → returns to https://daviskids.org/gala
//
// Editorial theme is single-light; no theme picker.

import { useState } from 'react';
import { TOKENS } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: 'var(--text-italic)',
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '14px',
        borderRadius: 12,
        border: `1px solid var(--rule)`,
        background: 'var(--fill-cream)',
        color: '#fff',
        fontSize: 15,
        fontFamily: TOKENS.font.ui,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  </label>
);

export default function SettingsSheet({ identity, isDelegation, token, apiBase, onClose, onSaved }) {
  // Sponsors store first/last separately; delegations store a single
  // delegate_name. We always render two fields and concat server-side
  // for the delegation case (handled by the /profile endpoint).
  const initialFirst = isDelegation
    ? (identity?.delegateName || '').split(' ')[0] || ''
    : identity?.contactName?.split(' ')[0] || '';
  const initialLast = isDelegation
    ? (identity?.delegateName || '').split(' ').slice(1).join(' ')
    : identity?.contactName?.split(' ').slice(1).join(' ') || '';

  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [email, setEmail] = useState(identity?.email || '');
  const [phone, setPhone] = useState(identity?.phone || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const valid = (first.trim() || last.trim()) && (email.trim() || phone.trim());

  const save = async () => {
    if (!valid) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: first.trim(),
          last_name: last.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaved(true);
      if (onSaved) await onSaved();
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div
        style={{
          marginBottom: 18,
          paddingBottom: 12,
          borderBottom: `1px solid var(--rule)`,
        }}
      >
        <SectionEyebrow color={TOKENS.brand.red}>Profile</SectionEyebrow>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="FIRST NAME" value={first} onChange={setFirst} placeholder="First" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="LAST NAME" value={last} onChange={setLast} placeholder="Last" />
        </div>
      </div>
      <Field
        label="EMAIL"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        type="email"
      />
      <Field label="PHONE" value={phone} onChange={setPhone} placeholder="(801) 555-0100" type="tel" />

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error.message}
        </div>
      )}

      <Btn
        kind="primary"
        size="md"
        full
        onClick={save}
        disabled={!valid || pending}
        icon={<Icon name={saved ? 'check' : 'arrowR'} size={14} />}
      >
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
      </Btn>

      <div
        style={{
          marginTop: 28,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: `1px solid var(--rule)`,
        }}
      >
        <SectionEyebrow color={TOKENS.brand.red}>Help</SectionEyebrow>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <a
          href="tel:8015129370"
          style={{
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--fill-cream)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon name="msg" size={16} />
          <div style={{ flex: 1 }}>
            <div>Call Sherry Miggin</div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              (801) 512-9370 · DEF Foundation
            </div>
          </div>
          <Icon name="chev" size={14} />
        </a>
        <a
          href="mailto:smiggin@dsdmail.net"
          style={{
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--fill-cream)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon name="mail" size={16} />
          <div style={{ flex: 1 }}>
            <div>Email Sherry directly</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>smiggin@dsdmail.net</div>
          </div>
          <Icon name="chev" size={14} />
        </a>
        <a
          href="mailto:gala@daviskids.org"
          style={{
            padding: '14px',
            borderRadius: 12,
            border: `1px solid var(--rule)`,
            background: 'var(--fill-cream)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon name="mail" size={16} />
          <div style={{ flex: 1 }}>
            <div>Email the gala inbox</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              gala@daviskids.org
            </div>
          </div>
          <Icon name="chev" size={14} />
        </a>
      </div>

      <button
        onClick={() => {
          window.location.href = 'https://daviskids.org/gala';
        }}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 99,
          border: `1.5px solid rgba(212,38,74,0.4)`,
          background: 'transparent',
          color: TOKENS.brand.red,
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: TOKENS.font.ui,
        }}
      >
        Sign out
      </button>
    </>
  );
}
