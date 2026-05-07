// src/hooks/useFinalize.js
//
// Shared /finalize POST handler. Replaces the duplicated finalize
// logic in Desktop.jsx (line 1701, StepConfirm.finalize) and
// MobileWizard.jsx (line 2136, exit). Both canonical shells consume
// this hook so the request body and response handling are byte-
// identical.
//
// Server contract (functions/api/gala/portal/[token]/finalize.js):
//   - Permissive: only requires >= 1 placed seat.
//   - Does NOT check dinner choices, total seat count vs entitled,
//     or any other gate.
//   - Flips sponsors.rsvp_status = 'completed' on success and fires
//     QR email + SMS via Twilio. The seat rows themselves remain
//     editable until June 9 — finalize is a notification trigger,
//     not a lock.
//
// Request: POST {apiBase}/api/gala/portal/{token}/finalize, body {}.
// Response: { ok, finalized, seatCount, checkInUrl, qrImgUrl,
//             email: { sent }, sms: { sent } } — consumed by
// ConfirmationScreen.

import { useState } from 'react';

export function useFinalize({ apiBase, token, onRefresh, initialConfirmationData = null }) {
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  // initialConfirmationData supports seeding from external sources
  // (e.g. Mobile.jsx promotes route state from MobileWizard's legacy
  // exit() flow). Default null = canonical first-time finalize.
  const [confirmationData, setConfirmationData] = useState(initialConfirmationData);

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setConfirmationData(data);
      if (onRefresh) await onRefresh();
      return data;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setFinalizing(false);
    }
  };

  return { finalize, finalizing, error, confirmationData, setConfirmationData };
}
