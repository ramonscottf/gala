// SettingsSheet — opened from the floating avatar tap. Three sections:
//   - Profile  → POST /api/gala/portal/{token}/profile (new endpoint)
//   - Help     → tel:/mailto: links to Sherry + the gala inbox
//   - Sign out → returns to https://daviskids.org/gala

import { useState } from 'react';
import { TOKENS, FONT_UI, FONT_MONO } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label style={{ display: 'block', marginBottom: 12 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        color: TOKENS.text.tertiary,
        marginBottom: 6,
        textTransform: 'uppercase',
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
        padding: '8px 12px',
        borderRadius: TOKENS.radius.md,
        border: `1px solid ${TOKENS.ruleStrong}`,
        background: TOKENS.surface.card,
        color: TOKENS.text.primary,
        fontSize: 14,
        fontFamily: FONT_UI,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  </label>
);

const HelpRow = ({ icon, title, sub, href }) => (
  <a
    href={href}
    style={{
      padding: '12px 14px',
      borderRadius: TOKENS.radius.md,
      border: `1px solid ${TOKENS.rule}`,
      background: TOKENS.surface.card,
      color: TOKENS.text.primary,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 500,
    }}
  >
    <span style={{ color: TOKENS.text.secondary, display: 'inline-flex' }}>
      <Icon name={icon} size={16} stroke={1.6} />
    </span>
    <div style={{ flex: 1 }}>
      <div>{title}</div>
      <div
        style={{
          fontSize: 12,
          color: TOKENS.text.secondary,
          marginTop: 2,
          fontFamily: FONT_MONO,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sub}
      </div>
    </div>
    <span style={{ color: TOKENS.text.tertiary }}>
      <Icon name="chev" size={14} />
    </span>
  </a>
);

export default function SettingsSheet({ identity, isDelegation, token, apiBase, onClose, onSaved }) {
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
      <div style={{ marginBottom: 12 }}>
        <SectionEyebrow>Profile</SectionEyebrow>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <Field label="First name" value={first} onChange={setFirst} placeholder="First" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Last name" value={last} onChange={setLast} placeholder="Last" />
        </div>
      </div>
      <Field
        label="Email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        type="email"
      />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="(801) 555-0100" type="tel" />

      {error && (
        <div
          style={{
            padding: 10,
            borderRadius: TOKENS.radius.md,
            background: TOKENS.surface.card,
            border: `1px solid ${TOKENS.brand.red}`,
            color: TOKENS.brand.red,
            fontSize: 12,
            marginBottom: 12,
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

      <div style={{ marginTop: 32, marginBottom: 12 }}>
        <SectionEyebrow>Help</SectionEyebrow>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <HelpRow
          icon="msg"
          title="Call Sherry Miggin"
          sub="(801) 512-9370 · DEF Foundation"
          href="tel:8015129370"
        />
        <HelpRow
          icon="mail"
          title="Email Sherry directly"
          sub="smiggin@dsdmail.net"
          href="mailto:smiggin@dsdmail.net"
        />
        <HelpRow
          icon="mail"
          title="Email the gala inbox"
          sub="gala@daviskids.org"
          href="mailto:gala@daviskids.org"
        />
      </div>

      <button
        onClick={() => {
          window.location.href = 'https://daviskids.org/gala';
        }}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: TOKENS.radius.md,
          border: `1px solid ${TOKENS.ruleStrong}`,
          background: TOKENS.surface.card,
          color: TOKENS.brand.red,
          fontWeight: 500,
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: FONT_UI,
        }}
      >
        Sign out
      </button>
    </>
  );
}
