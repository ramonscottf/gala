import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import {
  hasSponsorArchiveSupport,
  isPaidStatus,
  normalizeSponsorTier,
} from './_gala_data.js';

/**
 * /api/gala/sponsors
 *
 * GET ?token=XXX           → public RSVP lookup (returns sponsor + attendees)
 * GET                      → admin: list all sponsors from D1
 * GET ?tier=X              → admin: filter by tier
 * GET ?payment_status=X    → admin: filter by payment status
 * GET ?rsvp_status=X       → admin: filter by rsvp status
 * GET ?search=XXX          → admin: search company/name/email
 *
 * Returns camelCase fields + aliases (name/tier/amount/paymentStatus/contact)
 * matching what /gala-dashboard and /gala-dashboard/seating.html expect.
 * Includes seats_assigned via LEFT JOIN on seat_assignments.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  // ── Public RSVP token lookup ──
  const token = url.searchParams.get('token');
  if (token) {
    const archiveSupported = await hasSponsorArchiveSupport(env);
    const row = await env.GALA_DB.prepare(
      `SELECT * FROM sponsors WHERE rsvp_token = ?${archiveSupported ? ' AND archived_at IS NULL' : ''}`
    ).bind(token).first();
    if (!row) return jsonError('Invalid token', 404);
    const attendees = await env.GALA_DB.prepare(
      'SELECT * FROM attendees WHERE sponsor_id = ? ORDER BY guest_number'
    ).bind(row.id).all();
    return jsonOk({ sponsor: row, attendees: attendees.results || [] });
  }

  // ── Admin list ──
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const tier = url.searchParams.get('tier');
  const paymentStatus = url.searchParams.get('payment_status');
  const rsvpStatus = url.searchParams.get('rsvp_status');
  const search = url.searchParams.get('search');
  const archiveSupported = await hasSponsorArchiveSupport(env);

  let sql = `
    SELECT s.id, s.company, s.first_name, s.last_name, s.email, s.phone,
           s.sponsorship_tier, s.seats_purchased, s.amount_paid, s.payment_status,
           s.street_address, s.city, s.state, s.zip,
           s.rsvp_status, s.rsvp_token, s.rsvp_completed_at,
           s.seats_priority_order, s.notes,
           s.created_at, s.updated_at,
           COALESCE(sa.assigned, 0) AS seats_assigned
      FROM sponsors s
      LEFT JOIN (
        SELECT sponsor_id, COUNT(*) AS assigned
          FROM seat_assignments
         WHERE sponsor_id IS NOT NULL
         GROUP BY sponsor_id
      ) sa ON sa.sponsor_id = s.id
     WHERE 1=1
  `;
  const params = [];
  if (archiveSupported) sql += ' AND s.archived_at IS NULL';
  if (tier && tier !== 'all')                   { sql += ' AND s.sponsorship_tier = ?'; params.push(tier); }
  if (paymentStatus && paymentStatus !== 'all') { sql += ' AND s.payment_status = ?';    params.push(paymentStatus); }
  if (rsvpStatus && rsvpStatus !== 'all')       { sql += ' AND s.rsvp_status = ?';       params.push(rsvpStatus); }
  if (search) {
    sql += ' AND (s.company LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.email LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  sql += ' ORDER BY s.seats_priority_order, s.company';

  const { results } = await env.GALA_DB.prepare(sql).bind(...params).all();
  const rows = results || [];

  const sponsors = rows.map(r => {
    const contact = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    const seatsRemaining = Math.max(0, (r.seats_purchased || 0) - (r.seats_assigned || 0));
    return {
      id: r.id,
      // Aliases the existing dashboard already expects:
      name: r.company,
      tier: normalizeSponsorTier(r.sponsorship_tier) || r.sponsorship_tier,
      amount: r.amount_paid,
      paymentStatus: r.payment_status,
      contact,
      seats: r.seats_purchased,
      // Seating page expects `quantity`:
      quantity: r.seats_purchased,
      // Extended fields for future UI:
      company: r.company,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      sponsorshipTier: normalizeSponsorTier(r.sponsorship_tier) || r.sponsorship_tier,
      seatsPurchased: r.seats_purchased,
      seatsAssigned: r.seats_assigned,
      seatsRemaining,
      amountPaid: r.amount_paid,
      streetAddress: r.street_address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      rsvpStatus: r.rsvp_status,
      rsvpToken: r.rsvp_token,
      rsvpCompletedAt: r.rsvp_completed_at,
      priorityOrder: r.seats_priority_order,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  // Aggregate stats (camelCase + legacy snake_case for any callers)
  const stats = {
    total: sponsors.length,
    totalSeats: sponsors.reduce((a, s) => a + (s.seatsPurchased || 0), 0),
    totalAmount: sponsors.reduce((a, s) => a + (s.amountPaid || 0), 0),
    seatsAssigned: sponsors.reduce((a, s) => a + (s.seatsAssigned || 0), 0),
    seatsRemaining: sponsors.reduce((a, s) => a + (s.seatsRemaining || 0), 0),
    paidAmount: sponsors.filter(s => isPaidStatus(s.paymentStatus)).reduce((a, s) => a + (s.amountPaid || 0), 0),
    total_seats: sponsors.reduce((a, s) => a + (s.seatsPurchased || 0), 0),
    rsvp_done: sponsors.filter(s => s.rsvpStatus === 'completed').length,
    rsvp_pending: sponsors.filter(s => s.rsvpStatus === 'pending').length,
    revenue: sponsors.filter(s => isPaidStatus(s.paymentStatus)).reduce((a, s) => a + (s.amountPaid || 0), 0),
    byTier: sponsors.reduce((acc, s) => { acc[s.tier] = (acc[s.tier] || 0) + 1; return acc; }, {}),
    byStatus: sponsors.reduce((acc, s) => { acc[s.paymentStatus] = (acc[s.paymentStatus] || 0) + 1; return acc; }, {}),
  };

  return jsonOk({ sponsors, stats }, 0);
}

/**
 * PATCH /api/gala/sponsors
 * Body: { id, company?, first_name?, last_name?, email?, phone?, notes?,
 *         street_address?, city?, state?, zip?, payment_status?, sponsorship_tier? }
 *
 * Admin-only. Updates an existing sponsor record in D1. Any field not sent is
 * left untouched. Returns the fresh row.
 */
