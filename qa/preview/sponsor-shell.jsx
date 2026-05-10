import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/brand/styles.css';
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
  // The portal is one responsive shell now (was Mobile|Desktop split).
  // The ?surface=mobile|desktop query param is preserved for legacy
  // QA scripts but both branches render the same component — viewport
  // size is what determines layout, not a runtime branch.
  const props = {
    portal,
    token: TOKEN,
    theaterLayouts: previewTheaterLayouts,
    seats,
    isDev: false,
    onRefresh: async () => {},
    openSheetOnMount: false,
  };

  return (
    <MemoryRouter initialEntries={[`/sponsor/${TOKEN}`]}>
      <Mobile {...props} />
    </MemoryRouter>
  );
}

installPreviewApi();
createRoot(document.getElementById('root')).render(<PreviewApp />);
