// Portal v2 — soft-website redesign.
//
// Visual target: gala.daviskids.org/ — the homepage. Same navy ground,
// same Fraunces serif + Inter UI, same gradient strip cards, paper-feel
// info pills, no app shell. Pages flow vertically; modals replace tabs.
//
// What this shell renders (top to bottom):
//   1. Brand nav (DEF logo / annual gala / sign-out)
//   2. Hero — "Welcome, Scott." headline + tier chip + days-out
//   3. Status card — your block stats + showtime + venue + primary CTA
//   4. Your tickets — list of placed seats (or empty placeholders)
//   5. Group — assigned guests (if any delegations exist)
//   6. The lineup — four-film grid like the homepage
//   7. Night of — three info cards (location / dinner / private links)
//   8. Footer
//
// Modals (popups, not pages):
//   - SeatPickerModal — wraps the existing SeatPickSheet in v2 chrome
//   - TicketDetailModal — single seat detail / assign / unplace
//   - MovieDetailModal — full synopsis + trailer
//   - ProfileModal — name/email/phone edit
//
// What we kept from v1: SeatEngine.jsx, useSeats, usePortal, useFinalize,
// SeatPickSheet body. All API contracts identical. The redesign is the
// shell + the wrapper around the seat picker, not the seat picker itself.

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { config } from '../config.js';
import { useFinalize } from '../hooks/useFinalize.js';
import { SHOWING_NUMBER_TO_ID, formatBadgeFor } from '../hooks/usePortal.js';
import { enrichMovieScores, formatRottenBadge, highestRottenScore } from '../portal/movieScores.js';
import { SeatPickerModal } from './SeatPickerModal.jsx';
import { TicketDetailModal } from './TicketDetailModal.jsx';
import { TicketGroupModal, ShowingAuditoriumPills } from './TicketGroupModal.jsx';
import { MovieDetailModal } from './MovieDetailModal.jsx';
import { ProfileModal } from './ProfileModal.jsx';
import { CelebrationOverlay } from './CelebrationOverlay.jsx';
import { InviteModal } from './InviteModal.jsx';
import { DelegationManageModal } from './DelegationManageModal.jsx';
import { ReceiveOverlay } from './ReceiveOverlay.jsx';
import { SwapSeatModal } from './SwapSeatModal.jsx';
import { ReleaseSeatConfirm } from './ReleaseSeatConfirm.jsx';
import { MoveGroupModal } from './MoveGroupModal.jsx';
import './portal-v2.css';

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const GALA_DATE = new Date('2026-06-10T16:30:00-06:00');

