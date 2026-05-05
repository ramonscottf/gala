// MobileWizard — 4-step seat picker for /:token/seats on mobile.
//
// Lifted from uploads/seating-chart/project/components/mobile-wizard.jsx:
// Welcome → Pick → Invite → Review. The Pick step is the meat (real
// showings / theaters / API plumbing); Welcome and Review are mostly
// presentational, Invite is a local-state stub until a guest-mutation
// API endpoint exists (TODO comments mark the sites).
//
// Step transitions:
//   1 → 2    user taps "Let's place your seats"
//   2 → 3    confirm sheet places seats AND user is at capacity, OR user
//            taps the floating "ALL SEATS PLACED" banner
//   3 → 4    user taps "Review & finish" or "Skip for now"
//   4 → exit user taps "Done", we navigate back to the boarding pass

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
import { Btn, Icon, SectionEyebrow } from '../brand/atoms.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { adaptTheater, autoPickBlock, SeatMap, SEAT_TYPES, seatById } from './SeatEngine.jsx';
import { otherTakenForTheater } from '../hooks/useSeats.js';
import { SHOWING_NUMBER_TO_ID, formatBadgeFor } from '../hooks/usePortal.js';
import { formatShowTime } from './Mobile.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';
import DinnerPicker from './components/DinnerPicker.jsx';
import { useDinnerCompleteness } from './components/useDinnerCompleteness.js';

// ── small shared bits ─────────────────────────────────────────────────

const FormatBadge = ({ format }) => {
  const map = {
    IMAX: { bg: 'rgba(244,185,66,0.18)', c: BRAND.gold, border: 'rgba(244,185,66,0.45)' },
    Premier: { bg: 'rgba(212,38,74,0.18)', c: '#ff8da4', border: 'rgba(212,38,74,0.45)' },
    Standard: { bg: 'rgba(255,255,255,0.06)', c: 'var(--mute)', border: BRAND.rule },
  };
  const s = map[format] || map.Standard;
  return (
    <span
      style={{
        padding: '2px 7px',
        borderRadius: 99,
        background: s.bg,
        color: s.c,
        border: `1px solid ${s.border}`,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1.4,
      }}
    >
      {format.toUpperCase()}
    </span>
  );
};

