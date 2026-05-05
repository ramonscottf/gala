import { jsonError, jsonOk } from './_auth.js';

/**
 * POST /api/gala/webhook
 * Receives Monday.com webhook payloads when board items change.
 *
 * Monday.com webhook setup:
 * 1. In Monday.com board, add automation: "When column changes → Send webhook"
 * 2. Set webhook URL to: https://daviskids.org/api/gala/webhook
 * 3. Monday will first send a challenge request to verify the URL
 *
 * This webhook:
 * - Validates Monday.com challenge handshake
 * - Logs item changes to D1 sync_log
 * - Can be extended to trigger Bloomerang re-sync or Power Automate callbacks
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  // Monday.com challenge verification (sent on webhook setup)
  if (body.challenge) {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Process webhook event
  const event = body.event;
  if (!event) {
    return jsonOk({ ok: true, message: 'No event payload' }, 0);
  }

  const eventType = event.type || 'unknown';
  const itemId = event.pulseId || event.itemId || 'unknown';
  const boardId = event.boardId || 'unknown';
  const columnId = event.columnId || '';
  const newValue = event.value?.label || event.value?.text || JSON.stringify(event.value || {});

  // Log the webhook event to D1
  if (env.GALA_DB) {
    try {
      await env.GALA_DB.prepare(
        `INSERT INTO sync_log (direction, entity_type, entity_id, status, details)
         VALUES ('monday_webhook', ?, ?, 'success', ?)`
      ).bind(
        eventType,
        String(itemId),
        `Board ${boardId}, Column ${columnId}: ${newValue}`.substring(0, 500)
      ).run();
    } catch {}
  }

  return jsonOk({
    ok: true,
    message: `Webhook received: ${eventType} on item ${itemId}`,
  }, 0);
}
