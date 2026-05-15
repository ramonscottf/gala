// Router root — renders the Portal shell (formerly the "Mobile" shell).
// As of May 2026 the portal is one responsive web app, not two
// viewport-split shells. Phones, tablets, laptops all hit the same
// component tree; CSS handles the layout differences. The legacy
// Desktop.jsx file stays on disk for reference but is no longer
// routed to (will be deleted in a follow-up cleanup pass).
//
// Routes are relative to the /sponsor basename set by main.jsx, so
// they read as ('/:token', '/:token/seats'). The previous multi-prefix
// scheme (/gala-dev, /gala-seats, /gala) is gone after the May 2026
// migration to gala.daviskids.org.
//
// `/seats` deep link routes through the canonical shell + SeatPickSheet
// via `openSheetOnMount={onSeatsRoute}`.

import { useEffect, useState } from 'react';
import { Routes, Route, useParams, useLocation } from 'react-router-dom';
import { config } from './config.js';
import { BRAND, FONT_DISPLAY, FONT_UI } from './brand/tokens.js';
import { usePortal } from './hooks/usePortal.js';
import { useSeats } from './hooks/useSeats.js';
import { useTheme } from './hooks/useTheme.js';
// Portal v2 — soft-website redesign. Pulls visual language directly from
// the gala homepage (gala.daviskids.org/) — Fraunces serif, gradient strip
// cards, paper-feel info pills, no app-shell. The previous Portal.jsx
// (boarding-pass cards + iOS glass-pill tab bar) is preserved on disk for
// reference but no longer routed to.
import PortalShellV2 from './portal-v2/PortalShell.jsx';

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

  return (
    <PortalShellV2
      portal={portal.state}
      token={token}
      theaterLayouts={layouts}
      seats={seats}
      onRefresh={portal.refresh}
      openSheetOnMount={onSeatsRoute}
    />
  );
}

export default function App() {
  // The <main> wrapper used to set height: 100dvh to lock the app-shell
  // portal (boarding-pass card + glass tab bar managed their own scroll
  // regions inside it). The v2 soft-website portal is a normal scrolling
  // page — there's nothing to lock — so the wrapper just supplies the
  // a11y landmark with min-height filling the viewport for short pages
  // (loading/error states). Natural document scroll otherwise.
  return (
    <main id="main-content" style={{ minHeight: '100dvh' }}>
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
