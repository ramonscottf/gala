// Standalone preview of the v2 portal shell using mock portal data.
// Used to screenshot the redesign without needing a live deploy.
//
// Set `?seats=1` on the URL to open the seat picker modal on mount.
// Set `?fresh=1` for a fresh sponsor (no placed seats, window not open).
// Set `?done=1` for "all placed" state.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PortalShellV2 from '../../src/portal-v2/PortalShell.jsx';

const params = new URLSearchParams(window.location.search);
const SEATS_OPEN = params.get('seats') === '1';
const FRESH = params.get('fresh') === '1';
const DONE = params.get('done') === '1';

// Mock portal state — modeled on the real /api/gala/portal/{token} payload.
const mockPortal = {
  identity: {
    kind: 'sponsor',
    id: 89,
    company: 'Wicko Waypoint',
    contactName: 'Scott Foster',
    email: 'ramonscottf@gmail.com',
    phone: '801-810-6642',
    tier: 'Bronze',
    seatsPurchased: 12,
    rsvpStatus: 'completed',
  },
  tierAccess: {
    open: true,
    tier: 'Bronze',
    opensAt: '2026-05-20T14:00:00Z',
  },
  seatMath: {
    total: 12,
    placed: 6,
    delegated: 4,
    available: 6,
  },
  myAssignments: [
    {
      theater_id: 7,
      row_label: 'F',
      seat_num: '7',
      showing_number: 1,
      delegation_id: null,
      guest_name: null,
    },
    {
      theater_id: 7,
      row_label: 'F',
      seat_num: '8',
      showing_number: 1,
      delegation_id: null,
      guest_name: null,
    },
    {
      theater_id: 8,
      row_label: 'D',
      seat_num: '12',
      showing_number: 1,
      delegation_id: null,
      guest_name: 'Ali Foster',
    },
    {
      theater_id: 8,
      row_label: 'D',
      seat_num: '13',
      showing_number: 1,
      delegation_id: null,
      guest_name: 'Ali Foster',
    },
    {
      theater_id: 2,
      row_label: 'E',
      seat_num: '11',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
    },
    {
      theater_id: 2,
      row_label: 'E',
      seat_num: '12',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
    },
  ],
  myHolds: [],
  childDelegations: [
    {
      id: 1,
      guest_name: 'Aaron Sessions',
      guest_email: 'aaron@example.com',
      seat_count: 2,
    },
  ],
  childDelegationAssignments: [
    {
      theater_id: 7,
      row_label: 'G',
      seat_num: '5',
      delegation_id: 1,
    },
  ],
  allAssignments: [],
  showtimes: [
    {
      theater_id: 7,
      movie_id: 21,
      showing_number: 1,
      dinner_time: '4:30 PM',
      show_start: '5:00 PM',
      capacity: 203,
      movie_title: 'How to Train Your Dragon',
      runtime_minutes: 98,
      poster_url: 'https://image.tmdb.org/t/p/w500/ygGmAO60t8GyqUo9xYeYxSZAR3b.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/59vDC1BuEQvti24OMr0ZvtAK6R1.jpg',
      synopsis:
        "Hiccup is expected to prove himself by defeating a dragon. Instead, he befriends Toothless and begins changing what his village believes is possible.",
      rating: 'PG',
      year: 2010,
      stream_uid: 'fc9162d980d58a167d8577ded4c4f1e6',
      tmdb_score: 7.857,
      rt_critics_score: 99,
      rt_audience_score: 91,
      theater_tier: 'premier',
      theater_notes: 'How to Train Your Dragon (both showings)',
    },
    {
      theater_id: 2,
      movie_id: 17,
      showing_number: 1,
      dinner_time: '4:30 PM',
      show_start: '5:00 PM',
      capacity: 113,
      movie_title: 'Paddington 2',
      runtime_minutes: 104,
      poster_url: 'https://image.tmdb.org/t/p/w500/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/kRVUMsXFzhuXjr20JcCGc6TapxA.jpg',
      synopsis:
        'Paddington takes on odd jobs to buy the perfect gift for Aunt Lucy. When the gift is stolen, the Browns rally around him to set things right.',
      rating: 'PG',
      year: 2017,
      stream_uid: 'cb3eee6d88abd02af1f83ac09d2c929e',
      tmdb_score: 7.475,
      rt_critics_score: 99,
      rt_audience_score: 89,
      theater_tier: 'good',
    },
    {
      theater_id: 8,
      movie_id: 13,
      showing_number: 1,
      dinner_time: '4:30 PM',
      show_start: '4:50 PM',
      capacity: 266,
      movie_title: 'Star Wars: The Mandalorian and Grogu',
      runtime_minutes: 132,
      poster_url: 'https://image.tmdb.org/t/p/w500/qSWiY6KAvkapXJWeyNrmDGYWQwr.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/arjGfQaakBlmfWQGNdG2nFxrpMQ.jpg',
      synopsis:
        'Imperial warlords remain scattered across the galaxy while the New Republic fights to protect what the Rebellion won.',
      rating: 'PG-13',
      year: 2026,
      stream_uid: 'fa5d7c4fcb561113d1ed816665737eea',
      theater_tier: 'premier',
    },
    {
      theater_id: 3,
      movie_id: 14,
      showing_number: 1,
      dinner_time: '4:30 PM',
      show_start: '5:00 PM',
      capacity: 67,
      movie_title: 'The Breadwinner',
      runtime_minutes: 95,
      poster_url: 'https://image.tmdb.org/t/p/w500/4apG9Xk6HQvV48JKEjSUeiebju7.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/epIN71wb1bZBPmPu0EV4z6ce5J8.jpg',
      synopsis:
        'Nate Wilcox becomes the stay-at-home parent while his wife takes a career-changing opportunity, and the whole family has to adjust.',
      rating: 'PG',
      year: 2026,
      stream_uid: '22d5e5b97a4bc86ffeea9fa747f633a8',
      rt_critics_score: 95,
      rt_audience_score: 88,
      theater_tier: 'mid',
    },
  ],
};

if (FRESH) {
  mockPortal.seatMath = { total: 12, placed: 0, delegated: 0, available: 12 };
  mockPortal.myAssignments = [];
  mockPortal.tierAccess = { open: false, tier: 'Bronze', opensAt: '2026-05-20T14:00:00Z' };
  mockPortal.childDelegations = [];
}

if (DONE) {
  mockPortal.seatMath = { total: 6, placed: 6, delegated: 0, available: 0 };
  mockPortal.myAssignments = mockPortal.myAssignments.slice(0, 6);
}

const noopRefresh = async () => mockPortal;

const initialPath = SEATS_OPEN ? '/preview-token/seats' : '/preview-token';

function PreviewApp() {
  const [layouts, setLayouts] = useState(null);
  useEffect(() => {
    fetch('/data/theater-layouts.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setLayouts)
      .catch(() => setLayouts({}));
  }, []);

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <PortalShellV2
        portal={mockPortal}
        token="preview-token"
        theaterLayouts={layouts}
        seats={{ allSelfIds: new Set(), assigned: {}, totalAssigned: 6 }}
        onRefresh={noopRefresh}
        openSheetOnMount={SEATS_OPEN}
      />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<PreviewApp />);
