// SeatPickSheet — Phase 1.9.1.
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
// Layout (top to bottom):
//   - Counter line ("N to place")
//   - Movie chips (scroll-x)
//   - Compact movie card with "More about this movie →"
//   - Early/Late + Auditorium row (⅔ + ⅓ — single line)
//   - Seat map (scrollable)
//   - Legend
//   - Auto-pick chip OR selected-seat chips
//   - Place new / Reassign yours toggle (when applicable)
//   - Sticky Commit CTA
//
// Commit calls seats.place() then fires onCommitted(theaterId, seatIds,
// movieMeta) so the host can hand off to PostPickSheet.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';
import { Btn, Icon } from '../../brand/atoms.jsx';
import { SeatMap, SEAT_TYPES, adaptTheater, autoPickBlock } from '../SeatEngine.jsx';
import { otherTakenForTheater, checkBatchOrphans } from '../../hooks/useSeats.js';
import { SHOWING_NUMBER_TO_ID, formatBadgeFor } from '../../hooks/usePortal.js';
import { formatShowTime } from '../Mobile.jsx';

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
        m[s.showing_number].set(s.movie_id, {
          id: s.movie_id,
          title: s.movie_title,
          short: s.movie_title?.split(' ')[0] || '',
          posterUrl: s.poster_url,
          thumbnailUrl: s.thumbnail_url,
          backdropUrl: s.backdrop_url,
          trailerUrl: s.trailer_url,
          streamUid: s.stream_uid,
          synopsis: s.synopsis,
          year: s.year,
          rating: s.rating,
          runtime: s.runtime_minutes,
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

  // Phase 1.16 — Bug #5 fix: when the sheet opens and the sponsor already
  // has placed seats, default the showing/movie/theater to where those
  // seats live. Without this, the picker opens on showing[0]/movie[0]/
  // theater[0] regardless of where the sponsor's seats are — so the
  // "Reassign yours" toggle (gated on haveSelfHere) never appears, and
  // the only way to edit is to unplace and re-place. We do this once,
  // on mount, so the user can still navigate away to place additional
  // seats in another auditorium afterward.
  const didInitFromAssignments = useRef(false);
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
      setError(e?.message || 'Could not place seats');
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
    onMovieDetail({
      ...movie,
      __showingNumber: showingNumber,
      __showLabel: ctx?.label,
      __showTime: ctx?.time,
    });
  };

  const haveSelfHere = adaptedTheater
    ? adaptedTheater.rows.some((r) => r.seats.some((s) => s && seats.allSelfIds.has(s.id)))
    : false;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        // Desktop modal padding is on the wrapper; on mobile the Sheet
        // wrapper supplies its own 18×22 padding so we stay tight here.
        padding: 0,
      }}
    >
      {/* Counter line */}
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
          Pick seats
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

      {/* Movie chips — scroll-x. Mirrors MobileWizard line 632. */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollSnapType: 'x proximity',
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
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 99,
                  background: m.thumbnailUrl || m.posterUrl
                    ? `url(${m.thumbnailUrl || m.posterUrl}) center/cover`
                    : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
                  flexShrink: 0,
                }}
              />
              {m.title}
            </button>
          );
        })}
      </div>

      {/* Compact movie card (smaller than wizard) */}
      {movie && (
        <button
          onClick={onMoreInfo}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            gap: 0,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${BRAND.rule}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 60,
              minHeight: 84,
              background: movie.posterUrl
                ? `url(${movie.posterUrl}) center/cover no-repeat`
                : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
            }}
          />
          <div
            style={{
              flex: 1,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 0,
            }}
          >
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
              {movie.year ? (
                <span style={{ color: BRAND.mute, fontWeight: 500 }}> ({movie.year})</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {movie.rating && (
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
                  {movie.rating}
                </span>
              )}
              {movie.runtime && (
                <span style={{ fontSize: 10, color: BRAND.mute, fontVariantNumeric: 'tabular-nums' }}>
                  {movie.runtime} min · {movie.audCount} aud
                  {movie.audCount === 1 ? '' : 's'} · {movie.totalCapacity} seats
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6f86' }}>
              More about this movie →
            </div>
          </div>
        </button>
      )}

      {/* Early/Late + Auditorium on a single row — ⅔ + ⅓ per spec. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            flex: 2,
            display: 'inline-flex',
            border: `1px solid ${BRAND.rule}`,
            borderRadius: 10,
            padding: 3,
            background: 'rgba(255,255,255,0.06)',
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
                  padding: '8px 10px',
                  background: active ? BRAND.gradient : 'transparent',
                  border: 0,
                  borderRadius: 7,
                  cursor: 'pointer',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 1,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {s.time || s.label}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: active ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.72)',
                  }}
                >
                  {s.label}
                  {s.dinnerTime ? ` · dinner ${s.dinnerTime}` : ''}
                </span>
              </button>
            );
          })}
        </div>
        <select
          aria-label="Auditorium"
          value={theaterId || ''}
          onChange={(e) => setTheaterId(Number(e.target.value))}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${BRAND.rule}`,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            minWidth: 0,
          }}
        >
          {theaterChoices.map((c) => (
            <option key={c.theaterId} value={c.theaterId} style={{ color: BRAND.ink }}>
              {theatersById[c.theaterId]?.name || `Theater ${c.theaterId}`} · {c.format}
            </option>
          ))}
        </select>
      </div>

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
            />
          ) : (
            <div style={{ padding: 24, color: BRAND.mute, textAlign: 'center' }}>
              No theater selected
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 10,
          color: BRAND.mute,
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
          <span style={{ width: 9, height: 9, borderRadius: 2, background: BRAND.indigoLight }} />
          Yours
        </span>
      </div>

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
        <Btn kind="secondary" size="lg" onClick={onClose}>
          Close
        </Btn>
        <Btn
          kind="primary"
          size="lg"
          full
          disabled={mode !== 'place' || !sel.size || committing}
          onClick={commit}
          icon={<Icon name="arrowR" size={16} />}
        >
          {committing
            ? 'Placing…'
            : sel.size
              ? `Commit ${sel.size} seat${sel.size === 1 ? '' : 's'}`
              : mode === 'assign'
                ? 'Reassign mode'
                : 'Pick seats to commit'}
        </Btn>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(215,40,70,0.12)',
            color: '#ff8da4',
            fontSize: 12,
            border: `1px solid rgba(215,40,70,0.3)`,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
