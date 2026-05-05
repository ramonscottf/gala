// POST /api/gala/admin/send-invites
// Body: { tier: 'Platinum'|'Gold'|'Silver'|'Bronze'|'Cell Phone'|'all' | sponsor_ids: [1,2,3] }
// Returns: { sent: N, failed: [...] }
//
// GET /api/gala/admin/send-invites?tier=Platinum - preview (who would receive)

import { verifyGalaAuth } from '../_auth.js';
import { jsonError, jsonOk } from '../_sponsor_portal.js';
import { sendSMS, sendEmail } from '../_notify.js';
import {
  expandTierAliases,
  hasSponsorArchiveSupport,
  normalizeSponsorTier,
} from '../_gala_data.js';

function addTierFilter(sql, params, tier) {
  const aliases = expandTierAliases(tier);
  if (!aliases.length) return sql;
  sql += ` AND sponsorship_tier IN (${aliases.map(() => '?').join(',')})`;
  params.push(...aliases);
  return sql;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const tier = url.searchParams.get('tier');
  const archiveSupported = await hasSponsorArchiveSupport(env);

  let sql = `SELECT id, company, first_name, last_name, email, phone, sponsorship_tier, seats_purchased, rsvp_token, rsvp_status
             FROM sponsors WHERE rsvp_token IS NOT NULL AND rsvp_token != ''`;
  if (archiveSupported) sql += ' AND archived_at IS NULL';
  const params = [];
  if (tier && tier !== 'all') {
    sql = addTierFilter(sql, params, tier);
  }
  sql += ' ORDER BY company';

  const result = await env.GALA_DB.prepare(sql).bind(...params).all();
  return jsonOk({
    sponsors: (result.results || []).map((s) => ({
      ...s,
      sponsorship_tier: normalizeSponsorTier(s.sponsorship_tier) || s.sponsorship_tier,
    })),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { tier, sponsor_ids, dry_run = false, override = null } = body;
  const archiveSupported = await hasSponsorArchiveSupport(env);

  // Build target list
  let sql = `SELECT * FROM sponsors WHERE rsvp_token IS NOT NULL AND rsvp_token != ''`;
  if (archiveSupported) sql += ' AND archived_at IS NULL';
  const params = [];
  if (sponsor_ids && Array.isArray(sponsor_ids) && sponsor_ids.length) {
    sql += ` AND id IN (${sponsor_ids.map(() => '?').join(',')})`;
    params.push(...sponsor_ids);
  } else if (tier && tier !== 'all') {
    sql = addTierFilter(sql, params, tier);
  }

  const result = await env.GALA_DB.prepare(sql).bind(...params).all();
  const targets = result.results || [];

  if (dry_run) {
    return jsonOk({
      dryRun: true,
      wouldSend: targets.length,
      recipients: targets.map(s => ({
        id: s.id,
        company: s.company,
        tier: normalizeSponsorTier(s.sponsorship_tier) || s.sponsorship_tier,
        email: s.email,
        phone: s.phone,
      })),
    });
  }

  const summary = { sent_email: 0, sent_sms: 0, skipped_no_contact: [], failed: [], byTier: {} };

  for (const s of targets) {
    const portalUrl = `https://gala.daviskids.org/sponsor/${s.rsvp_token}`;
    const contactName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || s.company;
    const tierLabel = normalizeSponsorTier(s.sponsorship_tier) || s.sponsorship_tier;

    const subject = override?.subject
      || `Select your ${s.seats_purchased} gala seats — ${tierLabel} sponsor`;

    const html = buildInviteHtml({
      contactName,
      company: s.company,
      tier: tierLabel,
      seats: s.seats_purchased,
      portalUrl,
      override,
    });

    let anyChannelSucceeded = false;

    // Email
    if (s.email) {
      try {
        const r = await sendEmail(env, { to: s.email, subject, html, replyTo: env.GALA_ADMIN_EMAIL });
        if (r?.ok) { summary.sent_email += 1; anyChannelSucceeded = true; }
        else summary.failed.push({ company: s.company, channel: 'email', error: r?.error || 'unknown' });
        await env.GALA_DB.prepare(
          `INSERT INTO sponsor_invites (sponsor_id, channel, recipient, subject, status, error) VALUES (?, 'email', ?, ?, ?, ?)`
        ).bind(s.id, s.email, subject, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
      } catch (e) {
        summary.failed.push({ company: s.company, channel: 'email', error: e.message });
      }
    }

    // SMS
    if (s.phone) {
      const smsText = override?.smsText
        ? override.smsText
            .replace('{firstName}', contactName.split(' ')[0] || 'there')
            .replace('{portalUrl}', portalUrl)
            .replace('{seats}', String(s.seats_purchased))
            .replace('{tier}', tierLabel)
        : `Hi ${contactName.split(' ')[0] || 'there'}, DEF Gala 2026 ${tierLabel} sponsors can now select their ${s.seats_purchased} seats. Reply STOP to opt out. ${portalUrl}`;
      try {
        const r = await sendSMS(env, s.phone, smsText);
        if (r?.ok) { summary.sent_sms += 1; anyChannelSucceeded = true; }
        else summary.failed.push({ company: s.company, channel: 'sms', error: r?.error || 'unknown' });
        await env.GALA_DB.prepare(
          `INSERT INTO sponsor_invites (sponsor_id, channel, recipient, status, error) VALUES (?, 'sms', ?, ?, ?)`
        ).bind(s.id, s.phone, r?.ok ? 'sent' : 'failed', r?.ok ? null : (r?.error || 'unknown')).run();
      } catch (e) {
        summary.failed.push({ company: s.company, channel: 'sms', error: e.message });
      }
    }

    // Only mark as 'invited' if we actually delivered something.
    // Sponsors with no contact info (or all channels failed) stay 'pending' so the
    // dashboard shows their real state and admins know who still needs manual outreach.
    if (anyChannelSucceeded) {
      await env.GALA_DB.prepare(
        `UPDATE sponsors SET rsvp_status = 'invited', updated_at = datetime('now') WHERE id = ? AND (rsvp_status IS NULL OR rsvp_status = 'pending')`
      ).bind(s.id).run();
    } else if (!s.email && !s.phone) {
      summary.skipped_no_contact.push({ id: s.id, company: s.company, tier: s.sponsorship_tier, seats: s.seats_purchased });
    }

    summary.byTier[tierLabel] = (summary.byTier[tierLabel] || 0) + 1;
  }

  return jsonOk({ ok: true, targeted: targets.length, ...summary });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function buildInviteHtml({ contactName, company, tier, seats, portalUrl, override }) {
  // Allow override to customize the event copy for test/dry-run sends.
  // When override is null, this renders the production June 10 invite.
  const headline    = override?.headline    || 'Gala 2026 · June 10';
  const venue       = override?.venue       || 'Megaplex Theatres at Legacy Crossing · Centerville';
  const intro       = override?.intro       || `Thank you for supporting this year's Davis Education Foundation Gala. Your <strong>${escapeHtml(tier)}</strong> group can now select seats.`;
  const sponsorCard = override?.sponsorCard || `${escapeHtml(company)} · ${escapeHtml(tier)} · ${seats} seats`;
  const sponsorCardLabel = override?.sponsorCardLabel || 'Your Sponsorship';
  const footerLine  = override?.footerLine  || 'Davis Education Foundation · Gala 2026 · June 10, 2026 · 6:00 PM';
  const ctaLabel    = override?.ctaLabel    || 'Select my seats →';
  const extraSection = override?.extraSection || '';
  const bullets     = override?.bullets     || [
    `<strong>Select all ${seats} seats yourself</strong> — click your seats on the chart`,
    `<strong>Delegate some seats</strong> — have a colleague select their own spots`,
    `<strong>Need help?</strong> Reply to this email and our team will help your group finish seating`,
  ];
  const bulletsHtml = bullets.map(b => `<li>${b}</li>`).join('');
  const body        = override?.body        || `Click the link below to pick exactly where you'd like your group to sit. You can:`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="border-radius:18px;box-shadow:0 1px 2px rgba(11,27,60,0.06),0 10px 30px rgba(11,27,60,0.12),0 20px 48px rgba(11,27,60,0.08);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#122a57 0%,#1f4484 100%);padding:30px 30px 22px;border-top:3px solid #CB262C;">
      <div style="color:#ffc24d;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px;">Davis Education Foundation</div>
      <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700;">${escapeHtml(headline)}</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0;">${escapeHtml(venue)}</p>
    </div>
    <div style="background:#ffffff;padding:34px 30px;">
      <p style="color:#0b1b3c;font-size:17px;margin:0 0 12px;font-weight:600;">Hi ${escapeHtml(contactName)},</p>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 16px;">
        ${intro}
      </p>
      <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin:18px 0;border-left:3px solid #CB262C;">
        <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px;">${escapeHtml(sponsorCardLabel)}</div>
        <div style="color:#0b1b3c;font-size:16px;font-weight:700;">${sponsorCard}</div>
      </div>
      <p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 20px;">
        ${body}
      </p>
      <ul style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:18px;">
        ${bulletsHtml}
      </ul>
      <p style="text-align:center;margin:28px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#CB262C,#a01f24);color:#fff;padding:16px 36px;border-radius:50px;font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 12px 32px rgba(203,38,44,0.25);">${escapeHtml(ctaLabel)}</a>
      </p>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        Or open this URL in your browser:<br/>
        <a href="${portalUrl}" style="color:#CB262C;word-break:break-all;">${portalUrl}</a>
      </p>
      ${extraSection}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;"/>
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;line-height:1.6;">
        ${escapeHtml(footerLine)}<br/>
        Questions? Reply to this email or contact <a href="mailto:gala@daviskids.org" style="color:#CB262C;">gala@daviskids.org</a>
      </p>
    </div>
  </div>
</div>
</body></html>`;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
