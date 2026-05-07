// POST /api/gala/admin/sheet-webhook
// Receives sponsor rows from Power Automate every ~2 hours.
// Diffs against D1 sponsors, upserts, preserves RSVP state,
// soft-archives rows that disappeared from the sheet.

import {
  hasSponsorArchiveSupport,
  normalizeSponsorTier,
  parseSeatCount,
} from '../_gala_data.js';

const ARCHIVE_ALERT_THRESHOLD = 3;

function rowToSponsor(row) {
  if (!row || typeof row !== 'object') return null;

  // Preserve original keys in order (Sherry's sheet has a blank header between
  // "First Name" and "Sponsorship" that we need to find positionally).
  const rawEntries = Object.entries(row);

  // Normalize for named lookup — but KEEP a map of raw->normalized so we can
  // also do positional fallback for weird/blank headers.
  const normalized = {};
  for (const [k, v] of rawEntries) {
    const nk = String(k).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!(nk in normalized)) normalized[nk] = v;
  }
  const get = (...keys) => {
    for (const k of keys) {
      const nk = String(k).trim().toLowerCase().replace(/\s+/g, ' ');
      const v = normalized[nk];
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (s !== '') return s;
    }
    return null;
  };

  // Positional fallback for "Last Name": Sherry's sheet has header = nine spaces
  // (or similar blank/garbled). We look for the column sandwiched between
  // "First Name" and "Sponsorship" in the raw key order.
  const getLastNameByPosition = () => {
    const keys = rawEntries.map(([k]) => k);
    const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
    const firstIdx = keys.findIndex((k) => norm(k) === 'first name');
    const sponsorshipIdx = keys.findIndex((k) => norm(k) === 'sponsorship');
    if (firstIdx === -1 || sponsorshipIdx === -1) return null;
    // Expect last name to live at firstIdx + 1, and that slot must exist
    // before sponsorship (not be sponsorship itself).
    const lastIdx = firstIdx + 1;
    if (lastIdx >= sponsorshipIdx) return null;
    const v = rawEntries[lastIdx]?.[1];
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  const company = get('Company', 'Name');
  if (!company) return null;

  return {
    company,
    first_name: get('First Name', 'firstname', 'first'),
    last_name:
      get('Last Name', 'lastname', 'last', 'Surname') || getLastNameByPosition(),
    sponsorship_tier: normalizeSponsorTier(get('Sponsorship', 'Sponsorship Tier', 'Tier')),
    seats_purchased: parseSeatCount(get('Seats', 'Seat Count')),
    amount_paid: parseMoney(get('Amount', 'Amount Paid')),
    payment_status: get('Payment', 'Payment Status'),
    street_address: get('Street Adress', 'Street Address', 'Address'),
    city: get('City'),
    state: get('State'),
    zip: get('Zip', 'Zip Code', 'Postal Code'),
    email: ((get('Email Address', 'Email') || '').toLowerCase()) || null,
    phone: get('Phone', 'Phone Number'),
  };
}

