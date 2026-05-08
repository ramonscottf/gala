import React, { useState } from 'react';

const TIERS = [
  '', 'Platinum', 'Gold', 'Silver', 'Bronze',
  'Cell Phone', 'Friends and Family', 'Split Friends & Family',
  'Individual Seats', 'Donation', 'Silent Auction', 'Trade',
];

const PAYMENT_STATUSES = ['', 'paid', 'invoiced', 'pending', 'grant', 'trade'];

/**
 * AddSponsor — modal form for creating a new sponsor / ticket purchase.
 *
 * As of May 2026 the dashboard is the canonical source of sponsor data.
 * This is the primary write path for new entries.
 *
 * Uses the same .gs-modal / .gs-modal-bg styles as Composer for consistency.
 */
export function AddSponsor({ onClose, onCreate }) {
  const [draft, setDraft] = useState({
    company: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    sponsorship_tier: '',
    seats_purchased: '',
    amount_paid: '',
    payment_status: '',
    street_address: '',
    city: '',
    state: '',
    zip: '',
    logo_url: '',
    website_url: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!draft.company.trim()) {
      setError('Company name is required');
      return;
    }
    setSaving(true);
    try {
      await onCreate(draft);
    } catch (e) {
      setError(e.message || 'Could not create sponsor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gs-modal-bg" onClick={onClose}>
      <div
        className="gs-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="gs-modal-h">
          <div className="gs-modal-title">Add sponsor / ticket purchase</div>
          <button
            type="button"
            className="gs-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 14,
            fontSize: 12,
            color: '#166534',
            lineHeight: 1.4,
          }}>
            New sponsors are saved directly to the gala database. As of May 2026, this dashboard is the canonical source — no spreadsheet sync required.
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              padding: '8px 10px',
              marginBottom: 14,
              fontSize: 13,
              color: '#991b1b',
            }}>
              {error}
            </div>
          )}

          <div className="gs-form-grid">
            <div className="gs-field gs-field--wide">
              <label className="gs-label">Company / sponsor name *</label>
              <input
                className="gs-input"
                value={draft.company}
                onChange={e => update('company', e.target.value)}
                autoFocus
                placeholder="e.g. Acme Corporation"
              />
            </div>

            <div className="gs-field">
              <label className="gs-label">Contact first name</label>
              <input
                className="gs-input"
                value={draft.first_name}
                onChange={e => update('first_name', e.target.value)}
              />
            </div>
            <div className="gs-field">
              <label className="gs-label">Contact last name</label>
              <input
                className="gs-input"
                value={draft.last_name}
                onChange={e => update('last_name', e.target.value)}
              />
            </div>

            <div className="gs-field">
              <label className="gs-label">Email</label>
              <input
                className="gs-input"
                type="email"
                value={draft.email}
                onChange={e => update('email', e.target.value)}
              />
            </div>
            <div className="gs-field">
              <label className="gs-label">Phone</label>
              <input
                className="gs-input"
                type="tel"
                value={draft.phone}
                onChange={e => update('phone', e.target.value)}
              />
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
              <select
                className="gs-select"
                value={draft.sponsorship_tier}
                onChange={e => update('sponsorship_tier', e.target.value)}
              >
                {TIERS.map(t => <option key={t} value={t}>{t || '(none)'}</option>)}
              </select>
            </div>
            <div className="gs-field">
              <label className="gs-label">Payment status</label>
              <select
                className="gs-select"
                value={draft.payment_status}
                onChange={e => update('payment_status', e.target.value)}
              >
                {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{p || '(none)'}</option>)}
              </select>
            </div>

            <div className="gs-field gs-field--wide">
              <label className="gs-label">Street address</label>
              <input
                className="gs-input"
                value={draft.street_address}
                onChange={e => update('street_address', e.target.value)}
              />
            </div>

            <div className="gs-field">
              <label className="gs-label">City</label>
              <input
                className="gs-input"
                value={draft.city}
                onChange={e => update('city', e.target.value)}
              />
            </div>
            <div className="gs-field">
              <label className="gs-label">State</label>
              <input
                className="gs-input"
                value={draft.state}
                onChange={e => update('state', e.target.value)}
                maxLength={2}
                placeholder="UT"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="gs-field">
              <label className="gs-label">Zip</label>
              <input
                className="gs-input"
                value={draft.zip}
                onChange={e => update('zip', e.target.value)}
              />
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
              <textarea
                className="gs-textarea"
                rows={2}
                value={draft.notes}
                onChange={e => update('notes', e.target.value)}
              />
            </div>
          </div>

          <div style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            <button
              type="button"
              className="gs-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gs-btn gs-btn-primary"
              onClick={handleSave}
              disabled={saving || !draft.company.trim()}
            >
              {saving ? 'Adding…' : 'Add sponsor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
