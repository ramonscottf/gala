// TEMP DIAGNOSTIC v3 — replicate request-link end-to-end with full trace
import { sendEmail } from './_notify.js';
import { jsonOk, jsonError } from './_sponsor_portal.js';

const PORTAL_BASE = 'https://gala.daviskids.org/sponsor/';
const REPLY_TO = 'smiggin@dsdmail.net, sfoster@dsdmail.net';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('bad json', 400); }
  if (body.token !== 'skippy-debug-tta') return jsonError('nope', 403);

  const email = (body.email || 'ramonscottf@gmail.com').toLowerCase().trim();
  const trace = [];
  trace.push({ step: 'start', email });

  let sponsorRow = null, delegationRow = null;
  try {
    sponsorRow = await env.GALA_DB.prepare(
      `SELECT id, first_name, last_name, email, secondary_email, rsvp_token
         FROM sponsors
        WHERE archived_at IS NULL
          AND (LOWER(email) = ? OR LOWER(secondary_email) = ?)
        LIMIT 1`
    ).bind(email, email).first();
    trace.push({ step: 'sponsor_lookup', id: sponsorRow ? sponsorRow.id : null });
  } catch (e) { return jsonOk({ trace, error_at: 'sponsor_lookup', error: String(e && e.message) }); }

  try {
    delegationRow = await env.GALA_DB.prepare(
      `SELECT id, delegate_name, delegate_email, token, status
         FROM sponsor_delegations
        WHERE LOWER(delegate_email) = ?
          AND (status IS NULL OR status != 'revoked')
        LIMIT 1`
    ).bind(email).first();
    trace.push({ step: 'delegation_lookup', id: delegationRow ? delegationRow.id : null });
  } catch (e) { return jsonOk({ trace, error_at: 'delegation_lookup', error: String(e && e.message) }); }

  if (!sponsorRow && !delegationRow) return jsonOk({ trace, terminal: 'no_match' });

  let recipientName = null, portalToken = null, kind = 'sponsor';
  if (sponsorRow) {
    recipientName = [sponsorRow.first_name, sponsorRow.last_name].filter(Boolean).join(' ').trim() || null;
    portalToken = sponsorRow.rsvp_token;
  } else {
    recipientName = delegationRow.delegate_name || null;
    portalToken = delegationRow.token;
    kind = 'delegation';
  }
  trace.push({ step: 'resolved', kind, has_token: !!portalToken, token_prefix: portalToken ? portalToken.slice(0,4) : null });

  if (!portalToken) return jsonOk({ trace, terminal: 'no_token' });

  const portalUrl = `${PORTAL_BASE}${portalToken}`;
  const html = `<p>Trace test from email-debug — portal: <a href="${portalUrl}">${portalUrl}</a></p>`;

  trace.push({ step: 'about_to_send' });

  let mailResult;
  try {
    mailResult = await sendEmail(env, {
      to: email,
      subject: 'SKIPPYTEST-E: replicated request-link path',
      html,
      replyTo: REPLY_TO,
    });
    trace.push({ step: 'send_returned', ok: mailResult.ok, id: mailResult.id, via: mailResult.via, error: mailResult.error });
  } catch (e) {
    trace.push({ step: 'send_threw', error: String(e && e.message) });
    return jsonOk({ trace, terminal: 'threw' });
  }

  return jsonOk({ trace, terminal: 'complete' });
}
