// SeatEngine — auditorium seat map renderer + helpers, adapted from
// uploads/seating-chart/project/components/seat-data.jsx to read the real
// theater-layouts.json schema (mixed rows with segments, gaps, real seat
// types).
//
// Three exports:
//   - adaptTheater(theaterJson) → ready-to-render shape used by SeatMap
//   - SeatMap component — pure (theater + assignment Sets in, click events out)
//   - autoPickBlock + seatById helpers used by the wizards
//
// Seat IDs are `${row_label}-${seat_num}` so they match what the API returns
// in myAssignments / myHolds (`row_label` + `seat_num` fields) and what the
// design's wizards expect (e.g. 'F-7' in mobile-wizard.jsx).

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../brand/tokens.js';

// Brand-coherent palette over the navy ground. Real types from theater-
// layouts.json mapped to colors that read well against #0b1b3c (DEF navy).
// Yours (gold) is reserved for the user's own seats and applied at render
// time. These are *category* colors — they need to remain distinct from
// each other on the seat map, so a few sit outside the strict 2-color
// brand system (loveseat purple, wheelchair sky blue, companion light-blue)
// and that's intentional.
export const SEAT_TYPES = {
  luxury: { label: 'Luxury Recliner', short: 'Luxury', color: '#1a3aa3' },  // brand-blue-deep (was off-brand #3b3f9f)
  standard: { label: 'Standard', short: 'Standard', color: '#5a6e8f' },
  wheelchair: { label: 'Wheelchair', short: 'Accessible', color: '#0ea5e9' },
  companion: { label: 'Companion', short: 'Companion', color: '#7dd3fc' },
  loveseat: { label: 'Loveseat', short: 'Loveseat', color: '#6a3a9a' },  // deliberately purple — category distinguisher, review separately
  dbox: { label: 'D-BOX', short: 'D-BOX', color: '#ffc24d' },
  blocked: { label: 'Unavailable', short: 'Blocked', color: '#3a3f55' },
};

/**
 * Convert a theater entry from theater-layouts.json into a column-indexed
 * grid the SeatMap renders directly. Handles both simple uniform rows
 * (numbers/cols arrays) and mixed rows (segments — including type:'gap'
 * which has no seats/cols and just creates a visual aisle).
 */
export function adaptTheater(theater) {
  if (!theater) return null;

  let maxCol = theater.maxCol || 0;
  if (!theater.maxCol) {
    theater.rows.forEach((r) => {
      if (r.cols) r.cols.forEach((c) => (maxCol = Math.max(maxCol, c)));
      if (r.segments)
        r.segments.forEach((seg) => {
          (seg.cols || []).forEach((c) => (maxCol = Math.max(maxCol, c)));
        });
    });
  }
  const totalCols = maxCol + 1;

  const rows = theater.rows.map((r) => {
    const cells = new Array(totalCols).fill(null);
    if (r.type === 'mixed') {
      (r.segments || []).forEach((seg) => {
        if (!seg.cols || !seg.seats) return;
        seg.cols.forEach((col, i) => {
          const n = seg.seats[i];
          if (seg.type === 'blocked') return;
          cells[col] = { t: seg.type, id: `${r.label}-${n}`, n };
        });
      });
    } else if (r.type !== 'blocked') {
      (r.cols || []).forEach((col, i) => {
        const n = r.numbers[i];
        cells[col] = { t: r.type, id: `${r.label}-${n}`, n };
      });
    }
    // F5: detect adjacent loveseat tiles so the renderer can fuse the
    // pair (extend the LEFT half's width into the inter-cell gap, drop
    // it from the RIGHT half) for the cinema-loveseat couple-curve look.
    // Each tile remains independently selectable via its own id.
    cells.forEach((cell, cIdx) => {
      if (cell?.t !== 'loveseat') return;
      const left = cells[cIdx - 1];
      const right = cells[cIdx + 1];
      cell.pairLeft = left?.t === 'loveseat'; // there's a loveseat to my left
      cell.pairRight = right?.t === 'loveseat'; // there's a loveseat to my right
    });
    return { label: r.label, seats: cells };
  });

  return {
    id: theater.id,
    name: theater.name,
    cols: totalCols,
    totalSeats: theater.totalSeats,
    exitSide: theater.exitSide,
    rows,
  };
}

