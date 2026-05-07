import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/brand/styles.css';
import Desktop from '../../src/portal/Desktop.jsx';
import Mobile from '../../src/portal/Mobile.jsx';
import {
  createPreviewPortal,
  createPreviewSeats,
  previewTheaterLayouts,
} from './mock-sponsor-data.js';

const TOKEN = 'preview-token';

const installPreviewApi = () => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes(`/api/gala/portal/${TOKEN}`)) {
      return nativeFetch(input, init);
    }

    if (url.includes('/finalize')) {
      return Response.json({
        ok: true,
        finalized: true,
        seatCount: 10,
        checkInUrl: `https://gala.daviskids.org/checkin?t=${TOKEN}`,
        qrImgUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(TOKEN)}`,
        email: { sent: true },
        sms: { sent: true },
      });
    }

    if (url.includes('/delegate')) {
      return Response.json({
        ok: true,
        delegation: {
          id: Date.now(),
          token: 'preview-delegate-new',
          delegateName: 'Preview Guest',
          seatsAllocated: 1,
          seatsPlaced: 0,
          status: 'pending',
        },
      });
    }

    return Response.json({ ok: true });
  };
};

function PreviewApp() {
  const [portal, setPortal] = useState(() => createPreviewPortal());
  const seats = useMemo(() => createPreviewSeats(portal, setPortal), [portal]);
  const surface = new URLSearchParams(window.location.search).get('surface') || 'desktop';
  const props = {
    portal,
    token: TOKEN,
    theaterLayouts: previewTheaterLayouts,
    seats,
    isDev: false,
    onRefresh: async () => {},
    openSheetOnMount: false,
  };

  if (surface === 'mobile') {
    return (
      <MemoryRouter initialEntries={[`/sponsor/${TOKEN}`]}>
        <Mobile {...props} />
      </MemoryRouter>
    );
  }

  return (
    <MemoryRouter initialEntries={[`/sponsor/${TOKEN}`]}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Desktop {...props} />
        <div
          data-testid="desktop-companion-notes"
          style={{
            position: 'fixed',
            left: 18,
            bottom: 16,
            zIndex: 5,
            maxWidth: 310,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(7,10,29,0.82)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: 'rgba(255,255,255,0.78)',
            font: '600 11px/1.45 Inter, system-ui, sans-serif',
            letterSpacing: 0.2,
            boxShadow: '0 14px 38px rgba(0,0,0,0.28)',
          }}
        >
          Same flow as mobile. Desktop adds summary context around the live portal, not a second wizard.
        </div>
      </div>
    </MemoryRouter>
  );
}

installPreviewApi();
createRoot(document.getElementById('root')).render(<PreviewApp />);
