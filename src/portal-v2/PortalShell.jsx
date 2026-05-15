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
import { MovieDetailModal } from './MovieDetailModal.jsx';
import { ProfileModal } from './ProfileModal.jsx';
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

// Build the per-seat ticket list from portal state.
function buildTickets(portal) {
  const assignments = portal?.myAssignments || [];
  const showtimes = portal?.showtimes || [];
  // Index by (theater_id, showing_number) → showtime row.
  const showtimeKey = (tId, sNum) => `${tId}:${sNum}`;
  const stIndex = {};
  showtimes.forEach((s) => {
    stIndex[showtimeKey(s.theater_id, s.showing_number)] = s;
  });

  return assignments.map((a) => {
    const key = showtimeKey(a.theater_id, a.showing_number || 1);
    const st = stIndex[key] || {};
    return {
      id: `${a.theater_id}:${a.showing_number || 1}:${a.row_label}-${a.seat_num}`,
      seatLabel: `${a.row_label}${a.seat_num}`,
      row: a.row_label,
      num: a.seat_num,
      theater_id: a.theater_id,
      showing_number: a.showing_number || 1,
      showingLabel: formatShowing(a.showing_number || 1),
      movie_title: st.movie_title || 'TBD',
      poster_url: st.poster_url,
      auditorium: a.theater_id,
      guest_name: a.guest_name,
      raw: a,
    };
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

function Hero({ identity, seatMath, tierAccess }) {
  const firstName = (identity?.contactName || '').split(' ')[0] || identity?.company || 'there';
  const placed = seatMath?.placed || 0;
  const total = seatMath?.total || 0;
  const daysOut = daysUntilGala();
  const isStaff = identity?.kind === 'staff';
  const isDelegate = identity?.kind === 'delegate';
  const tier = identity?.tier || (isStaff ? 'Staff' : isDelegate ? 'Guest' : 'Sponsor');

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

  return (
    <section className="p2-section p2-hero">
      <div className="p2-eyebrow p2-hero-eyebrow">
        Lights · Camera · Take Action · 2026
      </div>
      <h1>{headline}</h1>
      <p className="p2-hero-sub">{sub}</p>
      <div className="p2-pill-row">
        <div className="p2-info-pill">
          <strong>Wednesday, June 10, 2026</strong>
          <span>{daysOut} {daysOut === 1 ? 'day' : 'days'} out</span>
        </div>
        <div className="p2-info-pill">
          <strong>Megaplex at Legacy Crossing</strong>
          <span>Centerville, Utah</span>
        </div>
        <div className="p2-info-pill">
          <strong>{tier} {isStaff ? 'access' : isDelegate ? 'invite' : 'sponsor'}</strong>
          <span>{total} {total === 1 ? 'seat' : 'seats'} reserved for you</span>
        </div>
      </div>
    </section>
  );
}

function StatusCard({ identity, seatMath, tierAccess, onPlace, onPlaceMore }) {
  const placed = seatMath?.placed || 0;
  const total = seatMath?.total || 0;
  const remaining = Math.max(0, total - placed);
  const delegated = seatMath?.delegated || 0;
  const open = tierAccess?.open === true;
  const tier = identity?.tier || 'Sponsor';

  let primaryLabel;
  if (remaining === 0 && total > 0) primaryLabel = 'Edit my seats';
  else if (placed > 0) primaryLabel = `Place ${remaining} more`;
  else primaryLabel = `Pick my ${total === 1 ? 'seat' : 'seats'}`;

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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {open ? (
                <button className="p2-btn primary" type="button" onClick={onPlace}>
                  {primaryLabel} →
                </button>
              ) : (
                <span className="p2-chip" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  Window not open yet
                </span>
              )}
            </div>
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

function TicketsSection({ tickets, seatMath, onOpenTicket, onPlaceMore }) {
  const total = seatMath?.total || 0;
  const placed = tickets.length;
  const remaining = Math.max(0, total - placed);

  return (
    <section className="p2-section">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Your tickets</div>
          <h2>Tickets <span className="p2-italic-flair">placed</span></h2>
        </div>
        <p>
          {placed} of {total} placed
          {remaining > 0 ? <> · {remaining} still to choose</> : <> · all set</>}
        </p>
      </div>

      <div className="p2-ticket-grid">
        {tickets.map((t) => (
          <button
            key={t.id}
            type="button"
            className="p2-ticket-card"
            onClick={() => onOpenTicket(t)}
          >
            <div
              className="p2-ticket-poster"
              style={
                t.poster_url
                  ? { backgroundImage: `url(${t.poster_url})` }
                  : undefined
              }
              aria-hidden="true"
            />
            <div className="p2-ticket-body">
              <div className="p2-ticket-title">
                <span className="p2-ticket-seat">{t.seatLabel}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                  {t.movie_title}
                </span>
              </div>
              <div className="p2-ticket-meta">
                {t.showingLabel} · Auditorium {t.auditorium}
                {t.guest_name ? <> · {t.guest_name}</> : null}
              </div>
            </div>
            <span className="p2-ticket-arrow">→</span>
          </button>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            className="p2-ticket-card placeholder"
            onClick={onPlaceMore}
            style={
              // When there are zero placed tickets the placeholder spans
              // both grid columns so the page doesn't read as a half-filled
              // table. With placed tickets present, the placeholder sits in
              // line with them.
              tickets.length === 0 ? { gridColumn: '1 / -1' } : undefined
            }
          >
            + Place {remaining === 1 ? 'your seat' : `${remaining} more seats`}
          </button>
        )}
      </div>
    </section>
  );
}

function GroupSection({ portal }) {
  const delegations = portal?.childDelegations || [];
  const delegatedAssignments = portal?.childDelegationAssignments || [];
  if (delegations.length === 0) return null;

  return (
    <section className="p2-section">
      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Your group</div>
          <h2>Guests you <span className="p2-italic-flair">invited</span></h2>
        </div>
        <p>
          {delegations.length} {delegations.length === 1 ? 'invite' : 'invites'} out · they pick
          their own seats inside their portal.
        </p>
      </div>
      <div className="p2-ticket-grid">
        {delegations.map((d) => {
          const placed = delegatedAssignments.filter((a) => a.delegation_id === d.id).length;
          return (
            <div key={d.id} className="p2-ticket-card" style={{ cursor: 'default' }}>
              <div
                className="p2-avatar"
                style={{ width: 48, height: 48, fontSize: 14, flexShrink: 0 }}
              >
                {initialsOf(d.guest_name || d.guest_email)}
              </div>
              <div className="p2-ticket-body">
                <div className="p2-ticket-title" style={{ fontSize: 14 }}>
                  {d.guest_name || 'Unnamed guest'}
                </div>
                <div className="p2-ticket-meta">
                  {placed} of {d.seat_count} placed ·{' '}
                  {d.guest_email || d.guest_phone || 'no contact yet'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  const [ticketModal, setTicketModal] = useState(null);
  const [movieModal, setMovieModal] = useState(null);
  const [profileModal, setProfileModal] = useState(false);

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

  const tickets = useMemo(() => buildTickets(portal), [portal]);

  const openSeatModal = () => setSeatModal(true);
  const closeSeatModal = async () => {
    setSeatModal(false);
    // Refresh after the modal closes, in case the user placed seats.
    if (onRefresh) await onRefresh();
  };

  return (
    <div className="p2-shell">
      <BrandNav identity={identity} onOpenProfile={() => setProfileModal(true)} />

      <Hero identity={identity} seatMath={seatMath} tierAccess={tierAccess} />

      <StatusCard
        identity={identity}
        seatMath={seatMath}
        tierAccess={tierAccess}
        onPlace={openSeatModal}
        onPlaceMore={openSeatModal}
      />

      {(tickets.length > 0 || seatMath.total > 0) && (
        <TicketsSection
          tickets={tickets}
          seatMath={seatMath}
          onOpenTicket={(t) => setTicketModal(t)}
          onPlaceMore={openSeatModal}
        />
      )}

      <GroupSection portal={portal} />

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
        />
      )}
      {ticketModal && (
        <TicketDetailModal
          ticket={ticketModal}
          portal={portal}
          token={token}
          onClose={() => setTicketModal(null)}
          onRefresh={onRefresh}
          onEditSeats={() => {
            setTicketModal(null);
            setSeatModal(true);
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
    </div>
  );
}
