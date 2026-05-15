// MovieDetailModal — page-style modal showing the trailer + full synopsis.
// Lifted look-and-feel from the homepage's movie cards.

import { formatRottenBadge } from '../portal/movieScores.js';

export function MovieDetailModal({ movie, onClose }) {
  const rt = formatRottenBadge(movie);
  const streamUid = movie.stream_uid || movie.streamUid;
  const trailerUrl = streamUid
    ? `https://customer-iy642ze20tq7w2hz.cloudflarestream.com/${streamUid}/iframe?autoplay=false&muted=false&loop=false&controls=true&preload=metadata`
    : movie.trailer_url || movie.trailerUrl;

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
          <span style={{ color: 'var(--p2-subtle)', fontSize: 13 }}>
            Pick seats for this film when your selection window opens.
          </span>
          <button type="button" className="p2-btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
