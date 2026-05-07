const showtime = ({
  theaterId,
  showingNumber,
  movieId,
  title,
  start,
  dinner,
  rating = 'PG',
  runtime = 118,
  capacity = 96,
}) => ({
  theater_id: theaterId,
  showing_number: showingNumber,
  movie_id: movieId,
  movie_title: title,
  show_start: start,
  dinner_time: dinner,
  rating,
  runtime_minutes: runtime,
  poster_url: null,
  thumbnail_url: null,
  backdrop_url: null,
  trailer_url: null,
  stream_uid: null,
  synopsis: `${title} preview synopsis for the sponsor shell harness.`,
  year: 2026,
  tmdb_score: 8.2,
  tmdb_vote_count: 1200,
  theater_tier: 'standard',
  theater_notes: '',
  capacity,
});

const row = (label, start, count, type = 'luxury', offset = 0) => ({
  label,
  seats: count,
  type,
  numbers: Array.from({ length: count }, (_, i) => start + i),
  cols: Array.from({ length: count }, (_, i) => offset + i),
});

export const previewTheaterLayouts = {
  venue: 'Megaplex Theatres at Legacy Crossing',
  theaters: [
    {
      id: 1,
      name: 'Auditorium 5',
      totalSeats: 84,
      exitSide: 'right',
      rows: [
        row('A', 1, 10, 'luxury', 2),
        row('B', 1, 12, 'luxury', 1),
        row('C', 1, 12, 'dbox', 1),
        row('D', 1, 14, 'luxury', 0),
        row('E', 1, 14, 'standard', 0),
      ],
    },
    {
      id: 2,
      name: 'Auditorium 8',
      totalSeats: 72,
      exitSide: 'left',
      rows: [
        row('F', 1, 10, 'luxury', 2),
        row('G', 1, 12, 'loveseat', 1),
        row('H', 1, 12, 'luxury', 1),
        row('J', 1, 14, 'standard', 0),
      ],
    },
  ],
};

export const createPreviewPortal = () => ({
  identity: {
    kind: 'sponsor',
    tier: 'Platinum',
    contactName: 'Scott Foster',
    company: 'Davis Education Foundation',
    logoUrl: '/assets/brand/def-logo-dark.png',
    seatsPurchased: 10,
  },
  seatMath: {
    total: 10,
    placed: 5,
    delegated: 2,
    available: 3,
  },
  showtimes: [
    showtime({
      theaterId: 1,
      showingNumber: 1,
      movieId: 101,
      title: 'Wicked: Part Two',
      start: '2026-06-10 16:30:00',
      dinner: '2026-06-10 18:10:00',
      rating: 'PG',
      runtime: 138,
    }),
    showtime({
      theaterId: 2,
      showingNumber: 2,
      movieId: 202,
      title: 'The Fantastic Four',
      start: '2026-06-10 20:15:00',
      dinner: '2026-06-10 19:00:00',
      rating: 'PG-13',
      runtime: 126,
    }),
  ],
  myAssignments: [
    {
      theater_id: 1,
      row_label: 'C',
      seat_num: 5,
      guest_name: 'Scott Foster',
      delegation_id: null,
      dinner_choice: 'brisket',
    },
    {
      theater_id: 1,
      row_label: 'C',
      seat_num: 6,
      guest_name: 'Scott Foster',
      delegation_id: null,
      dinner_choice: 'turkey',
    },
    {
      theater_id: 1,
      row_label: 'C',
      seat_num: 7,
      guest_name: 'Megan Foster',
      delegation_id: null,
      dinner_choice: 'veggie',
    },
    {
      theater_id: 2,
      row_label: 'G',
      seat_num: 4,
      guest_name: null,
      delegation_id: 301,
      dinner_choice: null,
    },
    {
      theater_id: 2,
      row_label: 'G',
      seat_num: 5,
      guest_name: null,
      delegation_id: 301,
      dinner_choice: null,
    },
  ],
  myHolds: [],
  allAssignments: [
    { theater_id: 1, row_label: 'C', seat_num: 1 },
    { theater_id: 1, row_label: 'C', seat_num: 2 },
    { theater_id: 1, row_label: 'D', seat_num: 8 },
    { theater_id: 2, row_label: 'H', seat_num: 6 },
  ],
  otherHolds: [],
  childDelegations: [
    {
      id: 301,
      token: 'preview-delegate-301',
      delegateName: 'Megan Foster',
      phone: '(801) 555-0131',
      email: 'megan@example.com',
      seatsAllocated: 2,
      seatsPlaced: 2,
      status: 'active',
    },
  ],
});

export function createPreviewSeats(portal, setPortal) {
  const ownRows = [...(portal.myAssignments || []), ...(portal.myHolds || [])];
  const allSelfIds = new Set(ownRows.map((r) => `${r.row_label}-${r.seat_num}`));

  return {
    assigned: {},
    allSelfIds,
    totalAssigned: allSelfIds.size,
    pending: false,
    pickError: null,
    async place(_showingId, theaterId, seatIds) {
      setPortal((current) => ({
        ...current,
        myAssignments: [
          ...(current.myAssignments || []),
          ...seatIds.map((seatId) => {
            const [rowLabel, seatNum] = seatId.split('-');
            return {
              theater_id: theaterId,
              row_label: rowLabel,
              seat_num: Number(seatNum),
              guest_name: null,
              delegation_id: null,
              dinner_choice: null,
            };
          }),
        ],
        seatMath: {
          ...(current.seatMath || {}),
          placed: (current.myAssignments || []).length + seatIds.length,
        },
      }));
    },
    async unplace(theaterId, seatIds) {
      const remove = new Set(seatIds);
      setPortal((current) => ({
        ...current,
        myAssignments: (current.myAssignments || []).filter(
          (rowData) =>
            rowData.theater_id !== theaterId ||
            !remove.has(`${rowData.row_label}-${rowData.seat_num}`)
        ),
      }));
    },
  };
}
