// qa/preview/placed-tickets.jsx
//
// Local-dev-only harness for PlacedTicketsPreview. Mounts the component
// with realistic mock data so we can eyeball/snapshot it in isolation.
// Requires `npm run dev` (vite) to serve. CI-runnable follow-up tracked
// in issue #2.
//
// Imports the global brand styles so CSS variables (--ground, --surface,
// --ink-on-ground, --mute, --accent-text, --rule) are available — the
// component is theme-aware, so without these vars it would render with
// "unset" fallback colors. The browser's prefers-color-scheme drives
// the theme; Playwright sets that per-project via the colorScheme
// option in qa/playwright.config.js.

import { createRoot } from 'react-dom/client';
import '../../src/brand/styles.css';
import PlacedTicketsPreview from '../../src/portal/components/PlacedTicketsPreview.jsx';

const mock = {
  theaterName: 'Auditorium 5',
  movieTitle: 'Wicked: Part Two',
  showLabel: 'Late',
  showTime: '8:30 PM',
  seatIds: ['F-12', 'F-13'],
};

createRoot(document.getElementById('root')).render(<PlacedTicketsPreview placed={mock} />);
