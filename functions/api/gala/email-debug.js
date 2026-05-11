// TEMP DIAGNOSTIC v2 — replicate request-link's DB lookups + send
import { sendEmail } from './_notify.js';
import { jsonOk, jsonError } from './_sponsor_portal.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('bad json', 400); }
  if (body.token !== 'skippy-debug-tta') return jsonError('nope', 403);

  const email = (body.email || 'ramonscottf@gmail.com').toLowerCase().trim();
  const trace = { steps: [], errors: [] };

  trace.steps.push({ step: 'start', email });

  try {
    const sponsorRow = await env.GALA_DB.prepare(
      `SELECT id, first_name, last_name, email, secondary_email, rsvp_token
         FROM sponsors
        WHERE archived_at IS NULL
          AND (LOWER(email) = ? OR LOWER(secondary_email) = ?)
        LIMIT 1`
    ).bind(email, email).first();
    trace.steps.push({ step: 'sponsor_lookup', found: !!sponsorRow, row: sponsorRow ? { id: sponsorRow.id, has_token: !!sponsorRow.rsvp_token, token_len: sponsorRow.rsvp_token ? sponsorRow.rsvp_token.length : 0 } : null });
  } catch (e) { trace.errors.push({ step: 'sponsor_lookup', error: String(e && e.message || e) }); }

  try {
    const delegationRow = await env.GALA_DB.prepare(
      `SELECT id, delegate_name, delegate_email, token, status
         FROM sponsor_delegations
        WHERE LOWER(delegate_email) = ?
          AND (status IS NULL OR status != 'revoked')
        LIMIT 1`
    ).bind(email).first();
    trace.steps.push({ step: 'delegation_lookup', found: !!delegationRow, row: delegationRow ? { id: delegationRow.id, has_token: !!delegationRow.token } : null });
  } catch (e) { trace.errors.push({ step: 'delegation_lookup', error: String(e && e.message || e) }); }

  return jsonOk(trace);
}