const PosterMiniM = ({ poster, color, label, size = 42 }) => (
  <div
    style={{
      width: size,
      height: size * 1.4,
      borderRadius: 5,
      background: poster
        ? `url(${poster}) center/cover`
        : `linear-gradient(160deg, ${color || BRAND.navyMid}, ${BRAND.navyDeep})`,
      display: 'flex',
      alignItems: 'flex-end',
      padding: 4,
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}
  >
    {!poster && label && (
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: size * 0.22,
          color: 'rgba(255,255,255,0.9)',
          lineHeight: 1.05,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    )}
  </div>
);

const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="force-dark-vars"
        style={{
          width: '100%',
          maxHeight: '85%',
          background: BRAND.navyDeep,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '8px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          borderTop: `1px solid var(--rule)`,
          animation: 'slideUp 0.25s ease-out',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 2,
            alignSelf: 'center',
            marginBottom: 14,
          }}
        />
        {title && (
          <div
            style={{
              padding: '0 22px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid var(--rule)`,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600 }}>{title}</div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.08)',
                border: 0,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="scroll-container" style={{ flex: 1, padding: '16px 22px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ── header (step counter + progress) ──────────────────────────────────

const MHeader = ({ step, total, totalAssigned, blockSize, onBack }) => {
  const { isLight } = useTheme();
  const pct = blockSize > 0 ? (totalAssigned / blockSize) * 100 : 0;
  return (
    <div
      className="page-header"
      style={{
        padding: '8px 18px 14px',
        borderBottom: `1px solid var(--rule)`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            background: 'var(--surface)',
            border: 0,
            color: isLight ? BRAND.ink : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="chevL" size={18} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: BRAND.red }}>
            STEP {step} OF {total}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Sponsor Seats</div>
        </div>
        <div style={{ width: 36 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: isLight ? 'rgba(13,18,36,0.10)' : 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, pct)}%`,
              height: '100%',
              background: '#a8b1ff',
              borderRadius: 3,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent-italic)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.5,
          }}
        >
          {totalAssigned}
          <span style={{ color: 'var(--mute)' }}>/{blockSize}</span>
        </div>
      </div>
    </div>
  );
};

const MStickyCTA = ({ children, helper }) => (
  <div
    className="tab-bar force-dark-vars"
    style={{
      padding: '14px 18px 10px',
      borderTop: `1px solid var(--rule)`,
      background: 'rgba(11,14,38,0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      flexShrink: 0,
    }}
  >
    {helper && (
      <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8, textAlign: 'center' }}>
        {helper}
      </div>
    )}
    {children}
  </div>
);

// ── Step 1: Welcome ───────────────────────────────────────────────────

const Step1Welcome = ({ onNext, blockSize, tier }) => {
  const { isLight } = useTheme();
  return (
  <div
    className="scroll-container"
    style={{
      flex: 1,
      padding: '30px 22px 18px',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <SectionEyebrow color="#ff6b8a">Welcome, sponsor</SectionEyebrow>
    <h1
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 46,
        lineHeight: 1.02,
        letterSpacing: -1,
        margin: '14px 0 0',
        fontWeight: 700,
      }}
    >
      Lights, camera,{' '}
      <i
        style={{
          background: BRAND.gradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: 500,
        }}
      >
        your seats.
      </i>
    </h1>
    <p style={{ fontSize: 15, color: 'var(--mute)', lineHeight: 1.55, marginTop: 14 }}>
      You've earned <b style={{ color: 'var(--ink-on-ground)' }}>{blockSize} seats</b> at the {tier || 'sponsor'}{' '}
      tier. Place them across two showtimes and the lineup of films — split or stay together,
      your call.
    </p>

    <div
      style={{
        marginTop: 24,
        padding: 18,
        border: `1px solid var(--rule)`,
        borderRadius: 14,
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.6,
          color: '#ff6b8a',
          marginBottom: 8,
        }}
      >
        YOUR EVENING
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          ['5:30 PM', 'Social hour & silent auction'],
          ['6:00 PM', 'Dinner (your showtime)'],
          ['Showtime', 'Select your movie & seats'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 14 }}>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--accent-italic)',
                minWidth: 80,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-on-ground)' }}>{d}</div>
          </div>
        ))}
      </div>
    </div>

    <div
      style={{
        marginTop: 18,
        padding: 14,
        borderRadius: 12,
        background: 'rgba(244,185,66,0.08)',
        border: `1px solid rgba(244,185,66,0.2)`,
        display: 'flex',
        gap: 10,
      }}
    >
      <Icon name="info" size={16} />
      <div style={{ fontSize: 13, color: isLight ? 'var(--mute)' : 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
        You can come back anytime to change seats or invite guests until <b>June 5</b>.
      </div>
    </div>

    <div style={{ flex: 1, minHeight: 24 }} />
    <Btn
      kind="primary"
      size="lg"
      full
      onClick={onNext}
      icon={<Icon name="arrowR" size={16} />}
    >
      Let's place your seats
    </Btn>
  </div>
  );
};

// ── Step 2: Pick ──────────────────────────────────────────────────────

// Phase 1.14 — exported so Mobile.jsx can render it as fullscreen
// pop-up content. The wizard still uses it via the `seats` step;
// the canonical entry is the sheet from Home/Tickets.
export const Step2Pick = ({
  portal,
  theaterLayouts,
  seats,
  blockSize,
  onAdvance,
  token,
  onDone,
  delegations = [],
  apiBase = '',
  onRefresh,
  onMovieDetail,
}) => {
  const navigate = useNavigate();
  const { isLight } = useTheme();
  const showtimes = portal?.showtimes || [];

  const showings = useMemo(() => {
    const set = new Set();
    showtimes.forEach((s) => set.add(s.showing_number));
    return [...set].sort();
  }, [showtimes]);

  // Rich showing data for the segmented pill — pulls show_start +
  // dinner_time from the earliest-start showtime per showing_number
  // (ties broken arbitrarily; in practice all theaters in a showing
  // share the same start). Phase 1.7 F2.
  const showingsRich = useMemo(() => {
    const m = new Map();
    showtimes.forEach((s) => {
      const existing = m.get(s.showing_number);
      if (!existing || (s.show_start && s.show_start < existing.show_start)) {
        m.set(s.showing_number, s);
      }
    });
    return [...m.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, s]) => ({
        number: n,
        label: n === 1 ? 'Early showing' : n === 2 ? 'Late showing' : `Show ${n}`,
        time: formatShowTime(s.show_start),
        dinnerTime: formatShowTime(s.dinner_time),
      }));
  }, [showtimes]);

  const moviesByShowing = useMemo(() => {
    const m = {};
    showtimes.forEach((s) => {
      if (!m[s.showing_number]) m[s.showing_number] = new Map();
      if (!m[s.showing_number].has(s.movie_id)) {
        m[s.showing_number].set(s.movie_id, {
          id: s.movie_id,
          title: s.movie_title,
          short: s.movie_title?.split(' ')[0] || '',
          posterUrl: s.poster_url,
          // H3 — thumbnail_url for the small movie pill (24×24 circle);
          // poster_url for the rich selected-movie card and the
          // MovieDetailSheet hero.
          thumbnailUrl: s.thumbnail_url,
          // F4 surfaces these in MovieDetailSheet — carry them through
          // from the API JOIN so the sheet doesn't need a second fetch.
          backdropUrl: s.backdrop_url,
          trailerUrl: s.trailer_url,
          streamUid: s.stream_uid,
          synopsis: s.synopsis,
          year: s.year,
          rating: s.rating,
          runtime: s.runtime_minutes,
          tmdbScore: s.tmdb_score,
          tmdbVoteCount: s.tmdb_vote_count,
          // F3 aggregates: how many auds + total seats for this movie
          // at this showing. Used in the "1 aud · 94 seats" meta line.
          theaterIds: new Set([s.theater_id]),
          totalCapacity: s.capacity || 0,
        });
      } else {
        const entry = m[s.showing_number].get(s.movie_id);
        entry.theaterIds.add(s.theater_id);
        entry.totalCapacity += s.capacity || 0;
      }
    });
    const out = {};
    Object.entries(m).forEach(([k, v]) => {
      out[k] = [...v.values()].map((e) => ({
        ...e,
        audCount: e.theaterIds.size,
      }));
    });
    return out;
  }, [showtimes]);

  const theatersForCombo = useMemo(() => {
    const out = {};
    showtimes.forEach((s) => {
      const k = `${s.showing_number}|${s.movie_id}`;
      if (!out[k]) out[k] = [];
      out[k].push({
        theaterId: s.theater_id,
        format: formatBadgeFor(s.theater_tier, s.theater_notes),
        capacity: s.capacity,
      });
    });
    return out;
  }, [showtimes]);

  const theatersById = useMemo(() => {
    const out = {};
    (theaterLayouts?.theaters || []).forEach((t) => {
      out[t.id] = t;
    });
    return out;
  }, [theaterLayouts]);

  const [showingNumber, setShowingNumber] = useState(showings[0] || 1);
  const moviesHere = moviesByShowing[showingNumber] || [];
  const [movieId, setMovieId] = useState(moviesHere[0]?.id);
  useEffect(() => {
    const list = moviesByShowing[showingNumber] || [];
    if (!list.find((m) => m.id === movieId)) setMovieId(list[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingNumber, moviesByShowing]);

  const theaterChoices = theatersForCombo[`${showingNumber}|${movieId}`] || [];
  const [theaterId, setTheaterId] = useState(theaterChoices[0]?.theaterId);
  useEffect(() => {
    const list = theatersForCombo[`${showingNumber}|${movieId}`] || [];
    if (!list.find((t) => t.theaterId === theaterId)) setTheaterId(list[0]?.theaterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingNumber, movieId, theatersForCombo]);

  const adaptedTheater = useMemo(
    () => (theaterId ? adaptTheater(theatersById[theaterId]) : null),
    [theaterId, theatersById]
  );
  const otherTaken = useMemo(
    () => (theaterId ? otherTakenForTheater(portal, theaterId) : new Set()),
    [portal, theaterId]
  );
  const movie = moviesHere.find((m) => m.id === movieId);
  const theaterMeta = theaterChoices.find((t) => t.theaterId === theaterId);

  const [sel, setSel] = useState(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 'place' = pick open seats to finalize; 'assign' = pick already-yours
  // seats and reassign them to a delegate via /assign endpoint.
  const [mode, setMode] = useState('place');
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignPending, setAssignPending] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const remaining = blockSize - seats.totalAssigned;

  // Phase 1.13 — brief flash on showing/theater change so users get
  // visual feedback even when both showings share the same auditorium
  // (e.g. Star Wars in Aud 7 plays at both Early and Late, so swapping
  // the showing pill renders an identical map; without the flash this
  // looks like a no-op state update).
  const [mapFlashKey, setMapFlashKey] = useState(0);
  useEffect(() => {
    setMapFlashKey((k) => k + 1);
  }, [showingNumber, theaterId, movieId]);

  // Phase 1.14 — Step2Pick IS the fullscreen pop-up content (rendered
  // inside SeatPickSheet from Mobile.jsx). The SeatMap renders inline,
  // tappable, full-bleed. The Phase 1.13 nested-sub-sheet is removed.

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setSel(new Set());
  };

  const onSelect = (ids, op) => {
    // In place mode, drop self seats (can't re-place yours). In assign
    // mode, drop everything that isn't yours (can't reassign someone
    // else's seats; can't reassign open seats).
    const filtered = ids.filter((id) => {
      const isSelf = seats.allSelfIds.has(id);
      return mode === 'assign' ? isSelf : !isSelf;
    });
    if (!filtered.length) return;
    setSel((prev) => {
      const n = new Set(prev);
      if (op === 'add') filtered.forEach((id) => n.add(id));
      else filtered.forEach((id) => n.delete(id));
      return n;
    });
  };

  const tryAuto = () => {
    if (!adaptedTheater || remaining <= 0) return;
    const taken = new Set([...otherTaken, ...seats.allSelfIds]);
    const N = Math.min(remaining, Math.max(2, sel.size || 4));
    const picks = autoPickBlock(adaptedTheater, N, taken);
    setSel(new Set(picks));
  };

  const assignToDelegation = async (delegationId) => {
    if (!sel.size || !theaterId) return;
    setAssignPending(true);
    setAssignError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: theaterId,
          seat_ids: [...sel],
          delegation_id: delegationId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
      setSel(new Set());
      setAssignPickerOpen(false);
      // After a successful reassign, drop back to place mode so the user
      // doesn't accidentally keep tapping yours.
      setMode('place');
    } catch (e) {
      setAssignError(e);
    } finally {
      setAssignPending(false);
    }
  };

  const confirm = async () => {
    const showingId = SHOWING_NUMBER_TO_ID[showingNumber];
    try {
      await seats.place(showingId, theaterId, [...sel]);
      setSel(new Set());
      setConfirmOpen(false);
    } catch {
      // pickError surfaced by useSeats; sheet stays open so user can retry
    }
  };

  // Floating "ALL SEATS PLACED" banner — appears when block is at capacity,
  // user taps Next to advance to the Invite step.
  const atCapacity = blockSize > 0 && seats.totalAssigned >= blockSize;

  // F4: open the MovieDetailSheet at the wizard root with the current
  // movie + showing context attached so the sheet can render the
  // "Show 4:30 PM · Early showing" badge without a separate prop chain.
  const onMoreInfo = (m) => {
    if (!onMovieDetail) return;
    const ctx = showingsRich.find((sr) => sr.number === showingNumber);
    onMovieDetail({
      ...m,
      __showingNumber: showingNumber,
      __showLabel: ctx?.label,
      __showTime: ctx?.time,
    });
  };

  return (
    <>
      {/* Movie pills — never truncate, scroll horizontally with snap. */}
      <div
        className="no-scrollbar"
        style={{
          margin: '12px 0 0',
          padding: '0 14px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {moviesHere.map((m) => {
          const active = movieId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMovieId(m.id)}
              style={{
                flexShrink: 0,
                scrollSnapAlign: 'center',
                padding: '4px 12px 4px 4px',
                borderRadius: 99,
                border: 0,
                cursor: 'pointer',
                background: active
                  ? (isLight ? 'rgba(244,185,66,0.20)' : 'rgba(244,185,66,0.14)')
                  : (isLight ? 'var(--surface)' : 'rgba(255,255,255,0.05)'),
                boxShadow: active
                  ? `inset 0 0 0 1.5px ${BRAND.gold}`
                  : `inset 0 0 0 1px var(--rule)`,
                color: isLight ? BRAND.ink : '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                maxWidth: 'none',
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 99,
                  // H3 — small filter chip uses thumbnail_url first
                  // (custom-cropped PNG) so the pill reads as a tight
                  // identifier; poster_url fallback keeps it working
                  // for movies without a custom thumbnail upload.
                  background: m.thumbnailUrl || m.posterUrl
                    ? `url(${m.thumbnailUrl || m.posterUrl}) center/cover`
                    : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{m.title}</span>
            </button>
          );
        })}
      </div>

      {/* F3 — selected movie card. Rich poster + meta + "More about
          this movie →" affordance for the currently-selected movie at
          the current showing. Tap the link to open MovieDetailSheet
          with backdrop, trailer, synopsis (F4 wires the sheet). */}
      {movie && (
        <button
          onClick={() => onMoreInfo(movie)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            margin: '10px 14px 0',
            display: 'flex',
            gap: 0,
            background: 'var(--surface)',
            border: `1.5px solid var(--rule)`,
            borderRadius: 14,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 76,
              minHeight: 110,
              background: movie.posterUrl
                ? `url(${movie.posterUrl}) center/cover no-repeat`
                : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
            }}
          />
          <div
            style={{
              flex: 1,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--ink-on-ground)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {movie.title}
              {movie.year ? (
                <span style={{ color: 'var(--mute)', fontWeight: 500 }}> ({movie.year})</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {movie.rating && (
                <span
                  style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: BRAND.ink,
                    color: '#fff',
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
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: isLight ? 'rgba(13,18,36,0.08)' : 'rgba(255,255,255,0.08)',
                    color: 'var(--ink-on-ground)',
                    fontSize: 10,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {movie.runtime} min
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--mute)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {movie.audCount} aud{movie.audCount === 1 ? '' : 's'} · {movie.totalCapacity} seats
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: BRAND.red,
                marginTop: 2,
              }}
            >
              More about this movie →
            </div>
          </div>
        </button>
      )}

      {/* Showtime segmented pill — single shared container with two
          stacked slots showing time + dinner-time subtitle. Active slot
          uses BRAND.gradient (Decision A swap from old solid red).
          Pattern from gala-seats-app.html .picker__showtimes (358-397).
          Phase 1.7 F2. */}
      <div
        style={{
          margin: '10px 14px 0',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            gap: 0,
            border: `1.5px solid var(--rule)`,
            borderRadius: 12,
            padding: 3,
            background: 'var(--surface)',
            width: '100%',
            maxWidth: 360,
          }}
        >
          {showingsRich.map((s) => {
            const active = showingNumber === s.number;
            return (
              <button
                key={s.number}
                onClick={() => setShowingNumber(s.number)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: active ? BRAND.gradient : 'transparent',
                  border: 0,
                  borderRadius: 9,
                  cursor: 'pointer',
                  color: active ? '#fff' : 'var(--mute)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  boxShadow: active ? '0 4px 12px rgba(203,38,44,0.25)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0.2,
                  }}
                >
                  {s.time || (s.number === 1 ? 'Early' : 'Late')}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: active
                      ? 'rgba(255,255,255,0.78)'
                      : (isLight ? 'rgba(13,18,36,0.62)' : 'rgba(255,255,255,0.45)'),
                    letterSpacing: 0.1,
                  }}
                >
                  {s.label}
                  {s.dinnerTime ? ` · dinner ${s.dinnerTime}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auditorium picker — own row below the showtime pill. Phase 1.13:
          stays visible even with only one choice (disabled state) so users
          never wonder whether something should change. */}
      <div
        style={{
          margin: '8px 14px 0',
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <select
          value={theaterId || ''}
          onChange={(e) => setTheaterId(Number(e.target.value))}
          disabled={theaterChoices.length <= 1}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 99,
            background: 'var(--surface)',
            border: `1px solid var(--rule)`,
            color: 'var(--ink-on-ground)',
            cursor: theaterChoices.length > 1 ? 'pointer' : 'default',
            fontSize: 12,
            fontWeight: 600,
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            opacity: theaterChoices.length > 1 ? 1 : 0.7,
          }}
        >
          {theaterChoices.map((c) => (
            <option key={c.theaterId} value={c.theaterId} style={{ color: BRAND.ink }}>
              {theatersById[c.theaterId]?.name || `Theater ${c.theaterId}`} · {c.format}
            </option>
          ))}
        </select>
      </div>

      {/* Phase 1.13 — selection caption. Reaffirms what the map below
          represents so a tap that doesn't visibly change the layout
          (same auditorium across showings) still feels responsive. */}
      <div
        style={{
          margin: '8px 14px 0',
          fontSize: 11,
          color: 'var(--accent-text)',
          letterSpacing: 0.4,
          fontWeight: 700,
          textTransform: 'uppercase',
          flexShrink: 0,
          textAlign: 'center',
        }}
      >
        {(() => {
          const sw = showingsRich.find((s) => s.number === showingNumber);
          const aud = theatersById[theaterId];
          if (!sw || !aud) return '';
          return `${sw.time || sw.label} · ${aud.name}`;
        })()}
      </div>

      {/* Phase 1.14 — Seat map renders inline, full-bleed, fully
          interactive. Step2Pick itself is the fullscreen content
          (rendered inside SeatPickSheet from Mobile.jsx), so there's
          no nested expand-to-fullscreen pattern anymore. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '14px 14px 10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          key={mapFlashKey}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.2)',
            border: `1px solid var(--rule)`,
            padding: 10,
            animation: 'mapFlash 0.32s ease-out',
            position: 'relative',
          }}
        >
          <div style={{ width: '100%' }}>
            {adaptedTheater ? (
              <SeatMap
                theater={adaptedTheater}
                scale={24}
                showLetters={true}
                allowZoom={true}
                allowLasso={true}
                assignedSelf={seats.allSelfIds}
                assignedOther={otherTaken}
                selected={sel}
                onSelect={onSelect}
              />
            ) : (
              <div style={{ padding: 24, color: 'var(--mute)', textAlign: 'center' }}>
                No theater selected
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 10,
            color: 'var(--mute)',
            justifyContent: 'center',
          }}
        >
          {['luxury', 'loveseat', 'dbox', 'wheelchair'].map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: SEAT_TYPES[t].color,
                }}
              />
              {SEAT_TYPES[t].short}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{ width: 9, height: 9, borderRadius: 2, background: BRAND.indigoLight }}
            />
            Yours
          </span>
        </div>

      </div>

      {/* Auto-pick block — own row, no overlap with the legend or the
          sticky CTA below. Only visible when nothing is selected and
          remaining > 0 (otherwise the CTA replaces it). */}
      {sel.size === 0 && remaining > 0 && (
        <div
          style={{
            padding: '0 14px 8px',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <button
            onClick={tryAuto}
            style={{
              padding: '8px 14px',
              borderRadius: 99,
              border: `1px solid var(--rule)`,
              background: 'rgba(168,177,255,0.10)',
              color: 'var(--accent-italic)',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Icon name="sparkle" size={12} stroke={2.2} /> Auto-select best block
          </button>
        </div>
      )}

      {/* Selected-seat tray (above CTA) — chips of every seat in `sel` so
          the user sees the concrete selection before tapping Place. The
          confirm sheet only opens on CTA tap, never on auto-pick or seat
          tap (per design — mobile-wizard.jsx 433-447). */}
      {sel.size > 0 && (
        <div
          style={{
            padding: '8px 14px 0',
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            maxHeight: 56,
            overflow: 'auto',
            flexShrink: 0,
            background: 'rgba(11,14,38,0.95)',
            borderTop: `1px solid var(--rule)`,
          }}
        >
          {[...sel].sort().map((id) => (
            <span
              key={id}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(168,177,255,0.18)',
                color: 'var(--accent-italic)',
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 0.3,
              }}
            >
              {id.replace('-', '')}
            </span>
          ))}
        </div>
      )}

      {/* Mode toggle — Place vs Assign. Only show Assign tab when the
          user has at least one self seat in the current theater. */}
      {(() => {
        const haveSelfHere = adaptedTheater
          ? adaptedTheater.rows.some((r) =>
              r.seats.some((s) => s && seats.allSelfIds.has(s.id))
            )
          : false;
        if (!haveSelfHere && mode === 'place') return null;
        return (
          <div
            style={{
              padding: '0 14px 8px',
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: 3,
                borderRadius: 99,
                background: 'var(--surface)',
                border: `1px solid var(--rule)`,
              }}
            >
              {[
                { id: 'place', label: 'Place new' },
                { id: 'assign', label: 'Reassign yours' },
              ].map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => switchMode(m.id)}
                    disabled={m.id === 'assign' && !haveSelfHere}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 99,
                      border: 0,
                      cursor:
                        m.id === 'assign' && !haveSelfHere ? 'not-allowed' : 'pointer',
                      background: active ? BRAND.indigoLight : 'transparent',
                      color: active ? BRAND.ink : 'var(--ink-on-ground)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      opacity: m.id === 'assign' && !haveSelfHere ? 0.4 : 1,
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Sticky CTA */}
      <MStickyCTA>
        {sel.size === 0 ? (
          <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 13, color: 'var(--mute)' }}>
            {mode === 'assign' ? (
              <>
                Tap your <b style={{ color: 'var(--accent-italic)' }}>indigo</b> seats to reassign them.
              </>
            ) : (
              <>
                Tap seats to select ·{' '}
                <b
                  style={{ color: 'var(--accent-italic)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {remaining}
                </b>{' '}
                still to place
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setSel(new Set())}
              style={{
                padding: '14px 18px',
                borderRadius: 99,
                border: `1.5px solid var(--rule)`,
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              onClick={() => {
                // HAPTIC: medium — primary CTA in wizard. Place mode opens
                // the confirm sheet; assign mode opens the delegation
                // picker. Confirm sheets never open on seat tap or auto-pick.
                if (mode === 'assign') setAssignPickerOpen(true);
                else setConfirmOpen(true);
              }}
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: 99,
                border: 0,
                background: BRAND.gradient,
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {mode === 'assign'
                  ? `Assign ${sel.size} seat${sel.size === 1 ? '' : 's'}`
                  : `Place ${sel.size} seat${sel.size === 1 ? '' : 's'}`}
              </span>
              <Icon name="arrowR" size={16} />
            </button>
          </div>
        )}
      </MStickyCTA>

      <Sheet
        open={assignPickerOpen}
        onClose={() => setAssignPickerOpen(false)}
        title={`Assign ${sel.size} seat${sel.size === 1 ? '' : 's'}`}
      >
        <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 14, lineHeight: 1.55 }}>
          Assigning to a guest hands these seats off for night-of identification. Their portal
          link still points at their own block — this just labels who's sitting where.
        </div>
        {assignError && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: 'rgba(212,38,74,0.12)',
              border: `1px solid rgba(212,38,74,0.4)`,
              color: '#ff8da4',
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {assignError.message}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...delegations, null].map((d, i) => (
            <button
              key={d?.id ?? `none-${i}`}
              onClick={() => assignToDelegation(d?.id ?? null)}
              disabled={assignPending}
              style={{
                all: 'unset',
                cursor: assignPending ? 'not-allowed' : 'pointer',
                padding: '12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: `1.5px solid var(--rule)`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: assignPending ? 0.6 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {d ? d.delegateName : 'No one yet (clear assignment)'}
                </div>
                {d && (d.phone || d.email) && (
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
                    {d.phone || d.email}
                  </div>
                )}
              </div>
              <Icon name="arrowR" size={16} />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm these seats?">
        <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 14 }}>
          {showingNumber === 1 ? 'Early' : 'Late'} showing · {movie?.title} ·{' '}
          {theatersById[theaterId]?.name} ({theaterMeta?.format})
        </div>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'rgba(168,177,255,0.1)',
            border: '1px solid rgba(168,177,255,0.24)',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              color: '#a8b1ff',
              marginBottom: 8,
            }}
          >
            {sel.size} SEATS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {[...sel].sort().map((id) => {
              const s = adaptedTheater ? seatById(adaptedTheater, id) : null;
              return (
                <span
                  key={id}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 5,
                    background: 'rgba(168,177,255,0.22)',
                    color: '#a8b1ff',
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    display: 'inline-flex',
                    gap: 5,
                    alignItems: 'center',
                  }}
                >
                  {id.replace('-', '')}
                  {s && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 1.5,
                        background: SEAT_TYPES[s.t]?.color,
                      }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
        {seats.pickError && seats.pickError.code === 'AT_CAPACITY' ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'rgba(244,185,66,0.10)',
              border: `1px solid rgba(244,185,66,0.32)`,
              marginBottom: 14,
            }}
          >
            <div
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-text)', marginBottom: 4 }}
            >
              You've placed your full block.
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 12, lineHeight: 1.5 }}>
              Want to swap some seats? Unplace a few from your tickets first, then come back
              here.
            </div>
            <button
              onClick={() => {
                if (onDone) onDone();
                navigate(`/${token}?tab=tickets`);
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 99,
                border: 0,
                background: BRAND.gold,
                color: BRAND.ink,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="ticket" size={14} /> Take me to my tickets
            </button>
          </div>
        ) : (
          seats.pickError && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'rgba(212,38,74,0.12)',
                border: `1px solid rgba(212,38,74,0.4)`,
                color: '#ff8da4',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {seats.pickError.message}
            </div>
          )
        )}
        <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 18, lineHeight: 1.5 }}>
          You can always change these later — and you'll have{' '}
          <b style={{ color: 'var(--ink-on-ground)' }}>{Math.max(0, remaining - sel.size)}</b> seats left to place
          after this.
        </div>
        <Btn
          kind="primary"
          size="lg"
          full
          onClick={confirm}
          disabled={seats.pending}
          icon={<Icon name="check" size={16} />}
        >
          {seats.pending ? 'Placing…' : 'Place these seats'}
        </Btn>
      </Sheet>

      {/* Floating "ALL SEATS PLACED" banner — at-capacity user advance */}
      {atCapacity && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100px + env(safe-area-inset-bottom))',
            left: 18,
            right: 18,
            padding: 14,
            borderRadius: 14,
            background: BRAND.gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 10,
          }}
        >
          <div>
            <div
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#ffd1dc' }}
            >
              ALL SEATS PLACED
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: '#fff' }}>
              Ready to invite guests?
            </div>
          </div>
          <button
            onClick={onAdvance}
            style={{
              padding: '10px 16px',
              borderRadius: 99,
              border: 0,
              background: '#fff',
              color: BRAND.ink,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}

    </>
  );
};

// ── Step 3: Invite ────────────────────────────────────────────────────
//
// Step 3 is intentionally a thin "share + skim" pass between seat
// placement and the final review. The real delegation invite flow lives
// outside the wizard — Mobile's Group tab → "Invite to seats" sheet
// fires the actual Twilio SMS + email via POST /delegate. This step's
// "Add a guest" placeholder local-state-only intentionally; sponsors
// who want to invite during the wizard can also do per-seat invites
// from SeatAssignSheet (Phase 1.6 B2) which chain delegate→assign.

const Step3Invite = ({ guests, onAddPlaceholder, onNext, onSkip }) => {
  const { isLight } = useTheme();
  return (
  <>
    <div
      className="scroll-container"
      style={{ flex: 1, padding: '24px 22px 12px' }}
    >
      <SectionEyebrow color="#ff6b8a">Step 3</SectionEyebrow>
      <h1
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 38,
          lineHeight: 1.05,
          letterSpacing: -1,
          margin: '14px 0 8px',
          fontWeight: 700,
        }}
      >
        Invite your{' '}
        <i
          style={{
            background: BRAND.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          guests.
        </i>
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mute)', lineHeight: 1.5 }}>
        Share a link so each guest claims their own seat — they'll get directions, dietary
        prompts, and a calendar invite.
      </p>

      <button
        onClick={onAddPlaceholder}
        style={{
          marginTop: 18,
          width: '100%',
          padding: 14,
          borderRadius: 12,
          border: `1.5px dashed var(--rule)`,
          background: isLight ? 'var(--surface)' : 'transparent',
          color: 'var(--ink-on-ground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={16} /> Add a guest
      </button>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: 'var(--mute)' }}>
          INVITED
        </div>
        {guests.length === 0 && (
          <div
            style={{
              padding: '18px 14px',
              borderRadius: 12,
              border: `1px dashed var(--rule)`,
              fontSize: 12,
              color: 'var(--mute)',
              fontStyle: 'italic',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Names you attach to seats will show up here.
          </div>
        )}
        {guests.map((g, i) => (
          <div
            key={g.id || i}
            style={{
              padding: '14px 14px',
              borderRadius: 12,
              border: `1px solid var(--rule)`,
              background: 'var(--surface)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
              {g.seats && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--mute)',
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {g.seats}
                </div>
              )}
            </div>
            {g.state === 'pending' ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: BRAND.red,
                  letterSpacing: 1.2,
                  background: 'rgba(212,38,74,0.12)',
                  padding: '4px 10px',
                  borderRadius: 99,
                }}
              >
                PENDING
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#a8b1ff',
                  letterSpacing: 1.2,
                  background: 'rgba(168,177,255,0.16)',
                  padding: '4px 10px',
                  borderRadius: 99,
                }}
              >
                CLAIMED
              </span>
            )}
          </div>
        ))}
      </div>

      <button
        style={{
          marginTop: 14,
          width: '100%',
          padding: 14,
          borderRadius: 12,
          border: `1.5px solid var(--rule)`,
          background: isLight ? 'var(--surface)' : 'rgba(255,255,255,0.03)',
          color: 'var(--ink-on-ground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Icon name="link" size={16} /> Copy shareable link
      </button>
    </div>
    <MStickyCTA>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSkip}
          style={{
            padding: '14px 18px',
            borderRadius: 99,
            border: `1.5px solid var(--rule)`,
            background: 'transparent',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          style={{
            flex: 1,
            padding: '14px 18px',
            borderRadius: 99,
            border: 0,
            background: BRAND.gradient,
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Review & finish
        </button>
      </div>
    </MStickyCTA>
  </>
  );
};

// ── Step 4: Review ────────────────────────────────────────────────────

const Step4Review = ({
  portal,
  theaterLayouts,
  onDone,
  finalizing,
  finalizeError,
  token,
  apiBase,
  onRefresh,
}) => {
  const { isLight } = useTheme();
  // H2 — Done button gate. Disabled until every claimed seat has a
  // dinner_choice; copy reflects how many are missing so the sponsor
  // knows what's blocking them.
  const dinner = useDinnerCompleteness(portal?.myAssignments);
  const showtimes = portal?.showtimes || [];
  const myAssignments = portal?.myAssignments || [];
  const myHolds = portal?.myHolds || [];

  const showtimeByTheater = useMemo(() => {
    const m = {};
    showtimes.forEach((s) => {
      if (!m[s.theater_id]) m[s.theater_id] = s;
    });
    return m;
  }, [showtimes]);

  const theatersById = useMemo(() => {
    const m = {};
    (theaterLayouts?.theaters || []).forEach((t) => (m[t.id] = t));
    return m;
  }, [theaterLayouts]);

  const grouped = useMemo(() => {
    const m = new Map();
    const push = (row, status) => {
      const key = row.theater_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({
        seat_id: `${row.row_label}-${row.seat_num}`,
        theater_id: row.theater_id,
        row_label: row.row_label,
        seat_num: row.seat_num,
        dinner_choice: row.dinner_choice || null,
        status,
      });
    };
    myAssignments.forEach((r) => push(r, 'claimed'));
    myHolds.forEach((r) => push(r, 'pending'));
    return [...m.entries()].map(([theaterId, assignments]) => {
      const st = showtimeByTheater[theaterId];
      const theater = theatersById[theaterId];
      return {
        key: theaterId,
        showLabel: st?.showing_number === 1 ? 'Early' : st?.showing_number === 2 ? 'Late' : '',
        showTime: formatShowTime(st?.show_start),
        movieTitle: st?.movie_title || '',
        movieShort: st?.movie_title?.split(' ')[0] || '',
        posterUrl: st?.poster_url,
        theaterName: theater?.name || `Theater ${theaterId}`,
        format: formatBadgeFor(st?.theater_tier, st?.theater_notes),
        // Sort by seat label for stable rendering; H1 dinner pickers
        // and the existing chip row both iterate this list.
        assignments: [...assignments].sort((a, b) =>
          a.seat_id.localeCompare(b.seat_id)
        ),
      };
    });
  }, [myAssignments, myHolds, showtimeByTheater, theatersById]);

  return (
    <>
      <div className="scroll-container" style={{ flex: 1, padding: '24px 22px 12px' }}>
        <SectionEyebrow color="#ff6b8a">All set</SectionEyebrow>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 38,
            lineHeight: 1.05,
            letterSpacing: -1,
            margin: '14px 0 8px',
            fontWeight: 700,
          }}
        >
          Your night at{' '}
          <i
            style={{
              background: BRAND.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            the gala.
          </i>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mute)', lineHeight: 1.5 }}>
          Wednesday, June 10 · Megaplex at Legacy Crossing
        </p>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grouped.length === 0 && (
            <div
              style={{
                padding: '24px 14px',
                borderRadius: 14,
                border: `1px dashed var(--rule)`,
                fontSize: 13,
                color: 'var(--mute)',
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              No seats placed yet — go back to Step 2 to select some.
            </div>
          )}
          {grouped.map((r) => (
            <div
              key={r.key}
              style={{
                padding: 14,
                borderRadius: 14,
                border: `1px solid var(--rule)`,
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <PosterMiniM poster={r.posterUrl} label={r.movieShort} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1.4,
                      color: isLight ? BRAND.red : '#ff8da4',
                    }}
                  >
                    {r.showLabel.toUpperCase()} ·{' '}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.showTime}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                    {r.movieTitle}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--mute)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.theaterName} · <FormatBadge format={r.format} /> ·{' '}
                    {r.assignments.length} seat
                    {r.assignments.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {r.assignments.map((a) => (
                  <span
                    key={a.seat_id}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 4,
                      background: 'rgba(168,177,255,0.2)',
                      color: 'var(--accent-italic)',
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {a.seat_id.replace('-', '')}
                  </span>
                ))}
              </div>
              {/* H1 — per-seat dinner picker on the review step. Same
                  enum + endpoint behavior as TicketsTab; sponsors can
                  set dinner here before tapping "Done — send me my QR"
                  rather than going back to the home shell. */}
              {r.assignments.some((a) => a.status === 'claimed') && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid var(--rule)`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: 'var(--accent-text)',
                    }}
                  >
                    DINNER
                  </div>
                  {r.assignments
                    .filter((a) => a.status === 'claimed')
                    .map((a) => (
                      <div
                        key={a.seat_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 38,
                            flexShrink: 0,
                            padding: '4px 6px',
                            borderRadius: 4,
                            background: 'rgba(168,177,255,0.18)',
                            color: 'var(--accent-italic)',
                            fontSize: 10,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'center',
                          }}
                        >
                          {a.seat_id.replace('-', '')}
                        </span>
                        <DinnerPicker
                          assignment={a}
                          token={token}
                          apiBase={apiBase}
                          size="sm"
                          onChange={onRefresh ? () => onRefresh() : undefined}
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Stub buttons — real PassKit + PDF ship in Phase 2.5 */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            disabled
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid var(--rule)`,
              background: isLight ? 'var(--surface)' : 'rgba(255,255,255,0.03)',
              color: isLight ? 'rgba(13,18,36,0.55)' : 'rgba(255,255,255,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'not-allowed',
            }}
            title="Coming in Phase 2.5"
          >
            <Icon name="qr" size={16} /> Add to Wallet (coming soon)
          </button>
          <button
            disabled
            style={{
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid var(--rule)`,
              background: isLight ? 'var(--surface)' : 'rgba(255,255,255,0.03)',
              color: isLight ? 'rgba(13,18,36,0.55)' : 'rgba(255,255,255,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'not-allowed',
            }}
            title="Coming in Phase 2.5"
          >
            <Icon name="download" size={16} /> Download itinerary PDF (coming soon)
          </button>
        </div>
      </div>
      {finalizeError && (
        <div
          style={{
            margin: '0 22px 12px',
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 12,
          }}
        >
          {finalizeError.message}
        </div>
      )}
      <MStickyCTA>
        <Btn
          kind="primary"
          size="lg"
          full
          disabled={finalizing || !dinner.allComplete}
          onClick={onDone}
          icon={<Icon name="check" size={16} />}
        >
          {finalizing
            ? 'Sending your QR…'
            : dinner.allComplete
              ? 'Done — send me my QR'
              : `Select dinner for ${dinner.missingCount} more seat${dinner.missingCount === 1 ? '' : 's'}`}
        </Btn>
      </MStickyCTA>
    </>
  );
};

// ── Wizard root ────────────────────────────────────────────────────────

export default function MobileWizard({
  portal,
  token,
  theaterLayouts,
  seats,
  onDone,
  apiBase = '',
  onRefresh,
}) {
  // F4 — MovieDetailSheet open-state lives at wizard root so it can
  // overlay the entire wizard, not just step 2's body. Step2Pick raises
  // the open request via onMovieDetail; the sheet shows the trailer
  // (Stream first, YouTube fallback) + synopsis from the API JOIN data
  // already on each movie row.
  const [movieDetail, setMovieDetail] = useState(null);
  const navigate = useNavigate();
  const blockSize =
    portal?.identity?.seatsPurchased || portal?.identity?.seatsAllocated || 0;
  const tier = portal?.identity?.tier || portal?.identity?.parentTier;

  const [step, setStep] = useState(seats.totalAssigned > 0 ? 2 : 1);
  const [pendingGuests, setPendingGuests] = useState([]);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);

  // Step 4 "Done — send me my QR" hits POST /finalize, which marks the
  // RSVP completed/finalized server-side and fires the email + SMS with
  // the QR. The response carries everything ConfirmationScreen renders;
  // we hand it to Mobile via route state on the back-navigate so Mobile
  // re-mounts in confirmation mode without an extra round-trip.
  const exit = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (onDone) await onDone();
      navigate('', { state: { confirmation: data } });
    } catch (e) {
      setFinalizeError(e);
    } finally {
      setFinalizing(false);
    }
  };

  const onBack = () => {
    if (step === 1) {
      // Phase 1.10-patch-2 Bug 5: navigate('') is a no-op in react-router-v6
      // with a basename. Use navigate(-1) to pop the history stack — works
      // whether the sponsor came from HomeTab (returns home) or deep-linked
      // directly to /seats (leaves the page).
      navigate(-1);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const { isDark } = useTheme();

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        background: isDark
          ? `radial-gradient(ellipse 100% 50% at 50% 0%, ${BRAND.navyMid}, ${BRAND.navyDeep} 70%, ${BRAND.ink})`
          : `radial-gradient(ellipse 100% 50% at 50% 0%, #fff, #f7f8fb 70%, #eef0f9)`,
        color: isDark ? '#fff' : BRAND.ink,
        fontFamily: FONT_UI,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <MHeader
        step={step}
        total={4}
        totalAssigned={seats.totalAssigned}
        blockSize={blockSize}
        onBack={onBack}
      />

      {step === 1 && (
        <Step1Welcome onNext={() => setStep(2)} blockSize={blockSize} tier={tier} />
      )}
      {step === 2 && (
        <Step2Pick
          portal={portal}
          theaterLayouts={theaterLayouts}
          seats={seats}
          blockSize={blockSize}
          onAdvance={() => setStep(3)}
          token={token}
          onDone={onDone}
          delegations={portal?.childDelegations || []}
          apiBase={apiBase}
          onRefresh={onRefresh}
          onMovieDetail={setMovieDetail}
        />
      )}
      {step === 3 && (
        <Step3Invite
          guests={pendingGuests}
          onAddPlaceholder={() =>
            // Local-state placeholder. Real invites happen via Mobile's
            // Group tab → DelegateForm. This is just a skim affordance.
            setPendingGuests((g) => [
              ...g,
              { id: `pg-${Date.now()}`, name: 'New guest', state: 'pending' },
            ])
          }
          onNext={() => setStep(4)}
          onSkip={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Step4Review
          portal={portal}
          theaterLayouts={theaterLayouts}
          onDone={exit}
          finalizing={finalizing}
          finalizeError={finalizeError}
          token={token}
          apiBase={apiBase}
          onRefresh={onRefresh}
        />
      )}

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
          onClose={() => setMovieDetail(null)}
        />
      )}
    </div>
  );
}
