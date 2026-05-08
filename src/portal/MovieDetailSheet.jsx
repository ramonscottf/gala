// MovieDetailSheet — full-height bottom sheet with backdrop hero + poster
// inset + in-app trailer playback (Cloudflare Stream / R2 video) +
// synopsis. Triggered by F3's "More about this movie →" link on the
// selected movie card in MobileWizard step 2.
//
// All metadata comes from the portal API JOIN — the showtime row carries
// movie_title / poster_url / backdrop_url / trailer_url / stream_uid /
// synopsis / rating / year / runtime_minutes already.
//
// Sponsor-facing playback intentionally does not link out to YouTube.
// The DB carries Stream UIDs for the active gala lineup; trailer_video_url
// remains supported for direct R2-hosted MP4/WebM assets.

import React from 'react';
import { BRAND, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
import { Icon } from '../brand/atoms.jsx';
import { enrichMovieScores, formatRottenBadge } from './movieScores.js';

const STREAM_CUSTOMER = 'customer-iy642ze20tq7w2hz';

export function buildTrailerSource(movie, { allowYouTubeFallback = false } = {}) {
  if (!movie) return null;
  const streamUid = movie.streamUid || movie.stream_uid;
  if (streamUid) {
    return {
      kind: 'iframe',
      src: `https://${STREAM_CUSTOMER}.cloudflarestream.com/${streamUid}/iframe?autoplay=true&muted=true&loop=true&controls=true&preload=auto`,
    };
  }
  const directVideo = (movie.trailerVideoUrl || movie.trailer_video_url || '').trim();
  if (directVideo) {
    return { kind: 'video', src: directVideo };
  }
  if (!allowYouTubeFallback) return null;
  const url = (movie.trailerUrl || '').trim();
  if (!url) return null;
  let videoId = '';
  let match = url.match(/youtu\.be\/([\w-]{6,})/i);
  if (match) videoId = match[1];
  if (!videoId) {
    match = url.match(/[?&]v=([\w-]{6,})/i);
    if (match) videoId = match[1];
  }
  if (!videoId) {
    match = url.match(/youtube\.com\/embed\/([\w-]{6,})/i);
    if (match) videoId = match[1];
  }
  if (!videoId && /^[\w-]{11}$/.test(url)) videoId = url;
  if (!videoId) return null;
  return {
    kind: 'iframe',
    src: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
  };
}

// Kept as a small compatibility wrapper for older unit/preview callers.
export function buildTrailerSrc(movie, opts) {
  return buildTrailerSource(movie, opts)?.src || '';
}

const TrailerPlayer = ({ source, title, modal = false }) => {
  if (!source?.src) return null;
  return (
    <div
      data-testid="movie-trailer-player"
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#000',
        marginBottom: 16,
        boxShadow: modal ? '0 14px 36px rgba(0,0,0,0.32)' : 'none',
      }}
    >
      {source.kind === 'video' ? (
        <video
          data-testid="movie-trailer-frame"
          src={source.src}
          title={`${title} trailer`}
          width="100%"
          height="100%"
          controls
          playsInline
          preload="metadata"
          style={{ display: 'block', border: 0, objectFit: 'cover' }}
        />
      ) : (
        <iframe
          data-testid="movie-trailer-frame"
          src={source.src}
          title={`${title} trailer`}
          width="100%"
          height="100%"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ display: 'block', border: 0 }}
        />
      )}
    </div>
  );
};

