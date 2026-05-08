import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SponsorRow } from './SponsorRow.jsx';
import { Composer } from './Composer.jsx';
import { KpiStrip } from './components.jsx';
import { deriveStatus, statusOrder, lastActivityAt } from './status.js';
import { loadSponsorsWithTracking, updateSponsor, sendMessage, resendInvite } from './api.js';

export function SponsorsView() {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('status'); // 'status' | 'company' | 'contact' | 'activity' | 'amount'
  const [composer, setComposer] = useState(null); // { sponsor, channel }
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await loadSponsorsWithTracking();
      setSponsors(data);
    } catch (e) {
      setError(e.message || 'Failed to load sponsors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Counts for KPI strip — derived once.
  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, invited: 0, opened: 0, complete: 0, stalled: 0 };
    for (const s of sponsors) {
      c.all++;
      const code = deriveStatus(s).code;
      if (code === 'pending') c.pending++;
      if (code === 'invited') c.invited++;
      if (code === 'opened' || code === 'clicked' || code === 'picking') c.opened++;
      if (code === 'complete') c.complete++;
      if (code === 'stalled' || code === 'bounced') c.stalled++;
    }
    return c;
  }, [sponsors]);

  // Apply filters + sort.
  const visible = useMemo(() => {
    let list = sponsors;
    if (tierFilter !== 'all') {
      list = list.filter(s => (s.sponsorship_tier || '').toLowerCase() === tierFilter.toLowerCase());
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => {
        const code = deriveStatus(s).code;
        if (statusFilter === 'opened') return ['opened', 'clicked', 'picking'].includes(code);
        if (statusFilter === 'stalled') return code === 'stalled' || code === 'bounced';
        return code === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        (s.company || '').toLowerCase().includes(q) ||
        (s.first_name || '').toLowerCase().includes(q) ||
        (s.last_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      );
    }
    const tsOf = (s) => {
      const v = lastActivityAt(s);
      if (!v) return 0;
      return new Date(v + (v.includes('Z') ? '' : 'Z')).getTime() || 0;
    };
    const contactName = (s) => [s.last_name, s.first_name].filter(Boolean).join(' ').toLowerCase();
    const company = (s) => (s.company || '').toLowerCase();

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'company':
          return company(a).localeCompare(company(b));
        case 'contact':
          return contactName(a).localeCompare(contactName(b)) || company(a).localeCompare(company(b));
        case 'activity':
          return tsOf(b) - tsOf(a) || company(a).localeCompare(company(b));
        case 'amount':
          return (Number(b.amount_paid) || 0) - (Number(a.amount_paid) || 0) || company(a).localeCompare(company(b));
        case 'status':
        default: {
          const oa = statusOrder(a);
          const ob = statusOrder(b);
          if (oa !== ob) return oa - ob;
          const ta = tsOf(a), tb = tsOf(b);
          if (tb !== ta) return tb - ta;
          return company(a).localeCompare(company(b));
        }
      }
    });
  }, [sponsors, tierFilter, statusFilter, search, sortBy]);

  const handleAction = async (sponsorId, action) => {
    const sponsor = sponsors.find(s => s.id === sponsorId);
    if (!sponsor) return;

    if (action === 'compose-sms')   return setComposer({ sponsor, channel: 'sms' });
    if (action === 'compose-email') return setComposer({ sponsor, channel: 'email' });

    if (action === 'copy-link') {
      const url = `https://gala.daviskids.org/sponsor/${sponsor.rsvp_token}`;
      try {
        await navigator.clipboard.writeText(url);
        setToast({ kind: 'success', text: 'Portal link copied' });
      } catch {
        setToast({ kind: 'error', text: 'Could not copy' });
      }
      return;
    }

    if (action === 'resend') {
      if (!confirm(`Resend the invite email to ${sponsor.company}?`)) return;
      try {
        await resendInvite(sponsorId);
        setToast({ kind: 'success', text: 'Invite re-sent' });
        setTimeout(refresh, 800);
      } catch (e) {
        setToast({ kind: 'error', text: 'Resend failed: ' + e.message });
      }
    }
  };

  const handleSave = async (sponsorId, patch) => {
    try {
      await updateSponsor(sponsorId, patch);
      setToast({ kind: 'success', text: 'Sponsor saved' });
      refresh();
    } catch (e) {
      setToast({ kind: 'error', text: 'Save failed: ' + e.message });
    }
  };

  const handleSend = async (channel, body, subject) => {
    if (!composer) return;
    try {
      await sendMessage(composer.sponsor.id, channel, body, subject);
      setToast({ kind: 'success', text: `${channel === 'email' ? 'Email' : 'Text'} sent` });
      setComposer(null);
      setTimeout(refresh, 800);
    } catch (e) {
      setToast({ kind: 'error', text: 'Send failed: ' + e.message });
    }
  };

  if (loading) {
    return (
      <div className="gs-root event-gala">
        <div className="gs-list">
          <div className="gs-shimmer" />
          <div className="gs-shimmer" />
          <div className="gs-shimmer" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gs-root event-gala">
        <div className="gs-empty" style={{ color: 'var(--def-danger)' }}>
          Failed to load sponsors: {error}
          <div style={{ marginTop: 12 }}>
            <button className="gs-btn" onClick={refresh}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gs-root event-gala">
      <KpiStrip counts={counts} activeFilter={statusFilter} onFilter={setStatusFilter} />

      {/* Search row — full width, prominent */}
      <div className="gs-searchbar">
        <span className="gs-searchbar-icon" aria-hidden>🔍</span>
        <input
          className="gs-searchbar-input"
          placeholder="Search by company, contact name, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            className="gs-searchbar-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
        <div className="gs-searchbar-count">
          {visible.length} of {sponsors.length}
        </div>
      </div>

      {/* Filter + sort row */}
      <div className="gs-filterbar">
        <div className="gs-filterbar-pills">
          {[
            'all',
            'Platinum',
            'Gold',
            'Silver',
            'Bronze',
            'Friends and Family',
            'Individual Seats',
            'Cell Phone',
            'Donation',
            'Silent Auction',
            'Trade',
            'Split Friends & Family',
          ].map(t => (
            <button
              key={t}
              className={`gs-pill ${tierFilter === t ? 'is-active' : ''}`}
              onClick={() => setTierFilter(t)}
            >
              {t === 'all' ? 'All tiers' : t === 'Friends and Family' ? 'Friends & Family' : t}
            </button>
          ))}
        </div>
        <div className="gs-sort">
          <label className="gs-sort-label">Sort:</label>
          <select
            className="gs-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="status">Status (stalled first)</option>
            <option value="company">Company A→Z</option>
            <option value="contact">Contact name A→Z</option>
            <option value="activity">Most recent activity</option>
            <option value="amount">Amount (highest first)</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="gs-empty">No sponsors match these filters.</div>
      ) : (
        <div className="gs-list">
          {visible.map(s => (
            <SponsorRow
              key={s.id}
              sponsor={s}
              isOpen={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              onAction={handleAction}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {composer && (
        <Composer
          sponsor={composer.sponsor}
          channel={composer.channel}
          onClose={() => setComposer(null)}
          onSend={handleSend}
        />
      )}

      {toast && (
        <div className={`gs-toast is-${toast.kind}`}>{toast.text}</div>
      )}
    </div>
  );
}