export function seatById(adapted, id) {
  if (!adapted) return null;
  for (const row of adapted.rows) {
    for (const s of row.seats) if (s && s.id === id) return s;
  }
  return null;
}

/**
 * Find the best contiguous block of N free seats in a single row.
 * Scores center proximity (column + row) + seat type bonus (D-BOX > loveseat
 * > luxury > standard). Skips wheelchair/companion unless explicitly allowed.
 */
export function autoPickBlock(adapted, N, taken, opts = {}) {
  const { allowAccessible = false, preferPremium = true } = opts;
  if (!adapted || N <= 0) return [];

  const rows = adapted.rows;
  const colCenter = (adapted.cols - 1) / 2;
  const rowCenter = (rows.length - 1) / 2;

  const typeScore = (t) => {
    if (t === 'dbox') return 60;
    if (t === 'loveseat') return 45;
    if (t === 'luxury') return 30;
    if (t === 'standard') return 20;
    if (t === 'wheelchair' || t === 'companion') return allowAccessible ? 10 : -500;
    return 0;
  };

  let best = null;
  rows.forEach((row, rIdx) => {
    const cells = row.seats;
    for (let start = 0; start <= cells.length - N; start++) {
      const slice = cells.slice(start, start + N);
      if (slice.some((c) => !c)) continue;
      if (slice.some((c) => taken.has(c.id))) continue;

      const blockCenter = start + (N - 1) / 2;
      const colDist = Math.abs(blockCenter - colCenter);
      const rowDist = Math.abs(rIdx - rowCenter);
      let score = (100 - rowDist * 14) * 1.4 + (80 - colDist * 6) * 1.1;
      const tBonus = slice.reduce((s, c) => s + typeScore(c.t), 0) / N;
      score += preferPremium ? tBonus : tBonus * 0.5;

      if (!best || score > best.score) {
        best = { score, ids: slice.map((c) => c.id) };
      }
    }
  });

  return best ? best.ids : [];
}

