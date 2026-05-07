import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { config } from '../config.js';
import { BRAND, FONT_DISPLAY } from '../brand/tokens.js';
import { GalaWordmark, Icon, Logo, TierBadge } from '../brand/atoms.jsx';
import { useFinalize } from '../hooks/useFinalize.js';
import ConfirmationScreen from './ConfirmationScreen.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import {
  DelegateForm,
  DelegateManage,
  GroupTab,
  NightTab,
  SeatAssignSheet,
  TicketManage,
  TicketsTab,
  adaptPortalToMobileData,
} from './Mobile.jsx';
import SeatPickSheet from './components/SeatPickSheet.jsx';
import PostPickSheet from './components/PostPickSheet.jsx';
import AssignTheseSheet from './components/AssignTheseSheet.jsx';
import PostPickDinnerSheet from './components/PostPickDinnerSheet.jsx';
import { formatRottenBadge } from './movieScores.js';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const firstNameFor = (name) => (name || 'Sponsor').trim().split(/\s+/)[0] || 'Sponsor';

const Stat = ({ icon, value, label, tone = 'default', testId, onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
  <Tag
    className={`desktop-parity-stat desktop-parity-stat--${tone}`}
    data-testid={testId}
    onClick={onClick}
  >
    <span className="desktop-parity-stat-icon">
      <Icon name={icon} size={16} stroke={2} />
    </span>
    <span>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  </Tag>
  );
};