function parseMoney(v) {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

async function sendTelegram(text, env) {
  try {
    const botToken = env.GALA_TELEGRAM_BOT_TOKEN;
    const chatId = env.GALA_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );
  } catch (e) {}
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const startedAt = Date.now();

  // --- Auth ---
  const secret = request.headers.get('X-Webhook-Secret');
  if (!env.GALA_SHEET_WEBHOOK_SECRET || secret !== env.GALA_SHEET_WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {

  // --- Parse body ---
  let body;
  try { body = await request.json(); }
  catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rawRows = Array.isArray(body) ? body : (body.rows || body.value || []);
  if (!Array.isArray(rawRows)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'no_rows_array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sheetRows = rawRows.map(rowToSponsor).filter(Boolean);

  // DIAGNOSTIC: log the actual keys from the first raw row so we can see
  // what column names Power Automate is actually sending us.
  const firstRawKeys = rawRows.length > 0 && typeof rawRows[0] === 'object'
    ? Object.keys(rawRows[0])
    : [];
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sync_log (direction, entity_type, status, details)
       VALUES ('inbound', 'sponsor_sheet_debug', 'debug', ?)`
    ).bind(JSON.stringify({
      raw_row_count: rawRows.length,
      parsed_row_count: sheetRows.length,
      first_row_keys: firstRawKeys,
      first_row_sample: rawRows[0] || null,
    })).run();
  } catch (e) {}

  // --- Load existing ---
  const archiveSupported = await hasSponsorArchiveSupport(env);
  const existing = await env.GALA_DB.prepare(
    `SELECT id, company, email, rsvp_token, rsvp_status,
            rsvp_completed_at, seats_priority_order${archiveSupported ? ', archived_at' : ''}
     FROM sponsors`
  ).all();

  const byEmail = new Map();
  const byCompany = new Map();
  for (const s of existing.results || []) {
    if (s.email) byEmail.set(s.email.toLowerCase(), s);
    byCompany.set((s.company || '').toLowerCase(), s);
  }

  // Split donations/silent-auction rows out of the sponsor flow — these go
  // into the `donors` table instead. They don't get gala emails, don't take
  // seats, and shouldn't be in audience presets.
  const DONOR_TIERS = new Set(['Donation', 'Silent Auction', 'Event Donor']);
  const sponsorRows = [];
  const donorRows = [];
  for (const row of sheetRows) {
    if (DONOR_TIERS.has(row.sponsorship_tier)) donorRows.push(row);
    else sponsorRows.push(row);
  }

  const seenIds = new Set();
  let inserted = 0, updated = 0;

  for (const row of sponsorRows) {
    const match =
      (row.email && byEmail.get(row.email)) ||
      byCompany.get(row.company.toLowerCase());

    if (match) {
      seenIds.add(match.id);
      await env.GALA_DB.prepare(
        `UPDATE sponsors SET
           company = ?,
           first_name = COALESCE(?, first_name),
           last_name = COALESCE(?, last_name),
           sponsorship_tier = COALESCE(?, sponsorship_tier),
           seats_purchased = COALESCE(?, seats_purchased),
           amount_paid = COALESCE(?, amount_paid),
           payment_status = COALESCE(?, payment_status),
           street_address = COALESCE(?, street_address),
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           zip = COALESCE(?, zip),
           email = COALESCE(NULLIF(?, ''), email),
           phone = COALESCE(?, phone),
           ${archiveSupported ? 'archived_at = NULL,' : ''}
           updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        row.company, row.first_name, row.last_name,
        row.sponsorship_tier, row.seats_purchased,
        row.amount_paid, row.payment_status,
        row.street_address, row.city, row.state, row.zip,
        row.email, row.phone, match.id
      ).run();
      updated++;
    } else {
      // Generate an RSVP token for the new sponsor so the seat-picker link works
      const tokenBytes = new Uint8Array(16);
      crypto.getRandomValues(tokenBytes);
      const rsvpToken = Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0')).join('');

      await env.GALA_DB.prepare(
        `INSERT INTO sponsors
           (company, first_name, last_name, sponsorship_tier,
            seats_purchased, amount_paid, payment_status,
            street_address, city, state, zip, email, phone,
            rsvp_token, rsvp_status,
            created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', datetime('now'),datetime('now'))`
      ).bind(
        row.company, row.first_name, row.last_name,
        row.sponsorship_tier || 'Individual Seats', row.seats_purchased ?? 0,
        row.amount_paid, row.payment_status,
        row.street_address, row.city, row.state, row.zip,
        row.email, row.phone, rsvpToken
      ).run();
      inserted++;
    }
  }

  // --- Donor table upsert (Donation, Silent Auction, Event Donor) ---
  let donorInserted = 0, donorUpdated = 0;

  // Load existing donors for matching
  let existingDonors = { results: [] };
  try {
    existingDonors = await env.GALA_DB.prepare(
      `SELECT id, company, email FROM donors WHERE archived_at IS NULL`
    ).all();
  } catch (e) {
    // donors table may not exist on older DB — skip silently
  }

  const donorByEmail = new Map();
  const donorByCompany = new Map();
  for (const d of existingDonors.results || []) {
    if (d.email) donorByEmail.set(d.email.toLowerCase(), d);
    donorByCompany.set((d.company || '').toLowerCase(), d);
  }

  for (const row of donorRows) {
    const match =
      (row.email && donorByEmail.get(row.email)) ||
      donorByCompany.get(row.company.toLowerCase());

    try {
      if (match) {
        await env.GALA_DB.prepare(
          `UPDATE donors SET
             company = ?, first_name = COALESCE(?, first_name),
             last_name = COALESCE(?, last_name),
             email = COALESCE(NULLIF(?, ''), email),
             phone = COALESCE(?, phone),
             donation_type = COALESCE(?, donation_type),
             amount = COALESCE(?, amount),
             payment_status = COALESCE(?, payment_status),
             street_address = COALESCE(?, street_address),
             city = COALESCE(?, city), state = COALESCE(?, state),
             zip = COALESCE(?, zip),
             updated_at = datetime('now')
           WHERE id = ?`
        ).bind(
          row.company, row.first_name, row.last_name,
          row.email, row.phone, row.sponsorship_tier,
          row.amount_paid, row.payment_status,
          row.street_address, row.city, row.state, row.zip,
          match.id
        ).run();
        donorUpdated++;
      } else {
        await env.GALA_DB.prepare(
          `INSERT INTO donors
             (company, first_name, last_name, email, phone,
              donation_type, amount, payment_status,
              street_address, city, state, zip)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          row.company, row.first_name, row.last_name,
          row.email, row.phone, row.sponsorship_tier,
          row.amount_paid, row.payment_status,
          row.street_address, row.city, row.state, row.zip
        ).run();
        donorInserted++;
      }
    } catch (e) {
      // Surface in sync_log debug entry but don't kill the whole run
    }
  }

  // --- Soft-archive missing, but protect anyone with seat assignments ---
  // SAFETY: compute candidates first. If it's more than 10% of active sponsors
  // OR more than 10 people in one run, refuse and alert instead of wrecking the table.
  const activeExisting = archiveSupported
    ? (existing.results || []).filter(s => !s.archived_at)
    : [];
  const archiveCandidates = [];
  for (const s of activeExisting) {
    if (seenIds.has(s.id)) continue;
    const seatCheck = await env.GALA_DB.prepare(
      `SELECT COUNT(*) as n FROM seat_assignments WHERE sponsor_id = ?`
    ).bind(s.id).first();
    if ((seatCheck?.n || 0) > 0) continue;
    archiveCandidates.push(s);
  }

  const pctWouldArchive = activeExisting.length > 0
    ? archiveCandidates.length / activeExisting.length
    : 0;

  let archived = 0;
  let archiveAborted = false;

  if (archiveSupported && (archiveCandidates.length > 10 || pctWouldArchive > 0.10)) {
    // Sanity threshold tripped — refuse to archive, alert Scott
    archiveAborted = true;
    await sendTelegram(
      `🛑 *Gala Sheet Sync ARCHIVE ABORTED*\n` +
      `Would have archived ${archiveCandidates.length} of ${activeExisting.length} ` +
      `active sponsors (${(pctWouldArchive * 100).toFixed(0)}%).\n` +
      `That's above the safety threshold, so NO archiving happened.\n` +
      `Sheet rows received: ${sheetRows.length}.\n` +
      `Check the spreadsheet — this could be a bad Power Automate payload or ` +
      `someone accidentally cleared rows.`,
      env
    );
  } else if (archiveSupported) {
    for (const s of archiveCandidates) {
      await env.GALA_DB.prepare(
        `UPDATE sponsors SET archived_at = datetime('now') WHERE id = ?`
      ).bind(s.id).run();
      archived++;
    }
  }

  const durationMs = Date.now() - startedAt;

  // --- Log ---
  try {
    await env.GALA_DB.prepare(
      `INSERT INTO sync_log (direction, entity_type, status, details)
       VALUES ('inbound', 'sponsor_sheet', ?, ?)`
    ).bind(
      archiveAborted ? 'warning' : 'success',
      JSON.stringify({
        rows_received: sheetRows.length,
        sponsor_rows: sponsorRows.length,
        donor_rows: donorRows.length,
        inserted, updated, archived,
        donor_inserted: donorInserted, donor_updated: donorUpdated,
        archive_aborted: archiveAborted,
        archive_candidates: archiveCandidates.length,
        duration_ms: durationMs,
      })
    ).run();
  } catch (e) {}

  if (!archiveAborted && archived > ARCHIVE_ALERT_THRESHOLD) {
    await sendTelegram(
      `⚠️ *Gala Sheet Sync* archived ${archived} sponsors ` +
      `(threshold ${ARCHIVE_ALERT_THRESHOLD}). ` +
      `Check gala.daviskids.org/admin to verify.`,
      env
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      rows_received: sheetRows.length,
      sponsor_rows: sponsorRows.length,
      donor_rows: donorRows.length,
      inserted, updated, archived,
      donor_inserted: donorInserted, donor_updated: donorUpdated,
      archive_aborted: archiveAborted,
      archive_candidates: archiveCandidates.length,
      duration_ms: durationMs,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

  } catch (err) {
    // Surface any runtime error as JSON so we can debug
    try {
      await env.GALA_DB.prepare(
        `INSERT INTO sync_log (direction, entity_type, status, details)
         VALUES ('inbound', 'sponsor_sheet', 'error', ?)`
      ).bind(JSON.stringify({
        error: String(err?.message || err),
        stack: String(err?.stack || '').split('\n').slice(0, 5).join(' | '),
      })).run();
    } catch (e2) {}

    return new Response(
      JSON.stringify({
        ok: false,
        error: 'runtime_error',
        message: String(err?.message || err),
        stack: String(err?.stack || '').split('\n').slice(0, 8),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Gala sheet webhook. POST only with X-Webhook-Secret header.',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
