// Shared time + overlap utilities for the gala movie scheduler.
// Pure functions — no DOM, no fetch — usable from both Worker and browser.

/**
 * Parse "4:30 PM", "16:30", "4:30pm", " 4:30 PM " into total minutes from midnight.
 * Returns null if unparseable.
 */
export function parseTimeToMinutes(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // 12-hour: "4:30 PM" / "12:00am" / "4:30 p.m."
  const m12 = raw.match(/^(\d{1,2}):?(\d{2})?\s*([ap])\.?\s*m\.?$/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2] || 0);
    const isPm = m12[3].toLowerCase() === 'p';
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  // 24-hour: "16:30" / "04:30"
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  return null;
}

/** Format minutes from midnight as "4:30 PM". */
export function formatMinutes12h(mins) {
  if (mins == null || isNaN(mins)) return '';
  const h24 = Math.floor(mins / 60) % 24;
  const m = ((mins % 60) + 60) % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Compute end time of a showing.
 * Returns minutes-from-midnight, or null if unable.
 *
 * Total room occupancy = pre-roll (DEF intro video) + movie runtime.
 * (The 15-min sponsor reel loops during dinner — it's not part of the
 *  show timing, so it isn't added here.)
 *
 * showStart: parseable time string (the moment the lights dim — pre-roll begins)
 * runtimeMinutes: movie length in minutes
 * trailerMinutes: pre-roll minutes (default 5 — the DEF intro video)
 * messagingMinutes: legacy parameter, default 0; kept for backward compat with callers
 */
export function computeShowEnd(showStart, runtimeMinutes, trailerMinutes = 5, messagingMinutes = 0) {
  const start = parseTimeToMinutes(showStart);
  if (start == null || !runtimeMinutes) return null;
  return start
    + Number(messagingMinutes || 0)
    + Number(trailerMinutes || 0)
    + Number(runtimeMinutes);
}

/**
 * Round minutes-from-midnight UP to the nearest 5-minute mark.
 * Used so auto-suggested start times read cleanly (e.g. 7:05 PM, not 7:03 PM).
 */
export function roundUpToFive(mins) {
  if (mins == null) return null;
  const r = mins % 5;
  return r === 0 ? mins : mins + (5 - r);
}

/**
 * Recommend a start time for showing 2 in a given auditorium based on showing 1.
 * Honors the cleaning turnover and a hard floor (so even short movies don't
 * push showing 2 too early — Scott wants 7:30 PM minimum).
 *
 * showing1End: minutes-from-midnight when showing 1 finishes (movie + pre-roll)
 * turnoverMinutes: cleaning gap between showings (default 30)
 * floorMinutes: earliest acceptable showing 2 start (default 19:30 = 7:30 PM)
 *
 * Returns { startMinutes, startLabel } or null if showing 1 end unknown.
 */
export function recommendShowing2Start(showing1End, turnoverMinutes = 30, floorMinutes = 19 * 60 + 30) {
  if (showing1End == null) return null;
  const earliestByTurnover = roundUpToFive(showing1End + Number(turnoverMinutes || 0));
  const startMinutes = Math.max(earliestByTurnover, floorMinutes);
  return {
    startMinutes,
    startLabel: formatMinutes12h(startMinutes),
    enforcedFloor: startMinutes === floorMinutes && earliestByTurnover < floorMinutes,
  };
}

/**
 * Detect overlap between showing 1 and showing 2 in the SAME auditorium.
 * Returns { overlap: bool, conflictMinutes: number, message: string|null }.
 *
 * showing1End: minutes from midnight (or null if cannot compute)
 * showing2Start: minutes from midnight (or null)
 * turnoverMinutes: required gap between showings for cleanup (default 30)
 */
export function checkOverlap(showing1End, showing2Start, turnoverMinutes = 30) {
  if (showing1End == null || showing2Start == null) {
    return { overlap: false, conflictMinutes: 0, message: null, ok: true };
  }
  const requiredStart = showing1End + turnoverMinutes;
  if (showing2Start < showing1End) {
    return {
      overlap: true,
      conflictMinutes: showing1End - showing2Start,
      ok: false,
      message: `Showing 2 starts at ${formatMinutes12h(showing2Start)} but showing 1 doesn't end until ${formatMinutes12h(showing1End)}.`,
    };
  }
  if (showing2Start < requiredStart) {
    return {
      overlap: false,
      conflictMinutes: 0,
      tight: true,
      ok: true,
      message: `Tight turnaround — only ${showing2Start - showing1End} minutes between showing 1 ending and showing 2 starting (recommend ${turnoverMinutes}+).`,
    };
  }
  return { overlap: false, conflictMinutes: 0, ok: true, message: null };
}