function initialsOf(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function daysUntilGala() {
  const ms = GALA_DATE.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function formatShowing(showingNumber) {
  return showingNumber === 1 ? 'Early · 4:30 PM' : showingNumber === 2 ? 'Late · 7:15 PM' : '';
}

function tierClass(tier) {
  return (tier || '').toLowerCase();
}

// Group seat assignments into one card per (theater + showing). Visiting
// the same showing twice means you're sitting next to yourself for the
// same movie — should render as a single ticket with multiple seat
// chips, not N visually-identical rows.
function buildTicketGroups(portal) {
  const assignments = portal?.myAssignments || [];
  const showtimes = portal?.showtimes || [];
  const stIndex = {};
  showtimes.forEach((s) => {
    stIndex[`${s.theater_id}:${s.showing_number}`] = s;
  });

  const groups = new Map();
  for (const a of assignments) {
    const showing = a.showing_number || 1;
    const key = `${a.theater_id}:${showing}`;
    if (!groups.has(key)) {
      const st = stIndex[key] || {};
      groups.set(key, {
        id: key,
        theater_id: a.theater_id,
        showing_number: showing,
        showingLabel: formatShowing(showing),
        movie_title: st.movie_title || 'TBD',
        poster_url: st.poster_url,
        seats: [],
      });
    }
    const seat = {
      id: `${key}:${a.row_label}-${a.seat_num}`,
      seatLabel: `${a.row_label}${a.seat_num}`,
      row: a.row_label,
      num: a.seat_num,
      theater_id: a.theater_id,
      showing_number: showing,
      auditorium: a.theater_id,
      guest_name: a.guest_name,
      poster_url: stIndex[key]?.poster_url,
      movie_title: stIndex[key]?.movie_title || 'TBD',
      showingLabel: formatShowing(showing),
      raw: a,
    };
    groups.get(key).seats.push(seat);
  }

  // Sort seats inside each group naturally (A1 before A2 before B1).
  for (const g of groups.values()) {
    g.seats.sort((a, b) => {
      if (a.row !== b.row) return String(a.row).localeCompare(String(b.row));
      return Number(a.num) - Number(b.num);
    });
  }

  // Sort groups by showing (early first), then theater_id.
  return [...groups.values()].sort((a, b) => {
    if (a.showing_number !== b.showing_number) return a.showing_number - b.showing_number;
    return a.theater_id - b.theater_id;
  });
}

// ───────────────────────────────────────────────────────────────────────
// Atom components
// ───────────────────────────────────────────────────────────────────────

function BrandNav({ identity, onOpenProfile }) {
  const initials = initialsOf(identity?.contactName || identity?.company);
  return (
    <nav className="p2-nav">
      <div className="p2-brand">
        <img src="/assets/brand/def-logo-light.png" alt="Davis Education Foundation" />
        <div className="p2-brand-mark" />
        <div className="p2-brand-title">Annual Gala</div>
      </div>
      <div className="p2-nav-right">
        <button
          className="p2-avatar"
          onClick={onOpenProfile}
          title={identity?.contactName || identity?.company || 'Profile'}
          aria-label="Open profile"
          type="button"
          style={{ cursor: 'pointer' }}
        >
          {initials}
        </button>
      </div>
    </nav>
  );
}

function Hero({ identity, seatMath, tierAccess, onPick }) {
  const firstName = (identity?.contactName || '').split(' ')[0] || identity?.company || 'there';
  const placed = seatMath?.placed || 0;
  const total = seatMath?.total || 0;
  const remaining = Math.max(0, total - placed);
  const daysOut = daysUntilGala();
  const isStaff = identity?.kind === 'staff';
  const isDelegate = identity?.kind === 'delegate';
  const tier = identity?.tier || (isStaff ? 'Staff' : isDelegate ? 'Guest' : 'Sponsor');
  const open = tierAccess?.open === true;

  let headline;
  if (placed >= total && total > 0) {
    headline = (
      <>Your <span className="p2-italic-flair">night</span> is set.</>
    );
  } else if (placed > 0) {
    headline = (
      <>Welcome <span className="p2-italic-flair">back</span>, {firstName}.</>
    );
  } else if (isDelegate) {
    headline = (
      <>Pick your <span className="p2-italic-flair">seat</span>, {firstName}.</>
    );
  } else {
    headline = (
      <>Welcome, <span className="p2-italic-flair">{firstName}.</span></>
    );
  }

  let sub;
  if (placed >= total && total > 0) {
    sub = (
      <>
        All {total} {total === 1 ? 'seat is' : 'seats are'} placed. Edit your tickets, assign
        delegate guests, or peek at the lineup below.
      </>
    );
  } else if (placed > 0) {
    sub = (
      <>
        {placed} of {total} {total === 1 ? 'seat' : 'seats'} placed.{' '}
        {total - placed} still to go — pick when you're ready.
      </>
    );
  } else if (!tierAccess?.open && tierAccess?.opensAt) {
    const opensAt = new Date(tierAccess.opensAt);
    const fmt = opensAt.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    sub = (
      <>
        Your {tier} window opens {fmt}. We'll text and email when it's time. Until then, dig
        through the lineup or update your contact info up top.
      </>
    );
  } else {
    sub = (
      <>
        {total} {total === 1 ? 'seat is' : 'seats are'} yours to place. Pick the showtime, the
        auditorium, and the seats — you can split your block across films if you want.
      </>
    );
  }

  // Hero CTA label varies with state. Always visible when window is open
  // so there's a clear "what to do next" near the top of the page.
  let ctaLabel = null;
  if (open) {
    if (remaining === 0 && total > 0) ctaLabel = 'Edit my seats';
    else if (placed > 0) ctaLabel = `Place ${remaining} more`;
    else if (total > 0) ctaLabel = `Pick my ${total === 1 ? 'seat' : 'seats'}`;
  }

  return (
    <section className="p2-section p2-hero">
      <div className="p2-eyebrow p2-hero-eyebrow">
        Lights · Camera · Take Action · 2026
      </div>
      <h1>{headline}</h1>
      <p className="p2-hero-sub">{sub}</p>

      {ctaLabel && (
        <div className="p2-hero-actions">
          <button className="p2-btn primary" type="button" onClick={onPick}>
            {ctaLabel} →
          </button>
        </div>
      )}

      {/* Date + venue collapse into one richer pill on desktop, splits
          on mobile via the .p2-event-pill flex layout. The Platinum
          tier pill is gone — that info already lives in the BRONZE/
          PLATINUM chip in the StatusCard below, no need to say it
          twice up here. */}
      <div className="p2-event-pill">
        <div>
          <strong>Wednesday, June 10, 2026</strong>
          <span>{daysOut} {daysOut === 1 ? 'day' : 'days'} out</span>
        </div>
        <div className="p2-event-pill-divider" aria-hidden="true" />
        <div>
          <strong>Megaplex at Legacy Crossing</strong>
          <span>Centerville, Utah</span>
        </div>
      </div>
    </section>
  );
}

function StatusCard({ identity, seatMath, tierAccess }) {
  const placed = seatMath?.placed || 0;
  const total = seatMath?.total || 0;
  const remaining = Math.max(0, total - placed);
  const delegated = seatMath?.delegated || 0;
  const open = tierAccess?.open === true;
  const tier = identity?.tier || 'Sponsor';

  return (
    <section className="p2-section tight">
      <div className="p2-card stripped">
        <div className="p2-card-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`p2-chip ${tierClass(tier)}`}>
                  <span className="p2-chip-dot" />
                  {tier}
                </span>
                {identity?.company && (
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>
                    {identity.company}
                  </span>
                )}
              </div>
              <h2>Your <span className="p2-italic-flair">block</span></h2>
            </div>
            {!open && (
              <span className="p2-chip" style={{ background: 'rgba(255,255,255,0.05)' }}>
                Window not open yet
              </span>
            )}
          </div>

          <div className="p2-stat-grid">
            <div className="p2-stat">
              <div className="p2-stat-label">Total</div>
              <span className="p2-stat-value">{total}</span>
              <span className="p2-stat-sub">Your block</span>
            </div>
            <div className="p2-stat">
              <div className="p2-stat-label">Placed</div>
              <span className={`p2-stat-value ${placed === 0 ? 'muted' : ''}`}>{placed}</span>
              <span className="p2-stat-sub">In seats</span>
            </div>
            <div className="p2-stat">
              <div className="p2-stat-label">Delegated</div>
              <span className={`p2-stat-value ${delegated === 0 ? 'muted' : ''}`}>{delegated}</span>
              <span className="p2-stat-sub">To guests</span>
            </div>
            <div className="p2-stat">
              <div className="p2-stat-label">Open</div>
              <span className={`p2-stat-value ${remaining === 0 ? 'muted' : ''}`}>{remaining}</span>
              <span className="p2-stat-sub">To place</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TicketsSection({ groups, seatMath, tierAccess, onOpenGroup, onPlaceMore }) {
  const total = seatMath?.total || 0;
  const placed = groups.reduce((n, g) => n + g.seats.length, 0);
  const remaining = Math.max(0, total - placed);
  const open = tierAccess?.open === true;

  // Display modes:
  //   'groups'   — collapsed by (theater + showing) — default. Each
  //                card lists seat chips for that group.
  //   'flat'     — flat list of seats, one card per seat. Useful when
  //                a sponsor wants to see each individual ticket as
  //                its own row (the "show me by seat" ask).
  // Hide the toggle entirely if every group is single-seat (toggle
  // becomes a visual no-op).
  const hasMultiSeatGroup = groups.some((g) => g.seats.length > 1);
  const [mode, setMode] = useState('groups');

  // Flat-mode view: explode every group into one card per seat. We
  // reuse the same TicketGroupModal-open path: each flat row points to
  // a synthetic single-seat group so the click behavior matches.
  const flatItems = useMemo(() => {
    if (mode !== 'flat') return [];
    const out = [];
    for (const g of groups) {
      for (const s of g.seats) {
        out.push({
          ...g,
          id: s.id,
          seats: [s], // synthetic single-seat group
          _isFlat: true,
          _flatSeat: s,
        });
      }
    }
    return out;
  }, [groups, mode]);

  const displayGroups = mode === 'flat' ? flatItems : groups;

  return (
    <section className="p2-section">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Your tickets</div>
          <h2>Tickets <span className="p2-italic-flair">placed</span></h2>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {hasMultiSeatGroup && placed > 0 && (
            <div className="p2-view-toggle" role="tablist" aria-label="Ticket view">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'groups'}
                className={mode === 'groups' ? 'active' : ''}
                onClick={() => setMode('groups')}
              >
                My groups
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'flat'}
                className={mode === 'flat' ? 'active' : ''}
                onClick={() => setMode('flat')}
              >
                By seat
              </button>
            </div>
          )}
          <p style={{ margin: 0 }}>
            {placed} of {total} placed
            {remaining > 0 ? <> · {remaining} still to choose</> : <> · all set</>}
          </p>
          {open && remaining === 0 && placed > 0 && (
            <button className="p2-btn ghost sm" type="button" onClick={onPlaceMore}>
              Edit my seats →
            </button>
          )}
        </div>
      </div>

      <div className="p2-ticket-grid">
        {displayGroups.map((g) => {
          const n = g.seats.length;
          // Compose a short summary line about who's sitting in the group.
          const named = g.seats.filter((s) => s.guest_name);
          let whoLine = null;
          if (named.length === n && named.length > 0) {
            const uniqueNames = [...new Set(named.map((s) => s.guest_name))];
            whoLine =
              uniqueNames.length === 1
                ? uniqueNames[0]
                : `${uniqueNames[0]} + ${uniqueNames.length - 1} other${uniqueNames.length === 2 ? '' : 's'}`;
          } else if (named.length > 0) {
            whoLine = `${named.length} of ${n} assigned`;
          }

          return (
            <button
              key={g.id}
              type="button"
              className="p2-ticket-card"
              onClick={() => onOpenGroup(g)}
            >
              <div
                className="p2-ticket-poster"
                style={
                  g.poster_url ? { backgroundImage: `url(${g.poster_url})` } : undefined
                }
                aria-hidden="true"
              />
              <div className="p2-ticket-body">
                <div className="p2-ticket-title">
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                    {g.movie_title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--p2-subtle)',
                      marginLeft: 'auto',
                    }}
                  >
                    {g._isFlat ? `Seat ${g._flatSeat.seatLabel}` : `${n} ${n === 1 ? 'seat' : 'seats'}`}
                  </span>
                </div>
                <div style={{ margin: '8px 0 4px' }}>
                  <ShowingAuditoriumPills
                    showingNumber={g.showing_number}
                    auditoriumId={g.theater_id}
                  />
                </div>
                {whoLine && (
                  <div className="p2-ticket-meta" style={{ marginTop: 4 }}>
                    {whoLine}
                  </div>
                )}
                <div className="p2-seat-chip-row">
                  {g.seats.map((s) => (
                    <span key={s.id} className="p2-seat-chip">
                      {s.seatLabel}
                    </span>
                  ))}
                </div>
              </div>
              <span className="p2-ticket-arrow">→</span>
            </button>
          );
        })}
        {remaining > 0 && (
          <button
            type="button"
            className="p2-ticket-card placeholder"
            onClick={onPlaceMore}
            disabled={!open}
            style={groups.length === 0 ? { gridColumn: '1 / -1' } : undefined}
          >
            {open
              ? `+ Place ${remaining === 1 ? 'your seat' : `${remaining} more seats`}`
              : `${remaining} ${remaining === 1 ? 'seat' : 'seats'} waiting for your window to open`}
          </button>
        )}
      </div>
    </section>
  );
}

