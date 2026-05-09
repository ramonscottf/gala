// HomeTabV2 — V2 IA, Phase 5 (new Home)
//
// What changed from V1's HomeTab:
//   - Single hybrid "X seats still to place" status card replaced by
//     TWO clear-intent action cards: Place / Invite (matches the
//     mock the user signed off on)
//   - Intro paragraph above the cards: "Two things to do here…"
//     plus the dinner-lock reminder so the deadline is visible
//   - Lineup grid (2x2) → horizontal scrollable slider, four cards
//     visible at a time, more posters fit in less vertical space
//
// What stays from V1:
//   - TicketHero (imported)
//   - Lineup card poster style + score badge (inlined)
//   - MovieDetailSheet on tap (parent passes onMovieDetail)
//   - All callbacks (onPlaceSeats, onInvite, onAssign, onMovieDetail,
//     onManageTickets) — same wiring
//
// Behind the same ?v2=1 flag as TicketsTabV2. V1 HomeTab still mounts
// when v2 is off, so nothing breaks for live sponsors.

import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { TicketHero } from '../Mobile.jsx';
import { highestRottenScore } from '../movieScores.js';
import { DINNER_LOCK_DAYS } from './SeatDetailSheet.jsx';

export default function HomeTabV2({
  data,
  onPlaceSeats,
  onInvite,
  onAssign,
  onMovieDetail,
  onManageTickets,
  token,
  apiBase,
}) {
  const {
    tier,
    name,
    subline,
    blockSize,
    tickets,
    lineup,
    daysOut,
    logoUrl,
    seatMath,
    isDelegation,
    company,
  } = data;

  const placed = tickets.reduce((n, t) => n + t.seats.length, 0);
  const assignedCount = tickets
    .filter((t) => t.guestName || t.localGuestId)
    .reduce((n, t) => n + t.seats.length, 0);
  const delegatedAway = seatMath?.delegated ?? 0;
  const personalQuota = Math.max(0, blockSize - delegatedAway);
  const openCount = Math.max(0, personalQuota - placed);
  const availableToGive = seatMath?.available ?? 0;
  const canInviteGuest = !isDelegation && availableToGive > 0 && typeof onInvite === 'function';

  // Dinner lock countdown — shown alongside daysOut so the kitchen
  // deadline is always visible. T = 7 days before gala (lockDate).
  const daysToLock = daysOut != null ? Math.max(0, daysOut - DINNER_LOCK_DAYS) : null;

  return (
    <div className="scroll-container" style={{ flex: 1, paddingBottom: 130 }}>
      <TicketHero
        tier={tier}
        name={name}
        subline={subline}
        blockSize={blockSize}
        placed={placed}
        assigned={assignedCount}
        openCount={openCount}
        logoUrl={logoUrl}
        daysOut={daysOut}
        isDelegation={isDelegation}
        inviterCompany={company}
      />

      {/* Intro copy — sets the model in two sentences. Hidden for
          delegations because their flow is different (their host
          already explained context to them). */}
      {!isDelegation && (
        <div
          style={{
            margin: '14px 22px 0',
            padding: '0',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--mute)',
          }}
        >
          Two things to do here:{' '}
          <strong style={{ color: 'var(--ink-on-ground)' }}>place your seats</strong>{' '}
          and{' '}
          <strong style={{ color: 'var(--ink-on-ground)' }}>invite guests</strong>.
          {daysToLock != null && daysToLock > 0 && (
            <>
              {' '}Pick movies the day-of, but{' '}
              <strong style={{ color: 'var(--accent-italic)' }}>
                dinners lock in {daysToLock} day{daysToLock === 1 ? '' : 's'}
              </strong>
              .
            </>
          )}
        </div>
      )}

      {/* Action cards */}
      <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ActionCard
          icon="🪑"
          gradient="linear-gradient(135deg,#d72846,#b32d4e)"
          title={openCount > 0 ? 'Place seats' : `All ${personalQuota} seats placed`}
          sub={
            openCount > 0
              ? `${openCount} of ${personalQuota} still to place`
              : `${assignedCount} with guests · tap to edit`
          }
          cta={openCount > 0 ? 'Place' : 'Edit'}
          ctaPrimary
          onClick={openCount > 0 ? onPlaceSeats : onManageTickets}
          testId="cta-place-seats"
        />

        {canInviteGuest && (
          <ActionCard
            icon="👥"
            gradient="linear-gradient(135deg,#a8b1ff,#6f75d8)"
            title="Invite a guest"
            sub={`${availableToGive} of your seats can go to a guest`}
            cta="Invite"
            onClick={onInvite}
            testId="cta-invite-guest"
          />
        )}
      </div>

      {/* Lineup — horizontal slider */}
      <div style={{ marginTop: 28 }}>
        <div style={{ padding: '0 22px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.5,
              color: BRAND.red,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            — The lineup
          </div>
          <h2
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              letterSpacing: -0.4,
            }}
          >
            {lineup.length} <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>films.</i>
          </h2>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
            Two showtimes · select one or split your block
          </div>
        </div>

        <div
          data-testid="mobile-lineup-slider"
          style={{
            marginTop: 14,
            paddingLeft: 22,
            paddingRight: 8,
            paddingBottom: 8,
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {lineup.map((m) => {
            const rtBadge = highestRottenScore(m);
            return (
              <button
                key={m.id}
                data-testid="mobile-lineup-card"
                onClick={() => onMovieDetail && onMovieDetail(m)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  flexShrink: 0,
                  width: 138,
                  scrollSnapAlign: 'start',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div
                  data-testid="mobile-lineup-poster"
                  style={{
                    width: '100%',
                    aspectRatio: '2 / 3',
                    borderRadius: 10,
                    background: m.posterUrl
                      ? `url(${m.posterUrl}) center/cover`
                      : `linear-gradient(160deg, ${m.color || BRAND.navyMid}, ${BRAND.navyDeep})`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: 10,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                    marginBottom: 8,
                  }}
                >
                  {!m.posterUrl && (
                    <div
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#fff',
                        lineHeight: 1.05,
                      }}
                    >
                      {m.short || m.title}
                    </div>
                  )}
                  {rtBadge && (
                    <div
                      data-testid="mobile-lineup-score"
                      style={{
                        position: 'absolute',
                        top: 7,
                        left: 7,
                        background: 'rgba(13,15,36,0.85)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        color: '#ff8a78',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '3px 7px',
                        borderRadius: 99,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: 0.2,
                        border: '1px solid rgba(255,255,255,0.14)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🍅 {rtBadge}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--ink-on-ground)',
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {m.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--mute)',
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.rating ? `${m.rating}` : ''}
                  {m.runtime ? `${m.rating ? ' · ' : ''}${m.runtime} min` : ''}
                </div>
              </button>
            );
          })}
          {/* trailing spacer so the last card has breathing room when scrolled into view */}
          <div style={{ flexShrink: 0, width: 8 }} />
        </div>
      </div>
    </div>
  );
}

// ActionCard — emoji icon + gradient bubble + title/sub + button.
// Same shape as the action cards in the mock (Place / Invite).
function ActionCard({ icon, gradient, title, sub, cta, ctaPrimary, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        background: 'var(--surface)',
        border: `1px solid var(--rule)`,
        borderRadius: 14,
        padding: '14px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow:
          '0 6px 16px -10px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-on-ground)' }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--mute)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      </div>
      <div
        style={{
          padding: '8px 16px',
          borderRadius: 99,
          background: ctaPrimary
            ? 'linear-gradient(135deg,#d72846,#b32d4e)'
            : 'rgba(168,177,255,0.18)',
          color: ctaPrimary ? '#fff' : BRAND.indigoLight,
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {cta}
      </div>
    </button>
  );
}
