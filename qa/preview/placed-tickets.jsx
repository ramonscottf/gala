// qa/preview/placed-tickets.jsx
//
// Local-dev-only harness for PlacedTicketsPreview. Mounts the component
// with realistic mock data so we can eyeball/snapshot it in isolation.
// Requires `npm run dev` (vite) to serve. CI-runnable follow-up tracked
// separately — see Task 9 commit body.

import { createRoot } from 'react-dom/client';
import PlacedTicketsPreview from '../../src/portal/components/PlacedTicketsPreview.jsx';

const mock = {
  theaterId: 5,
  theaterName: 'Auditorium 5',
  movieTitle: 'Wicked: Part Two',
  showLabel: 'Late',
  showTime: '8:30 PM',
  seatIds: ['F-12', 'F-13'],
  posterUrl: null,
};

createRoot(document.getElementById('root')).render(<PlacedTicketsPreview placed={mock} />);
