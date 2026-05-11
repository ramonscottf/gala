// FlowError — Phase 5.13
//
// A single, global, dead-center modal for flow-blocking errors.
// Lives at the Portal shell root, sits above ALL sheets and content
// regardless of scroll position, dismissible with a primary button.
//
// Problem this solves: Kara hit the orphan-seat-rule warning while
// trying to commit Dragon early. The warning was correctly set on
// SeatPickSheet's local error state, but it rendered as an inline
// banner BELOW the seat map. On her phone with text-zoom enabled
// (accessibility mode many older users live in), the warning was
// below the viewport edge. She saw the Commit button refusing to
// progress and had no idea why.
//
// The fix: any error that prevents flow progression now fires
// showFlowError(message) instead of (or in addition to) inline
// banners. The user gets a dead-center card they can't miss, with
// the actual reason, and a dismiss button. Once they tap to dismiss
// they're back in the flow with the offending state to fix.
//
// Usage:
//   // At Portal shell root:
//   <FlowErrorProvider>
//     {/* whole app */}
//   </FlowErrorProvider>
//
//   // In any component inside:
//   const { showFlowError } = useFlowError();
//   showFlowError("That selection would leave seat 12 alone in row C...");
//
//   // With optional title and action label:
//   showFlowError(msg, { title: "Can't place these seats" });
//
// Design:
//   - Fixed-position overlay, z-index above sheets (sheets are z=50,
//     modal is z=200)
//   - Centered card 320-380px wide
//   - Dismiss-on-backdrop-tap defaults ON (matches Kara's "dismissable
//     small warning window" spec)
//   - Single primary "Got it" button
//   - ⚠️ icon, title, body

import { createContext, useCallback, useContext, useState } from 'react';
import { BRAND, FONT_DISPLAY } from '../../brand/tokens.js';

const FlowErrorContext = createContext({
  showFlowError: () => {},
  hideFlowError: () => {},
});

export function useFlowError() {
  return useContext(FlowErrorContext);
}

export function FlowErrorProvider({ children }) {
  const [state, setState] = useState(null); // { message, title } | null

  const showFlowError = useCallback((message, opts = {}) => {
    if (!message) return;
    setState({
      message: String(message),
      title: opts.title || 'Heads up',
    });
  }, []);

  const hideFlowError = useCallback(() => setState(null), []);

  return (
    <FlowErrorContext.Provider value={{ showFlowError, hideFlowError }}>
      {children}
      {state && (
        <FlowErrorModal
          title={state.title}
          message={state.message}
          onDismiss={hideFlowError}
        />
      )}
    </FlowErrorContext.Provider>
  );
}

function FlowErrorModal({ title, message, onDismiss }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="flow-error-title"
      aria-describedby="flow-error-message"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        // Above Sheet (z=50) and any other portal-layer chrome.
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'flow-error-fade-in 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: BRAND.navyDeep,
          color: '#fff',
          borderRadius: 16,
          border: `1px solid rgba(215,40,70,0.35)`,
          boxShadow:
            '0 24px 48px -16px rgba(0,0,0,0.6), 0 8px 16px -10px rgba(0,0,0,0.5)',
          padding: '20px 22px 18px',
          textAlign: 'center',
          animation: 'flow-error-scale-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 99,
            background: 'rgba(215,40,70,0.18)',
            border: `1px solid rgba(215,40,70,0.35)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: 22,
          }}
        >
          ⚠️
        </div>
        <div
          id="flow-error-title"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: -0.2,
            marginBottom: 8,
            color: '#fff',
          }}
        >
          {title}
        </div>
        <div
          id="flow-error-message"
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 18,
          }}
        >
          {message}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          autoFocus
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: '100%',
            padding: '12px 18px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,#4a7df0,#2858d6)',
            color: '#fff',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
