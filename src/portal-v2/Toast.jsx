// Toast — non-blocking confirmation message that slides in from the top
// and auto-dismisses. Used to confirm destructive or save actions where
// the modal closes back to the underlying page (release seat, reassign,
// move group, profile save, etc.).
//
// Usage: PortalShell holds a single `toast` state shaped as
//   { kind: 'success'|'error', message: string, key: number }
// and renders <Toast key={toast.key} {...toast} onDone={() => setToast(null)} />.
// The `key` prop bumps on each new toast so React remounts and the
// auto-dismiss timer restarts cleanly.

import { useEffect } from 'react';

export function Toast({ kind = 'success', message, onDone, durationMs = 3000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => { if (onDone) onDone(); }, durationMs);
    return () => clearTimeout(t);
  }, [message, onDone, durationMs]);

  if (!message) return null;

  return (
    <div
      className={`p2-toast p2-toast-${kind}`}
      role="status"
      aria-live="polite"
    >
      <span className="p2-toast-icon" aria-hidden="true">
        {kind === 'error' ? '✕' : '✓'}
      </span>
      <span className="p2-toast-msg">{message}</span>
    </div>
  );
}
