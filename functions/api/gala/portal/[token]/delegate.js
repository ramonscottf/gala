// POST /api/gala/portal/[token]/delegate
// Body: { delegate_name, delegate_phone, delegate_email, seats_allocated }
// Creates a sub-group delegation with its own token + sends invite
//
// DELETE /api/gala/portal/[token]/delegate?delegation_id=N
// Reclaims a sub-group (releases its unplaced allocation, unassigns any placed seats)

import {
  resolveToken,
  generateToken,
  getSeatsAvailableToPlace,
  getTierAccess,
  tierGateError,
  jsonError,
  jsonOk,
} from '../../_sponsor_portal.js';
import { sendSMS, sendEmail } from '../../_notify.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const token = params.token;

  if (!env.GALA_DB) return jsonError('Database not configured', 503);

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid token', 404);

  // Tier-window gate (migration 010). Delegation creates/resends/reclaims
  // all require an open tier — they're all sponsor-active operations.
  const access = await getTierAccess(env, resolved);
  if (!access.open) return tierGateError(access);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  // ── RESEND action ──
  if (body.action === 'resend') {
    const delegation_id = body.delegation_id;
    if (!delegation_id) return jsonError('delegation_id required', 400);

    const deleg = await env.GALA_DB.prepare(
      `SELECT * FROM sponsor_delegations WHERE id = ?`
    ).bind(delegation_id).first();
    if (!deleg) return jsonError('Delegation not found', 404);

    let allowed = false;
    if (resolved.kind === 'sponsor' && deleg.parent_sponsor_id === resolved.record.id && !deleg.parent_delegation_id) allowed = true;
    else if (resolved.kind === 'delegation' && deleg.parent_delegation_id === resolved.record.id) allowed = true;
    if (!allowed) return jsonError('Not allowed', 403);

    const parent = await env.GALA_DB.prepare(
      `SELECT company FROM sponsors WHERE id = ?`
    ).bind(deleg.parent_sponsor_id).first();

    const inviterName = resolved.kind === 'sponsor'
      ? [resolved.record.first_name, resolved.record.last_name].filter(Boolean).join(' ').trim() || resolved.record.company
      : resolved.record.delegate_name;

    const portalUrl = `https://gala.daviskids.org/sponsor/${deleg.token}`;
    context.waitUntil(sendDelegationInvite(env, {
      delegationId: deleg.id,
      email: deleg.delegate_email,
      phone: deleg.delegate_phone,
      name: deleg.delegate_name,
      seats: deleg.seats_allocated,
      parentCompany: parent?.company || 'the gala',
      inviterName,
      portalUrl,
    }));
    return jsonOk({ ok: true, resent: true });
  }

  // ── REMIND DINNERS action ──
  // Sponsor-only nudge to a delegation that has placed seats but missing
  // dinner choices. Sends a focused SMS+email asking them to pick meals.
  if (body.action === 'remind_dinners') {
    const delegation_id = body.delegation_id;
    if (!delegation_id) return jsonError('delegation_id required', 400);

    const deleg = await env.GALA_DB.prepare(
      `SELECT * FROM sponsor_delegations WHERE id = ?`
    ).bind(delegation_id).first();
    if (!deleg) return jsonError('Delegation not found', 404);

    let allowed = false;
    if (resolved.kind === 'sponsor' && deleg.parent_sponsor_id === resolved.record.id && !deleg.parent_delegation_id) allowed = true;
    else if (resolved.kind === 'delegation' && deleg.parent_delegation_id === resolved.record.id) allowed = true;
    if (!allowed) return jsonError('Not allowed', 403);

    // Count missing dinners — we don't send if they've already chosen all
    const missing = await env.GALA_DB.prepare(
      `SELECT COUNT(*) AS n FROM seat_assignments
        WHERE delegation_id = ? AND (dinner_choice IS NULL OR dinner_choice = '')`
    ).bind(delegation_id).first();
    const missingCount = missing?.n || 0;
    if (missingCount === 0) {
      return jsonError('All dinners already chosen', 400);
    }

    const inviterName = resolved.kind === 'sponsor'
      ? [resolved.record.first_name, resolved.record.last_name].filter(Boolean).join(' ').trim() || resolved.record.company
      : resolved.record.delegate_name;

    const portalUrl = `https://gala.daviskids.org/sponsor/${deleg.token}`;
    context.waitUntil(sendDinnerReminder(env, {
      delegationId: deleg.id,
      email: deleg.delegate_email,
      phone: deleg.delegate_phone,
      name: deleg.delegate_name,
      missingCount,
      inviterName,
      portalUrl,
    }));
    return jsonOk({ ok: true, reminded: true, missing: missingCount });
  }

  // ── UPDATE action ──
  // Sponsor edits a child delegation's contact info (name, phone, email).
  // Delegate can edit their own (resolved kind = delegation, target id ==
  // resolved.record.id). Partial updates: omit a field to leave it
  // untouched. Pass an empty string to clear (email/phone only — name
  // can't be cleared because NOT NULL).
  if (body.action === 'update') {
    const delegation_id = body.delegation_id;
    if (!delegation_id) return jsonError('delegation_id required', 400);

    const deleg = await env.GALA_DB.prepare(
      `SELECT * FROM sponsor_delegations WHERE id = ?`
    ).bind(delegation_id).first();
    if (!deleg) return jsonError('Delegation not found', 404);

    // Authorization mirrors `resend`: sponsor owns the parent, OR the
    // delegate is editing their own row.
    let allowed = false;
    if (resolved.kind === 'sponsor' && deleg.parent_sponsor_id === resolved.record.id && !deleg.parent_delegation_id) allowed = true;
    else if (resolved.kind === 'delegation' && deleg.id === resolved.record.id) allowed = true;
    else if (resolved.kind === 'delegation' && deleg.parent_delegation_id === resolved.record.id) allowed = true;
    if (!allowed) return jsonError('Not allowed', 403);

    const updates = [];
    const binds = [];

    if (body.delegate_name !== undefined) {
      const name = String(body.delegate_name).trim();
      if (!name) return jsonError('delegate_name cannot be empty', 400);
      updates.push('delegate_name = ?');
      binds.push(name);
    }
    if (body.delegate_email !== undefined) {
      const email = String(body.delegate_email).trim();
      updates.push('delegate_email = ?');
      binds.push(email || null);
    }
    if (body.delegate_phone !== undefined) {
      const phone = String(body.delegate_phone).trim();
      updates.push('delegate_phone = ?');
      binds.push(phone || null);
    }

    if (updates.length === 0) return jsonError('No editable fields provided', 400);

    // Always bump updated_at on a real change.
    updates.push("updated_at = datetime('now')");
    binds.push(delegation_id);

    const res = await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    if ((res.meta?.changes || 0) === 0) {
      return jsonError('No row updated', 500);
    }

    const fresh = await env.GALA_DB.prepare(
      `SELECT id, token, delegate_name, delegate_email, delegate_phone,
              seats_allocated, status, confirmed_at
         FROM sponsor_delegations WHERE id = ?`
    ).bind(delegation_id).first();

    return jsonOk({
      ok: true,
      action: 'update',
      delegation: {
        id: fresh.id,
        delegateName: fresh.delegate_name,
        email: fresh.delegate_email,
        phone: fresh.delegate_phone,
        seatsAllocated: fresh.seats_allocated,
        status: fresh.status,
        confirmedAt: fresh.confirmed_at,
      },
    });
  }

  // ── CONFIRM action ──
  // First-visit "Keep these seats" gate on the delegate-side receive
  // flow. Only callable by the delegate themselves on their own row.
  // Idempotent — re-confirming is fine, returns the existing
  // confirmed_at timestamp. Sponsors can NOT call this on behalf of
  // a delegate (the delegate is the one who's affirming).
  if (body.action === 'confirm') {
    if (resolved.kind !== 'delegation') {
      return jsonError('Only the delegate can confirm their own seats', 403);
    }

    const delegId = resolved.record.id;
    const existing = await env.GALA_DB.prepare(
      `SELECT confirmed_at FROM sponsor_delegations WHERE id = ?`
    ).bind(delegId).first();

    if (existing?.confirmed_at) {
      // Already confirmed — idempotent return
      return jsonOk({
        ok: true,
        action: 'confirm',
        confirmedAt: existing.confirmed_at,
        wasAlreadyConfirmed: true,
      });
    }

    await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations
          SET confirmed_at = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(delegId).run();

    const fresh = await env.GALA_DB.prepare(
      `SELECT confirmed_at FROM sponsor_delegations WHERE id = ?`
    ).bind(delegId).first();

    return jsonOk({
      ok: true,
      action: 'confirm',
      confirmedAt: fresh.confirmed_at,
      wasAlreadyConfirmed: false,
    });
  }

  // ── CREATE new delegation (default) ──
  const name = (body.delegate_name || '').trim();
  const phone = (body.delegate_phone || '').trim();
  const email = (body.delegate_email || '').trim();
  const seats = Number(body.seats_allocated || 0);

  if (!name) return jsonError('Delegate name required', 400);
  if (!phone && !email) return jsonError('At least phone or email required', 400);
  if (!seats || seats < 1) return jsonError('Seats must be >= 1', 400);

  // Validate capacity: can this token sub-allocate `seats` more?
  const math = await getSeatsAvailableToPlace(env, resolved);
  if (seats > math.available) {
    return jsonError(`Only ${math.available} seats available to delegate`, 400);
  }

  const parentSponsorId = resolved.kind === 'sponsor' ? resolved.record.id : resolved.record.parent_sponsor_id;
  const parentDelegationId = resolved.kind === 'delegation' ? resolved.record.id : null;

  const newToken = generateToken();
  const insertResult = await env.GALA_DB.prepare(
    `INSERT INTO sponsor_delegations
       (parent_sponsor_id, parent_delegation_id, token, delegate_name, delegate_email, delegate_phone, seats_allocated, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
     RETURNING id`
  ).bind(parentSponsorId, parentDelegationId, newToken, name, email || null, phone || null, seats).first();

  const delegationId = insertResult.id;

  // Fetch parent company name for invite
  const parent = await env.GALA_DB.prepare(
    `SELECT company FROM sponsors WHERE id = ?`
  ).bind(parentSponsorId).first();
  const parentCompany = parent?.company || 'the gala';

  // Send invite
  const portalUrl = `https://gala.daviskids.org/sponsor/${newToken}`;
  const inviterName = resolved.kind === 'sponsor'
    ? [resolved.record.first_name, resolved.record.last_name].filter(Boolean).join(' ').trim() || resolved.record.company
    : resolved.record.delegate_name;

  context.waitUntil(sendDelegationInvite(env, {
    delegationId,
    email,
    phone,
    name,
    seats,
    parentCompany,
    inviterName,
    portalUrl,
  }));

  return jsonOk({
    ok: true,
    delegation: {
      id: delegationId,
      token: newToken,
      delegateName: name,
      email,
      phone,
      seatsAllocated: seats,
      status: 'pending',
    },
  });
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const token = params.token;

  const resolved = await resolveToken(env, token);
  if (!resolved) return jsonError('Invalid token', 404);

  // Tier-window gate (migration 010).
  const access = await getTierAccess(env, resolved);
  if (!access.open) return tierGateError(access);

  const url = new URL(request.url);
  const delegationId = Number(url.searchParams.get('delegation_id'));
  if (!delegationId) return jsonError('delegation_id required', 400);

  // Verify the delegation belongs to this token
  const deleg = await env.GALA_DB.prepare(
    `SELECT * FROM sponsor_delegations WHERE id = ?`
  ).bind(delegationId).first();
  if (!deleg) return jsonError('Delegation not found', 404);

  let allowed = false;
  if (resolved.kind === 'sponsor' && deleg.parent_sponsor_id === resolved.record.id && !deleg.parent_delegation_id) {
    allowed = true;
  } else if (resolved.kind === 'delegation' && deleg.parent_delegation_id === resolved.record.id) {
    allowed = true;
  }
  if (!allowed) return jsonError('Not allowed to reclaim this delegation', 403);

  // Cascade: find and reclaim any grand-child delegations first
  const grandkids = await env.GALA_DB.prepare(
    `SELECT id FROM sponsor_delegations WHERE parent_delegation_id = ? AND status != 'reclaimed'`
  ).bind(delegationId).all();
  for (const gk of grandkids.results || []) {
    // Release their seats + holds
    await env.GALA_DB.prepare(`DELETE FROM seat_assignments WHERE delegation_id = ?`).bind(gk.id).run();
    await env.GALA_DB.prepare(`DELETE FROM seat_holds WHERE delegation_id = ?`).bind(gk.id).run();
    await env.GALA_DB.prepare(
      `UPDATE sponsor_delegations SET status = 'reclaimed', updated_at = datetime('now') WHERE id = ?`
    ).bind(gk.id).run();
  }

  // Unassign any seats placed under this delegation
  await env.GALA_DB.prepare(
    `DELETE FROM seat_assignments WHERE delegation_id = ?`
  ).bind(delegationId).run();

  // Also remove holds
  await env.GALA_DB.prepare(
    `DELETE FROM seat_holds WHERE delegation_id = ?`
  ).bind(delegationId).run();

  // Mark delegation as reclaimed (soft-delete so history is preserved)
  await env.GALA_DB.prepare(
    `UPDATE sponsor_delegations SET status = 'reclaimed', updated_at = datetime('now') WHERE id = ?`
  ).bind(delegationId).run();

  return jsonOk({ ok: true, reclaimed: delegationId });
}

