// Tickets endpoint — now backed by D1 `sponsors` (synced from Sherry's xlsx),
// previously read from Monday "Sales Pipeline" board which left orphaned rows
// (Murdock Auto Team, Murdock Chevrolet, etc.) that were never in the xlsx.
//
// The Tickets tab and Sponsors tab now share a single source of truth: D1.
// Frontend contract is preserved exactly so renderTickets() / openTicketEditor()
// keep working without changes:
//   GET  -> { tickets: [{id, name, contact, contactFirst, contactLast,
//              email, quantity, amount, tier, paymentStatus, logoUrl, websiteUrl}],
//              totalTickets, totalAmount, count }
//   POST -> { id, fields: { name?, contactFirst?, contactLast?, email?,
//              seats?, amount?, tier?, payment?, logoUrl?, websiteUrl? } }
//
// Note: `id` is now the D1 sponsor row id (integer), not a Monday item id.
//        Any browser tab with stale ticketsData must reload before editing.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { normalizeSponsorTier } from './_gala_data.js';

function rowToTicket(r) {
  const contactFirst = r.first_name || '';
  const contactLast = r.last_name || '';
  return {
    id: r.id,
    name: r.company || '',
    quantity: parseInt(r.seats_purchased || 0, 10) || 0,
    amount: parseFloat(r.amount_paid || 0) || 0,
    tier: normalizeSponsorTier(r.sponsorship_tier) || r.sponsorship_tier || '',
    paymentStatus: r.payment_status || '',
    email: r.email || '',
    contact: [contactFirst, contactLast].filter(Boolean).join(' '),
    contactFirst,
    contactLast,
    logoUrl: r.logo_url || '',
    websiteUrl: r.website_url || '',
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isPublic = url.searchParams.get('public') === 'true';

  // Public endpoint: only return totals (no auth, used by public sponsor page).
  if (isPublic) {
    try {
      const { results } = await env.GALA_DB.prepare(
        `SELECT COALESCE(SUM(seats_purchased), 0) AS seats,
                COALESCE(SUM(amount_paid), 0) AS amount
         FROM sponsors
         WHERE archived_at IS NULL`
      ).all();
      const row = results?.[0] || { seats: 0, amount: 0 };
      return jsonOk({
        totalTickets: Number(row.seats) || 0,
        totalAmount: Number(row.amount) || 0,
      });
    } catch {
      return jsonOk({ totalTickets: 0, totalAmount: 0 });
    }
  }

  // Authenticated full payload.
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  try {
    const { results } = await env.GALA_DB.prepare(
      `SELECT id, company, first_name, last_name, email, phone,
              sponsorship_tier, seats_purchased, amount_paid, payment_status,
              logo_url, website_url
       FROM sponsors
       WHERE archived_at IS NULL
       ORDER BY company COLLATE NOCASE`
    ).all();

    const tickets = (results || []).map(rowToTicket);
    const totalTickets = tickets.reduce((s, t) => s + t.quantity, 0);
    const totalAmount = tickets.reduce((s, t) => s + (t.amount || 0), 0);

    return jsonOk({
      tickets,
      totalTickets,
      totalAmount,
      count: tickets.length,
    });
  } catch (err) {
    return jsonError(err?.message || 'Failed to load tickets');
  }
}

/**
 * Update or create a sponsor row in D1.
 *  Body: { id?, action?, fields: {...} }
 *  - action === 'create' OR (no id && no action) → INSERT new sponsor
 *  - id present → UPDATE that row
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { id, fields, action } = body || {};
  if (!fields || typeof fields !== 'object') {
    return jsonError('fields object required', 400);
  }

  // Map UI field names → DB columns. Only touch fields that were sent.
  const colMap = {
    name:          'company',
    contactFirst:  'first_name',
    contactLast:   'last_name',
    email:         'email',
    seats:         'seats_purchased',
    amount:        'amount_paid',
    tier:          'sponsorship_tier',
    payment:       'payment_status',
    logoUrl:       'logo_url',
    websiteUrl:    'website_url',
  };

  function coerce(key, v) {
    if (v == null) return null;
    if (key === 'seats') return parseInt(v, 10) || 0;
    if (key === 'amount') {
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    }
    return String(v);
  }

  // ─── CREATE ────────────────────────────────────────────────────
  if (action === 'create' || (!id && !action)) {
    const name = (fields.name || '').trim();
    if (!name) return jsonError('fields.name required for create', 400);

    // Generate an RSVP token so seat-picker links work for new rows
    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const rsvpToken = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const cols = ['company', 'rsvp_token', 'rsvp_status', 'created_at', 'updated_at'];
    const vals = [name, rsvpToken, 'pending'];
    const placeholders = ['?', '?', '?', "datetime('now')", "datetime('now')"];

    for (const [k, dbCol] of Object.entries(colMap)) {
      if (k === 'name') continue;
      if (fields[k] === undefined) continue;
      cols.push(dbCol);
      vals.push(coerce(k, fields[k]));
      placeholders.push('?');
    }

    try {
      const result = await env.GALA_DB.prepare(
        `INSERT INTO sponsors (${cols.join(',')}) VALUES (${placeholders.join(',')})`
      ).bind(...vals).run();
      return jsonOk({
        ok: true,
        created: true,
        id: result?.meta?.last_row_id || null,
      });
    } catch (err) {
      return jsonError(`Failed to create: ${err?.message || err}`);
    }
  }

  // ─── UPDATE ────────────────────────────────────────────────────
  if (!id) return jsonError('id required', 400);

  const sets = [];
  const vals = [];
  for (const [k, dbCol] of Object.entries(colMap)) {
    if (fields[k] === undefined) continue;
    sets.push(`${dbCol} = ?`);
    vals.push(coerce(k, fields[k]));
  }

  if (sets.length === 0) {
    return jsonOk({ ok: true, updated: false, note: 'no editable fields' });
  }

  sets.push("updated_at = datetime('now')");
  vals.push(id);

  try {
    await env.GALA_DB.prepare(
      `UPDATE sponsors SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();
    return jsonOk({ ok: true, updated: true });
  } catch (err) {
    return jsonError(`Failed to update: ${err?.message || err}`);
  }
}
