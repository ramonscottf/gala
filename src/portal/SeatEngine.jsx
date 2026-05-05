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

import { useRef, useState } from 'react';
import { BRAND } from '../brand/tokens.js';

// Brand-coherent palette over the navy ground. Real types from theater-
// layouts.json mapped to colors that read well against #0f1639. Yours (gold)
// is reserved for the user's own seats and applied at render time.
export const SEAT_TYPES = {
  luxury: { label: 'Luxury Recliner', short: 'Luxury', color: '#3b3f9f' },
  standard: { label: 'Standard', short: 'Standard', color: '#5a6e8f' },
  wheelchair: { label: 'Wheelchair', short: 'Accessible', color: '#0ea5e9' },
  companion: { label: 'Companion', short: 'Companion', color: '#7dd3fc' },
  loveseat: { label: 'Loveseat', short: 'Loveseat', color: '#6a3a9a' },
  dbox: { label: 'D-BOX', short: 'D-BOX', color: '#f4b942' },
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
  theme = 'dark',
  assignedSelf = new Set(),
  assignedOther = new Set(),
  selected = new Set(),
  onSelect,
  showLetters = true,
  allowZoom = true,
  allowLasso = true,
  zoom: zoomProp,
  onZoomChange,
  highlightRows,
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
  const dark = theme === 'dark';

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

  const handleSeatClick = (id, ev) => {
    if (status(id) === 'other') return;
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
          onSelect && onSelect(ids, 'add');
          lastClick.current = id;
          return;
        }
      }
    }
    // HAPTIC: light — Phase 2 wires Capacitor Haptics here.
    onSelect && onSelect([id], selected.has(id) ? 'remove' : 'add');
    lastClick.current = id;
  };

  const onMouseDown = (e) => {
    if (!allowLasso) return;
    if (e.target.tagName === 'rect' && e.target.dataset.seat) return;
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
    if (ids.length) onSelect && onSelect(ids, 'add');
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
                          opacity={st === 'other' ? 0.4 : 1}
                        />
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
                      <path
                        key={`${row.label}-${cIdx}`}
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
                        opacity={st === 'other' ? 0.4 : 1}
                      />
                    );
                  }
                }

                // Single (unpaired) loveseat — same width/height as standard
                // but with hint-rounded corners to read as a single armchair.
                if (isLoveseat) {
                  return (
                    <rect
                      key={`${row.label}-${cIdx}`}
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
                      opacity={st === 'other' ? 0.4 : 1}
                    />
                  );
                }

                // Standard seats — unchanged from prior behavior.
                return (
                  <rect
                    key={`${row.label}-${cIdx}`}
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
                    opacity={st === 'other' ? 0.4 : 1}
                  />
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
            bottom: 8,
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
  dark = true,
  types = ['luxury', 'standard', 'wheelchair', 'companion', 'loveseat', 'dbox'],
  showSelf = true,
}) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14,
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(13,15,36,0.6)',
      alignItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
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
          background: dark ? 'rgba(255,255,255,0.16)' : 'rgba(13,15,36,0.16)',
        }}
      />
      Taken
    </span>
  </div>
);
