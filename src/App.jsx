// Router root — viewport-aware shell that dispatches to Mobile/MobileWizard
// (<880px) or Desktop (≥880px). Routes are relative to the /sponsor
// basename set by main.jsx, so they read as ('/:token', '/:token/seats').
// The previous multi-prefix scheme (/gala-dev, /gala-seats, /gala) is gone
// after the May 2026 migration to gala.daviskids.org.

import { useEffect, useState } from 'react';
import { Routes, Route, useParams, useLocation } from 'react-router-dom';
import { config } from './config.js';
import { TOKENS } from './brand/tokens.js';
import { usePortal } from './hooks/usePortal.js';
import { useSeats } from './hooks/useSeats.js';
import { useViewport } from './hooks/useViewport.js';
import Mobile from './portal/Mobile.jsx';
import MobileWizard from './portal/MobileWizard.jsx';
import Desktop from './portal/Desktop.jsx';

function isDevPrefix() {
  // No dev mirror in the gala repo — single /sponsor prefix only.
  // Returning false retires every dev-only banner/marker downstream.
  return false;
}

function useTheaterLayouts() {
  const [layouts, setLayouts] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${config.apiBase}/data/theater-layouts.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (alive) setLayouts(j);
      })
      .catch((e) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { layouts, error };
}

function FullScreenMessage({ children, accent = TOKENS.brand.red }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: TOKENS.surface.ground,
        color: TOKENS.text.primary,
        fontFamily: TOKENS.font.ui,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: accent,
            marginBottom: 16,
            textTransform: 'uppercase',
          }}
        >
          DEF Gala · 2026
        </div>
        <div
          style={{
            fontFamily: TOKENS.font.ui,
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.2,
            color: TOKENS.text.primary,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PortalContainer() {
  const { token } = useParams();
  const location = useLocation();
  const { isMobile } = useViewport();
  const portal = usePortal(token);
  const { layouts, error: layoutsError } = useTheaterLayouts();
  const seats = useSeats(portal.state, token, portal.refresh);
  const dev = isDevPrefix();
  const onSeatsRoute = location.pathname.endsWith('/seats');

  if (portal.loading) {
    return <FullScreenMessage accent={TOKENS.text.tertiary}>Loading your portal…</FullScreenMessage>;
  }
  if (portal.error) {
    return (
      <FullScreenMessage accent={TOKENS.brand.red}>
        We couldn't load your portal — your invite link may have expired or be invalid.
        <div style={{ fontSize: 13, color: TOKENS.text.tertiary, marginTop: 18 }}>
          {String(portal.error.message || portal.error)}
        </div>
      </FullScreenMessage>
    );
  }
  if (layoutsError) {
    return (
      <FullScreenMessage accent={TOKENS.brand.red}>
        Theater layouts failed to load.
        <div style={{ fontSize: 13, color: TOKENS.text.tertiary, marginTop: 18 }}>
          {String(layoutsError.message || layoutsError)}
        </div>
      </FullScreenMessage>
    );
  }

  if (isMobile) {
    if (onSeatsRoute) {
      return (
        <MobileWizard
          portal={portal.state}
          token={token}
          theaterLayouts={layouts}
          seats={seats}
          onDone={() => portal.refresh()}
          apiBase={config.apiBase}
          onRefresh={portal.refresh}
        />
      );
    }
    return (
      <Mobile
        portal={portal.state}
        token={token}
        theaterLayouts={layouts}
        seats={seats}
        isDev={dev}
        onRefresh={portal.refresh}
      />
    );
  }

  return (
    <Desktop
      portal={portal.state}
      token={token}
      theaterLayouts={layouts}
      seats={seats}
      isDev={dev}
      initialStep={onSeatsRoute ? 3 : 1}
      apiBase={config.apiBase}
      onRefresh={portal.refresh}
    />
  );
}

export default function App() {
  return (
    <main id="main-content" style={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/:token" element={<PortalContainer />} />
        <Route path="/:token/seats" element={<PortalContainer />} />
        <Route
          path="*"
          element={
            <FullScreenMessage>
              Add your sponsor token to the URL —<br />
              <span
                style={{
                  fontFamily: TOKENS.font.displaySerif,
                  fontStyle: 'italic',
                  color: TOKENS.brand.gold,
                }}
              >
                /sponsor/{'{your-token}'}
              </span>
            </FullScreenMessage>
          }
        />
      </Routes>
    </main>
  );
}
