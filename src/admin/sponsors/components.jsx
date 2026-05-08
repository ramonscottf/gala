import React from 'react';

// ── Tier badge ──────────────────────────────────────────────────────────
const TIER_CLASS = {
  'Platinum': 'tier-platinum',
  'Gold': 'tier-gold',
  'Silver': 'tier-silver',
  'Bronze': 'tier-bronze',
  'Cell Phone': 'tier-cell',
  'Friends and Family': 'tier-friends',
  'Friends & Family': 'tier-friends',
  'Individual Seats': 'tier-individual',
  'Trade': 'tier-trade',
};

export function TierBadge({ tier }) {
  const cls = TIER_CLASS[tier] || 'tier-none';
  const label = tier === 'Friends and Family' ? 'Friends & Family' : (tier || 'No tier');
  return <span className={`gs-badge ${cls}`}>{label}</span>;
}

// ── Status badge ───────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  return <span className={`gs-status s-${status.code}`}>{status.label}</span>;
}

// ── Pipeline pills (collapsed-row mini pipeline) ────────────────────────
const PIPELINE_LABELS = [
  ['invite', 'Invite'],
  ['opened', 'Opened'],
  ['clicked', 'Clicked'],
  ['picked', 'Picked'],
  ['finalized', 'Finalized'],
];

