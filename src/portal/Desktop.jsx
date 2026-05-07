import Mobile, { adaptPortalToMobileData } from './Mobile.jsx';
import { BRAND, FONT_DISPLAY } from '../brand/tokens.js';
import { GalaWordmark, Icon, Logo, TierBadge } from '../brand/atoms.jsx';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const Stat = ({ icon, value, label, tone = 'default' }) => (
  <div className={`desktop-parity-stat desktop-parity-stat--${tone}`}>
    <span className="desktop-parity-stat-icon">
      <Icon name={icon} size={16} stroke={2} />
    </span>
    <span>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  </div>
);

const TicketLine = ({ ticket }) => {
  const seats = ticket.seats.map((seat) => seat.replace('-', '')).join(', ');
  return (
    <div className="desktop-parity-ticket">
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
        <small>
          {[ticket.showTime, ticket.theaterName, seats].filter(Boolean).join(' · ')}
        </small>
      </div>
    </div>
  );
};

const LineupPoster = ({ movie }) => (
  <div
    className="desktop-parity-lineup-poster force-dark"
    title={movie.title}
    style={{
      background: movie.posterUrl
        ? `url(${movie.posterUrl}) center/cover`
        : `linear-gradient(160deg, ${BRAND.indigo}, ${BRAND.navyDeep})`,
    }}
  >
    {!movie.posterUrl && <span>{movie.short || movie.title}</span>}
  </div>
);

export default function Desktop(props) {
  const data = adaptPortalToMobileData(props.portal, props.theaterLayouts);

  if (!data) {
    return (
      <div className="desktop-parity-stage">
        <div className="desktop-parity-phone">
          <Mobile {...props} desktopFrame />
        </div>
      </div>
    );
  }

  const placed = data.tickets.reduce((sum, ticket) => sum + ticket.seats.length, 0);
  const delegatedAway = data.seatMath?.delegated ?? 0;
  const personalQuota = Math.max(0, data.blockSize - delegatedAway);
  const stillOpen = Math.max(0, personalQuota - placed);
  const dinners = data.tickets.flatMap((ticket) => ticket.assignmentRows || []);
  const dinnersPicked = dinners.filter((row) => row.dinner_choice).length;
  const delegatedSeats = data.delegations.reduce((sum, d) => sum + (d.seatsAllocated || 0), 0);
  const headline = stillOpen > 0 ? `${stillOpen} to place` : 'Seats placed';
  const subtitle = data.isDelegation
    ? data.subline
    : [data.company, plural(data.blockSize, 'seat')].filter(Boolean).join(' · ');
  const ticketLines = data.tickets.slice(0, 4);
  const lineup = data.lineup.slice(0, 6);

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
            <Stat icon="users" value={delegatedSeats} label="Delegated" />
            <Stat icon="seat" value={stillOpen} label="Open" />
            <Stat icon="qr" value={dinnersPicked} label={`of ${dinners.length} dinners`} />
          </div>
        </aside>

        <section className="desktop-parity-phone-wrap" aria-label="Live sponsor portal">
          <div className="desktop-parity-phone-label">
            <span>Live portal</span>
            <strong>{stillOpen > 0 ? 'Seat placement ready' : 'Ticket management ready'}</strong>
          </div>
          <div className="desktop-parity-phone" data-testid="desktop-live-mobile-shell">
            <Mobile {...props} desktopFrame />
          </div>
        </section>

        <aside className="desktop-parity-panel desktop-parity-snapshot" aria-label="Ticket snapshot">
          <div className="desktop-parity-panel-heading">
            <span>Tonight at a glance</span>
            <strong>{data.daysOut} days out</strong>
          </div>

          <div className="desktop-parity-ticket-list">
            {ticketLines.length > 0 ? (
              ticketLines.map((ticket) => <TicketLine key={ticket.id} ticket={ticket} />)
            ) : (
              <div className="desktop-parity-empty">
                <Icon name="seat" size={18} />
                <span>Seats will appear here after placement.</span>
              </div>
            )}
          </div>

          {lineup.length > 0 && (
            <div className="desktop-parity-lineup">
              <div className="desktop-parity-panel-heading">
                <span>Film lineup</span>
                <strong>{plural(data.lineup.length, 'film')}</strong>
              </div>
              <div className="desktop-parity-lineup-strip">
                {lineup.map((movie) => (
                  <LineupPoster key={movie.id} movie={movie} />
                ))}
              </div>
            </div>
          )}

          <div className="desktop-parity-night">
            <Icon name="pin" size={16} />
            <div>
              <strong>Megaplex Legacy Crossing</strong>
              <span>Wednesday, June 10 · doors 3:15 PM</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
