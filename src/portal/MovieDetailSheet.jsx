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

import React from 'react';
import { TOKENS, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
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
  // Reset the inner scroll container to top whenever the sheet opens
  // for a new movie. Without this, if the user previously opened a
  // sheet and scrolled, the next open could remember scrollTop and
  // start mid-content. (Browsers also occasionally try to maintain
  // scroll position across slideUp animations.)
  const innerRef = React.useRef(null);
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.scrollTop = 0;
  }, [movie?.id]);

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
        ref={innerRef}
        className="scroll-container"
        style={{
          width: '100%',
          maxWidth: isModal ? 640 : '100%',
          maxHeight: isModal ? '90vh' : '94%',
          background: TOKENS.surface.sheet,
          borderTopLeftRadius: TOKENS.radius.xl,
          borderTopRightRadius: TOKENS.radius.xl,
          borderBottomLeftRadius: isModal ? TOKENS.radius.xl : 0,
          borderBottomRightRadius: isModal ? TOKENS.radius.xl : 0,
          overflow: 'auto',
          paddingBottom: isModal ? 28 : 'max(28px, env(safe-area-inset-bottom))',
          color: TOKENS.text.primary,
          fontFamily: FONT_UI,
          boxShadow: isModal ? TOKENS.shadow.cardElevated : TOKENS.shadow.sheet,
          border: `1px solid ${TOKENS.rule}`,
        }}
      >
        {/* Hero backdrop with darkening gradient overlay + close X.
            Smaller on mobile sheet (180px) so more content fits above
            the fold; full 240px on desktop modal. */}
        <div
          style={{
            position: 'relative',
            height: isModal ? 240 : 180,
            background: backdrop
              ? `linear-gradient(to bottom, rgba(13,27,61,0.4), rgba(13,27,61,0.95)), url(${backdrop}) center/cover no-repeat`
              : `linear-gradient(160deg, ${TOKENS.brand.navyMid}, ${TOKENS.brand.navyDeep})`,
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

        <div style={{ padding: '20px 24px 24px' }}>
          <h2
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              fontWeight: 600,
              margin: '0 0 8px',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: TOKENS.text.primary,
            }}
          >
            {movie.title}
            {movie.year ? (
              <span style={{ color: TOKENS.text.tertiary, fontWeight: 500 }}>
                {' '}
                ({movie.year})
              </span>
            ) : null}
          </h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {movie.rating && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: TOKENS.radius.sm,
                  background: TOKENS.fill.secondary,
                  color: TOKENS.text.primary,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                {movie.rating}
              </span>
            )}
            {movie.runtime && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: TOKENS.radius.sm,
                  background: TOKENS.fill.secondary,
                  color: TOKENS.text.primary,
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono), monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {movie.runtime}m
              </span>
            )}
            {movie.tmdbScore != null && movie.tmdbScore >= 1 && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: TOKENS.radius.sm,
                  background: TOKENS.fill.secondary,
                  color: TOKENS.text.primary,
                  fontSize: 11,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={`${movie.tmdbVoteCount?.toLocaleString() || 0} votes on TMDB`}
              >
                <span style={{ color: TOKENS.brand.gold }}>★</span>
                {movie.tmdbScore.toFixed(1)}
              </span>
            )}
            {(showLabel || showTime) && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: TOKENS.radius.sm,
                  background: TOKENS.fill.secondary,
                  color: TOKENS.text.secondary,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {showLabel}
                {showTime ? ` · ${showTime}` : ''}
              </span>
            )}
          </div>

          {trailerSrc && (
            <div
              style={{
                aspectRatio: '16 / 9',
                width: '100%',
                borderRadius: TOKENS.radius.md,
                overflow: 'hidden',
                background: TOKENS.brand.navyDeep,
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
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  color: TOKENS.text.tertiary,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                About
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: TOKENS.text.primary,
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
