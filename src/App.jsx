// Router root — viewport-aware shell that dispatches to Mobile (<880px) or
// Desktop (≥880px). Routes are relative to the /sponsor basename set by
// main.jsx, so they read as ('/:token', '/:token/seats'). The previous
// multi-prefix scheme (/gala-dev, /gala-seats, /gala) is gone after the
// May 2026 migration to gala.daviskids.org.
//
// Task 11: `/seats` deep link routes through canonical Mobile/Desktop +
// SeatPickSheet via `openSheetOnMount={onSeatsRoute}`. The legacy
// MobileWizard branch is gone (Task 8 removes the file).

import { useEffect, useState } from 'react';
import { Routes, Route, useParams, useLocation } from 'react-router-dom';
import { config } from './config.js';
import { BRAND, FONT_DISPLAY, FONT_UI } from './brand/tokens.js';
import { usePortal } from './hooks/usePortal.js';
import { useSeats } from './hooks/useSeats.js';
import { useViewport } from './hooks/useViewport.js';
import { useTheme } from './hooks/useTheme.js';
import Mobile from './portal/Mobile.jsx';
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

function FullScreenMessage({ children, accent = BRAND.gold }) {
  const { isLight } = useTheme();
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: isLight
          ? `radial-gradient(ellipse 120% 60% at 50% -10%, #fff 0%, ${BRAND.paper} 60%)`
          : BRAND.groundDeep,
        color: isLight ? BRAND.ink : '#fff',
        fontFamily: FONT_UI,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: accent, marginBottom: 12 }}>
          DEF GALA · 2026
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, lineHeight: 1.15 }}>{children}</div>
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
    return <FullScreenMessage accent={BRAND.mute}>Loading your portal…</FullScreenMessage>;
  }
  if (portal.error) {
    return (
      <FullScreenMessage accent={BRAND.red}>
        We couldn't load your portal — your invite link may have expired or be invalid.
        <div style={{ fontSize: 13, color: BRAND.mute, marginTop: 18 }}>
          {String(portal.error.message || portal.error)}
        </div>
      </FullScreenMessage>
    );
  }
  if (layoutsError) {
    return (
      <FullScreenMessage accent={BRAND.red}>
        Theater layouts failed to load.
        <div style={{ fontSize: 13, color: BRAND.mute, marginTop: 18 }}>
          {String(layoutsError.message || layoutsError)}
        </div>
      </FullScreenMessage>
    );
  }

  if (isMobile) {
    return (
      <Mobile
        portal={portal.state}
        token={token}
        theaterLayouts={layouts}
        seats={seats}
        isDev={dev}
        onRefresh={portal.refresh}
        openSheetOnMount={onSeatsRoute}
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
      openSheetOnMount={onSeatsRoute}
      apiBase={config.apiBase}
      onRefresh={portal.refresh}
    />
  );
}

export default function App() {
  return (
    <main id="main-content" style={{ height: '100dvh' }}>
      <Routes>
        <Route path="/:token" element={<PortalContainer />} />
        <Route path="/:token/seats" element={<PortalContainer />} />
        <Route
          path="*"
          element={
            <FullScreenMessage>
              Add your sponsor token to the URL —<br />
              <span style={{ color: BRAND.gold, fontStyle: 'italic' }}>/sponsor/{'{your-token}'}</span>
            </FullScreenMessage>
          }
        />
      </Routes>
    </main>
  );
}
