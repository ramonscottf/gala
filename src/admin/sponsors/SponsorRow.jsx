import React, { useState } from 'react';
import { TierBadge, StatusBadge, PipelinePills, Timeline } from './components.jsx';
import { SponsorAvatar } from './SponsorAvatar.jsx';
import { deriveStatus, pipelineState } from './status.js';

function fmtCurrency(n) {
  if (!n) return '';
  return '$' + Number(n).toLocaleString('en-US');
}

export function SponsorRow({ sponsor, isOpen, onToggle, onAction, onSave }) {
  const status = deriveStatus(sponsor);
  const pipeline = pipelineState(sponsor);

  const seatsAssigned = sponsor.seats_assigned || 0;
  const seatsTotal = sponsor.seats_purchased || 0;
  const portalUrl = sponsor.rsvp_token
    ? `https://gala.daviskids.org/sponsor/${sponsor.rsvp_token}`
    : '';

  const contactName = [sponsor.first_name, sponsor.last_name].filter(Boolean).join(' ');
  const hasInvited = !!(sponsor.tracking_summary?.sent_at || sponsor.rsvp_status === 'invited' || sponsor.rsvp_status === 'completed');
  const isStalled = status.code === 'stalled';
  const isComplete = status.code === 'complete';

  return (
    <div className={`gs-row ${isOpen ? 'is-open' : ''}`}>
      <div className="gs-row-head" onClick={onToggle}>
        <SponsorAvatar sponsor={sponsor} />
        <div className="gs-row-main">
          <div className="gs-row-titleline">
            <span className="gs-row-name">{sponsor.company || contactName || '(no company)'}</span>
            <TierBadge tier={sponsor.sponsorship_tier} />
            <StatusBadge status={status} />
          </div>
          <div className="gs-row-meta">
            {sponsor.amount_paid ? <><strong>{fmtCurrency(sponsor.amount_paid)}</strong> · </> : null}
            {seatsTotal ? <>{seatsAssigned}/{seatsTotal} seats · </> : null}
            {contactName && <>{contactName}{sponsor.email ? ' · ' : ''}</>}
            {sponsor.email}
          </div>
          {!isOpen && hasInvited && !isComplete && <PipelinePills state={pipeline} />}
        </div>

        <div className="gs-row-actions" onClick={e => e.stopPropagation()}>
          {!hasInvited && (
            <>
              <button
                className="gs-btn gs-btn-text"
                disabled={!sponsor.phone}
                title={sponsor.phone ? '' : 'No phone on file'}
                onClick={() => onAction(sponsor.id, 'compose-sms')}
              >
                📱 Text
              </button>
              <button
                className="gs-btn gs-btn-email"
                disabled={!sponsor.email}
                title={sponsor.email ? '' : 'No email on file'}
                onClick={() => onAction(sponsor.id, 'compose-email')}
              >
                📧 Email
              </button>
            </>
          )}
          {hasInvited && !isComplete && !isStalled && (
            <>
              <button className="gs-btn" onClick={() => onAction(sponsor.id, 'copy-link')}>
                📋 Copy link
              </button>
              <button className="gs-btn" onClick={() => onAction(sponsor.id, 'resend')}>
                ↻ Resend
              </button>
            </>
          )}
          {isStalled && (
            <>
              <button
                className="gs-btn gs-btn-text"
                disabled={!sponsor.phone}
                onClick={() => onAction(sponsor.id, 'compose-sms')}
              >
                📱 Nudge
              </button>
              <button
                className="gs-btn gs-btn-email"
                disabled={!sponsor.email}
                onClick={() => onAction(sponsor.id, 'compose-email')}
              >
                📧 Nudge
              </button>
            </>
          )}
          {isComplete && (
            <>
              {portalUrl && (
                <a
                  className="gs-btn"
                  href={portalUrl}
                  target="_blank"
                  rel="noopener"
                  onClick={e => e.stopPropagation()}
                >
                  👁 Preview
                </a>
              )}
              <button className="gs-btn" onClick={() => onAction(sponsor.id, 'copy-link')}>
                📋 Copy link
              </button>
            </>
          )}
        </div>

        <span className="gs-chev">▼</span>
      </div>

      {isOpen && (
        <div className="gs-exp">
          <div className="gs-exp-grid">
            <div>
              <div className="gs-section-h">Touchpoint timeline</div>
              <Timeline sponsor={sponsor} />
            </div>
            <EditPanel sponsor={sponsor} onSave={onSave} portalUrl={portalUrl} />
          </div>
          <div className="gs-exp-footer">
            <button
              className="gs-btn gs-btn-text"
              disabled={!sponsor.phone}
              onClick={() => onAction(sponsor.id, 'compose-sms')}
            >
              📱 Compose text
            </button>
            <button
              className="gs-btn gs-btn-email"
              disabled={!sponsor.email}
              onClick={() => onAction(sponsor.id, 'compose-email')}
            >
              📧 Compose email
            </button>
            {portalUrl && (
              <a
                className="gs-btn"
                href={portalUrl}
                target="_blank"
                rel="noopener"
              >
                👁 Preview portal
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditPanel({ sponsor, onSave, portalUrl }) {
  const [draft, setDraft] = useState({
    company: sponsor.company || '',
    first_name: sponsor.first_name || '',
    last_name: sponsor.last_name || '',
    email: sponsor.email || '',
    phone: sponsor.phone || '',
    sponsorship_tier: sponsor.sponsorship_tier || '',
    payment_status: sponsor.payment_status || '',
    seats_purchased: sponsor.seats_purchased ?? '',
    amount_paid: sponsor.amount_paid ?? '',
    logo_url: sponsor.logo_url || '',
    website_url: sponsor.website_url || '',
    notes: sponsor.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sponsor.id, draft);
    } finally {
      setSaving(false);
    }
  };

  // Compare against current sponsor values, treating null/undefined as ''.
  const cmp = (k) => {
    const cur = sponsor[k];
    const draftVal = draft[k];
    if (cur === null || cur === undefined) return draftVal === '' || draftVal === null;
    return String(draftVal) === String(cur);
  };
  const dirty = Object.keys(draft).some(k => !cmp(k));

  return (
    <div>
      <div className="gs-section-h">Edit details</div>
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 10,
        fontSize: 12,
        color: '#166534',
        lineHeight: 1.4,
      }}>
        Saved to the gala database. As of May 2026, this dashboard is the canonical source — Sherry's spreadsheet is no longer kept in sync. Use <strong>Download Excel</strong> on the Sponsors tab when you need a snapshot for board reports.
      </div>
      <div className="gs-form-grid">
        <div className="gs-field gs-field--wide">
          <label className="gs-label">Company</label>
          <input className="gs-input" value={draft.company} onChange={e => update('company', e.target.value)} />
        </div>
        <div className="gs-field">
          <label className="gs-label">First name</label>
          <input className="gs-input" value={draft.first_name} onChange={e => update('first_name', e.target.value)} />
        </div>
        <div className="gs-field">
          <label className="gs-label">Last name</label>
          <input className="gs-input" value={draft.last_name} onChange={e => update('last_name', e.target.value)} />
        </div>
        <div className="gs-field">
          <label className="gs-label">Email</label>
          <input className="gs-input" type="email" value={draft.email} onChange={e => update('email', e.target.value)} />
        </div>
        <div className="gs-field">
          <label className="gs-label">Phone</label>
          <input className="gs-input" type="tel" value={draft.phone} onChange={e => update('phone', e.target.value)} />
        </div>
        <div className="gs-field">
          <label className="gs-label">Seats</label>
          <input
            className="gs-input"
            type="number"
            min="0"
            step="1"
            value={draft.seats_purchased}
            onChange={e => update('seats_purchased', e.target.value)}
          />
        </div>
        <div className="gs-field">
          <label className="gs-label">Amount ($)</label>
          <input
            className="gs-input"
            type="number"
            min="0"
            step="50"
            value={draft.amount_paid}
            onChange={e => update('amount_paid', e.target.value)}
          />
        </div>
        <div className="gs-field">
          <label className="gs-label">Tier</label>
          <select className="gs-select" value={draft.sponsorship_tier} onChange={e => update('sponsorship_tier', e.target.value)}>
            {['', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Cell Phone', 'Friends and Family', 'Split Friends & Family', 'Individual Seats', 'Donation', 'Silent Auction', 'Trade'].map(t => (
              <option key={t} value={t}>{t || '(none)'}</option>
            ))}
          </select>
        </div>
        <div className="gs-field">
          <label className="gs-label">Payment</label>
          <select className="gs-select" value={draft.payment_status} onChange={e => update('payment_status', e.target.value)}>
            {['', 'paid', 'invoiced', 'pending', 'grant', 'trade'].map(p => (
              <option key={p} value={p}>{p || '(none)'}</option>
            ))}
          </select>
        </div>
        <div className="gs-field gs-field--wide">
          <label className="gs-label">Logo URL</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 6, overflow: 'hidden',
              background: '#0a1733', flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border, #e2e8f0)',
            }}>
              {draft.logo_url ? (
                <img
                  src={draft.logo_url}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={e => { e.target.style.display = 'none'; }}
                  onLoad={e => { e.target.style.display = ''; }}
                />
              ) : (
                <span style={{ color: '#64748b', fontSize: 11 }}>?</span>
              )}
            </div>
            <input
              className="gs-input"
              type="url"
              placeholder="https://example.com/logo.png"
              value={draft.logo_url}
              onChange={e => update('logo_url', e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <div className="gs-field gs-field--wide">
          <label className="gs-label">Website</label>
          <input
            className="gs-input"
            type="url"
            placeholder="https://example.com"
            value={draft.website_url}
            onChange={e => update('website_url', e.target.value)}
          />
        </div>
        <div className="gs-field gs-field--wide">
          <label className="gs-label">Notes</label>
          <textarea className="gs-textarea" rows={2} value={draft.notes} onChange={e => update('notes', e.target.value)} />
        </div>
      </div>
      {portalUrl && (
        <>
          <div className="gs-section-h" style={{ marginTop: 14 }}>Seat-selector link</div>
          <div className="gs-portal-link">
            <input readOnly value={portalUrl} />
            <button
              className="gs-btn"
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
              }}
            >
              Copy
            </button>
          </div>
        </>
      )}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          className="gs-btn"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : (dirty ? 'Save changes' : 'No changes')}
        </button>
      </div>
    </div>
  );
}
