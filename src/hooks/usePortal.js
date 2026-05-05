// usePortal — single source of truth for /api/gala/portal/{token}.
//
// Returns { state, refresh, error, loading } so consumers can opt in to a
// re-fetch after a successful /pick (or any other mutation). State shape
// mirrors the API response; the hook does no derivation.
//
// We deliberately do NOT cache anything in localStorage / sessionStorage —
// the SKILL.md Capacitor-readiness rule mandates that auth/identity state
// stays in React state. The token in the URL IS the auth.

import { useCallback, useEffect, useState } from 'react';
import { config } from '../config.js';

export function usePortal(token) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    // Keep the shell mounted during post-load refreshes. Several UI flows
    // refresh server state before opening a sheet; flipping loading=true
    // after initial load unmounts the caller before its next setState runs.
    try {
      const res = await fetch(`${config.apiBase}/api/gala/portal/${token}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      setState(json);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setState(null);
    setError(null);
    setLoading(true);
    refresh();
  }, [refresh]);

  return { state, refresh, error, loading };
}

// Conversions between the design's 'early'|'late' string IDs and the API's
// numeric showing_number (1|2). Used everywhere tickets and showtimes are
// rendered against the design's components.
export const SHOWING_ID_TO_NUMBER = { early: 1, late: 2 };
export const SHOWING_NUMBER_TO_ID = { 1: 'early', 2: 'late' };

/** theater_tier → format badge label (matches design's FormatBadge). */
export function formatBadgeFor(theaterTier, theaterNotes) {
  if (theaterNotes && /\bIMAX\b/i.test(theaterNotes)) return 'IMAX';
  if (theaterTier === 'premier') return 'Premier';
  return 'Standard';
}
