// SeatPickSheet — Phase 1.9.1 → Phase 5.13 staged flow.
//
// Sheet body that replaces the wizard's StepShowing + StepSeats flow.
// Mounted on a feature flag (?sheet=1) for staged rollout — both old
// MobileWizard and new sheet path coexist until the flag flips on by
// default in a follow-up commit.
//
// Renders inside a wrapper provided by the host:
//   Mobile:  <Sheet> from Mobile.jsx (bottom-sheet, full-width)
//   Desktop: <Modal> from Desktop.jsx (centered, maxWidth=720)
//
// Same source for both shells per the Phase 1.9 process rule.
//
// Phase 5.13 — three-step staged flow.
//   Step 1: Movie       — movie pills + selected movie card
//   Step 2: Time + aud  — showtime pills + auditorium chip/select
//   Step 3: Seats       — legend + seat map + selection + commit CTA
//
// Horizontal stepper at top (Movie · Time · Seats) shows where the
// user is. Tapping any step in the stepper jumps there. Auto-advance
// fires on each selection: tap a movie → step 2; tap a time → step 3.
// Returning users with seats already placed open directly on step 3
// (haveSelfHere) with a "Change movie ↑" affordance to jump back.
// Selections (movie/time/seats) persist across step jumps; selected
// seats are only cleared if the underlying theater changes.
//
// Commit calls seats.place() then fires onCommitted(theaterId, seatIds,
// movieMeta) so the host can hand off to PostPickSheet.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Btn, Icon } from '../../brand/atoms.jsx';
import { SeatMap, SEAT_TYPES, adaptTheater, autoPickBlock, seatById } from '../SeatEngine.jsx';
import { otherTakenForTheater, checkBatchOrphans } from '../../hooks/useSeats.js';
import { SHOWING_NUMBER_TO_ID, formatBadgeFor } from '../../hooks/usePortal.js';
import { formatShowTime } from '../Portal.jsx';
import { enrichMovieScores, formatRottenBadge } from '../movieScores.js';

const SEAT_TYPE_ORDER = ['luxury', 'standard', 'dbox', 'loveseat', 'wheelchair', 'companion'];

const SEAT_TYPE_DETAILS = {
  luxury: {
    name: 'Luxury Recliner',
    copy: 'Recliner seat.',
    note: 'Recliner',
  },
  standard: {
    name: 'Standard',
    copy: 'Classic theater seat.',
    note: 'Classic',
  },
  dbox: {
    name: 'D-BOX',
    copy: 'Motion-enabled seat.',
    note: 'Motion',
  },
  loveseat: {
    name: 'Loveseat',
    copy: 'Paired sofa-style seat.',
    note: 'Pair',
  },
  wheelchair: {
    name: 'Wheelchair',
    copy: 'Wheelchair space.',
    note: 'Space',
  },
  companion: {
    name: 'Companion',
    copy: 'Seat next to a wheelchair space.',
    note: 'Adjacent',
  },
};

const formatSeatLabel = (id = '') => id.replace('-', '');

const SeatTypeVisual = ({ type, small = false }) => {
  const color = SEAT_TYPES[type]?.color || '#6f75d8';
  const isLoveseat = type === 'loveseat';
  const isAccessible = type === 'wheelchair';
  const isCompanion = type === 'companion';
  return (
    <div
      aria-hidden="true"
      style={{
        width: small ? 48 : 64,
        height: small ? 42 : 54,
        borderRadius: 9,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.18))',
        border: `1px solid ${BRAND.rule}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isLoveseat ? (
        <div
          style={{
            width: small ? 36 : 46,
            height: small ? 24 : 31,
            borderRadius: '12px 12px 7px 7px',
            background: color,
            boxShadow: `0 8px 0 ${color}55`,
          }}
        />
      ) : (
        <div
          style={{
            width: small ? 26 : 34,
            height: small ? 25 : 32,
            borderRadius: isAccessible || isCompanion ? 99 : 8,
            background: color,
            boxShadow: `0 7px 0 ${color}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(13,18,36,0.85)',
            fontSize: small ? 14 : 17,
            fontWeight: 900,
          }}
        >
          {isAccessible ? 'A' : isCompanion ? 'C' : ''}
        </div>
      )}
    </div>
  );
};

