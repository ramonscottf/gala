// Shared confirmation-SMS builder. Single source of truth for the rich
// "🎬 GALA · 2026" format used both by the sponsor self-send button (sms.js)
// and the desktop seat-finalize confirmation (finalize.js).
//
// Format:
//   🎬 GALA · 2026 — {Company}
//   Wed June 10 · Megaplex Legacy Crossing · Doors 4:00 PM
//
//   {Movie Title} (Aud {N})
//   Seats: {row+seat list}
//
//   Manage: gala.daviskids.org/sponsor/{token}
//
// The check-in QR URL is intentionally NOT included here — that goes out via
// a separate scheduled day-before-event send (see day-before reminder cron).

export async function buildConfirmationSms(env, { kind, recordId, company, token }) {
  // Pull seat assignments + show + movie. Sponsor scope joins on sponsor_id;
  // delegation scope joins on delegation_id.
  const where = kind === 'sponsor'
    ? 'sa.sponsor_id = ? AND sa.delegation_id IS NULL'
    : 'sa.delegation_id = ?';

  const q = await env.GALA_DB.prepare(
    `SELECT sa.theater_id, sa.row_label, sa.seat_num,
            s.showing_number, s.show_start, s.dinner_time,
            m.title AS movie_title
       FROM seat_assignments sa
       JOIN showtimes s ON s.theater_id = sa.theater_id
                       AND s.showing_number = sa.showing_number
       JOIN movies m ON m.id = s.movie_id
      WHERE ${where}
      ORDER BY sa.theater_id, sa.row_label, sa.seat_num`
  ).bind(recordId).all();
  const rows = q.results || [];

  const byShow = new Map();
  rows.forEach((r) => {
    const key = `${r.movie_title}|${r.theater_id}`;
    if (!byShow.has(key)) {
      byShow.set(key, { movie: r.movie_title, theaterId: r.theater_id, seats: [] });
    }
    byShow.get(key).seats.push(`${r.row_label}${r.seat_num}`);
  });

  const masthead = company
    ? `🎬 GALA · 2026 — ${company}`
    : `🎬 GALA · 2026`;

  const parts = [
    masthead,
    `Wed June 10 · Megaplex Legacy Crossing · Doors 4:00 PM`,
    '',
  ];
  if (byShow.size === 0) {
    parts.push(`No seats placed yet.`);
  } else {
    for (const show of byShow.values()) {
      parts.push(`${show.movie} (Aud ${show.theaterId})`);
      parts.push(`Seats: ${show.seats.join(', ')}`);
      parts.push('');
    }
  }
  parts.push(`Manage: gala.daviskids.org/sponsor/${token}`);
  return parts.join('\n').trim();
}