const DesktopModal = ({ open, onClose, title, children, wide = false, forceDark = true }) => {
  if (!open) return null;
  return (
    <div className="desktop-modal-backdrop" onClick={onClose}>
      <div
        className={`desktop-modal ${forceDark ? 'force-dark-vars' : ''} ${wide ? 'desktop-modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <div className="desktop-modal-header">
          <strong>{title}</strong>
          <button aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="desktop-modal-body scroll-container">{children}</div>
      </div>
    </div>
  );
};

const LineupCard = ({ movie, onOpen }) => {
  const rtBadge = formatRottenBadge(movie);
  return (
    <button
      className="desktop-lineup-card"
      data-testid="desktop-lineup-card"
      onClick={() => onOpen?.(movie)}
    >
      <div
        className="desktop-lineup-poster force-dark"
        style={{
          background: movie.posterUrl
            ? `url(${movie.posterUrl}) center/cover`
            : `linear-gradient(160deg, ${BRAND.indigo}, ${BRAND.navyDeep})`,
        }}
      >
        {rtBadge && <span className="desktop-lineup-score">{rtBadge}</span>}
        {!movie.posterUrl && <span>{movie.short || movie.title}</span>}
      </div>
      <div className="desktop-lineup-copy">
        <strong>{movie.title}</strong>
        <span>{[movie.rating, movie.runtime ? `${movie.runtime} min` : null].filter(Boolean).join(' · ')}</span>
      </div>
    </button>
  );
};

const TicketLine = ({ ticket, onOpen }) => {
  const seats = ticket.seats.map((seat) => seat.replace('-', '')).join(', ');
  return (
    <button className="desktop-parity-ticket" data-testid="desktop-placed-ticket-card" onClick={() => onOpen(ticket)}>
      <div
        className="desktop-parity-ticket-poster force-dark"
        style={{
          background: ticket.posterUrl
            ? `url(${ticket.posterUrl}) center/cover`
            : `linear-gradient(160deg, ${BRAND.red}, ${BRAND.navyDeep})`,
        }}
      >
        {!ticket.posterUrl && <span>{ticket.movieShort || 'Gala'}</span>}
      </div>
      <div className="desktop-parity-ticket-copy">
        <strong>{ticket.movieTitle || ticket.movieShort || 'Movie showing'}</strong>
        <small>{[ticket.showTime, ticket.theaterName, seats].filter(Boolean).join(' · ')}</small>
      </div>
      <Icon name="chev" size={14} />
    </button>
  );
};

const CenterTicketCard = ({ ticket, onOpen }) => (
  <button className="desktop-center-ticket" onClick={() => onOpen(ticket)}>
    <div
      className="desktop-center-ticket-poster force-dark"
      style={{
        background: ticket.posterUrl
          ? `url(${ticket.posterUrl}) center/cover`
          : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
      }}
    />
    <div className="desktop-center-ticket-copy">
      <strong>{ticket.movieTitle || 'Movie showing'}</strong>
      <span>{[ticket.showTime, ticket.theaterName].filter(Boolean).join(' · ')}</span>
      <div>
        {ticket.seats.slice(0, 8).map((seat) => (
          <em key={seat}>{seat.replace('-', '')}</em>
        ))}
        {ticket.seats.length > 8 && <small>+{ticket.seats.length - 8}</small>}
      </div>
    </div>
    <span className="desktop-center-ticket-action">Manage</span>
  </button>
);

export default function Desktop({
  portal,
  token,
  theaterLayouts,
  seats,
  isDev,
  openSheetOnMount = false,
  onRefresh,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const data = useMemo(
    () => adaptPortalToMobileData(portal, theaterLayouts),
    [portal, theaterLayouts]
  );
  const {
    finalize,
    finalizing,
    error: finalizeError,
    clearError: clearFinalizeError,
    confirmationData,
    setConfirmationData,
  } = useFinalize({
    apiBase: config.apiBase,
    token,
    onRefresh,
    initialConfirmationData: location.state?.confirmation || null,
  });

  const [seatPickOpen, setSeatPickOpen] = useState(false);
  const [postPick, setPostPick] = useState(null);
  const [assignThese, setAssignThese] = useState(null);
  const [dinnerOpen, setDinnerOpen] = useState(false);
  const [ticketSheet, setTicketSheet] = useState(null);
  const [seatPicker, setSeatPicker] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [delegationSheet, setDelegationSheet] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [movieDetail, setMovieDetail] = useState(null);
  const [desktopTab, setDesktopTab] = useState(null);

  useEffect(() => {
    if (openSheetOnMount) setSeatPickOpen(true);
  }, [openSheetOnMount]);

  if (!data) return null;

  const placed = data.tickets.reduce((sum, ticket) => sum + ticket.seats.length, 0);
  const assignedCount = data.tickets
    .filter((t) => t.guestName || t.localGuestId)
    .reduce((sum, ticket) => sum + ticket.seats.length, 0);
  const delegatedAway = data.seatMath?.delegated ?? 0;
  const personalQuota = Math.max(0, data.blockSize - delegatedAway);
  const stillOpen = Math.max(0, personalQuota - placed);
  const dinners = data.tickets.flatMap((ticket) => ticket.assignmentRows || []);
  const dinnersPicked = dinners.filter((row) => row.dinner_choice).length;
  const guestsInvited = data.delegations.length;
  const headline = stillOpen > 0 ? `${stillOpen} to place` : 'Seats placed';
  const subtitle = data.isDelegation
    ? data.subline
    : [data.company, plural(data.blockSize, 'seat')].filter(Boolean).join(' · ');
  const canFinalize = placed >= personalQuota && personalQuota > 0;
  const lineup = data.lineup.slice(0, 4);
  const firstUnassigned = data.tickets.find((t) => !t.guestName && !t.localGuestId);

  const goSeats = async () => {
    if (onRefresh) await onRefresh();
    setSeatPickOpen(true);
  };

  const onUnplace = async () => {
    if (!ticketSheet || !seats) return;
    await seats.unplace(ticketSheet.theaterId, ticketSheet.seats);
    setTicketSheet(null);
  };

  const inviteForSeat = (seat, theaterId) => {
    setSeatPicker(null);
    setInviteOpen({ seat, theaterId });
  };

  const onDelegationCreated = async (newDeleg) => {
    const seatBinding = typeof inviteOpen === 'object' ? inviteOpen : null;
    if (seatBinding && newDeleg?.id) {
      await fetch(`${config.apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: seatBinding.theaterId,
          seat_ids: [seatBinding.seat],
          delegation_id: newDeleg.id,
        }),
      }).catch(() => {});
    }
    if (onRefresh) await onRefresh();
  };

  if (confirmationData) {
    return (
      <ConfirmationScreen
        name={data.name}
        data={confirmationData}
        isDev={isDev}
        logoUrl={data.logoUrl}
        onEdit={() => {
          setConfirmationData(null);
          navigate('', { replace: true });
        }}
      />
    );
  }

  return (
    <div className="desktop-parity-stage">
      <div className="desktop-parity-shell" data-testid="desktop-parity-shell">
        <aside className="desktop-parity-panel desktop-parity-identity" aria-label="Sponsor summary">
          <div className="desktop-parity-brand">
            <Logo size={26} dark />
            <GalaWordmark size={10} />
          </div>

          <div className="desktop-parity-title">
            <TierBadge tier={data.tier} />
            <h1 style={{ fontFamily: FONT_DISPLAY }}>{data.name || 'Sponsor portal'}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <div className="desktop-parity-progress" aria-label={`${placed} of ${personalQuota} seats placed`}>
            <div>
              <strong>{headline}</strong>
              <span>
                {placed} of {personalQuota || data.blockSize} placed
              </span>
            </div>
            <div className="desktop-parity-meter">
              <span
                style={{
                  width: `${Math.min(100, Math.round((placed / Math.max(1, personalQuota || data.blockSize)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="desktop-parity-stat-grid">
            <Stat icon="ticket" value={placed} label="Placed" tone={stillOpen > 0 ? 'warn' : 'good'} />
            <Stat
              icon="users"
              value={guestsInvited}
              label="Guests invited"
              testId="desktop-guests-stat"
              onClick={() => setDesktopTab('guests')}
            />
            <Stat icon="seat" value={stillOpen} label="Open" />
            <Stat icon="qr" value={dinnersPicked} label={`of ${dinners.length} dinners`} />
          </div>
        </aside>

        <main className="desktop-main-panel" data-testid="desktop-main-panel">
          <section className="desktop-main-hero">
            <div className="desktop-main-kicker">
              <span>Lights · Camera · Take Action · 2026</span>
              <TierBadge tier={data.tier} />
            </div>
            <h2 style={{ fontFamily: FONT_DISPLAY }}>
              {firstNameFor(data.name)}, your gala portal is ready.
            </h2>
            <p>
              Place seats, assign guests, choose dinners, and keep the night-of details in one
              desktop workspace.
            </p>
            <div className="desktop-main-actions">
              <button className="desktop-primary-action" data-testid="cta-place-seats" onClick={goSeats}>
                <Icon name="seat" size={17} />
                {stillOpen > 0 ? `Place ${stillOpen} seat${stillOpen === 1 ? '' : 's'}` : 'Edit seats'}
              </button>
              {firstUnassigned && (
                <button className="desktop-secondary-action" onClick={() => setTicketSheet(firstUnassigned)}>
                  <Icon name="users" size={16} />
                  Assign guests
                </button>
              )}
              <button
                className="desktop-secondary-action"
                data-testid="desktop-open-tickets"
                onClick={() => setDesktopTab('tickets')}
              >
                <Icon name="ticket" size={16} />
                Tickets
              </button>
              <button
                className="desktop-secondary-action"
                data-testid="desktop-open-guests"
                onClick={() => setDesktopTab('guests')}
              >
                <Icon name="users" size={16} />
                Guests invited
              </button>
              <button
                className="desktop-secondary-action"
                data-testid="desktop-open-night"
                onClick={() => setDesktopTab('night')}
              >
                <Icon name="moon" size={16} />
                Tonight
              </button>
              <button className="desktop-secondary-action" onClick={() => setSettingsOpen(true)}>
                <Icon name="user" size={16} />
                Settings
              </button>
            </div>
          </section>

          <section className="desktop-progress-row">
            <div>
              <strong>{data.blockSize}</strong>
              <span>Total seats</span>
            </div>
            <div>
              <strong>{placed}</strong>
              <span>Placed</span>
            </div>
            <div>
              <strong>{assignedCount}</strong>
              <span>With guests</span>
            </div>
            <div>
              <strong>{stillOpen}</strong>
              <span>Still open</span>
            </div>
          </section>

          <section className="desktop-center-section">
            <div className="desktop-center-heading">
              <div>
                <span>Your tickets</span>
                <strong>{placed > 0 ? `${plural(placed, 'seat')} placed` : 'No seats placed yet'}</strong>
              </div>
              <button onClick={goSeats}>
                <Icon name="plus" size={14} />
                Add showing
              </button>
            </div>

            {data.tickets.length > 0 ? (
              <div className="desktop-center-ticket-list">
                {data.tickets.map((ticket) => (
                  <CenterTicketCard key={ticket.id} ticket={ticket} onOpen={setTicketSheet} />
                ))}
              </div>
            ) : (
              <button className="desktop-center-empty" onClick={goSeats}>
                <Icon name="seat" size={22} />
                <strong>Start by placing seats</strong>
                <span>The seat map will open wide on desktop so you can scan rows and showtimes.</span>
              </button>
            )}
          </section>
        </main>

        <aside className="desktop-parity-panel desktop-parity-snapshot" aria-label="Ticket snapshot">
          <section className="desktop-lineup-rail" data-testid="desktop-lineup-rail">
            <div className="desktop-parity-panel-heading">
              <span>Film lineup</span>
              <strong>{plural(data.lineup.length, 'film')}</strong>
            </div>
            <div className="desktop-lineup-grid">
              {lineup.map((movie) => (
                <LineupCard key={movie.id} movie={movie} onOpen={setMovieDetail} />
              ))}
            </div>
          </section>

          <section className="desktop-right-section">
            <div className="desktop-parity-panel-heading">
              <span>Placed seats</span>
              <strong>{placed} / {data.blockSize}</strong>
            </div>
            <div className="desktop-parity-ticket-list">
              {data.tickets.length > 0 ? (
                data.tickets.map((ticket) => (
                  <TicketLine key={ticket.id} ticket={ticket} onOpen={setTicketSheet} />
                ))
              ) : (
                <div className="desktop-parity-empty" data-testid="desktop-placed-seat-placeholder">
                  <Icon name="seat" size={18} />
                  <span>Seats will appear here after placement.</span>
                </div>
              )}
            </div>
          </section>

          <section className="desktop-right-section">
            <div className="desktop-parity-panel-heading">
              <span>Tonight at a glance</span>
              <strong>{data.daysOut} days out</strong>
            </div>
            <div className="desktop-parity-night">
              <Icon name="pin" size={16} />
              <div>
                <strong>Megaplex Legacy Crossing</strong>
                <span>Wednesday, June 10 · doors 3:15 PM</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <DesktopModal open={seatPickOpen} onClose={() => setSeatPickOpen(false)} title="Place seats" wide forceDark>
        <SeatPickSheet
          portal={portal}
          theaterLayouts={theaterLayouts}
          seats={seats}
          blockSize={data.blockSize}
          token={token}
          apiBase={config.apiBase}
          onRefresh={onRefresh}
          onMovieDetail={setMovieDetail}
          variant="modal"
          onCommitted={(placedSeats) => {
            setSeatPickOpen(false);
            setPostPick(placedSeats);
          }}
          onClose={() => setSeatPickOpen(false)}
        />
      </DesktopModal>

      <DesktopModal open={!!postPick} onClose={() => setPostPick(null)} title="Seats placed">
        {postPick && (
          <PostPickSheet
            placed={postPick}
            missingDinnerCount={
              (portal?.myAssignments || [])
                .filter((a) => postPick.seatIds?.includes(`${a.row_label}-${a.seat_num}`))
                .filter((a) => !a.dinner_choice).length
            }
            onAssign={() => setAssignThese(postPick)}
            onPickDinners={() => setDinnerOpen(true)}
            onDone={() => {
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
            canFinalize={canFinalize}
            onFinalize={async () => {
              await finalize();
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
            finalizing={finalizing}
            error={finalizeError}
            onClearError={clearFinalizeError}
          />
        )}
      </DesktopModal>

      <DesktopModal open={!!assignThese} onClose={() => setAssignThese(null)} title="Assign seats">
        {assignThese && (
          <AssignTheseSheet
            placed={assignThese}
            delegations={data.delegations || []}
            token={token}
            apiBase={config.apiBase}
            onSaved={async () => {
              if (onRefresh) await onRefresh();
              setAssignThese(null);
              setPostPick(null);
            }}
            onSkip={() => setAssignThese(null)}
            onInviteNew={() => {
              setAssignThese(null);
              setInviteOpen(true);
            }}
          />
        )}
      </DesktopModal>

      <DesktopModal open={dinnerOpen} onClose={() => setDinnerOpen(false)} title="Pick dinners">
        {dinnerOpen && postPick && (
          <PostPickDinnerSheet
            assignments={(portal?.myAssignments || []).filter((r) =>
              postPick.seatIds?.includes(`${r.row_label}-${r.seat_num}`)
            )}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh}
            canFinalize={canFinalize}
            onFinalize={async () => {
              await finalize();
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
            finalizing={finalizing}
            error={finalizeError}
            onClearError={clearFinalizeError}
            onDone={() => {
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
          />
        )}
      </DesktopModal>

      <DesktopModal open={!!ticketSheet} onClose={() => setTicketSheet(null)} title="Manage ticket">
        {ticketSheet && (
          <TicketManage
            ticket={ticketSheet}
            delegations={data.delegations}
            onTapSeat={(seat) => setSeatPicker({ seat, ticket: ticketSheet })}
            onUnplace={onUnplace}
            onClose={() => setTicketSheet(null)}
            pending={seats?.pending}
          />
        )}
      </DesktopModal>

      <DesktopModal
        open={!!seatPicker}
        onClose={() => setSeatPicker(null)}
        title={seatPicker ? `Seat ${seatPicker.seat.replace('-', '')}` : ''}
      >
        {seatPicker && (
          <SeatAssignSheet
            seat={seatPicker.seat}
            ticket={seatPicker.ticket}
            delegations={data.delegations}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={() => setSeatPicker(null)}
            onInviteNew={inviteForSeat}
          />
        )}
      </DesktopModal>

      <DesktopModal
        open={!!inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={typeof inviteOpen === 'object' ? `Invite for seat ${inviteOpen.seat.replace('-', '')}` : 'Invite to seats'}
      >
        <DelegateForm
          token={token}
          apiBase={config.apiBase}
          available={
            typeof inviteOpen === 'object'
              ? Math.max(1, data.seatMath?.available ?? 1)
              : (data.seatMath?.available ?? 0)
          }
          lockSeats={typeof inviteOpen === 'object' ? 1 : null}
          onCreated={onDelegationCreated}
          onClose={() => setInviteOpen(false)}
        />
      </DesktopModal>

      <DesktopModal open={!!delegationSheet} onClose={() => setDelegationSheet(null)} title="Manage invite">
        {delegationSheet && (
          <DelegateManage
            delegation={delegationSheet}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={() => setDelegationSheet(null)}
          />
        )}
      </DesktopModal>

      <DesktopModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsSheet
          identity={portal?.identity}
          isDelegation={data.isDelegation}
          token={token}
          apiBase={config.apiBase}
          onClose={() => setSettingsOpen(false)}
          onSaved={onRefresh}
        />
      </DesktopModal>

      <DesktopModal
        open={!!desktopTab}
        onClose={() => setDesktopTab(null)}
        title={
          desktopTab === 'tickets'
            ? 'All tickets'
            : desktopTab === 'guests'
              ? 'Guests invited'
              : 'Tonight details'
        }
        wide
      >
        <div className="desktop-tab-modal" data-testid="desktop-tab-modal">
          {desktopTab === 'tickets' && (
            <TicketsTab
              data={data}
              onOpenTicket={(ticket) => {
                setDesktopTab(null);
                setTicketSheet(ticket);
              }}
              onPlaceSeats={() => {
                setDesktopTab(null);
                goSeats();
              }}
              token={token}
              apiBase={config.apiBase}
              onRefresh={onRefresh}
              onOpenDelegation={(delegation) => {
                if (!delegation) return;
                setDesktopTab(null);
                setDelegationSheet(delegation);
              }}
            />
          )}
          {desktopTab === 'guests' && (
            <GroupTab
              data={data}
              onInvite={() => {
                setDesktopTab(null);
                setInviteOpen(true);
              }}
              onOpenDelegation={(delegation) => {
                setDesktopTab(null);
                setDelegationSheet(delegation);
              }}
            />
          )}
          {desktopTab === 'night' && <NightTab />}
        </div>
      </DesktopModal>

      {movieDetail && (
        <MovieDetailSheet
          movie={movieDetail}
          showLabel={
            movieDetail.__showLabel ||
            (movieDetail.__showingNumber === 1
              ? 'Early showing'
              : movieDetail.__showingNumber === 2
                ? 'Late showing'
                : '')
          }
          showTime={movieDetail.__showTime}
          variant="modal"
          onClose={() => setMovieDetail(null)}
        />
      )}
    </div>
  );
}
