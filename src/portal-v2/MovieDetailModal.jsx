// MovieDetailModal — page-style modal showing the trailer + full synopsis.
// Lifted look-and-feel from the homepage's movie cards.
//
// 2026-05-18 — schedule block added (Phase 5.7+ item C). The Early/Late
// × Auditorium grid renders for EVERY film, including those in "Pending"
// state. Previously the modal had no schedule at all; the chat doc and
// Scott's walk both flagged that even pending films should show the
// time + auditorium so sponsors can plan around them.

import { useMemo } from 'react';
import { formatRottenBadge } from '../portal/movieScores.js';

function showingLabel(num) {
  return num === 1 ? 'Early · 4:30 PM' : num === 2 ? 'Late · 7:15 PM' : '';
}

export function MovieDetailModal({ movie, allShowtimes = [], theaterLayouts = null, onClose, onSelectSeats }) {
  const rt = formatRottenBadge(movie);
  const streamUid = movie.stream_uid || movie.streamUid;
  const trailerUrl = streamUid
    ? `https://customer-iy642ze20tq7w2hz.cloudflarestream.com/${streamUid}/iframe?autoplay=false&muted=false&loop=false&controls=true&preload=metadata`
    : movie.trailer_url || movie.trailerUrl;

  // Build a map of theater_id → display name so we can render auditorium
  // labels alongside each Early/Late slot for this film.
  const theaterNameById = useMemo(() => {
    const m = {};
    const list = theaterLayouts?.theaters || [];
    list.forEach((t) => { m[t.id] = t.name || `Auditorium ${t.id}`; });
    return m;
  }, [theaterLayouts]);

  // Every showtime for THIS movie, sorted Early → Late then by theater.
  const filmShowtimes = useMemo(() => {
    const id = movie.movie_id || movie.id;
    return (allShowtimes || [])
      .filter((s) => (s.movie_id || s.id) === id)
      .slice()
      .sort((a, b) => {
        if (a.showing_number !== b.showing_number) {
          return (a.showing_number || 0) - (b.showing_number || 0);
        }
        return (a.theater_id || 0) - (b.theater_id || 0);
      });
  }, [movie, allShowtimes]);

  // Group showtimes by showing_number so each row is one showtime with
  // all auditoriums listed inline as small pills (Scott 2026-05-18:
  // "Early 4:30, auditorium 8, 9 — one line. Late 7:15, auditorium 5, 8").
  const showtimeGroups = useMemo(() => {
    const map = new Map();
    for (const s of filmShowtimes) {
      const k = s.showing_number || 1;
      if (!map.has(k)) {
        map.set(k, { showingNumber: k, theaters: [] });
      }
      map.get(k).theaters.push(s);
    }
    return [...map.values()].sort((a, b) => a.showingNumber - b.showingNumber);
  }, [filmShowtimes]);

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal wide stripped">
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Lineup</div>
            <div className="p2-modal-title">{movie.movie_title || movie.title}</div>
          </div>
          <button
            className="p2-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p2-modal-body" style={{ padding: 0 }}>
          {movie.backdrop_url && (
            <div
              style={{
                position: 'relative',
                aspectRatio: '21 / 9',
                background: '#050817',
                borderBottom: '1px solid var(--p2-rule)',
              }}
            >
              <img
                src={movie.backdrop_url}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.7,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(11,17,50,0.95), rgba(11,17,50,0.2) 60%, transparent)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 20,
                  right: 20,
                  bottom: 18,
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 16,
                  alignItems: 'end',
                }}
              >
                {movie.poster_url && (
                  <img
                    src={movie.poster_url}
                    alt={`${movie.movie_title || movie.title} poster`}
                    style={{
                      width: 96,
                      aspectRatio: '2 / 3',
                      objectFit: 'cover',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.24)',
                      boxShadow: '0 12px 30px rgba(0,0,0,0.34)',
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="p2-movie-meta-row" style={{ marginTop: 0 }}>
                    {movie.rating && <span className="p2-badge">{movie.rating}</span>}
                    {(movie.runtime_minutes || movie.runtime) && (
                      <span className="p2-badge">
                        {movie.runtime_minutes || movie.runtime} min
                      </span>
                    )}
                    {rt && <span className="p2-badge rt">🍅 {rt}</span>}
                    {movie.year && <span className="p2-badge">{movie.year}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: '24px' }}>
            <p
              style={{
                color: 'rgba(255,255,255,0.86)',
                fontSize: 16,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {movie.synopsis || 'Synopsis unavailable.'}
            </p>

            {/* Schedule block — ALWAYS renders for every film, including
                Pending-state. Grouped by showtime (Scott 2026-05-18):
                each showing gets one row; the auditoriums for that
                showing are listed inline as small pills on the same
                line. Example:  "Early · 4:30 PM   [Aud 8]  [Aud 9]"
                                "Late  · 7:15 PM   [Aud 5]  [Aud 8]" */}
            {showtimeGroups.length > 0 && (
              <div className="p2-movie-schedule">
                <div className="p2-eyebrow">Schedule</div>
                <div className="p2-movie-schedule-grid">
                  {showtimeGroups.map((g) => (
                    <div
                      key={`grp-${g.showingNumber}`}
                      className="p2-movie-schedule-row"
                    >
                      <span className="p2-pill p2-pill-showing">
                        {showingLabel(g.showingNumber)}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        {g.theaters.map((s) => {
                          const name =
                            theaterNameById[s.theater_id] ||
                            `Auditorium ${s.theater_id}`;
                          // Compact label: "Aud 8" instead of "Auditorium 8"
                          const compact = name.replace(/^Auditorium\s+/i, 'Aud ');
                          return (
                            <span
                              key={`${g.showingNumber}-${s.theater_id}`}
                              className="p2-pill p2-pill-aud"
                            >
                              {compact}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trailerUrl && (
              <div
                style={{
                  marginTop: 22,
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: '#000',
                  border: '1px solid var(--p2-rule)',
                  aspectRatio: '16 / 9',
                }}
              >
                <iframe
                  src={trailerUrl}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title={`${movie.movie_title || movie.title} trailer`}
                  style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="p2-modal-footer">
          {onSelectSeats ? (
            <>
              <button type="button" className="p2-btn ghost sm" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="p2-btn primary"
                onClick={() => onSelectSeats(movie)}
              >
                Select seats for this film →
              </button>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--p2-subtle)', fontSize: 13 }}>
                Pick seats for this film when your selection window opens.
              </span>
              <button type="button" className="p2-btn ghost sm" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
