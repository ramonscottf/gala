// MovieDetailSheet — full-height bottom sheet with backdrop hero + poster
// inset + trailer embed (Cloudflare Stream first, YouTube fallback) +
// synopsis. Triggered by F3's "More about this movie →" link on the
// selected movie card in MobileWizard step 2.
//
// All metadata comes from the portal API JOIN — the showtime row carries
// movie_title / poster_url / backdrop_url / trailer_url / stream_uid /
// synopsis / rating / year / runtime_minutes already.
//
// Trailer playback priority (per Phase 1.7 plan):
//   1. Cloudflare Stream — if streamUid is set, embed customer
//      `customer-iy642ze20tq7w2hz`'s player (premium quality, no
//      YouTube branding).
//   2. YouTube fallback — parse the YouTube ID from trailer_url and
//      embed via youtube-nocookie. Logic ported from
//      gala-seats-app.html buildTrailerEmbed (1835-1862).
//
// CSP — public/_headers allows frame-src for *.cloudflarestream.com
// and youtube-nocookie.com so neither embed is blocked.

import { BRAND, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
import { Icon } from '../brand/atoms.jsx';

const STREAM_CUSTOMER = 'customer-iy642ze20tq7w2hz';

// Returns an iframe src for the trailer or '' if neither source resolves.
// Prefers Cloudflare Stream when available; falls back to YouTube via the
// nocookie domain (CSP-friendly + no tracking pixels by default).
export function buildTrailerSrc(movie) {
  if (!movie) return '';
  if (movie.streamUid) {
    return `https://${STREAM_CUSTOMER}.cloudflarestream.com/${movie.streamUid}/iframe?autoplay=true&muted=true&loop=true&controls=true&preload=auto`;
  }
  const url = (movie.trailerUrl || '').trim();
  if (!url) return '';
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
  if (!videoId) return '';
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export default function MovieDetailSheet({
  movie,
  showLabel,
  showTime,
  onClose,
  variant = 'sheet',
}) {
  if (!movie) return null;
  const backdrop = movie.backdropUrl || movie.posterUrl;
  const trailerSrc = buildTrailerSrc(movie);
  const isModal = variant === 'modal';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 60,
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
        className="scroll-container"
        style={{
          width: '100%',
          // Cap at 640px on desktop so the sheet doesn't stretch the
          // hero backdrop beyond reasonable viewing width on a 1440px+
          // monitor; mobile keeps full width.
          maxWidth: isModal ? 640 : '100%',
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
        {/* Hero backdrop with darkening gradient overlay + close X. */}
        <div
          style={{
            position: 'relative',
            height: 240,
            background: backdrop
              ? `linear-gradient(to bottom, rgba(13,27,61,0.4), rgba(13,27,61,0.95)), url(${backdrop}) center/cover no-repeat`
              : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
            display: 'flex',
            alignItems: 'flex-end',
            padding: '14px',
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 'max(14px, env(safe-area-inset-top))',
              right: 14,
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
          {movie.posterUrl && (
            <div
              style={{
                position: 'absolute',
                top: 'max(110px, env(safe-area-inset-top))',
                left: 18,
                width: 88,
                height: 120,
                borderRadius: 8,
                background: `url(${movie.posterUrl}) center/cover no-repeat`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                border: `1px solid var(--rule)`,
              }}
            />
          )}
        </div>

        <div style={{ padding: '18px 22px 22px' }}>
          <h2
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
            {movie.title}
            {movie.year ? (
              <span style={{ color: 'var(--mute)', fontWeight: 500 }}> ({movie.year})</span>
            ) : null}
          </h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {movie.rating && (
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
                {movie.rating}
              </span>
            )}
            {movie.runtime && (
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
                {movie.runtime} min
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

          {trailerSrc && (
            <div
              style={{
                aspectRatio: '16 / 9',
                width: '100%',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#000',
                marginBottom: 16,
              }}
            >
              <iframe
                src={trailerSrc}
                title={`${movie.title} trailer`}
                width="100%"
                height="100%"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ display: 'block', border: 0 }}
              />
            </div>
          )}

          {movie.synopsis && (
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
                {movie.synopsis}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
