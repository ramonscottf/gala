// /api/gala/marketing-send-queued
//
// POST { sendId, confirmedRecipientCount }
//
// Replaces /api/gala/marketing-send-now (which had a 30s wall-clock ceiling
// from Pages Functions when the browser disconnected). This function:
//
//   1. Verifies audience count matches what admin saw at preview time
//   2. Generates a runId
//   3. Enqueues N messages to gala-marketing-send (one per recipient)
//   4. Returns { runId, queued } in <1 second
//
// The actual send happens in gala-send-consumer (queue-triggered worker).
// Dashboard polls /api/gala/marketing-send-progress?run_id=X for status.
//
// Bindings required (wrangler.toml or Pages env):
//   GALA_DB                 — D1 (gala-seating)
//   GALA_DASH_SECRET        — admin auth secret
//   GALA_SEND_QUEUE         — Queue producer binding to gala-marketing-send

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { resolveAudience } from './_audience.js';

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('Unauthorized', 401);
  }

  let payload;
  try { payload = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { sendId, confirmedRecipientCount } = payload || {};
  if (!sendId) return jsonError('sendId required', 400);
  if (typeof confirmedRecipientCount !== 'number') {
    return jsonError('confirmedRecipientCount required', 400);
  }

  const db = env.GALA_DB;
  if (!db) return jsonError('GALA_DB not bound', 500);
  if (!env.GALA_SEND_QUEUE) return jsonError('GALA_SEND_QUEUE not bound — queue infra not configured', 500);

  // Pull canonical send row
  const send = await db.prepare(
    'SELECT send_id, channel, audience, subject, body FROM marketing_sends WHERE send_id = ?'
  ).bind(sendId).first();
  if (!send) return jsonError(`Send ${sendId} not found in marketing_sends`, 404);
  const channelLc = (send.channel || '').toLowerCase();
  if (channelLc !== 'email') {
    return jsonError(`Queued send is email only — this row is ${send.channel}`, 400);
  }
  if (!send.subject || !send.body) return jsonError('Subject and body required', 400);

  // Re-resolve audience server-side and verify count matches what admin saw
  const { recipients } = await resolveAudience(send.audience, db);
  if (recipients.length !== confirmedRecipientCount) {
    return jsonError(
      `Recipient count changed since preview (was ${confirmedRecipientCount}, now ${recipients.length}). Re-open Preview Send to refresh.`,
      409
    );
  }
  if (recipients.length === 0) {
    return jsonError(`No recipients matched audience "${send.audience}"`, 400);
  }

  const runId = crypto.randomUUID();

  // Sanitize sendRow for queue payload (don't include unnecessary metadata)
  const sendRow = {
    send_id: send.send_id,
    audience: send.audience,
    subject: send.subject,
    body: send.body,
  };

  // Enqueue in batches of 100 (Cloudflare Queues sendBatch max).
  // Each message = one recipient. Consumer will fan out to send one email per message.
  const messages = recipients.map((r) => ({
    body: {
      sendId,
      runId,
      recipient: {
        id: r.id,
        email: r.email,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        company: r.company || null,
      },
      sendRow,
    },
  }));

  // sendBatch caps at 100 messages per call; chunk if needed
  const CHUNK = 100;
  let queued = 0;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const slice = messages.slice(i, i + CHUNK);
    await env.GALA_SEND_QUEUE.sendBatch(slice);
    queued += slice.length;
  }

  return jsonOk({
    runId,
    queued,
    total: recipients.length,
    sendId,
    message: 'Messages enqueued. Poll /api/gala/marketing-send-progress?run_id=' + runId + ' for status.',
  });
}
