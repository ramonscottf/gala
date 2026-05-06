// SettingsSheet — opened from the AppBar avatar tap. Three sections:
//   - Profile  → POST /api/gala/portal/{token}/profile (new endpoint)
//   - Help     → tel:/mailto: links to Sherry + the gala inbox
//   - Sign out → returns to https://daviskids.org/gala
//
// Single light theme — iOS-native styling.

import { useState } from 'react';
import { TOKENS, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: TOKENS.text.secondary,
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
        padding: '12px 14px',
        borderRadius: TOKENS.radius.md,
        border: 'none',
        background: TOKENS.fill.tertiary,
        color: TOKENS.text.primary,
        fontSize: 17,
        fontFamily: FONT_UI,
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
      <SectionHeader>Profile</SectionHeader>

      <div style={{ display: 'flex', gap: 8 }}>
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
            padding: 12,
            borderRadius: TOKENS.radius.md,
            background: 'rgba(255,59,48,0.10)',
            color: TOKENS.semantic.danger,
            fontSize: 13,
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

      <SectionHeader>Help</SectionHeader>
      <div style={groupedListStyle}>
        <SettingsRow
          href="tel:8015129370"
          icon="msg"
          title="Call Sherry Miggin"
          subtitle="(801) 512-9370 · DEF Foundation"
        />
        <Divider />
        <SettingsRow
          href="mailto:smiggin@dsdmail.net"
          icon="mail"
          title="Email Sherry directly"
          subtitle="smiggin@dsdmail.net"
        />
        <Divider />
        <SettingsRow
          href="mailto:gala@daviskids.org"
          icon="mail"
          title="Email the gala inbox"
          subtitle="gala@daviskids.org"
        />
      </div>

      <button
        onClick={() => {
          window.location.href = 'https://daviskids.org/gala';
        }}
        style={{
          marginTop: 24,
          width: '100%',
          padding: '14px',
          borderRadius: TOKENS.radius.md,
          border: 'none',
          background: TOKENS.surface.card,
          color: TOKENS.semantic.danger,
          fontWeight: 600,
          fontSize: 17,
          cursor: 'pointer',
          fontFamily: FONT_UI,
          boxShadow: TOKENS.shadow.card,
        }}
      >
        Sign out
      </button>
    </>
  );
}

const SectionHeader = ({ children }) => (
  <div
    style={{
      fontSize: 13,
      fontWeight: 400,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      color: TOKENS.text.secondary,
      marginTop: 20,
      marginBottom: 8,
      padding: '0 4px',
    }}
  >
    {children}
  </div>
);

const groupedListStyle = {
  background: TOKENS.surface.card,
  borderRadius: TOKENS.radius.lg,
  overflow: 'hidden',
  boxShadow: TOKENS.shadow.card,
};

const Divider = () => (
  <div style={{ height: 1, background: TOKENS.rule, marginLeft: 50 }} />
);

const SettingsRow = ({ href, icon, title, subtitle }) => (
  <a
    href={href}
    style={{
      padding: '12px 16px',
      background: TOKENS.surface.card,
      color: TOKENS.text.primary,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      textDecoration: 'none',
      fontSize: 17,
      fontWeight: 400,
    }}
  >
    <span style={{ color: TOKENS.semantic.info, display: 'flex' }}>
      <Icon name={icon} size={20} />
    </span>
    <div style={{ flex: 1 }}>
      <div>{title}</div>
      {subtitle && (
        <div
          style={{
            fontSize: 13,
            color: TOKENS.text.secondary,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
    <span style={{ color: TOKENS.text.tertiary, display: 'flex' }}>
      <Icon name="chev" size={14} />
    </span>
  </a>
);
