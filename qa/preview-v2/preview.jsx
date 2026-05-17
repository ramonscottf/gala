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
import { CelebrationOverlay } from '../../src/portal-v2/CelebrationOverlay.jsx';

const params = new URLSearchParams(window.location.search);
const SEATS_OPEN = params.get('seats') === '1';
const FRESH = params.get('fresh') === '1';
const DONE = params.get('done') === '1';
const CELEBRATE = params.get('celebrate') === '1';
const RECEIVE = params.get('receive') === '1';

// Mock portal state — modeled on the real /api/gala/portal/{token} payload.
const mockPortal = {
  identity: {
    kind: 'sponsor',
    id: 89,
    company: 'Wicko Waypoint',
    contactName: 'Scott Foster',
    email: 'ramonscottf@gmail.com',
    phone: '801-810-6642',
    tier: 'Platinum',
    seatsPurchased: 20,
    rsvpStatus: 'completed',
  },
  tierAccess: {
    open: true,
    tier: 'Platinum',
    opensAt: '2026-05-11T14:00:00Z',
  },
  seatMath: {
    total: 20,
    placed: 4,
    delegated: 6, // Ali=2 + Aaron=4
    available: 10,
  },
  myAssignments: [
    // One seat in Paddington (H1, Late showing, Auditorium 1) — meal picked
    {
      theater_id: 1,
      row_label: 'H',
      seat_num: '1',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
      dinner_choice: 'frenchdip',
    },
    // Three seats together for Star Wars Late, Auditorium 8 (F12, G12, G13)
    // — mix: one with veggie, one with salad, one still unpicked
    {
      theater_id: 8,
      row_label: 'F',
      seat_num: '12',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
      dinner_choice: 'veggie',
    },
    {
      theater_id: 8,
      row_label: 'G',
      seat_num: '12',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
      dinner_choice: 'salad',
    },
    {
      theater_id: 8,
      row_label: 'G',
      seat_num: '13',
      showing_number: 2,
      delegation_id: null,
      guest_name: null,
      dinner_choice: null,
    },
  ],
  myHolds: [],
  childDelegations: [
    {
      id: 1,
      token: 'preview-ali-token',
      delegateName: 'Ali Foster',
      email: 'ali@example.com',
      phone: '801-205-6642',
      seatsAllocated: 2,
      seatsPlaced: 2,
      seatsMissingDinner: 0,
      status: 'claimed',
      invitedAt: '2026-05-12T18:00:00Z',
      accessedAt: '2026-05-13T09:30:00Z',
      finalizedAt: '2026-05-13T14:22:00Z',
    },
    {
      id: 2,
      token: 'preview-aaron-token',
      delegateName: 'Aaron Sessions',
      email: 'aaron@example.com',
      phone: null,
      seatsAllocated: 4,
      seatsPlaced: 0,
      seatsMissingDinner: 0,
      status: 'invited',
      invitedAt: '2026-05-14T11:00:00Z',
      accessedAt: null,
      finalizedAt: null,
    },
  ],
  childDelegationAssignments: [
    { delegation_id: 1, theater_id: 8, row_label: 'D', seat_num: '11' },
    { delegation_id: 1, theater_id: 8, row_label: 'D', seat_num: '12' },
  ],
  allAssignments: [],
  showtimes: [
    {
      theater_id: 8,
      movie_id: 13,
      showing_number: 2,
      dinner_time: '7:15 PM',
      show_start: '7:35 PM',
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
      theater_id: 1,
      movie_id: 17,
      showing_number: 2,
      dinner_time: '7:15 PM',
      show_start: '7:35 PM',
      capacity: 113,
      movie_title: 'Paddington 2',
      runtime_minutes: 104,
      poster_url: 'https://image.tmdb.org/t/p/w500/1OJ9vkD5xPt3skC6KguyXAgagRZ.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/kRVUMsXFzhuXjr20JcCGc6TapxA.jpg',
      synopsis: 'Paddington takes on odd jobs.',
      rating: 'PG',
      year: 2017,
      stream_uid: 'cb3eee6d88abd02af1f83ac09d2c929e',
      tmdb_score: 7.475,
      rt_critics_score: 99,
      rt_audience_score: 89,
      theater_tier: 'good',
    },
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
      synopsis: 'Hiccup learns to befriend a dragon.',
      rating: 'PG',
      year: 2010,
      stream_uid: 'fc9162d980d58a167d8577ded4c4f1e6',
      tmdb_score: 7.857,
      rt_critics_score: 99,
      rt_audience_score: 91,
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
      synopsis: 'Family adjusts to a parent change.',
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
const stubSeats = {
  allSelfIds: new Set(),
  assigned: {},
  totalAssigned: 6,
  place: async () => {
    console.log('[preview] seats.place — no-op');
  },
  unplace: async () => {
    console.log('[preview] seats.unplace — no-op');
  },
  pending: false,
  pickError: null,
};

const initialPath = SEATS_OPEN ? '/preview-token/seats' : '/preview-token';

function PreviewApp() {
  const [layouts, setLayouts] = useState(null);
  useEffect(() => {
    fetch('/data/theater-layouts.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setLayouts)
      .catch(() => setLayouts({}));
  }, []);

  if (CELEBRATE) {
    return (
      <CelebrationOverlay
        seats={['F12', 'G12', 'G13', 'H1']}
        movieTitle="Star Wars: The Mandalorian and Grogu"
        onClose={() => {}}
        autoDismissMs={999999}
      />
    );
  }

  if (RECEIVE) {
    // Synthesize a delegate-side portal payload: identity.kind = delegation,
    // confirmedAt = null (so the receive gate fires), 2 seats with 1 meal
    // picked and 1 not, sponsor company shown.
    const delegatePortal = {
      identity: {
        kind: 'delegation',
        id: 1,
        delegateName: 'Ali Foster',
        email: 'ali@example.com',
        phone: '801-205-6642',
        parentCompany: 'Wicko Waypoint',
        parentTier: 'Platinum',
        seatsAllocated: 2,
        status: 'invited',
        confirmedAt: null,
        accessedAt: null,
      },
      seatMath: { total: 2, placed: 2, delegated: 0, available: 0 },
      tierAccess: { open: true, tier: 'Platinum' },
      myAssignments: [
        {
          theater_id: 8,
          row_label: 'D',
          seat_num: '11',
          showing_number: 2,
          dinner_choice: 'frenchdip',
        },
        {
          theater_id: 8,
          row_label: 'D',
          seat_num: '12',
          showing_number: 2,
          dinner_choice: null,
        },
      ],
      myHolds: [],
      childDelegations: [],
      childDelegationAssignments: [],
      allAssignments: [],
      showtimes: mockPortal.showtimes,
    };
    return (
      <MemoryRouter initialEntries={['/preview-ali-token']}>
        <PortalShellV2
          portal={delegatePortal}
          token="preview-ali-token"
          theaterLayouts={layouts}
          seats={{ allSelfIds: new Set(), assigned: {}, totalAssigned: 0 }}
          onRefresh={noopRefresh}
        />
      </MemoryRouter>
    );
  }

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <PortalShellV2
        portal={mockPortal}
        token="preview-token"
        theaterLayouts={layouts}
        seats={stubSeats}
        onRefresh={noopRefresh}
        openSheetOnMount={SEATS_OPEN}
      />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<PreviewApp />);
