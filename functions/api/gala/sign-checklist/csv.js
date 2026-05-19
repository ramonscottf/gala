/**
 * GET /api/gala/sign-checklist/csv
 *
 * Streams a CSV of every active sponsor with sign status and asset URLs.
 * Columns are friendly for opening straight in Canva's bulk-create flow
 * or Excel / Numbers / Sheets.
 *
 * Sorted the same way the UI shows them: tier in canonical order, then
 * company A→Z within tier — so the printed CSV maps 1:1 to what Scott
 * sees on screen.
 */

import { verifyGalaAuth, jsonError } from '../_auth.js';

const TIER_ORDER = [
  'Platinum',
  'Gold',
  'Silver',
  'Bronze',
  'Friends and Family',
  'Split Friends & Family',
  'Individual Seats',
  'Donation',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('unauthorized', 401);
  }
  if (!env.GALA_DB) return jsonError('D1 not bound', 503);

  const sql = `
    SELECT
      id, company, first_name, last_name, email, phone,
      sponsorship_tier, seats_purchased, amount_paid, payment_status,
      logo_url, logo_white_url, sign_completed_at
    FROM sponsors
    WHERE archived_at IS NULL
    ORDER BY
      CASE sponsorship_tier
        WHEN 'Platinum'               THEN 1
        WHEN 'Gold'                   THEN 2
        WHEN 'Silver'                 THEN 3
        WHEN 'Bronze'                 THEN 4
        WHEN 'Friends and Family'     THEN 5
        WHEN 'Split Friends & Family' THEN 6
        WHEN 'Individual Seats'       THEN 7
        WHEN 'Donation'               THEN 8
        ELSE 9
      END,
      LOWER(company) ASC;
  `;
  const { results } = await env.GALA_DB.prepare(sql).all();

  const origin = new URL(request.url).origin;
  const absoluteIfRelative = (u) => (u && u.startsWith('/') ? origin + u : u || '');

  const headers = [
    'tier',
    'id',
    'company',
    'contact_first',
    'contact_last',
    'email',
    'phone',
    'seats',
    'amount_paid',
    'payment_status',
    'color_logo_url',
    'white_logo_url',
    'sign_completed_at',
    'sign_done',
  ];

  let csv = headers.join(',') + '\n';
  for (const r of (results || [])) {
    csv += [
      csvCell(r.sponsorship_tier),
      csvCell(r.id),
      csvCell(r.company),
      csvCell(r.first_name),
      csvCell(r.last_name),
      csvCell(r.email),
      csvCell(r.phone),
      csvCell(r.seats_purchased),
      csvCell(r.amount_paid),
      csvCell(r.payment_status),
      csvCell(absoluteIfRelative(r.logo_url)),
      csvCell(absoluteIfRelative(r.logo_white_url)),
      csvCell(r.sign_completed_at),
      csvCell(r.sign_completed_at ? 'yes' : 'no'),
    ].join(',') + '\n';
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="gala-2026-sponsor-signs-${today}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