const SeatTypeGuide = ({ types, activeType, onSelectType }) => (
  <div
    data-testid="seat-type-guide"
    className="no-scrollbar"
    style={{
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      paddingBottom: 4,
      scrollSnapType: 'x proximity',
    }}
  >
    {types.map((type) => {
      const detail = SEAT_TYPE_DETAILS[type] || { name: SEAT_TYPES[type]?.label || type };
      const color = SEAT_TYPES[type]?.color || '#6f75d8';
      const active = activeType === type;
      return (
        <button
          type="button"
          key={type}
          data-testid="seat-type-button"
          aria-pressed={active}
          onClick={() => onSelectType?.(active ? null : type)}
          style={{
            flexShrink: 0,
            scrollSnapAlign: 'start',
            // Same shape as the movie pills above: 99-radius capsule,
            // small circle marker, name only. Compact so the seat map +
            // sticky CTA below fit in the viewport without clipping.
            padding: '4px 12px 4px 4px',
            borderRadius: 99,
            border: 0,
            cursor: 'pointer',
            background: active ? 'rgba(244,185,66,0.14)' : 'rgba(255,255,255,0.05)',
            boxShadow: active
              ? `inset 0 0 0 1.5px ${BRAND.gold}`
              : `inset 0 0 0 1px ${BRAND.rule}`,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Color dot — matches the seat color in the map. Loveseat
              uses a wider pill-shaped marker for the visual cue, all
              other types use a circle. */}
          <span
            aria-hidden="true"
            style={{
              width: type === 'loveseat' ? 28 : 18,
              height: 18,
              borderRadius: type === 'loveseat' ? 6 : 99,
              background: color,
              flexShrink: 0,
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)',
            }}
          />
          {detail.name}
        </button>
      );
    })}
  </div>
);

