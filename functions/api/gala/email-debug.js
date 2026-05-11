// TEMP DIAGNOSTIC — Phase 5.14 hotfix investigation
// Tests sendEmail() in isolation, bypassing any DB lookups.
// Token-gated so it's not abusable.
//
// REMOVE THIS FILE once email path is confirmed working.

import { sendEmail } from './_notify.js';
import { jsonOk, jsonError } from './_sponsor_portal.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Light gate — body must have the right token to fire a send.
  let body;
  try { body = await request.json(); } catch { return jsonError('bad json', 400); }

  if (body.token !== 'skippy-debug-tta') {
    return jsonError('nope', 403);
  }

  const to = body.to || 'ramonscottf@gmail.com';

  // Snapshot what the worker actually sees in env
  const envCheck = {
    has_GALA_DB: !!env.GALA_DB,
    has_GALA_MAIL_TOKEN: !!env.GALA_MAIL_TOKEN,
    GALA_MAIL_TOKEN_len: env.GALA_MAIL_TOKEN ? env.GALA_MAIL_TOKEN.length : 0,
    has_RESEND_API_KEY: !!env.RESEND_API_KEY,
    GALA_FROM_EMAIL: env.GALA_FROM_EMAIL || '(unset)',
    GALA_ADMIN_EMAIL: env.GALA_ADMIN_EMAIL || '(unset)',
  };

  const html = '<p>Skippy diagnostic from /api/gala/email-debug. If you see this, sendEmail() works inside the worker.</p>';
  const result = await sendEmail(env, {
    to,
    subject: 'SKIPPYTEST-D: sendEmail() inside worker',
    html,
    replyTo: 'smiggin@dsdmail.net',
  });

  return jsonOk({ env_check: envCheck, mail: result });
}