export async function onRequestPatch(context) {
  const { request, env } = context;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON body', 400); }

  const id = Number(body.id);
  if (!id) return jsonError('id is required', 400);

  if (Object.prototype.hasOwnProperty.call(body, 'sponsorship_tier')) {
    body.sponsorship_tier = normalizeSponsorTier(body.sponsorship_tier) || null;
  }

  // Type coercion for numeric fields — modal sends strings.
  if (Object.prototype.hasOwnProperty.call(body, 'seats_purchased')) {
    if (body.seats_purchased === '' || body.seats_purchased === null) {
      body.seats_purchased = null;
    } else {
      const n = parseInt(body.seats_purchased, 10);
      body.seats_purchased = isNaN(n) ? null : n;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'amount_paid')) {
    if (body.amount_paid === '' || body.amount_paid === null) {
      body.amount_paid = null;
    } else {
      const cleaned = String(body.amount_paid).replace(/[$,\s]/g, '');
      const n = parseFloat(cleaned);
      body.amount_paid = isNaN(n) ? null : n;
    }
  }

  const EDITABLE = [
    'company', 'first_name', 'last_name', 'email', 'phone', 'notes',
    'street_address', 'city', 'state', 'zip',
    'payment_status', 'sponsorship_tier',
    'seats_purchased', 'amount_paid',
    'logo_url', 'website_url',
  ];

  const sets = [];
  const params = [];
  for (const field of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sets.push(`${field} = ?`);
      params.push(body[field] === '' ? null : body[field]);
    }
  }

  if (!sets.length) return jsonError('No editable fields provided', 400);

  sets.push(`updated_at = datetime('now')`);
  params.push(id);

  try {
    await env.GALA_DB.prepare(
      `UPDATE sponsors SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  } catch (e) {
    return jsonError(`Update failed: ${e.message}`, 500);
  }

  const fresh = await env.GALA_DB.prepare(
    `SELECT * FROM sponsors WHERE id = ?`
  ).bind(id).first();

  if (!fresh) return jsonError('Sponsor not found after update', 404);

  return jsonOk({ sponsor: fresh });
}

/**
 * POST /api/gala/sponsors
 * Body: { company (required), first_name?, last_name?, email?, phone?,
 *         sponsorship_tier?, seats_purchased?, amount_paid?, payment_status?,
 *         street_address?, city?, state?, zip?, notes?,
 *         logo_url?, website_url? }
 *
 * Admin-only. Creates a new sponsor row in D1.
 *
 * As of May 2026, the dashboard is the canonical source of sponsor data.
 * This endpoint replaces the inbound xlsx sync as the primary write path
 * for new sponsors and ticket purchases.
 *
 * Returns the freshly-created row.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON body', 400); }

  const company = String(body.company || '').trim();
  if (!company) return jsonError('company is required', 400);

  // Normalize tier
  const tier = body.sponsorship_tier
    ? (normalizeSponsorTier(body.sponsorship_tier) || null)
    : null;

  // Type-coerce numerics
  let seats = null;
  if (body.seats_purchased !== undefined && body.seats_purchased !== '' && body.seats_purchased !== null) {
    const n = parseInt(body.seats_purchased, 10);
    seats = isNaN(n) ? null : n;
  }
  let amount = null;
  if (body.amount_paid !== undefined && body.amount_paid !== '' && body.amount_paid !== null) {
    const cleaned = String(body.amount_paid).replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    amount = isNaN(n) ? null : n;
  }

  const norm = v => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  // Email lowercased to match existing convention
  const email = norm(body.email);
  const emailLower = email ? email.toLowerCase() : null;

  // Check for duplicate (by email or company) before insert
  if (emailLower) {
    const existing = await env.GALA_DB.prepare(
      `SELECT id, company FROM sponsors WHERE LOWER(email) = ? LIMIT 1`
    ).bind(emailLower).first();
    if (existing) {
      return jsonError(
        `A sponsor with email ${emailLower} already exists (id ${existing.id}, "${existing.company}"). Edit that record instead.`,
        409
      );
    }
  }

  const dupeCompany = await env.GALA_DB.prepare(
    `SELECT id FROM sponsors WHERE LOWER(company) = LOWER(?) LIMIT 1`
  ).bind(company).first();
  if (dupeCompany) {
    return jsonError(
      `A sponsor named "${company}" already exists (id ${dupeCompany.id}). Edit that record instead.`,
      409
    );
  }

  // Insert
  let result;
  try {
    result = await env.GALA_DB.prepare(
      `INSERT INTO sponsors (
         company, first_name, last_name, email, phone,
         sponsorship_tier, seats_purchased, amount_paid, payment_status,
         street_address, city, state, zip,
         logo_url, website_url, notes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      company,
      norm(body.first_name),
      norm(body.last_name),
      emailLower,
      norm(body.phone),
      tier,
      seats,
      amount,
      norm(body.payment_status),
      norm(body.street_address),
      norm(body.city),
      norm(body.state),
      norm(body.zip),
      norm(body.logo_url),
      norm(body.website_url),
      norm(body.notes),
    ).run();
  } catch (e) {
    return jsonError(`Insert failed: ${e.message}`, 500);
  }

  const newId = result?.meta?.last_row_id;
  if (!newId) return jsonError('Insert succeeded but no id returned', 500);

  const fresh = await env.GALA_DB.prepare(
    `SELECT * FROM sponsors WHERE id = ?`
  ).bind(newId).first();

  return jsonOk({ sponsor: fresh, id: newId });
}
