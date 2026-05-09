// TicketCardV2 — V2 R5 (collapsed showing card)
//
// Per-showing card. Poster + eyebrow + title + theater + a row of
// count badges, plus two action buttons:
//   - "View ticket →" — opens TicketDetailSheet (the beautiful
//     full-page view with QR + seat list + save-to-phone)
//   - "+ Invite" — opens HandBlockSheet for this card's seats so
//     the user can hand the whole group to a guest in one tap
//
// REMOVED FROM R3:
//   - Inline always-visible seat rows (the user said too noisy)
//   - Per-row action buttons (moved into TicketDetailSheet)
//   - The chevron — no more expand/collapse, the action button is
//     "View ticket" and that opens the detail sheet
//
// Guest-section cards (guest=true) work the same shape but the
// "+ Invite" button is hidden — you don't invite guests on a guest
// ticket; you manage them via DelegateManage which is reachable
// from the Guests section in TicketsTabV2.

import { useMemo } from 'react';
import { BRAND } from '../../brand/tokens.js';
import { PosterMini } from '../Mobile.jsx';

export default function TicketCardV2({
  ticket,
  guest = false,
  onViewTicket,
  onInviteGroup, // (ticket) => void  — opens HandBlockSheet
}) {
  const rows = ticket.assignmentRows || [];

  // Count seats by ownership for the badge row
  const counts = useMemo(() => {
    let yours = 0;
    let assigned = 0;
    for (const r of rows) {
      if (r.delegation_id) assigned += 1;
      else yours += 1;
    }
    return { yours, assigned, total: rows.length };
  }, [rows]);

  // Missing dinner count for the badge row — same logic everywhere
  const missingDinner = useMemo(
    () => rows.filter((r) => !r.dinner_choice).length,
    [rows]
  );

  return (
    <article
      data-testid={guest ? 'guest-ticket-card-v2' : 'ticket-card-v2'}
      style={{
        borderRadius: 14,
        background: 'var(--surface)',
        border: `1px solid var(--rule)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0,1fr)',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <PosterMini
          poster={ticket.posterUrl}
          color={ticket.color}
          label={ticket.movieShort}
          size={56}
          showLabel={false}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              color: guest ? 'var(--accent-italic)' : 'var(--accent-text)',
              textTransform: 'uppercase',
            }}
          >
            {guest ? 'Guest ticket' : ticket.showLabel || 'Showing'} · {ticket.showTime}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink-on-ground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: -0.2,
            }}
          >
            {ticket.movieTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: 'var(--mute)',
            }}
          >
            {ticket.theaterName}
          </div>
        </div>
      </div>

      {/* Badge row — quick-glance counts */}
      <div
        style={{
          padding: '0 14px 12px',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <Badge label={`${counts.total} seat${counts.total === 1 ? '' : 's'}`} kind="indigo" />
        {counts.yours > 0 && (
          <Badge label={`${counts.yours} you`} kind="indigo-soft" />
        )}
        {counts.assigned > 0 && (
          <Badge label={`${counts.assigned} guest`} kind="green" />
        )}
        {missingDinner > 0 && (
          <Badge
            label={`${missingDinner} no dinner`}
            kind="amber"
          />
        )}
      </div>

      {/* Action row — View ticket primary, + Invite secondary */}
      <div
        style={{
          padding: '0 14px 14px',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          onClick={() => onViewTicket && onViewTicket(ticket)}
          data-testid="ticket-view"
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            flex: 1,
            padding: '10px 14px',
            borderRadius: 99,
            background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
            color: BRAND.navyDeep,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.3,
            textAlign: 'center',
          }}
        >
          View ticket →
        </button>
        {!guest && onInviteGroup && (
          <button
            onClick={() => onInviteGroup(ticket)}
            data-testid="ticket-invite-group"
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: '10px 14px',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--ink-on-ground)',
              border: `1px solid var(--rule)`,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            + Invite
          </button>
        )}
      </div>
    </article>
  );
}

function Badge({ label, kind = 'indigo' }) {
  const map = {
    indigo: { bg: 'rgba(168,177,255,0.16)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.3)' },
    'indigo-soft': { bg: 'rgba(168,177,255,0.08)', fg: BRAND.indigoLight, br: 'rgba(168,177,255,0.2)' },
    green: { bg: 'rgba(99,201,118,0.14)', fg: '#63c976', br: 'rgba(99,201,118,0.3)' },
    amber: { bg: 'rgba(244,185,66,0.12)', fg: BRAND.gold, br: 'rgba(244,185,66,0.3)' },
  };
  const s = map[kind] || map.indigo;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: '3px 8px',
        borderRadius: 99,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.br}`,
      }}
    >
      {label}
    </span>
  );
}