const SelectedSeatPreview = ({ seats }) => {
  if (!seats.length) return null;
  const first = seats[0];
  const detail = SEAT_TYPE_DETAILS[first.t] || {};
  const typeName = detail.name || SEAT_TYPES[first.t]?.label || first.t;
  return (
    <div
      data-testid="selected-seat-preview"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid rgba(168,177,255,0.28)`,
        background: 'rgba(168,177,255,0.10)',
      }}
    >
      <SeatTypeVisual type={first.t} small />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>
          Seat {formatSeatLabel(first.id)} · {typeName}
        </div>
        <div style={{ marginTop: 2, color: BRAND.mute, fontSize: 11, lineHeight: 1.35 }}>
          {detail.copy || 'Seat selected for this block.'}
          {seats.length > 1 ? ` ${seats.length - 1} more selected.` : ''}
        </div>
      </div>
    </div>
  );
};

// Phase 5.13 — horizontal stepper for the staged seat-pick flow.
// Three dots labeled Movie / Time / Seats. Active step gets a
// gradient red fill + bold label. Completed steps get a filled gold
// dot with a check glyph. Future steps stay outlined and dim.
// Tappable: a tap on any dot or label jumps to that step. Connector
// bars between dots fill in based on the step's status.
const Stepper = ({ step, onJump }) => {
  const steps = [
    { n: 1, label: 'Movie' },
    { n: 2, label: 'Time' },
    { n: 3, label: 'Seats' },
  ];
  return (
    <div
      data-testid="seat-pick-stepper"
      data-current-step={step}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 2px 2px',
      }}
    >
      {steps.map((s, i) => {
        const active = step === s.n;
        const done = step > s.n;
        const future = step < s.n;
        return (
          <Fragment key={s.n}>
            <button
              type="button"
              onClick={() => onJump(s.n)}
              data-testid={`stepper-${s.n}${active ? '-active' : done ? '-done' : '-future'}`}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: '0 0 auto',
                padding: '2px 4px',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 99,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: active
                    ? BRAND.gradient
                    : done
                      ? 'rgba(244,185,66,0.18)'
                      : 'transparent',
                  border: done
                    ? `1.5px solid ${BRAND.gold}`
                    : active
                      ? `1.5px solid transparent`
                      : `1.5px solid rgba(255,255,255,0.22)`,
                  color: active
                    ? '#fff'
                    : done
                      ? BRAND.gold
                      : 'rgba(255,255,255,0.45)',
                  fontSize: 11,
                  fontWeight: 800,
                  transition: 'background 0.18s ease, border 0.18s ease',
                }}
              >
                {done ? '✓' : s.n}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 800 : 600,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  color: active
                    ? '#fff'
                    : done
                      ? 'rgba(255,255,255,0.78)'
                      : 'rgba(255,255,255,0.45)',
                  transition: 'color 0.18s ease',
                }}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 1.5,
                  borderRadius: 1,
                  background: step > s.n
                    ? `linear-gradient(90deg, ${BRAND.gold}, rgba(244,185,66,0.45))`
                    : 'rgba(255,255,255,0.12)',
                  transition: 'background 0.18s ease',
                  minWidth: 12,
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
};

export default function SeatPickSheet({
  portal,
  theaterLayouts,
  seats,
  blockSize,
  token,
  apiBase = '',
  onRefresh,
  onMovieDetail,
  onCommitted,
  onClose,
  variant = 'sheet',
  // Phase 5.5 — when opened from a MovieDetailSheet's "Select seats
  // for this film" CTA, the picker should land on that film's
  // showing/movie/theater regardless of where the sponsor's existing
  // seats live. These props override the mount-time
  // "default to placed-seats location" effect when supplied.
  initialShowingNumber = null,
  initialMovieId = null,
}) {
  const compact = variant === 'sheet';
  const showtimes = portal?.showtimes || [];

  const showings = useMemo(() => {
    const set = new Set();
    showtimes.forEach((s) => set.add(s.showing_number));
    return [...set].sort();
  }, [showtimes]);

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
        label: n === 1 ? 'Early' : n === 2 ? 'Late' : `Show ${n}`,
        time: formatShowTime(s.show_start),
        dinnerTime: formatShowTime(s.dinner_time),
      }));
  }, [showtimes]);

  const moviesByShowing = useMemo(() => {
    const m = {};
    showtimes.forEach((s) => {
      if (!m[s.showing_number]) m[s.showing_number] = new Map();
      if (!m[s.showing_number].has(s.movie_id)) {
        m[s.showing_number].set(s.movie_id, enrichMovieScores({
          id: s.movie_id,
          title: s.movie_title,
          short: s.movie_title?.split(' ')[0] || '',
          posterUrl: s.poster_url,
          thumbnailUrl: s.thumbnail_url,
          backdropUrl: s.backdrop_url,
          trailerUrl: s.trailer_url,
          trailerVideoUrl: s.trailer_video_url,
          streamUid: s.stream_uid,
          synopsis: s.synopsis,
          year: s.year,
          rating: s.rating,
          runtime: s.runtime_minutes,
          theaterIds: new Set([s.theater_id]),
          totalCapacity: s.capacity || 0,
          rtCriticsScore: s.rt_critics_score,
          rtAudienceScore: s.rt_audience_score,
          rtUrl: s.rt_url,
        }));
      } else {
        const entry = m[s.showing_number].get(s.movie_id);
        entry.theaterIds.add(s.theater_id);
        entry.totalCapacity += s.capacity || 0;
      }
    });
    const out = {};
    Object.entries(m).forEach(([k, v]) => {
      out[k] = [...v.values()].map((e) => ({ ...e, audCount: e.theaterIds.size }));
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

  const [showingNumber, setShowingNumber] = useState(
    initialShowingNumber || showings[0] || 1
  );
  const moviesHere = moviesByShowing[showingNumber] || [];
  const [movieId, setMovieId] = useState(initialMovieId || moviesHere[0]?.id);
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

  // Phase 1.16 — Bug #5 fix: when the sheet opens and the sponsor already
  // has placed seats, default the showing/movie/theater to where those
  // seats live. Without this, the picker opens on showing[0]/movie[0]/
  // theater[0] regardless of where the sponsor's seats are — so the
  // "Reassign yours" toggle (gated on haveSelfHere) never appears, and
  // the only way to edit is to unplace and re-place. We do this once,
  // on mount, so the user can still navigate away to place additional
  // seats in another auditorium afterward.
  //
  // Phase 5.5 — when initialShowingNumber/initialMovieId are passed
  // (CTA flow from MovieDetailSheet), they take precedence and we
  // skip this effect entirely. Mark the flag so it doesn't run later
  // either.
  const didInitFromAssignments = useRef(initialShowingNumber || initialMovieId ? true : false);
  useEffect(() => {
    if (didInitFromAssignments.current) return;
    const placed = portal?.myAssignments || [];
    if (!placed.length || !showtimes.length) return;
    const first = placed[0];
    const match = showtimes.find((s) => s.theater_id === first.theater_id);
    if (!match) return;
    didInitFromAssignments.current = true;
    setShowingNumber(match.showing_number);
    setMovieId(match.movie_id);
    setTheaterId(match.theater_id);
  }, [portal, showtimes]);

  const adaptedTheater = useMemo(
    () => (theaterId ? adaptTheater(theatersById[theaterId]) : null),
    [theaterId, theatersById]
  );

  // Phase 5.14 — per-movie showings. When the user picks a movie,
  // the time buttons in step 2 should reflect THAT movie's actual
  // start + dinner times, not a generic average across all films.
  // (Some movies — e.g. Mandalorian on certain auditoriums — have
  // earlier dinner times to accommodate runtime; this lets that
  // variance show through.)
  //
  // For each showing_number, we pick the canonical row for the
  // current movie: the row whose theater matches the currently
  // selected theaterId if one is chosen, otherwise the first row
  // for that (showing, movie). That way switching auditoriums on
  // step 3 doesn't redraw the time buttons unless the times truly
  // differ for that aud.
  //
  // MUST be declared AFTER movieId / theaterId / showingNumber state
  // hooks above — useMemo deps array reads those variables at the
  // call site, and reading a `const` before its declaration line
  // throws a Temporal Dead Zone ReferenceError. This produced a
  // blank seat-pick screen for fresh users (Phase 5.14.1 hotfix).
  const showingsForMovie = useMemo(() => {
    if (!movieId) return showingsRich;
    const byShowing = new Map();
    showtimes
      .filter((s) => s.movie_id === movieId)
      .forEach((s) => {
        const prev = byShowing.get(s.showing_number);
        // Prefer the row matching the currently selected theater so
        // a per-aud variance shows the right times.
        if (
          !prev ||
          (theaterId && s.theater_id === theaterId)
        ) {
          byShowing.set(s.showing_number, s);
        }
      });
    return [...byShowing.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, s]) => ({
        number: n,
        label: n === 1 ? 'Early' : n === 2 ? 'Late' : `Show ${n}`,
        time: formatShowTime(s.show_start),
        dinnerTime: formatShowTime(s.dinner_time),
      }));
  }, [showtimes, movieId, theaterId, showingsRich]);

  const seatTypesPresent = useMemo(() => {
    if (!adaptedTheater) return [];
    const found = new Set();
    adaptedTheater.rows.forEach((row) => {
      row.seats.forEach((seat) => {
        if (seat?.t && SEAT_TYPE_ORDER.includes(seat.t)) found.add(seat.t);
      });
    });
    return SEAT_TYPE_ORDER.filter((type) => found.has(type));
  }, [adaptedTheater]);
  const [highlightedSeatType, setHighlightedSeatType] = useState(null);
  useEffect(() => {
    if (highlightedSeatType && !seatTypesPresent.includes(highlightedSeatType)) {
      setHighlightedSeatType(null);
    }
  }, [highlightedSeatType, seatTypesPresent]);
  const otherTaken = useMemo(
    () => (theaterId ? otherTakenForTheater(portal, theaterId) : new Set()),
    [portal, theaterId]
  );
  const movie = moviesHere.find((m) => m.id === movieId);
  const theaterMeta = theaterChoices.find((t) => t.theaterId === theaterId);

  const [sel, setSel] = useState(new Set());
  // Mode toggle from the wizard — kept per spec note that it's still
  // useful but moved to bottom of the sheet, near the CTA.
  const [mode, setMode] = useState('place');
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);
  const remaining = blockSize - seats.totalAssigned;
  const selectedSeatDetails = useMemo(
    () =>
      [...sel]
        .map((id) => seatById(adaptedTheater, id))
        .filter(Boolean)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [adaptedTheater, sel]
  );

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setSel(new Set());
  };

  const onSelect = (ids, op) => {
    const filtered = ids.filter((id) => {
      const isSelf = seats.allSelfIds.has(id);
      return mode === 'assign' ? isSelf : !isSelf;
    });
    if (!filtered.length) return;
    // Clear any prior pre-flight error — the user changed their selection,
    // the previous error (orphan rule, quota) may no longer apply. The
    // error reasserts itself if they hit Commit again with a new bad batch.
    setError(null);
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

  const commit = async () => {
    if (!sel.size || !theaterId || mode !== 'place') return;
    const showingId = SHOWING_NUMBER_TO_ID[showingNumber];

    // Pre-flight: this batch must not leave any single empty seat wedged
    // between two occupied seats in the same row. Server has the same check
    // for non-SPA clients, but the SPA-side check is friendlier (one error
    // for the whole batch rather than a race between N parallel /pick calls).
    const seatIds = [...sel];
    const orphanCheck = checkBatchOrphans(portal, theaterId, seatIds);
    if (!orphanCheck.ok) {
      setError(
        `That selection would leave seat ${orphanCheck.orphan} alone in row ${orphanCheck.row}. Please choose a different seat so no single seat is left empty.`
      );
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      await seats.place(showingId, theaterId, seatIds);
      // Hand off to host so PostPickSheet can open with these
      // freshly-placed seats. Pass the movie + showing context too so
      // PostPickSheet can render the success header without a re-lookup.
      if (onCommitted) {
        onCommitted({
          theaterId,
          seatIds,
          movieTitle: movie?.title || '',
          movieShort: movie?.short || '',
          posterUrl: movie?.posterUrl || null,
          showLabel: showingsRich.find((s) => s.number === showingNumber)?.label || '',
          showTime: showingsRich.find((s) => s.number === showingNumber)?.time || '',
          theaterName: theatersById[theaterId]?.name || `Theater ${theaterId}`,
        });
      }
      setSel(new Set());
    } catch (e) {
      const msg = e?.message || 'Could not place seats';
      // Common cause of commit failure: the user's seat-map data is
      // stale and one or more selected seats were finalized by someone
      // else between page-load and Commit. Detect that case, refresh
      // the portal so taken seats render as such, drop the now-invalid
      // selection, and show a friendlier message than 'Seat already
      // taken.' (Aaron's first try at D-BOX hit exactly this — D15/D16
      // were grabbed ~60s before he tapped Commit.)
      const wasTakenRace = /already taken|already finalized|already placed/i.test(msg);
      if (wasTakenRace) {
        setError(
          'One or more of those seats was just taken by someone else. Refreshing the seat map — pick again from the open seats.'
        );
        setSel(new Set());
        if (onRefresh) {
          try { await onRefresh(); } catch { /* swallow — error already shown */ }
        }
      } else {
        setError(msg);
      }
    } finally {
      setCommitting(false);
    }
  };

  // Reassign mode: POST /assign for the selected indigo seats. Kept
  // simple — opens a small inline dropdown of delegations rather than
  // a nested sheet; when zero delegations exist, the toggle is disabled.
  const delegations = portal?.childDelegations || [];
  const [assignTo, setAssignTo] = useState('');
  const [assignPending, setAssignPending] = useState(false);

  const reassign = async () => {
    if (!sel.size || !theaterId || !assignTo) return;
    setAssignPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theater_id: theaterId,
          seat_ids: [...sel],
          delegation_id: assignTo === 'me' ? null : Number(assignTo),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onRefresh) await onRefresh();
      setSel(new Set());
      setAssignTo('');
      setMode('place');
    } catch (e) {
      setError(e?.message || 'Could not reassign');
    } finally {
      setAssignPending(false);
    }
  };

  const onMoreInfo = () => {
    if (!onMovieDetail || !movie) return;
    const ctx = showingsRich.find((sr) => sr.number === showingNumber);
    // Phase 5.5 — build a schedule for this movie on the fly from
    // showtimes, matching the shape MovieDetailSheet expects from the
    // home-tab lineup path. This way the sheet's schedule block + CTA
    // work the same regardless of where it was opened from.
    const schedule = showtimes
      .filter((s) => s.movie_id === movie.id)
      .map((s) => ({
        theaterId: s.theater_id,
        theaterName: theatersById[s.theater_id]?.name || `Theater ${s.theater_id}`,
        showingNumber: s.showing_number,
        showLabel:
          s.showing_number === 1 ? 'Early' :
          s.showing_number === 2 ? 'Late' : '',
        showTime: formatShowTime(s.show_start),
        showStart: s.show_start,
      }))
      .sort((a, b) => {
        if (a.showingNumber !== b.showingNumber) {
          return (a.showingNumber || 99) - (b.showingNumber || 99);
        }
        return String(a.showStart || '').localeCompare(String(b.showStart || ''));
      });
    onMovieDetail({
      ...movie,
      __showingNumber: showingNumber,
      __showLabel: ctx?.label,
      __showTime: ctx?.time,
      schedule,
    });
  };

  const haveSelfHere = adaptedTheater
    ? adaptedTheater.rows.some((r) => r.seats.some((s) => s && seats.allSelfIds.has(s.id)))
    : false;

  // Phase 5.13 — three-step staged flow. Step state defaults to 3
  // for returning users (they already have seats placed in this
  // theater, so their movie+time is already determined and they're
  // just here to pick more seats or reassign), and to 1 for new
  // users picking from scratch.
  //
  // didInitStepRef gates the auto-default to a single mount-time
  // effect, so subsequent state changes don't yank the user out of
  // the step they navigated to. The same pattern as the
  // didInitFromAssignments ref above for movie/showing defaulting.
  const didInitStepRef = useRef(false);
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (didInitStepRef.current) return;
    if (!adaptedTheater) return;
    didInitStepRef.current = true;
    // initialShowingNumber/initialMovieId from a Movie Detail CTA mean
    // the caller already knows the movie + time, so we should land
    // the user on the seats step too. Same idea: skip the picker, go
    // straight to the seat map.
    if (haveSelfHere || initialShowingNumber || initialMovieId) {
      setStep(3);
    }
  }, [adaptedTheater, haveSelfHere, initialShowingNumber, initialMovieId]);

  // Stepper jumps: tapping a step in the stepper navigates there.
  // Selections persist across step jumps; seats clear only when
  // the underlying theater actually changes.
  const goToStep = (n) => setStep(n);

  // Phase 5.14 — auto-advance is OFF. Selection just selects;
  // the Continue button is the only way to advance. These helpers
  // wrap setMovieId / setShowingNumber / setTheaterId so that
  // changes to the theater (movie pick, time pick on a different
  // showing, aud change) clear the current seat selection so we
  // don't carry over picks that don't map to the new auditorium.
  const selectMovie = (id) => {
    if (id !== movieId) setSel(new Set());
    setMovieId(id);
  };
  const selectShowing = (n) => {
    if (n !== showingNumber) setSel(new Set());
    setShowingNumber(n);
  };
  const selectTheater = (id) => {
    if (id !== theaterId) setSel(new Set());
    setTheaterId(id);
  };

  // Step headlines. Counter line ("N to place") stays on every step
  // so the user always knows how many they still owe; the headline
  // changes to match the step.
  const stepTitle =
    step === 1 ? 'Pick your movie'
    : step === 2 ? 'Pick a showtime'
    : 'Pick your seats';

  return (
    <div
      data-testid="seat-pick-sheet"
      data-highlighted-seat-type={highlightedSeatType || undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        // Desktop modal padding is on the wrapper; on mobile the Sheet
        // wrapper supplies its own 18×22 padding so we stay tight here.
        padding: 0,
      }}
    >
      {/* Counter line + step title — counter stays on every step so the
          user always knows how many seats they still owe. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: -0.2,
          }}
        >
          {stepTitle}
        </div>
        <div
          style={{
            fontSize: 12,
            color: BRAND.mute,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {remaining > 0 ? (
            <>
              <b style={{ color: BRAND.indigoLight }}>{remaining}</b> to place
            </>
          ) : (
            <span style={{ color: '#7fcfa0' }}>All placed</span>
          )}
        </div>
      </div>

      {/* Phase 5.13 — horizontal stepper. Tap any step to jump. */}
      <Stepper step={step} onJump={goToStep} />

      {/* ─── STEP 1 — Movie ──────────────────────────────────────
          Phase 5.14 — four (or however many) movie cards stacked.
          No pill row; the cards themselves are the selector. Tap a
          card to select it (no auto-advance); tap Continue at the
          bottom to advance to step 2. Selected card gets a gold
          ring + tinted background. "More about this movie" link
          inside each card opens the MovieDetailSheet for the deep
          info dive. */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {moviesHere.map((m) => {
            const selected = movieId === m.id;
            const rotten = formatRottenBadge(m);
            return (
              <div
                key={m.id}
                data-testid={`step1-movie-card${selected ? '-selected' : ''}`}
                data-movie-id={m.id}
                onClick={() => {
                  // Phase 5.14 — select only; do NOT advance. User
                  // commits the choice with the Continue button.
                  selectMovie(m.id);
                }}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 0,
                  background: selected
                    ? 'rgba(244,185,66,0.10)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${selected ? BRAND.gold : BRAND.rule}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  transition: 'border 0.18s ease, background 0.18s ease',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 84,
                    minHeight: 124,
                    background: m.posterUrl
                      ? `url(${m.posterUrl}) center/cover no-repeat`
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
                      fontWeight: 800,
                      color: '#fff',
                      lineHeight: 1.2,
                      letterSpacing: -0.2,
                    }}
                  >
                    {m.title}
                    {m.year ? (
                      <span style={{ color: BRAND.mute, fontWeight: 500 }}> ({m.year})</span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {m.rating && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: BRAND.ink,
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                        }}
                      >
                        {m.rating}
                      </span>
                    )}
                    {rotten && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: 'rgba(244,185,66,0.16)',
                          color: BRAND.gold,
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {rotten}
                      </span>
                    )}
                    {m.runtime && (
                      <span
                        style={{
                          fontSize: 10,
                          color: BRAND.mute,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {m.runtime} min · {m.audCount} aud
                        {m.audCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {m.synopsis && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.65)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {m.synopsis}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      // Stop the card's onClick so this doesn't also
                      // toggle selection. Open the detail sheet for
                      // this movie regardless of current selection.
                      e.stopPropagation();
                      selectMovie(m.id);
                      // Defer one tick so movieId state is fresh.
                      setTimeout(() => onMoreInfo(), 0);
                    }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ff6f86',
                      alignSelf: 'flex-start',
                      marginTop: 'auto',
                    }}
                  >
                    More about this movie →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── STEP 2 — Time ────────────────────────────────────────
          Phase 5.14 — two big stacked buttons (Early / Late), each
          showing the movie start time AND dinner time for the
          currently selected movie. Times come from showingsForMovie
          so per-movie variance (e.g. Mandalorian's earlier dinner
          on certain auditoriums) shows correctly. Auditorium moved
          OUT of this step — it lives on step 3 next to the seat
          map so users can flip aud quickly if the seats stink. */}
      {step === 2 && (
        <>
      {/* Selected-movie summary at top of step 2, tap to go back to step 1. */}
      {movie && (
        <button
          onClick={() => goToStep(1)}
          data-testid="step2-movie-summary"
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${BRAND.rule}`,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 48,
              borderRadius: 6,
              background: movie.posterUrl
                ? `url(${movie.posterUrl}) center/cover no-repeat`
                : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: BRAND.gold,
                textTransform: 'uppercase',
              }}
            >
              Step 1 · Movie
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.2,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {movie.title}
            </div>
          </div>
          <span style={{ fontSize: 11, color: BRAND.indigoLight, fontWeight: 700 }}>
            Change ↑
          </span>
        </button>
      )}

      {/* Two big stacked buttons — Early / Late. Each shows the
          movie start time + dinner time underneath the label. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {showingsForMovie.map((s) => {
          const active = showingNumber === s.number;
          return (
            <button
              key={s.number}
              type="button"
              data-testid={`step2-showing-${s.number}${active ? '-selected' : ''}`}
              onClick={() => selectShowing(s.number)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                padding: '16px 18px',
                borderRadius: 14,
                background: active
                  ? 'rgba(244,185,66,0.10)'
                  : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${active ? BRAND.gold : BRAND.rule}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 6,
                transition: 'border 0.18s ease, background 0.18s ease',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: active ? BRAND.gold : 'rgba(255,255,255,0.55)',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: -0.4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.time || '—'}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.55)',
                      marginLeft: 6,
                      letterSpacing: 0,
                    }}
                  >
                    movie
                  </span>
                </div>
                {s.dinnerTime && (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.75)',
                      letterSpacing: -0.2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.dinnerTime}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.45)',
                        marginLeft: 6,
                      }}
                    >
                      dinner
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
        </>
      )}

      {/* ─── STEP 3 — Seats ──────────────────────────────────────
          Phase 5.14 — auditorium picker moved INTO step 3, sitting
          between the breadcrumb and the seat map. When the seats
          in one aud are bad, the user can flip aud here without
          jumping back to step 2. When there's only one aud the
          slot becomes an informational chip. */}
      {step === 3 && (
        <>
      {/* Phase 5.13/5.14 — compact summary at top of step 3 showing the
          movie + time chosen, with a tap target to jump back. Auditorium
          is NOT in this summary because it has its own picker below
          (right next to the seat map where flipping aud is most
          useful). */}
      {movie && (
        <button
          onClick={() => goToStep(1)}
          data-testid="step3-summary"
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${BRAND.rule}`,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <div
            style={{
              width: 30,
              height: 40,
              borderRadius: 5,
              background: movie.posterUrl
                ? `url(${movie.posterUrl}) center/cover no-repeat`
                : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {movie.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: BRAND.mute,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(() => {
                // Use per-movie showings so the time matches the
                // selected film (e.g. Mandalorian's earlier dinner).
                const ctx = showingsForMovie.find((sr) => sr.number === showingNumber);
                if (!ctx) return '';
                const parts = [ctx.label];
                if (ctx.time) parts.push(ctx.time);
                if (ctx.dinnerTime) parts.push(`dinner ${ctx.dinnerTime}`);
                return parts.join(' · ');
              })()}
            </div>
          </div>
          <span style={{ fontSize: 11, color: BRAND.indigoLight, fontWeight: 700 }}>
            Change ↑
          </span>
        </button>
      )}

      {/* Auditorium picker — between breadcrumb and seat map. Three
          states:
            - 0 choices: hide (defensive; shouldn't happen)
            - 1 choice: informational pill ("Auditorium 7 · Standard")
            - >1 choices: scrollable row of tappable chips, current
              selection highlighted. This makes flipping aud cheap
              when the seats in one are bad. */}
      {theaterChoices.length > 0 && (
        <div
          data-testid="step3-aud-picker"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            Auditorium
          </div>
          {theaterChoices.length === 1 ? (
            <div
              data-testid="auditorium-chip-static"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${BRAND.rule}`,
                color: 'rgba(255,255,255,0.85)',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {(theatersById[theaterId]?.name || `Auditorium ${theaterId}`).replace(/^Auditorium\s+/i, 'Aud ')}
              {theaterMeta?.format ? (
                <span style={{ color: BRAND.mute, fontWeight: 500 }}>
                  {' '}· {theaterMeta.format}
                </span>
              ) : null}
            </div>
          ) : (
            <div
              className="no-scrollbar"
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollSnapType: 'x proximity',
              }}
            >
              {theaterChoices.map((c) => {
                const active = theaterId === c.theaterId;
                const audName = (theatersById[c.theaterId]?.name || `Auditorium ${c.theaterId}`).replace(/^Auditorium\s+/i, 'Aud ');
                return (
                  <button
                    key={c.theaterId}
                    type="button"
                    onClick={() => selectTheater(c.theaterId)}
                    data-testid={`step3-aud-${c.theaterId}${active ? '-selected' : ''}`}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      flexShrink: 0,
                      scrollSnapAlign: 'center',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: active
                        ? 'rgba(244,185,66,0.10)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${active ? BRAND.gold : BRAND.rule}`,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      transition: 'border 0.18s ease, background 0.18s ease',
                    }}
                  >
                    <span>{audName}</span>
                    {c.format && (
                      <span
                        style={{
                          fontSize: 10,
                          color: BRAND.mute,
                          fontWeight: 600,
                        }}
                      >
                        {c.format}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {seatTypesPresent.length > 0 && (
        <SeatTypeGuide
          types={seatTypesPresent}
          activeType={highlightedSeatType}
          onSelectType={setHighlightedSeatType}
        />
      )}

      {/* Seat map — capped height so the whole sheet stays scrollable.
          Mobile sheet caps at 88vh; modal at 90vh. We give the map a
          comfortable 360px (compact) / 440px (modal) ceiling. */}
      <div
        role="region"
        aria-label="Seat map"
        tabIndex={0}
        style={{
          maxHeight: compact ? 360 : 440,
          minHeight: 240,
          overflow: 'auto',
          borderRadius: 10,
          background: 'rgba(0,0,0,0.2)',
          border: `1px solid ${BRAND.rule}`,
          padding: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: compact ? 'flex-start' : 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            minWidth: compact && adaptedTheater ? Math.max(540, adaptedTheater.cols * 24 + 84) : 0,
          }}
        >
          {adaptedTheater ? (
            <SeatMap
              theater={adaptedTheater}
              theme="dark"
              scale={compact ? 20 : 22}
              showLetters={true}
              showSeatNumbers={true}
              allowZoom={false}
              allowLasso={!compact}
              assignedSelf={seats.allSelfIds}
              assignedOther={otherTaken}
              selected={sel}
              onSelect={onSelect}
              highlightSeatType={highlightedSeatType}
            />
          ) : (
            <div style={{ padding: 24, color: BRAND.mute, textAlign: 'center' }}>
              No theater selected
            </div>
          )}
        </div>
      </div>

      <SelectedSeatPreview seats={selectedSeatDetails} />

      {/* Auto-pick chip OR selected-seat chips */}
      {sel.size === 0 && remaining > 0 && mode === 'place' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={tryAuto}
            style={{
              padding: '8px 14px',
              borderRadius: 99,
              border: `1px solid ${BRAND.rule}`,
              background: 'rgba(168,177,255,0.10)',
              color: BRAND.indigoLight,
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Icon name="sparkle" size={12} stroke={2.2} /> Auto-pick best block
          </button>
        </div>
      )}

      {sel.size > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            maxHeight: 56,
            overflow: 'auto',
            padding: '6px 0',
            borderTop: `1px solid ${BRAND.rule}`,
          }}
        >
          {[...sel].sort().map((id) => (
            <span
              key={id}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(168,177,255,0.18)',
                color: BRAND.indigoLight,
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

      {/* Place new / Reassign yours toggle — surfaces only when the
          sponsor has at least one self seat in the current theater. */}
      {haveSelfHere && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: 3,
              borderRadius: 99,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${BRAND.rule}`,
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
                  style={{
                    padding: '6px 12px',
                    borderRadius: 99,
                    border: 0,
                    cursor: 'pointer',
                    background: active ? BRAND.indigoLight : 'transparent',
                    color: active ? BRAND.ink : '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reassign target dropdown — only in assign mode with seats
          selected. Quick inline picker rather than a nested sheet. */}
      {mode === 'assign' && sel.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            aria-label="Reassign selected seats to"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${BRAND.rule}`,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            <option value="" style={{ color: BRAND.ink }}>
              Reassign to…
            </option>
            <option value="me" style={{ color: BRAND.ink }}>
              Me (clear delegation)
            </option>
            {delegations.map((d) => (
              <option key={d.id} value={d.id} style={{ color: BRAND.ink }}>
                {d.delegateName || `Delegation ${d.id}`}
              </option>
            ))}
          </select>
          <Btn
            kind="primary"
            size="md"
            disabled={!assignTo || assignPending}
            onClick={reassign}
          >
            {assignPending ? 'Saving…' : 'Reassign'}
          </Btn>
        </div>
      )}
        </>
      )}

      <div aria-hidden="true" style={{ height: 54, flex: '0 0 auto' }} />

      {/* Error from commit/place — must render ABOVE the sticky CTA, not
          after it. Previously this was below the sticky button which on
          mobile means it sits BELOW the viewport edge (hidden by the
          pinned button itself) — users tapped Commit, got a 'Seat already
          taken' from a stale seat map, and never saw the explanation. */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            marginBottom: 8,
            borderRadius: 10,
            background: 'rgba(215,40,70,0.14)',
            color: '#ff8da4',
            fontSize: 13,
            lineHeight: 1.45,
            border: `1px solid rgba(215,40,70,0.35)`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.2, flexShrink: 0 }}>⚠️</span>
          <div style={{ minWidth: 0, flex: 1 }}>{error}</div>
        </div>
      )}

      {/* Sticky CTA — bottom of sheet body */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 4,
          paddingTop: 10,
          background: BRAND.navyDeep,
          borderTop: `1px solid ${BRAND.rule}`,
          display: 'flex',
          gap: 8,
        }}
      >
        {/* Phase 5.15 — left-side button is step-aware. Step 1 is
            the "first screen" of the flow so it shows Close (closes
            the whole sheet, returns to portal). Steps 2 and 3 show
            Back, which steps backward one stage. Stepper jumps still
            work for nonlinear navigation; Back is just the "I'm not
            done with this flow, take me one step prior" convenience. */}
        {step === 1 ? (
          <Btn kind="secondary" size="lg" onClick={onClose} testId="seat-pick-close">
            Close
          </Btn>
        ) : (
          <Btn
            kind="secondary"
            size="lg"
            onClick={() => setStep(step - 1)}
            testId={`seat-pick-step${step}-back`}
          >
            Back
          </Btn>
        )}
        {step === 3 ? (
          <Btn
            kind="primary"
            size="lg"
            full
            disabled={mode !== 'place' || !sel.size || committing}
            onClick={commit}
            icon={<Icon name="arrowR" size={16} />}
            testId="seat-pick-commit"
          >
            {committing
              ? 'Placing…'
              : sel.size
                ? `Commit ${sel.size} seat${sel.size === 1 ? '' : 's'}`
                : mode === 'assign'
                  ? 'Reassign mode'
                  : 'Pick seats to commit'}
          </Btn>
        ) : (
          /* Phase 5.13 — on steps 1 and 2 the right-side primary
             becomes a Continue button. Step 1 advances to 2 when a
             movie is picked; step 2 advances to 3 when a theater is
             determined. Auto-advance still fires on selection — this
             is the explicit secondary path for users who land on a
             step with defaults already set. */
          <Btn
            kind="primary"
            size="lg"
            full
            disabled={step === 1 ? !movieId : !theaterId}
            onClick={() => setStep(step + 1)}
            icon={<Icon name="arrowR" size={16} />}
            testId={`seat-pick-step${step}-continue`}
          >
            Continue →
          </Btn>
        )}
      </div>
    </div>
  );
}
