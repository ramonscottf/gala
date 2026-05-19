/**
 * GET /api/gala/sign-checklist/list
 *
 * Returns every active (non-archived) sponsor with the fields the sign
 * checklist UI needs: identity, tier, seats/amount/contact for context,
 * and the three sign-related columns:
 *   - logo_url            : full-color logo (existing column)
 *   - logo_white_url      : white-on-transparent logo (new, this build)
 *   - sign_completed_at   : ISO ts when sign was marked done in Canva
 *
 * Auth: the /sponsorchecklist page is gated by _middleware.js, but this
 * endpoint is reached directly so we also require a valid session cookie.
 * (Same pattern as other /api/gala/admin/* endpoints.)
 *
 * Sorted alphabetically by company within each tier; the UI groups by
 * tier in the canonical order Platinum → Gold → Silver → Bronze → F&F →
 * Split F&F → Individual Seats → Donation. Tier ordering is enforced
 * server-side via a CASE; alpha-within-tier is plain ORDER BY company.
 */

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Require admin session — same shape every gated /api/gala route uses.
  const ok = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!ok) return jsonError('unauthorized', 401);

  if (!env.GALA_DB) return jsonError('D1 not bound', 503);

  const sql = `
    SELECT
      id,
      company,
      first_name,
      last_name,
      email,
      phone,
      sponsorship_tier,
      seats_purchased,
      amount_paid,
      payment_status,
      logo_url,
      logo_white_url,
      sign_completed_at,
      sign_video_frame_url
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
  return jsonOk({ sponsors: results || [] });
}