export function PipelinePills({ state }) {
  return (
    <div className="gs-pipeline">
      {PIPELINE_LABELS.map(([key, label]) => {
        const s = state[key] || 'todo';
        const icon = s === 'done' ? '✓' : s === 'warn' ? '⚠' : '';
        return (
          <span key={key} className={`gs-tp tp-${s}`}>
            {icon && <span>{icon}</span>}
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────────
export function KpiStrip({ counts, activeFilter, onFilter }) {
  const cards = [
    { key: 'all',      label: 'Total',       n: counts.all,       color: 'var(--def-navy)' },
    { key: 'pending',  label: 'Not invited', n: counts.pending,   color: 'var(--def-light)' },
    { key: 'invited',  label: 'Invited',     n: counts.invited,   color: 'var(--def-info)' },
    { key: 'opened',   label: 'Opened',      n: counts.opened,    color: 'var(--def-success)' },
    { key: 'complete', label: 'Selected',    n: counts.complete,  color: 'var(--def-success)' },
    { key: 'stalled',  label: 'Stalled',     n: counts.stalled,   color: 'var(--def-danger)' },
  ];
  return (
    <div className="gs-kpis">
      {cards.map(c => (
        <div
          key={c.key}
          className={`gs-kpi ${activeFilter === c.key ? 'is-active' : ''}`}
          onClick={() => onFilter(activeFilter === c.key ? 'all' : c.key)}
        >
          <div className="gs-kpi-n" style={{ color: c.color }}>{c.n}</div>
          <div className="gs-kpi-l">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Touchpoint timeline row ────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now.getTime() - 86400000);
  const isYest = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (isYest) return `Yesterday · ${time}`;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}

const ICONS = {
  sent:      { cls: 'gs-tl-i-sent',      sym: '✉' },
  delivered: { cls: 'gs-tl-i-delivered', sym: '✓' },
  opened:    { cls: 'gs-tl-i-opened',    sym: '👁' },
  clicked:   { cls: 'gs-tl-i-clicked',   sym: '↗' },
  picked:    { cls: 'gs-tl-i-picked',    sym: '🪑' },
  finalized: { cls: 'gs-tl-i-final',     sym: '🎫' },
  bounced:   { cls: 'gs-tl-i-bounced',   sym: '⚠' },
  pending:   { cls: 'gs-tl-i-pending',   sym: '·' },
};

export function TimelineRow({ icon, title, sub, time }) {
  const i = ICONS[icon] || ICONS.pending;
  return (
    <div className="gs-tl-row">
      <div className={`gs-tl-icon ${i.cls}`}>{i.sym}</div>
      <div className="gs-tl-main">
        <div className="gs-tl-title">{title}</div>
        {sub && <div className="gs-tl-sub">{sub}</div>}
      </div>
      <div className="gs-tl-time">{fmtTime(time)}</div>
    </div>
  );
}

// ── Touchpoint timeline ────────────────────────────────────────────────
export function Timeline({ sponsor }) {
  const send = sponsor.last_send;
  const events = sponsor.email_events || [];
  const ts = sponsor.tracking_summary || {};

  const rows = [];

  if (send) {
    const channel = send.channel === 'sms' ? 'SMS' : 'Email';
    rows.push({
      icon: 'sent',
      title: `${channel} sent — ${send.audience_label || send.subject || 'invite'}`,
      sub: send.subject ? `Subject: "${send.subject}"${send.sent_by ? ` · by ${send.sent_by}` : ''}` : (send.sent_by ? `Sent by ${send.sent_by}` : null),
      time: send.sent_at,
    });
  }

  // Group identical event types within 60s into a single row to reduce noise.
  // (Outlook prefetch frequently fires multiple opens within seconds.)
  const grouped = [];
  let last = null;
  for (const ev of events) {
    if (last && last.event_type === ev.event_type) {
      const gap = (new Date(ev.occurred_at).getTime() - new Date(last.occurred_at).getTime()) / 1000;
      if (gap < 60 && ev.event_type === 'email.opened') {
        last._count = (last._count || 1) + 1;
        last.occurred_at = ev.occurred_at;
        continue;
      }
    }
    grouped.push({ ...ev, _count: 1 });
    last = grouped[grouped.length - 1];
  }

  for (const ev of grouped) {
    switch (ev.event_type) {
      case 'email.delivered':
        rows.push({
          icon: 'delivered',
          title: 'Delivered to inbox',
          sub: ev.recipient_email,
          time: ev.occurred_at,
        });
        break;
      case 'email.opened':
        rows.push({
          icon: 'opened',
          title: ev._count > 1 ? `Opened (${ev._count}x in burst)` : 'Email opened',
          sub: parseUserAgent(ev.user_agent),
          time: ev.occurred_at,
        });
        break;
      case 'email.clicked':
        rows.push({
          icon: 'clicked',
          title: 'Clicked link',
          sub: ev.click_link ? truncateUrl(ev.click_link) : null,
          time: ev.occurred_at,
        });
        break;
      case 'email.bounced':
        rows.push({
          icon: 'bounced',
          title: `Email bounced ${ev.bounce_type ? `(${ev.bounce_type})` : ''}`,
          sub: ev.bounce_reason || 'No further detail from Resend',
          time: ev.occurred_at,
        });
        break;
      case 'email.complained':
        rows.push({
          icon: 'bounced',
          title: 'Recipient marked as spam',
          sub: 'Do not contact again from this domain',
          time: ev.occurred_at,
        });
        break;
      case 'email.failed':
        rows.push({
          icon: 'bounced',
          title: 'Send failed',
          sub: 'Resend reported permanent failure',
          time: ev.occurred_at,
        });
        break;
    }
  }

  // Portal events — picked + finalized
  if ((sponsor.seats_assigned || 0) > 0 && sponsor.last_assigned_at) {
    rows.push({
      icon: 'picked',
      title: `Picked ${sponsor.seats_assigned} of ${sponsor.seats_purchased || '?'} seats`,
      sub: sponsor.seats_assigned < (sponsor.seats_purchased || 0)
        ? `${(sponsor.seats_purchased || 0) - sponsor.seats_assigned} seats still to place`
        : 'All seats placed',
      time: sponsor.last_assigned_at,
    });
  }
  if (sponsor.rsvp_completed_at) {
    rows.push({
      icon: 'finalized',
      title: 'Finalized RSVP',
      sub: 'QR code dispatched',
      time: sponsor.rsvp_completed_at,
    });
  }

  // Sort newest first.
  rows.sort((a, b) => {
    const ta = new Date((a.time || '') + (a.time && !a.time.includes('Z') ? 'Z' : '')).getTime();
    const tb = new Date((b.time || '') + (b.time && !b.time.includes('Z') ? 'Z' : '')).getTime();
    return tb - ta;
  });

  // Show pending next-step row at top if invited but not finalized.
  if (sponsor.rsvp_status !== 'completed' && rows.length > 0) {
    const next = nextStep(sponsor);
    if (next) {
      rows.unshift({
        icon: 'pending',
        title: next,
        sub: 'Awaiting sponsor action',
        time: null,
      });
    }
  }

  if (rows.length === 0) {
    return <div style={{ color: 'var(--def-light)', fontSize: 13, padding: '12px 0' }}>No activity yet — sponsor hasn't been invited.</div>;
  }

  return (
    <div className="gs-tl">
      {rows.map((r, i) => <TimelineRow key={i} {...r} />)}
    </div>
  );
}

function nextStep(sponsor) {
  const ts = sponsor.tracking_summary || {};
  if (ts.bounced_at || ts.complained_at) return 'Update contact email';
  if ((sponsor.seats_assigned || 0) > 0 && sponsor.seats_assigned < (sponsor.seats_purchased || 0)) {
    return `Pick remaining ${(sponsor.seats_purchased || 0) - sponsor.seats_assigned} seats`;
  }
  if ((sponsor.seats_assigned || 0) === (sponsor.seats_purchased || 0) && sponsor.seats_purchased > 0 && !sponsor.rsvp_completed_at) {
    return 'Finalize RSVP';
  }
  if (ts.clicked_at) return 'Pick seats from portal';
  if (ts.opened_at) return 'Click portal link';
  if (ts.sent_at) return 'Open invite email';
  return null;
}

function parseUserAgent(ua) {
  if (!ua) return null;
  // Heuristic — Microsoft prefetch is "BarracudaCentral" or contains "MicrosoftPreview"
  if (/microsoftpreview|barracuda|outlookforefront/i.test(ua)) {
    return 'Likely security scanner (auto-open)';
  }
  if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/macintosh/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  return null;
}

function truncateUrl(url) {
  if (!url) return '';
  if (url.length <= 60) return url;
  return url.slice(0, 50) + '…' + url.slice(-7);
}