// ───── Invite sender ─────
async function sendDelegationInvite(env, opts) {
  const { delegationId, email, phone, name, seats, parentCompany, inviterName, portalUrl } = opts;

  const subject = `${inviterName} reserved ${seats} gala seat${seats===1?'':'s'} for you`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Gala 2026 · June 10</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">Megaplex Theatres at Legacy Crossing</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 12px;font-weight:600;">Hi ${escapeHtml(name)},</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        <strong>${escapeHtml(inviterName)}</strong> from <strong>${escapeHtml(parentCompany)}</strong> has reserved <strong>${seats} seat${seats===1?'':'s'}</strong> for you at the Davis Education Foundation Gala on June 10, 2026.
      </p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Select exactly where you want to sit by clicking your personal link below. You can select all your seats yourself, or delegate some to someone else.
      </p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#CB262C,#a01f24);color:#fff;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 12px 32px rgba(203,38,44,0.25);">Select my seats →</a>
      </p>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        Or open this URL in your browser:<br/>
        <a href="${portalUrl}" style="color:#CB262C;word-break:break-all;">${portalUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">
        Davis Education Foundation · Gala 2026 · June 10, 2026<br/>
        Questions? Reply to this email or contact <a href="mailto:gala@daviskids.org" style="color:#CB262C;">gala@daviskids.org</a>
      </p>
    </div>
  </div>
</div>
</body></html>`;

  const inviteSmsBody = [
    `🎬 DEF Gala 2026 · June 10`,
    ``,
    `${inviterName} reserved ${seats} seat${seats===1?'':'s'} for you${parentCompany && parentCompany !== 'the gala' ? ` (${parentCompany})` : ''}.`,
    `Pick your seats:`,
    portalUrl,
  ].join('\n');

  const results = await Promise.allSettled([
    email ? sendEmail(env, { to: email, subject, html, replyTo: env.GALA_ADMIN_EMAIL }) : Promise.resolve(null),
    phone ? sendSMS(env, phone, inviteSmsBody) : Promise.resolve(null),
  ]);

  // Log to sponsor_invites
  try {
    if (email) {
      const r = results[0].status === 'fulfilled' ? results[0].value : null;
      await env.GALA_DB.prepare(
        `INSERT INTO sponsor_invites (delegation_id, channel, recipient, subject, status, error) VALUES (?, 'email', ?, ?, ?, ?)`
      ).bind(delegationId, email, subject, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
    }
    if (phone) {
      const r = results[1].status === 'fulfilled' ? results[1].value : null;
      await env.GALA_DB.prepare(
        `INSERT INTO sponsor_invites (delegation_id, channel, recipient, status, error) VALUES (?, 'sms', ?, ?, ?)`
      ).bind(delegationId, phone, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
    }
  } catch {}
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ───── Dinner reminder sender ─────
// Lighter touch than the full invite — focused on the missing-meals
// nudge. Same delivery pattern (SMS + email, allSettled, log to
// sponsor_invites) as sendDelegationInvite for consistency.
async function sendDinnerReminder(env, opts) {
  const { delegationId, email, phone, name, missingCount, inviterName, portalUrl } = opts;

  const seatWord = missingCount === 1 ? 'seat' : 'seats';
  const subject = `Pick your dinner — DEF Gala`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Gala 2026 · June 10</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">Time to pick your dinner</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 12px;font-weight:600;">Hi ${escapeHtml(name)},</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Your seats are locked in for the gala — thank you! ${escapeHtml(inviterName)} just wants to make sure your dinner${missingCount===1?'':'s'} are set so the kitchen knows what to prep.
      </p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Open your portal and pick a meal for ${missingCount === 1 ? 'your seat' : `your ${missingCount} ${seatWord}`}. Brisket, turkey, veggie, kids, or gluten-free.
      </p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#CB262C,#a01f24);color:#fff;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 12px 32px rgba(203,38,44,0.25);">Pick my dinner →</a>
      </p>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        Or open this URL in your browser:<br/>
        <a href="${portalUrl}" style="color:#CB262C;word-break:break-all;">${portalUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">
        Davis Education Foundation · Gala 2026 · June 10, 2026<br/>
        Questions? Reply to this email or contact <a href="mailto:gala@daviskids.org" style="color:#CB262C;">gala@daviskids.org</a>
      </p>
    </div>
  </div>
</div>
</body></html>`;

  const smsBody = [
    `🎬 DEF Gala 2026 · June 10`,
    ``,
    `${inviterName}: don't forget to pick a dinner for ${missingCount === 1 ? 'your seat' : `your ${missingCount} ${seatWord}`}.`,
    `Tap to choose:`,
    portalUrl,
  ].join('\n');

  const results = await Promise.allSettled([
    email ? sendEmail(env, { to: email, subject, html, replyTo: env.GALA_ADMIN_EMAIL }) : Promise.resolve(null),
    phone ? sendSMS(env, phone, smsBody) : Promise.resolve(null),
  ]);

  try {
    if (email) {
      const r = results[0].status === 'fulfilled' ? results[0].value : null;
      await env.GALA_DB.prepare(
        `INSERT INTO sponsor_invites (delegation_id, channel, recipient, subject, status, error) VALUES (?, 'email', ?, ?, ?, ?)`
      ).bind(delegationId, email, subject, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
    }
    if (phone) {
      const r = results[1].status === 'fulfilled' ? results[1].value : null;
      await env.GALA_DB.prepare(
        `INSERT INTO sponsor_invites (delegation_id, channel, recipient, status, error) VALUES (?, 'sms', ?, ?, ?)`
      ).bind(delegationId, phone, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
    }
  } catch {}
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