// Compute a normalized status from the delegation row. Mirrors the
// resolveDelegationStatus helper inside the old Portal.jsx so we get
// the same buckets without importing the whole module.
function delegationStatus(d) {
  if (!d) return 'unknown';
  const raw = (d.status || '').toLowerCase();
  if (raw === 'claimed' || raw === 'accepted' || d.claimed_at) return 'claimed';
  if (raw === 'declined' || raw === 'revoked') return raw;
  if (raw === 'expired') return 'expired';
  return 'invited';
}

function DelegationStatusPillV2({ status }) {
  const map = {
    claimed:  { label: 'Claimed',  color: '#7fcfa0' },
    invited:  { label: 'Invited',  color: 'var(--p2-gold)' },
    declined: { label: 'Declined', color: 'var(--p2-red-soft)' },
    revoked:  { label: 'Revoked',  color: 'var(--p2-subtle)' },
    expired:  { label: 'Expired',  color: 'var(--p2-red-soft)' },
    unknown:  { label: 'Unknown',  color: 'var(--p2-subtle)' },
  };
  const m = map[status] || map.unknown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: m.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: m.color,
        }}
      />
      {m.label}
    </span>
  );
}

function GroupSection({ portal, onOpenInvite, onManageDelegation }) {
  const delegations = portal?.childDelegations || [];
  const seatMath = portal?.seatMath || { total: 0, placed: 0, delegated: 0, available: 0 };
  const tierAccess = portal?.tierAccess || {};
  const open = tierAccess?.open === true;

  // Sponsors are the only kind who can invite. If we're a delegate
  // looking at our own portal, the group section is irrelevant.
  const isSponsor = portal?.identity?.kind === 'sponsor';

  // Show the section if there are delegations OR if the sponsor still
  // has seats to give away (so the "Invite a guest" CTA has a home).
  if (!isSponsor) return null;
  if (delegations.length === 0 && seatMath.total === 0) return null;

  return (
    <section className="p2-section">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Your group</div>
          <h2>Guests you <span className="p2-italic-flair">invited</span></h2>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {delegations.length > 0 && (
            <p style={{ margin: 0 }}>
              {delegations.length} {delegations.length === 1 ? 'invite' : 'invites'} out
            </p>
          )}
          {open && (
            <button
              type="button"
              className="p2-btn primary sm"
              onClick={() => onOpenInvite()}
            >
              + Invite a guest
            </button>
          )}
        </div>
      </div>

      {delegations.length === 0 ? (
        <div
          style={{
            padding: '28px 22px',
            border: '1px dashed var(--p2-rule)',
            borderRadius: 18,
            textAlign: 'center',
            color: 'var(--p2-muted)',
            fontSize: 14,
          }}
        >
          No invites out yet. Tap "Invite a guest" to hand seats to someone — they'll get
          their own portal link to pick where they sit.
        </div>
      ) : (
        <div className="p2-ticket-grid">
          {delegations.map((d) => {
            // Production API returns camelCase: delegateName, email,
            // phone, seatsPlaced, seatsAllocated, status. Mock preview
            // data may use either shape — guard both.
            const name = d.delegateName || d.guest_name || 'Unnamed guest';
            const email = d.email || d.guest_email;
            const phone = d.phone || d.guest_phone;
            const placed = d.seatsPlaced ?? 0;
            const allocated = d.seatsAllocated ?? d.seat_count ?? 0;
            const status = delegationStatus(d);
            return (
              <button
                key={d.id}
                type="button"
                className="p2-ticket-card"
                onClick={() => onManageDelegation(d)}
                style={{ textAlign: 'left' }}
              >
                <div
                  className="p2-avatar"
                  style={{ width: 48, height: 48, fontSize: 14, flexShrink: 0 }}
                >
                  {initialsOf(name)}
                </div>
                <div className="p2-ticket-body">
                  <div
                    className="p2-ticket-title"
                    style={{ fontSize: 14, alignItems: 'center', gap: 10 }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{name}</span>
                    <DelegationStatusPillV2 status={status} />
                  </div>
                  <div className="p2-ticket-meta">
                    {placed} of {allocated} placed · {email || phone || 'no contact yet'}
                  </div>
                </div>
                <span className="p2-ticket-arrow">→</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LineupSection({ showtimes, onOpenMovie }) {
  // Unique movies, keyed by movie_id, with the highest-tier showtime per movie.
  const unique = useMemo(() => {
    const byId = {};
    (showtimes || []).forEach((s) => {
      if (!byId[s.movie_id] || s.theater_tier === 'premier') {
        byId[s.movie_id] = s;
      }
    });
    return enrichMovieScores(Object.values(byId));
  }, [showtimes]);

  if (unique.length === 0) return null;

  return (
    <section className="p2-section wide-pad">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">The lineup</div>
          <h2>Four films, two <span className="p2-italic-flair">showtimes</span>.</h2>
        </div>
        <p>
          Tap any film for the synopsis and trailer. You can split your block across films
          when you pick seats.
        </p>
      </div>
      <div className="p2-movie-grid">
        {unique.map((m) => {
          const rt = formatRottenBadge(m);
          return (
            <button
              key={m.movie_id}
              type="button"
              className="p2-movie-card"
              onClick={() => onOpenMovie(m)}
            >
              <div className="p2-movie-media">
                {m.backdrop_url && (
                  <img
                    className="p2-movie-backdrop"
                    src={m.backdrop_url}
                    alt=""
                    loading="lazy"
                  />
                )}
                <div className="p2-movie-identity">
                  {m.poster_url && (
                    <img
                      className="p2-movie-poster"
                      src={m.poster_url}
                      alt={`${m.movie_title} poster`}
                      loading="lazy"
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="p2-movie-title">{m.movie_title}</div>
                    <div className="p2-movie-meta-row">
                      {m.rating && <span className="p2-badge">{m.rating}</span>}
                      {m.runtime_minutes && (
                        <span className="p2-badge">{m.runtime_minutes} min</span>
                      )}
                      {rt && <span className="p2-badge rt">🍅 {rt}</span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p2-movie-body">
                <p>
                  {(m.synopsis || '').slice(0, 180)}
                  {m.synopsis && m.synopsis.length > 180 ? '…' : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NightOfSection() {
  return (
    <section className="p2-section">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Night of</div>
          <h2>What to <span className="p2-italic-flair">expect</span>.</h2>
        </div>
        <p>
          Dinner, films, and time to mingle — laid out so you know exactly where to land
          when you arrive.
        </p>
      </div>
      <div className="p2-info-grid">
        <div className="p2-info-card">
          <div className="kicker">Location</div>
          <h3>Legacy Crossing</h3>
          <p>
            Megaplex Theatres at Legacy Crossing in Centerville. DEF check-in and theater
            assignments on site.
          </p>
        </div>
        <div className="p2-info-card">
          <div className="kicker">Dinner</div>
          <h3>Chef-curated</h3>
          <p>
            Plated dinner before each showing. Dietary notes and special asks live in
            your guest portal.
          </p>
        </div>
        <div className="p2-info-card">
          <div className="kicker">Tickets</div>
          <h3>Private links</h3>
          <p>
            Each seat gets its own confirmation — text or email — so guests don't need a login
            on the night.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="p2-footer">
      <img src="/assets/brand/def-logo-light.png" alt="Davis Education Foundation" />
      <div>
        DEF Gala 2026 · Wednesday, June 10, 2026 · Megaplex at Legacy Crossing
      </div>
    </footer>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Container
// ───────────────────────────────────────────────────────────────────────

export default function PortalShellV2({
  portal,
  token,
  theaterLayouts,
  seats,
  onRefresh,
  openSheetOnMount,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [seatModal, setSeatModal] = useState(false);
  const [groupModal, setGroupModal] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);
  const [movieModal, setMovieModal] = useState(null);
  const [profileModal, setProfileModal] = useState(false);
  const [celebration, setCelebration] = useState(null);
  // inviteModal: null | { seatPills, preselectedPills } — Mode A is
  // open=true with no pills set; Mode B requires seatPills.
  const [inviteModal, setInviteModal] = useState(null);
  // delegationManageModal: the delegation record being managed
  const [manageDelegation, setManageDelegation] = useState(null);
  // swapSeat: { seat, returnTo? } — open the single-seat swap UX
  // for `seat`. If returnTo is set, re-open that thing after the
  // swap modal closes (e.g. the group modal the user came from).
  const [swapSeat, setSwapSeat] = useState(null);
  // releaseConfirm: { seats: [...], returnTo? } — confirm releasing
  // one or many seats. The seats array shape matches the seat objects
  // from group.seats so ReleaseSeatConfirm can render labels + meals.
  const [releaseConfirm, setReleaseConfirm] = useState(null);
  // moveGroup: { group, returnTo } — open the multi-seat move flow
  // for a whole group. The group object is the full group payload
  // from buildTicketGroups so we have movie title, poster, seats.
  const [moveGroup, setMoveGroup] = useState(null);

  // Deep-link `/sponsor/{token}/seats` opens the seat modal.
  useEffect(() => {
    if (openSheetOnMount) setSeatModal(true);
  }, [openSheetOnMount]);

  // When the seat modal closes, route back to the bare token path.
  useEffect(() => {
    if (!seatModal && location.pathname.endsWith('/seats')) {
      navigate(`/${token}`, { replace: true });
    }
  }, [seatModal, location.pathname, navigate, token]);

  const identity = portal?.identity || {};
  const seatMath = portal?.seatMath || { total: 0, placed: 0, delegated: 0, available: 0 };
  const tierAccess = portal?.tierAccess || {};
  const showtimes = portal?.showtimes || [];

  const tickets = useMemo(() => buildTicketGroups(portal), [portal]);

  // When the portal refreshes (e.g. after saving a dinner pick inside
  // an open group modal), the groupModal state still holds a snapshot
  // taken at open time — stale. Re-derive from the fresh tickets list
  // keyed by group id so the modal stays in sync.
  const liveGroup = useMemo(() => {
    if (!groupModal) return null;
    return tickets.find((g) => g.id === groupModal.id) || groupModal;
  }, [groupModal, tickets]);

  // Same for the single-seat detail modal — re-derive from fresh
  // assignments so the dinner pill inside updates without close+reopen.
  const liveTicket = useMemo(() => {
    if (!ticketModal) return null;
    for (const g of tickets) {
      const found = g.seats.find((s) => s.id === ticketModal.id);
      if (found) return found;
    }
    return ticketModal;
  }, [ticketModal, tickets]);

  const openSeatModal = () => setSeatModal(true);
  const closeSeatModal = async () => {
    setSeatModal(false);
    // Refresh after the modal closes, in case the user placed seats.
    if (onRefresh) await onRefresh();
  };

  // Receive flow gate: a delegate visiting their portal for the first
  // time (confirmedAt is null) sees a take-over "here's what you have,
  // keep or modify?" overlay before the normal shell. Once they
  // confirm (or modify-then-close), the gate falls away and they see
  // the regular portal — same view sponsors see, just scoped to their
  // own seats and contact info.
  const needsReceiveGate =
    identity.kind === 'delegation' && !identity.confirmedAt;

  if (needsReceiveGate) {
    return (
      <ReceiveOverlay
        portal={portal}
        token={token}
        onConfirmed={onRefresh}
      />
    );
  }

  return (
    <div className="p2-shell">
      <BrandNav identity={identity} onOpenProfile={() => setProfileModal(true)} />

      <Hero identity={identity} seatMath={seatMath} tierAccess={tierAccess} onPick={openSeatModal} />

      <StatusCard
        identity={identity}
        seatMath={seatMath}
        tierAccess={tierAccess}
      />

      {(tickets.length > 0 || seatMath.total > 0) && (
        <TicketsSection
          groups={tickets}
          seatMath={seatMath}
          tierAccess={tierAccess}
          onOpenGroup={(g) => {
            // Single-seat groups skip the group screen and go straight
            // to the per-seat detail modal (where you can release /
            // assign / text). Multi-seat groups land on the group
            // modal where you can act on each seat in context.
            if (g.seats.length === 1) {
              setTicketModal(g.seats[0]);
            } else {
              setGroupModal(g);
            }
          }}
          onPlaceMore={openSeatModal}
        />
      )}

      <GroupSection
        portal={portal}
        onOpenInvite={() => setInviteModal({})}
        onManageDelegation={(d) => setManageDelegation(d)}
      />

      <LineupSection showtimes={showtimes} onOpenMovie={(m) => setMovieModal(m)} />

      <NightOfSection />

      <Footer />

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {seatModal && (
        <SeatPickerModal
          portal={portal}
          token={token}
          theaterLayouts={theaterLayouts}
          seats={seats}
          onClose={closeSeatModal}
          onRefresh={onRefresh}
          onOpenMovieDetail={(m) => setMovieModal(m)}
          onCommitted={(placed) => {
            // The seat picker fires this once the placed payload is
            // committed and the portal has been refreshed. Close the
            // picker and trigger the full-screen celebration moment.
            // The user dismisses the overlay (auto-fades after ~4.5s
            // or tap-anywhere) and lands back on the home page with
            // their freshly placed tickets in view.
            setSeatModal(false);
            setCelebration({
              seats: (placed?.seatIds || []).map((s) => s.replace('-', '')),
              movieTitle: placed?.movieTitle || '',
            });
          }}
        />
      )}
      {groupModal && (
        <TicketGroupModal
          group={liveGroup}
          portal={portal}
          token={token}
          onClose={() => setGroupModal(null)}
          onRefresh={onRefresh}
          onOpenSeat={(seat) => {
            setGroupModal(null);
            setTicketModal(seat);
          }}
          onEditSeats={() => {
            setGroupModal(null);
            setSeatModal(true);
          }}
          onChangeSeat={(seat) => {
            const returnGroup = groupModal;
            setGroupModal(null);
            setSwapSeat({ seat, returnTo: { kind: 'group', group: returnGroup } });
          }}
          onReleaseSeat={(seat) => {
            // One-seat release. Confirm modal opens overlaid on the
            // group modal (group modal stays mounted underneath so
            // closing the confirm reveals the group with updated
            // contents after refresh).
            setReleaseConfirm({
              seats: [seat],
              returnTo: { kind: 'group', group: groupModal },
            });
          }}
          onMoveGroup={(g) => {
            const returnGroup = groupModal;
            setGroupModal(null);
            setMoveGroup({ group: g, returnTo: { kind: 'group', group: returnGroup } });
          }}
          onReleaseGroup={(g) => {
            // Whole-group release. Same confirm modal, multiple seats.
            // After confirm the group will be empty so there's nothing
            // to return to — close the group modal as part of release.
            setReleaseConfirm({
              seats: g.seats,
              returnTo: { kind: 'close-group' },
            });
          }}
          onInviteSeat={(seat) => {
            const sid = `${seat.row}-${seat.num}`;
            const giveable = [];
            for (const g of tickets) {
              for (const s of g.seats) {
                if (!s.raw?.delegation_id && !s.guest_name) {
                  giveable.push(`${s.row}-${s.num}`);
                }
              }
            }
            setGroupModal(null);
            setInviteModal({
              seatPills: giveable.length > 0 ? giveable : [sid],
              preselectedPills: [sid],
            });
          }}
        />
      )}
      {ticketModal && (
        <TicketDetailModal
          ticket={liveTicket}
          portal={portal}
          token={token}
          onClose={() => setTicketModal(null)}
          onRefresh={onRefresh}
          onEditSeats={() => {
            setTicketModal(null);
            setSeatModal(true);
          }}
          onChangeSeat={(seat) => {
            const returnTicket = ticketModal;
            setTicketModal(null);
            setSwapSeat({ seat, returnTo: { kind: 'ticket', ticket: returnTicket } });
          }}
          onReleaseSeat={(seat) => {
            // Single-seat detail release. After confirm, drop user
            // back on home (seat is gone, ticket modal would be
            // showing a stale reference).
            setTicketModal(null);
            setReleaseConfirm({
              seats: [seat],
              returnTo: { kind: 'close-group' }, // no return-to needed
            });
          }}
        />
      )}
      {movieModal && (
        <MovieDetailModal movie={movieModal} onClose={() => setMovieModal(null)} />
      )}
      {profileModal && (
        <ProfileModal
          identity={identity}
          token={token}
          onClose={() => setProfileModal(false)}
          onRefresh={onRefresh}
        />
      )}
      {celebration && (
        <CelebrationOverlay
          seats={celebration.seats}
          movieTitle={celebration.movieTitle}
          onClose={() => setCelebration(null)}
        />
      )}
      {inviteModal && (
        <InviteModal
          token={token}
          available={seatMath.available || seatMath.total - seatMath.placed - seatMath.delegated}
          seatPills={inviteModal.seatPills || null}
          preselectedPills={inviteModal.preselectedPills || null}
          onClose={() => setInviteModal(null)}
          onCreated={onRefresh}
        />
      )}
      {manageDelegation && (
        <DelegationManageModal
          delegation={manageDelegation}
          token={token}
          onClose={() => setManageDelegation(null)}
          onRefresh={onRefresh}
        />
      )}
      {swapSeat && (
        <SwapSeatModal
          currentSeat={swapSeat.seat}
          theaterLayouts={theaterLayouts}
          portal={portal}
          seats={seats}
          onRefresh={onRefresh}
          onClose={() => {
            const ret = swapSeat.returnTo;
            setSwapSeat(null);
            if (ret?.kind === 'group') setGroupModal(ret.group);
          }}
        />
      )}
      {releaseConfirm && (
        <ReleaseSeatConfirm
          seats={releaseConfirm.seats}
          onConfirm={async () => {
            // Group by (theater, showing) so we can call unplace once
            // per (showing, theater) with the full seat list. Each
            // unplace POSTs one assignment at a time inside useSeats
            // anyway, but the grouping is cleaner.
            const buckets = new Map();
            for (const s of releaseConfirm.seats) {
              const key = `${s.theater_id}:${s.showing_number || 1}`;
              if (!buckets.has(key)) buckets.set(key, { showingNum: s.showing_number || 1, theaterId: s.theater_id, ids: [] });
              buckets.get(key).ids.push(`${s.row}-${s.num}`);
            }
            for (const b of buckets.values()) {
              const showingId = SHOWING_NUMBER_TO_ID[b.showingNum];
              await seats.unplace(showingId, b.theaterId, b.ids);
            }
            if (onRefresh) await onRefresh();
          }}
          onClose={() => {
            const ret = releaseConfirm.returnTo;
            setReleaseConfirm(null);
            // After release: if we came from a group modal that still
            // has seats, reopen it (per-seat release path). If the
            // group is now empty (whole-group release), don't reopen.
            if (ret?.kind === 'group') {
              // Re-derive the live group from fresh tickets. If it's
              // gone (all seats released), skip the reopen.
              const stillExists = tickets.find((g) => g.id === ret.group?.id);
              if (stillExists && stillExists.seats.length > 0) {
                setGroupModal(stillExists);
              }
            }
            // 'close-group' returnTo: do nothing, user lands on home.
          }}
        />
      )}
      {moveGroup && (
        <MoveGroupModal
          group={moveGroup.group}
          theaterLayouts={theaterLayouts}
          portal={portal}
          seats={seats}
          onRefresh={onRefresh}
          onClose={() => {
            const ret = moveGroup.returnTo;
            setMoveGroup(null);
            if (ret?.kind === 'group') {
              // Re-derive the live group from fresh tickets. The
              // group's id is (theater + showing) so post-move it's
              // the same id but with new seat labels.
              const fresh = tickets.find((g) => g.id === ret.group?.id);
              if (fresh) setGroupModal(fresh);
            }
          }}
        />
      )}
    </div>
  );
}