export const SeatMap = ({
  theater,
  scale = 22,
  theme = 'auto',
  assignedSelf = new Set(),
  assignedOther = new Set(),
  selected = new Set(),
  onSelect,
  showLetters = true,
  showSeatNumbers = false,
  allowZoom = true,
  allowLasso = true,
  zoom: zoomProp,
  onZoomChange,
  highlightRows,
  highlightSeatType,
}) => {
  const rows = theater?.rows || [];
  const W = theater?.cols || 0;
  const H = rows.length;

  const [zoomState, setZoomState] = useState(1);
  const zoom = zoomProp != null ? zoomProp : zoomState;
  const setZoom = onZoomChange || setZoomState;
  const lastClick = useRef(null);
  const [lasso, setLasso] = useState(null);
  const dragging = useRef(null);
  const containerRef = useRef(null);
  // theme='auto' (new default): follow the OS color scheme via the
  // `prefers-color-scheme` media query. This is the same signal the
  // CSS @media block uses to flip --ground / --ink-on-ground, so the
  // SVG row letters and the "taken" tint stay in sync with the page.
  // Earlier versions tried to read document.documentElement[data-theme]
  // but nothing in this app sets that attribute — the theme is purely
  // media-query driven, so matchMedia is the right hook.
  const isDarkExplicit = theme === 'dark';
  const isLightExplicit = theme === 'light';
  const [autoDark, setAutoDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
  });
  useEffect(() => {
    if (theme !== 'auto') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const read = () => setAutoDark(!mq.matches);
    read();
    // addEventListener is the modern API; some older WebKit needs addListener.
    if (mq.addEventListener) {
      mq.addEventListener('change', read);
      return () => mq.removeEventListener('change', read);
    } else if (mq.addListener) {
      mq.addListener(read);
      return () => mq.removeListener(read);
    }
  }, [theme]);
  const dark = isDarkExplicit ? true : isLightExplicit ? false : autoDark;

  const gap = 3;
  const cell = scale;
  const padX = showLetters ? cell * 1.6 : cell * 0.4;
  const padTop = cell * 1.8;
  const totalW = padX * 2 + W * (cell + gap);
  const totalH = padTop + H * (cell + gap) + cell * 0.6;
  const seatRadius = Math.max(2, cell * 0.22);

  const find = (id) => {
    for (const row of rows) {
      for (const s of row.seats) if (s && s.id === id) return s;
    }
    return null;
  };

  // Phase 5.2 — paired-loveseat atomic selection.
  //
  // Loveseats are physically two cushions on one fused frame (couple-curve).
  // The pairLeft/pairRight flags on each cell mark "I have a loveseat
  // neighbor on that side." A user tapping ONE half selects the WHOLE
  // pair; releasing one half releases both. The same goes for lasso-
  // select and shift-range select. The server enforces this too —
  // /pick and /assign can't half-book a pair — but enforcing it here
  // keeps the UI in sync with the server's reality so a user never sees
  // "1 selected" and gets a 2-seat charge.
  //
  // partnersFor(id) returns [id] for non-paired seats and [leftHalfId,
  // rightHalfId] for either half of a paired loveseat. Caller dedupes.
  const partnersFor = (id) => {
    const seat = find(id);
    if (!seat || seat.t !== 'loveseat') return [id];
    if (!seat.pairLeft && !seat.pairRight) return [id]; // standalone loveseat
    // Locate the row + index, then walk neighbors.
    for (const row of rows) {
      const idx = row.seats.findIndex((s) => s && s.id === id);
      if (idx < 0) continue;
      const partnerIdx = seat.pairRight ? idx + 1 : idx - 1;
      const partner = row.seats[partnerIdx];
      if (partner && partner.t === 'loveseat') {
        return seat.pairRight ? [id, partner.id] : [partner.id, id];
      }
      return [id];
    }
    return [id];
  };
  // expandPair takes an array of ids and returns the same array with
  // every paired-loveseat half expanded to include its partner.
  // Deduplicates so an explicit two-half tap doesn't double-fire.
  const expandPair = (ids) => {
    const out = new Set();
    for (const id of ids) {
      for (const p of partnersFor(id)) out.add(p);
    }
    return [...out];
  };

  const status = (id) => {
    if (assignedSelf.has(id)) return 'self';
    if (assignedOther.has(id)) return 'other';
    return 'open';
  };
  const colorFor = (id, seatType) => {
    const st = status(id);
    if (st === 'self') return BRAND.indigoLight;
    if (st === 'other') return dark ? 'rgba(255,255,255,0.16)' : 'rgba(13,15,36,0.16)';
    return SEAT_TYPES[seatType]?.color || '#999';
  };
  const numberColorFor = (id, seatType) => {
    const st = status(id);
    if (st === 'other') return dark ? 'rgba(255,255,255,0.46)' : 'rgba(13,15,36,0.42)';
    if (st === 'self') return 'rgba(13,18,36,0.86)';
    if (seatType === 'wheelchair' || seatType === 'companion' || seatType === 'dbox') {
      return 'rgba(13,18,36,0.82)';
    }
    return 'rgba(255,255,255,0.78)';
  };
  const opacityFor = (seat) => {
    if (!seat) return 1;
    const st = status(seat.id);
    if (st === 'other') return 0.4;
    if (selected.has(seat.id)) return 1;
    if (highlightSeatType && seat.t !== highlightSeatType) return 0.2;
    return 1;
  };
  const seatNumberNode = (seat, x, y, w = cell, h = cell, key = 'num') => {
    if (!showSeatNumbers || !seat?.n) return null;
    const digits = String(seat.n).length;
    return (
      <text
        key={key}
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={cell * (digits > 2 ? 0.3 : digits > 1 ? 0.36 : 0.43)}
        fontWeight="800"
        fill={numberColorFor(seat.id, seat.t)}
        opacity={status(seat.id) === 'other' ? 0.62 : 1}
        pointerEvents="none"
      >
        {seat.n}
      </text>
    );
  };

  const handleSeatClick = (id, ev) => {
    if (status(id) === 'other') return;
    // Expand this tap to include the loveseat partner if applicable.
    // For a paired loveseat, BOTH halves go to onSelect together — the
    // app's selection state (and the server's hold/finalize) will treat
    // them as one transaction. For a non-paired tile this is a no-op.
    const tapIds = expandPair([id]);
    // If the partner is held by another sponsor, the partner is 'other'
    // and the whole pair must be unselectable. Bail rather than fire a
    // half-pair that the server would reject.
    if (tapIds.some((tid) => status(tid) === 'other')) return;

    if (ev.shiftKey && lastClick.current) {
      const a = find(lastClick.current);
      const b = find(id);
      for (const row of rows) {
        if (
          row.seats.some((s) => s && s.id === a?.id) &&
          row.seats.some((s) => s && s.id === b?.id)
        ) {
          const aIdx = row.seats.findIndex((s) => s && s.id === a.id);
          const bIdx = row.seats.findIndex((s) => s && s.id === b.id);
          const lo = Math.min(aIdx, bIdx);
          const hi = Math.max(aIdx, bIdx);
          const ids = [];
          for (let c = lo; c <= hi; c++) {
            const seat = row.seats[c];
            if (seat && status(seat.id) !== 'other') ids.push(seat.id);
          }
          // Expand any paired-loveseat halves caught in the range to
          // include their partners (in case the partner falls outside
          // the shift-selected window).
          onSelect && onSelect(expandPair(ids), 'add');
          lastClick.current = id;
          return;
        }
      }
    }
    // HAPTIC: light — Phase 2 wires Capacitor Haptics here.
    // Selection check is on the tapped id; the partner follows. The
    // contract: if EITHER half is currently selected, treat the tap
    // as a remove for both. This avoids a quirk where the partner is
    // unselected (e.g. just placed by the server) but the tapped half
    // is selected — we'd flip-flop between half-states. partnersFor()
    // is monotonic: same input → same pair every time.
    const anyHalfSelected = tapIds.some((tid) => selected.has(tid));
    onSelect && onSelect(tapIds, anyHalfSelected ? 'remove' : 'add');
    lastClick.current = id;
  };

  const onMouseDown = (e) => {
    if (!allowLasso) return;
    if (e.target.dataset?.seat) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragging.current = { x0: e.clientX - rect.left, y0: e.clientY - rect.top };
    setLasso({ x: dragging.current.x0, y: dragging.current.y0, w: 0, h: 0 });
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const x0 = dragging.current.x0;
    const y0 = dragging.current.y0;
    setLasso({
      x: Math.min(x, x0),
      y: Math.min(y, y0),
      w: Math.abs(x - x0),
      h: Math.abs(y - y0),
    });
  };
  const onMouseUp = () => {
    if (!dragging.current || !lasso) {
      dragging.current = null;
      setLasso(null);
      return;
    }
    const c = containerRef.current.querySelector('svg');
    const sRect = c.getBoundingClientRect();
    const cRect = containerRef.current.getBoundingClientRect();
    const svgX = (lasso.x - (sRect.left - cRect.left)) * (totalW / sRect.width);
    const svgY = (lasso.y - (sRect.top - cRect.top)) * (totalH / sRect.height);
    const svgW = lasso.w * (totalW / sRect.width);
    const svgH = lasso.h * (totalH / sRect.height);
    const ids = [];
    rows.forEach((row, rIdx) => {
      const y = padTop + rIdx * (cell + gap);
      row.seats.forEach((s, cIdx) => {
        if (!s) return;
        const x = padX + cIdx * (cell + gap);
        if (x + cell > svgX && x < svgX + svgW && y + cell > svgY && y < svgY + svgH) {
          if (status(s.id) !== 'other') ids.push(s.id);
        }
      });
    });
    if (ids.length) {
      // Phase 5.2 — if the lasso clipped one half of a paired loveseat,
      // pull the partner in. Same atomic pairing rule as click.
      const expanded = expandPair(ids).filter((id) => status(id) !== 'other');
      if (expanded.length) onSelect && onSelect(expanded, 'add');
    }
    dragging.current = null;
    setLasso(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        position: 'relative',
        userSelect: 'none',
        cursor: allowLasso ? 'crosshair' : 'default',
        width: '100%',
      }}
    >
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        <rect
          x={totalW * 0.18}
          y={padTop * 0.32}
          width={totalW * 0.64}
          height={3}
          rx={1.5}
          fill={BRAND.red}
          opacity="0.95"
        />
        <text
          x={totalW / 2}
          y={padTop * 0.85}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={cell * 0.5}
          fontWeight="700"
          letterSpacing={3}
          fill={dark ? 'rgba(255,255,255,0.55)' : 'rgba(13,15,36,0.5)'}
        >
          SCREEN
        </text>

        {rows.map((row, rIdx) => {
          const y = padTop + rIdx * (cell + gap);
          const dim = highlightRows && !highlightRows.includes(row.label);
          return (
            <g key={row.label} opacity={dim ? 0.18 : 1}>
              {showLetters && (
                <text
                  x={padX - cell * 0.5}
                  y={y + cell * 0.78}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontSize={cell * 0.65}
                  fontWeight="700"
                  textAnchor="end"
                  fill={dark ? 'rgba(255,255,255,0.5)' : 'rgba(13,15,36,0.5)'}
                >
                  {row.label}
                </text>
              )}
              {showLetters && (
                <text
                  x={totalW - padX + cell * 0.5}
                  y={y + cell * 0.78}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontSize={cell * 0.65}
                  fontWeight="700"
                  fill={dark ? 'rgba(255,255,255,0.5)' : 'rgba(13,15,36,0.5)'}
                >
                  {row.label}
                </text>
              )}
              {row.seats.map((s, cIdx) => {
                if (!s) return null;
                const x = padX + cIdx * (cell + gap);
                const st = status(s.id);
                const isSel = selected.has(s.id);
                const fill = colorFor(s.id, s.t);
                const strokeColor = isSel ? (dark ? '#fff' : BRAND.ink) : 'none';
                const sw = isSel ? 2.5 : 0;

                // Phase 1.13 — fix paired-loveseat overlap and height.
                // Phase 1.11 added a `bonus` widening that caused the right
                // half's left edge to overlap the left half's right edge by
                // ~1.65px, fusing the pair into a single horizontal slab.
                // Also bumped height to 1.05× cell which broke row baseline
                // at small scales. Reverting both: the asymmetric corners
                // alone create the couch silhouette; height stays at cell.
                const isLoveseat = s.t === 'loveseat';
                const isPairLeftHalf = isLoveseat && s.pairRight;  // loveseat to my right -> I'm the left half
                const isPairRightHalf = isLoveseat && s.pairLeft;   // loveseat to my left -> I'm the right half
                const isPairedLove = isPairLeftHalf || isPairRightHalf;

                if (isPairedLove) {
                  // Per-half geometry (cell=22, gap=3 in production):
                  //   leftWidth  = cell + gap          ≈ 25 (absorbs the inter-cell gap)
                  //   rightWidth = cell                ≈ 22 (standard width)
                  //   height     = cell                ≈ 22 (matches standard seat baseline)
                  //   topCorner  = cell * 0.42         ≈ 9.24 (headrest hint)
                  //   bottomCorner = cell * 0.28       ≈ 6.16
                  // Right-half x = cell-grid x (which already starts at the
                  // seam since the left half extended through the gap).
                  const lvHeight = cell;
                  const tc = cell * 0.42;
                  const bc = cell * 0.28;
                  const seamStroke = dark
                    ? (isSel ? 'rgba(13,18,36,0.4)' : 'rgba(255,255,255,0.22)')
                    : (isSel ? 'rgba(13,18,36,0.4)' : 'rgba(13,18,36,0.18)');

                  if (isPairLeftHalf) {
                    // LEFT HALF — outer-left corners rounded, inner-right edge flat.
                    const w = cell + gap;  // absorbs the inter-cell gap, no bonus
                    const seamX = x + w;
                    const path = [
                      `M ${x} ${y + tc}`,
                      `Q ${x} ${y} ${x + tc} ${y}`,
                      `L ${x + w} ${y}`,
                      `L ${x + w} ${y + lvHeight}`,
                      `L ${x + bc} ${y + lvHeight}`,
                      `Q ${x} ${y + lvHeight} ${x} ${y + lvHeight - bc}`,
                      `Z`,
                    ].join(' ');
                    return (
                      <g key={`${row.label}-${cIdx}`}>
                        <path
                          data-seat={s.id}
                          d={path}
                          fill={fill}
                          stroke={strokeColor}
                          strokeWidth={sw}
                          style={{
                            cursor: st === 'other' ? 'not-allowed' : 'pointer',
                            transition: 'fill 0.12s',
                          }}
                          onClick={(e) => handleSeatClick(s.id, e)}
                          opacity={opacityFor(s)}
                        />
                        {seatNumberNode(s, x, y, w, lvHeight)}
                        {/* seam highlight — drawn on the left-half so it's
                            rendered once per pair. Skipped if either half
                            is in 'other' status (faded fill makes it noise). */}
                        {st !== 'other' && (
                          <line
                            x1={seamX - 0.15}
                            y1={y + 1.5}
                            x2={seamX - 0.15}
                            y2={y + lvHeight - 1.5}
                            stroke={seamStroke}
                            strokeWidth={0.6}
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  } else {
                    // RIGHT HALF — inner-left edge flat, outer-right corners rounded.
                    // Width is standard cell width; x is the cell-grid column
                    // position, which already coincides with the seam (the
                    // left half extended through the gap to meet here).
                    const w = cell;
                    const xR = x;
                    const path = [
                      `M ${xR} ${y}`,
                      `L ${xR + w - tc} ${y}`,
                      `Q ${xR + w} ${y} ${xR + w} ${y + tc}`,
                      `L ${xR + w} ${y + lvHeight - bc}`,
                      `Q ${xR + w} ${y + lvHeight} ${xR + w - bc} ${y + lvHeight}`,
                      `L ${xR} ${y + lvHeight}`,
                      `Z`,
                    ].join(' ');
                    return (
                      <g key={`${row.label}-${cIdx}`}>
                        <path
                          data-seat={s.id}
                          d={path}
                          fill={fill}
                          stroke={strokeColor}
                          strokeWidth={sw}
                          style={{
                            cursor: st === 'other' ? 'not-allowed' : 'pointer',
                            transition: 'fill 0.12s',
                          }}
                          onClick={(e) => handleSeatClick(s.id, e)}
                          opacity={opacityFor(s)}
                        />
                        {seatNumberNode(s, xR, y, w, lvHeight)}
                      </g>
                    );
                  }
                }

                // Single (unpaired) loveseat — same width/height as standard
                // but with hint-rounded corners to read as a single armchair.
                if (isLoveseat) {
                  return (
                    <g key={`${row.label}-${cIdx}`}>
                      <rect
                        data-seat={s.id}
                        x={x}
                        y={y}
                        width={cell}
                        height={cell}
                        rx={cell * 0.32}
                        fill={fill}
                        stroke={strokeColor}
                        strokeWidth={sw}
                        style={{
                          cursor: st === 'other' ? 'not-allowed' : 'pointer',
                          transition: 'fill 0.12s',
                        }}
                        onClick={(e) => handleSeatClick(s.id, e)}
                        opacity={opacityFor(s)}
                      />
                      {seatNumberNode(s, x, y)}
                    </g>
                  );
                }

                // Standard seats — unchanged from prior behavior.
                return (
                  <g key={`${row.label}-${cIdx}`}>
                    <rect
                      data-seat={s.id}
                      x={x}
                      y={y}
                      width={cell}
                      height={cell}
                      rx={seatRadius}
                      fill={fill}
                      stroke={strokeColor}
                      strokeWidth={sw}
                      style={{
                        cursor: st === 'other' ? 'not-allowed' : 'pointer',
                        transition: 'fill 0.12s',
                      }}
                      onClick={(e) => handleSeatClick(s.id, e)}
                      opacity={opacityFor(s)}
                    />
                    {seatNumberNode(s, x, y)}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {lasso && lasso.w > 2 && (
        <div
          style={{
            position: 'absolute',
            left: lasso.x,
            top: lasso.y,
            width: lasso.w,
            height: lasso.h,
            border: `1.5px dashed ${BRAND.gold}`,
            background: 'rgba(244,185,66,0.12)',
            pointerEvents: 'none',
            borderRadius: 4,
          }}
        />
      )}
      {allowZoom && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            background: dark ? 'rgba(13,15,36,0.85)' : 'rgba(255,255,255,0.95)',
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            style={{
              width: 30,
              height: 30,
              border: 0,
              background: 'transparent',
              color: dark ? '#fff' : BRAND.ink,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <div
            style={{
              height: 1,
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(13,15,36,0.1)',
            }}
          />
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))}
            style={{
              width: 30,
              height: 30,
              border: 0,
              background: 'transparent',
              color: dark ? '#fff' : BRAND.ink,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            −
          </button>
          <div
            style={{
              height: 1,
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(13,15,36,0.1)',
            }}
          />
          <button
            onClick={() => setZoom(1)}
            style={{
              width: 30,
              height: 30,
              border: 0,
              background: 'transparent',
              color: dark ? '#fff' : BRAND.ink,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            FIT
          </button>
        </div>
      )}
    </div>
  );
};

export const SeatLegend = ({
  dark, // legacy: when omitted, the legend follows the page theme via CSS vars
  types = ['luxury', 'standard', 'wheelchair', 'companion', 'loveseat', 'dbox'],
  showSelf = true,
}) => {
  // When `dark` is explicitly set, honor it (some surfaces are force-dark
  // regardless of the page theme — e.g., a sheet rendered over a light
  // page). When omitted, fall through to var(--ink-on-ground) so light
  // mode renders dark text and dark mode renders light text.
  const textColor =
    dark === true ? 'rgba(255,255,255,0.7)'
    : dark === false ? 'rgba(13,15,36,0.6)'
    : 'var(--ink-on-ground)';
  const takenColor =
    dark === true ? 'rgba(255,255,255,0.16)'
    : dark === false ? 'rgba(13,15,36,0.16)'
    : 'rgba(13,15,36,0.16)';
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        fontSize: 11,
        color: textColor,
        alignItems: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        opacity: dark === undefined ? 0.75 : 1,
      }}
    >
      {types.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{ width: 11, height: 11, borderRadius: 3, background: SEAT_TYPES[t].color }}
          />
          {SEAT_TYPES[t].label}
        </span>
      ))}
      {showSelf && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: BRAND.indigoLight }} />
          Yours
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 3,
            background: takenColor,
          }}
        />
        Taken
      </span>
    </div>
  );
};