export default function MovieDetailSheet({
  movie,
  showLabel,
  showTime,
  onClose,
  variant = 'sheet',
}) {
  const displayMovie = enrichMovieScores(movie);
  if (!displayMovie) return null;
  const backdrop = displayMovie.backdropUrl || displayMovie.posterUrl;
  const trailerSource = buildTrailerSource(displayMovie, { allowYouTubeFallback: false });
  const trailerSrc = trailerSource?.src || '';
  const isModal = variant === 'modal';
  const [trailerOpen, setTrailerOpen] = React.useState(false);
  // Reset the inner scroll container to top whenever the sheet opens
  // for a new movie. Without this, if the user previously opened a
  // sheet and scrolled, the next open could remember scrollTop and
  // start mid-content. (Browsers also occasionally try to maintain
  // scroll position across slideUp animations.)
  const innerRef = React.useRef(null);
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.scrollTop = 0;
    setTrailerOpen(!isModal && !!trailerSrc);
  }, [displayMovie?.id, isModal, trailerSrc]);

  return (
    <div
      onClick={onClose}
      style={{
        position: isModal ? 'fixed' : 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: isModal ? 140 : 60,
        display: 'flex',
        // sheet: anchor to bottom of viewport (mobile bottom-sheet pattern).
        // modal: center vertically with horizontal padding (desktop modal).
        alignItems: isModal ? 'center' : 'flex-end',
        justifyContent: 'center',
        padding: isModal ? '40px 24px' : 0,
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        ref={innerRef}
        data-testid="movie-detail-sheet"
        className="scroll-container force-dark-vars"
        style={{
          width: '100%',
          // Cap at 640px on desktop so the sheet doesn't stretch the
          // hero backdrop beyond reasonable viewing width on a 1440px+
          // monitor; mobile keeps full width.
          maxWidth: isModal ? 680 : '100%',
          // 90vh on modal so there's always padding around the edge;
          // 94% on sheet so the modal hugs the bottom safe-area inset.
          maxHeight: isModal ? '90vh' : '94%',
          background: BRAND.navyDeep,
          // Sheet rounds the top only (the bottom is flush with the
          // viewport edge); modal rounds all four corners.
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: isModal ? 22 : 0,
          borderBottomRightRadius: isModal ? 22 : 0,
          overflow: 'auto',
          paddingBottom: isModal ? 28 : 'max(28px, env(safe-area-inset-bottom))',
          color: '#fff',
          fontFamily: FONT_UI,
          boxShadow: isModal ? '0 24px 64px rgba(0,0,0,0.55)' : 'none',
        }}
      >
        {/* Hero backdrop. The image is its own absolutely-positioned layer
            so we can apply soft top + bottom fade masks that blend cleanly
            into the navy sheet instead of cutting off with a hard edge.
            Mobile is 220px (up from 180) to give the cinematic image room
            to breathe; desktop modal stays at 260px. */}
        <div
          style={{
            position: 'relative',
            height: isModal ? 260 : 220,
            background: BRAND.navyDeep,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '14px',
          }}
        >
          {backdrop ? (
            <>
              {/* Backdrop image layer with WebKit + standard mask for a
                  feathered fade at top (into the sheet edge) and bottom
                  (into the poster row), so the photo never cuts off
                  with a hard horizontal line. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `url(${backdrop}) center/cover no-repeat`,
                  WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%)',
                  maskImage:
                    'linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%)',
                }}
              />
              {/* Color wash on top of the image — left-to-right navy tint
                  so titles stay legible, plus a stronger bottom-edge
                  darken that meets the sheet body seamlessly. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(15,22,57,0.55) 0%, rgba(15,22,57,0.25) 35%, rgba(15,22,57,0.55) 75%, rgba(15,22,57,0.98) 100%)',
                }}
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
              }}
            />
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 'max(14px, env(safe-area-inset-top))',
              right: 14,
              zIndex: 2,
              width: 36,
              height: 36,
              borderRadius: 99,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: 0,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px 22px 22px', position: 'relative' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: displayMovie.posterUrl ? '100px minmax(0, 1fr)' : '1fr',
              gap: 16,
              alignItems: 'start',
              marginTop: isModal ? -84 : -72,
              marginBottom: 16,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {displayMovie.posterUrl && (
              <div
                data-testid="movie-detail-poster"
                style={{
                  width: 100,
                  aspectRatio: '2 / 3',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.26)',
                  boxShadow:
                    '0 18px 40px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset',
                  border: `1px solid rgba(255,255,255,0.10)`,
                  overflow: 'hidden',
                }}
              >
                <img
                  data-testid="movie-detail-poster-img"
                  src={displayMovie.posterUrl}
                  alt={`${displayMovie.title} poster`}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}
            <div style={{ minWidth: 0, paddingTop: isModal ? 96 : 84 }}>
              <h2
                data-testid="movie-detail-title"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 26,
                  fontWeight: 700,
                  margin: '0 0 8px',
                  lineHeight: 1.15,
                  letterSpacing: -0.4,
                  color: '#fff',
                }}
              >
                {displayMovie.title}
                {displayMovie.year ? (
                  <span style={{ color: 'var(--mute)', fontWeight: 500 }}> ({displayMovie.year})</span>
                ) : null}
              </h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {displayMovie.rating && (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: '#fff',
                      color: BRAND.ink,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                    }}
                  >
                    {displayMovie.rating}
                  </span>
                )}
                {displayMovie.runtime && (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.10)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {displayMovie.runtime} min
                  </span>
                )}
                {formatRottenBadge(displayMovie, { audience: true }) && (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(220,68,52,0.18)',
                      color: '#ff8a78',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    title={displayMovie.rtPending ? 'Rotten Tomatoes score pending' : 'Rotten Tomatoes critics and audience scores'}
                  >
                    <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1 }}>🍅</span>
                    {formatRottenBadge(displayMovie, { audience: true })}
                  </span>
                )}
                {(showLabel || showTime) && (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(168,177,255,0.18)',
                      color: 'var(--accent-italic)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                    }}
                  >
                    <Icon name="play" size={9} stroke={2.4} /> {showLabel}
                    {showTime ? ` · ${showTime}` : ''}
                  </span>
                )}
              </div>
              {isModal && trailerSrc && (
                <button
                  type="button"
                  onClick={() => setTrailerOpen((open) => !open)}
                  style={{
                    marginTop: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--accent-italic)',
                    fontSize: 12,
                    fontWeight: 800,
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    fontFamily: FONT_UI,
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="play" size={12} stroke={2.4} /> {trailerOpen ? 'Hide trailer' : 'Watch trailer'}
                </button>
              )}
            </div>
          </div>

          {trailerOpen && trailerSource && (
            <TrailerPlayer source={trailerSource} title={displayMovie.title} modal={isModal} />
          )}

          {displayMovie.synopsis && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  color: 'var(--accent-text)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                About
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {displayMovie.synopsis}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
