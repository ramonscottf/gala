// HomeTab — V2 IA, Phase 5 (new Home)
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
// Behind the same ?v2=1 flag as TicketsTab. V1 HomeTab still mounts
// when v2 is off, so nothing breaks for live sponsors.

import { useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { TicketHero } from '../Portal.jsx';
import { highestRottenScore } from '../movieScores.js';

export default function HomeTab({
  data,
  onPlaceSeats,
  onInvite,
  onAssign,
  onMovieDetail,
  onManageTickets,
  onPickMeals,
  onViewTicket,
  onEditSeats,
  onEditMeals,
  token,
  apiBase,
  footerSlot = null,
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

  // Phase 5.12 — meals are a top-level action now, not buried inside
  // the seat-pick flow. Logan's note: "Three things to do — pick
  // movie/seats, choose dinner, and invite guests." Count seats
  // that have been placed by this sponsor (i.e. show up in their
  // own tickets) but haven't picked a dinner yet. When all placed
  // seats have meals, the card shifts to a completion state.
  const placedRows = tickets.flatMap((t) => t.assignmentRows || []);
  const mealsNeededCount = placedRows.filter(
    (r) => !r.dinner_choice || String(r.dinner_choice).trim() === ''
  ).length;
  // The Pick meals card only appears once they have something
  // placed. If placed === 0 there are no meals to pick yet — the
  // Place seats card is the only action that makes sense.
  const showMealsCard = placed > 0;

  // Phase 5.13 — fully-done collapse. Kara feedback: when every
  // seat is placed AND every placed seat has a meal AND (sponsors
  // only) there's nothing left to give to a guest, the two
  // action cards become noise. Hide them and let the ticket hero
  // card carry the page. Stat grid up top also flips to a single
  // completion check + "X seats placed · meals chosen" line.
  // Delegations don't have the canInviteGuest gate; their done
  // state is just openCount===0 + meals.
  const allDone =
    openCount === 0 &&
    placed > 0 &&
    mealsNeededCount === 0 &&
    (isDelegation || !canInviteGuest);

  return (
    <div className="scroll-container home-tab" style={{ flex: 1, paddingBottom: 130 }}>
      <div className="home-tab__hero" data-testid="home-hero-region">
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
          allDone={allDone}
        />
      </div>

      <div className="home-tab__body">
        <section className="home-tab__actions" data-testid="home-actions-region" aria-label="Sponsor actions">
          {/* Intro copy — sets the model in two sentences. Hidden for
              delegations because their flow is different (their host
              already explained context to them). */}
          {!isDelegation && (
            <div
              className="home-tab__intro"
              style={{
                margin: '14px 22px 0',
                padding: '0',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--mute)',
              }}
            >
              <strong style={{ color: 'var(--ink-on-ground)' }}>Reserve your seats and dinners.</strong>
              {' '}Want to invite guests? They can join your showing or pick their own. Their choice.
            </div>
          )}

          {/* Action cards */}
          <div
            className="home-tab__actions-list"
            style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {!allDone && (
              <ActionCard
                icon="🪑"
                gradient="linear-gradient(135deg,#CB262C,#a01f24)"
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
            )}

            {/* Phase 5.12 — Pick meals card. Only appears once seats are
                placed (no meals to pick before there are seats). When
                every placed seat has a meal, the card shifts to a
                completion state but stays visible so the user can still
                tap to change meals before the lock date. */}
            {showMealsCard && !allDone && (
              <ActionCard
                icon="🍽️"
                gradient="linear-gradient(135deg,#ffc24d,#f5a623)"
                title={mealsNeededCount > 0 ? 'Pick meals' : 'All meals picked'}
                sub={
                  mealsNeededCount > 0
                    ? `${mealsNeededCount} of your seat${mealsNeededCount === 1 ? '' : 's'} still need${mealsNeededCount === 1 ? 's' : ''} a meal`
                    : `${placed} meal${placed === 1 ? '' : 's'} ready · tap to change`
                }
                cta={mealsNeededCount > 0 ? 'Pick' : 'Edit'}
                ctaPrimary={mealsNeededCount > 0}
                onClick={onPickMeals}
                testId="cta-pick-meals"
              />
            )}

            {canInviteGuest && (
              <ActionCard
                icon="👥"
                gradient="linear-gradient(135deg,#4a7df0,#2858d6)"
                title="Invite a guest"
                sub={`${availableToGive} of your seats can go to a guest`}
                cta="Invite"
                onClick={onInvite}
                testId="cta-invite-guest"
              />
            )}

            {/* Your ticket(s) — hero entry to TicketDetailSheet (QR + per-seat
                dinner + meta). Only renders when this caller has at least one
                ticket of their own (i.e. seats they placed under their token).
                For a sponsor who has fully delegated their entire block, the
                tickets array is empty and we skip — their ticket lives on the
                delegate's portal in that scenario. */}
            {tickets.length > 0 && typeof onViewTicket === 'function' && (
              tickets.map((t) => (
                <TicketHeroCard
                  key={t.id}
                  ticket={t}
                  onViewTicket={onViewTicket}
                  onEditSeats={onEditSeats}
                  onEditMeals={onEditMeals}
                />
              ))
            )}
          </div>
        </section>

        {/* Lineup — horizontal slider */}
        <aside
          className="home-tab__lineup"
          data-testid="home-lineup-region"
          style={{ marginTop: 28 }}
          aria-label="Movie lineup"
        >
        <div className="home-tab__lineup-header" style={{ padding: '0 22px' }}>
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
            {lineup.length} <i className="shimmer-text" style={{ fontWeight: 500 }}>films.</i>
          </h2>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
            Two showtimes · select one or split your block
          </div>
        </div>

        <div
          className="home-tab__lineup-slider"
          data-testid="mobile-lineup-slider"
          style={{
            marginTop: 14,
            paddingLeft: 22,
            paddingRight: 8,
            paddingBottom: 8,
            display: 'flex',
            // Phase 5.7 — explicitly anchor cards to the top of the
            // flex line. The default stretch behavior worked in
            // theory but combined with button content stacking in
            // block flow it left ambiguity about where the poster
            // sat when titles wrapped to different line counts.
            // flex-start guarantees poster tops align across cards.
            alignItems: 'flex-start',
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
                className="home-tab__lineup-card"
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
                    // Phase 5.7 — reserve space for two lines so a
                    // one-line title ('Paddington 2') and a two-line
                    // title ('How to Train Your Dragon') occupy the
                    // same vertical block. Without this the rating
                    // row below sits at different heights across
                    // cards and the lineup looks ragged at the bottom
                    // even though poster tops are aligned. Height =
                    // fontSize × lineHeight × WebkitLineClamp.
                    minHeight: `calc(12px * 1.25 * 2)`,
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
          <div className="home-tab__lineup-spacer" style={{ flexShrink: 0, width: 8 }} />
        </div>
        </aside>
      </div>
      {footerSlot}
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
            ? 'linear-gradient(135deg,#CB262C,#a01f24)'
            : 'linear-gradient(135deg,#2858d6,#CB262C)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          boxShadow: ctaPrimary
            ? '0 8px 20px -8px rgba(203,38,44,0.45)'
            : '0 8px 20px -8px rgba(40,88,214,0.45)',
        }}
      >
        {cta}
      </div>
    </button>
  );
}

// TicketHeroCard — fast-path entry on Home into TicketDetailSheet.
//
// Visual: poster thumbnail (left) + show label / movie title / showtime
// stack (middle) + View / Edit pill CTAs (right). Same surface treatment
// as ActionCard so the home column reads as one rhythmic stack of cards.
//
// One card per ticket — when a sponsor's block spans both early and late
// showings, the home column shows two ticket cards stacked. Tapping
// View opens the per-showing TicketDetailSheet. Tapping Edit reveals
// an inline picker (Seats / Meals) below the card so the user can
// route straight to the right edit sheet without bouncing through
// the Tickets tab. Phase 5.13.
function TicketHeroCard({ ticket, onViewTicket, onEditSeats, onEditMeals }) {
  const [editOpen, setEditOpen] = useState(false);
  const seatCount = (ticket.assignmentRows || ticket.seats || []).length;
  const showLabel = ticket.showLabel || '';
  const showTime = ticket.showTime || '';
  const subParts = [];
  if (showLabel) subParts.push(showLabel);
  if (showTime) subParts.push(showTime);
  if (seatCount) subParts.push(`${seatCount} seat${seatCount === 1 ? '' : 's'}`);
  const sub = subParts.join(' · ');

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid var(--rule)`,
        borderRadius: 14,
        boxShadow:
          '0 6px 16px -10px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {/* Poster thumbnail — taller aspect than ActionCard's icon bubble
            to read as a movie ticket rather than a generic action. */}
        <div
          style={{
            width: 44,
            height: 60,
            borderRadius: 8,
            background: ticket.posterUrl
              ? `url(${ticket.posterUrl}) center/cover`
              : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {!ticket.posterUrl && ticket.movieShort && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 4,
                padding: '0 4px',
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.05,
              }}
            >
              {ticket.movieShort}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onViewTicket(ticket)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Caps overline mirrors the SEATS / DATE labels on the ticket
              sheet itself — small visual rhyme so this reads as a
              preview of that sheet. */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.2,
              color: 'var(--mute)',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            Your ticket
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink-on-ground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ticket.movieTitle || 'Showing TBD'}
          </div>
          {sub && (
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
          )}
        </button>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(typeof onEditSeats === 'function' || typeof onEditMeals === 'function') && (
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              aria-expanded={editOpen}
              data-testid="cta-edit-ticket"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: 99,
                background: editOpen ? 'rgba(168,177,255,0.18)' : 'rgba(255,255,255,0.06)',
                color: editOpen ? BRAND.indigoLight : 'var(--ink-on-ground)',
                fontSize: 12,
                fontWeight: 700,
                border: `1px solid ${editOpen ? 'rgba(168,177,255,0.32)' : 'var(--rule)'}`,
              }}
            >
              {editOpen ? 'Close' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onViewTicket(ticket)}
            data-testid="cta-view-ticket"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '8px 14px',
              borderRadius: 99,
              background: 'rgba(168,177,255,0.18)',
              color: BRAND.indigoLight,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            View
          </button>
        </div>
      </div>

      {/* Inline edit picker — only when Edit was tapped. Two pills:
          Seats and Meals. Each routes to the parent-provided callback
          which opens the corresponding sheet. Phase 5.13 — keeps the
          edit path one tap deep instead of bouncing to Tickets tab. */}
      {editOpen && (
        <div
          style={{
            padding: '0 14px 12px',
            display: 'flex',
            gap: 8,
            borderTop: `1px solid var(--rule)`,
            paddingTop: 12,
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          {typeof onEditSeats === 'function' && (
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                onEditSeats(ticket);
              }}
              data-testid="cta-edit-seats"
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#CB262C,#a01f24)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              🪑 Edit seats
            </button>
          )}
          {typeof onEditMeals === 'function' && (
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                onEditMeals(ticket);
              }}
              data-testid="cta-edit-meals"
              style={{
                all: 'unset',
                cursor: 'pointer',
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#ffc24d,#f5a623)',
                color: BRAND.navyDeep,
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              🍽️ Edit meals
            </button>
          )}
        </div>
      )}
    </div>
  );
}
