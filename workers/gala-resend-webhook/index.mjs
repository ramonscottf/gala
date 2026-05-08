// gala-resend-webhook
//
// Cloudflare Worker that receives Resend email-event webhooks and writes
// them to the marketing_email_events table in gala-seating D1.
//
// Resend sends webhook events for: email.sent, email.delivered, email.opened,
// email.clicked, email.bounced, email.complained, email.delivery_delayed,
// email.failed.
//
// Webhook URL (set in Resend dashboard):
//   https://gala-resend-webhook.<account-subdomain>.workers.dev/
//   (or routed via custom domain — recommended: webhooks.daviskids.org/resend)
//
// Authentication: Resend signs webhooks with Svix. The signing secret is
// stored as the WEBHOOK_SECRET env var. We verify the svix-signature header
// before accepting any payload. Unsigned or mismatched requests get 401.
//
// Bindings:
//   GALA_DB         — D1 (gala-seating, 1468a0b3-cc6c-49a6-ad89-421e9fb00a86)
//   WEBHOOK_SECRET  — secret, Svix signing secret from Resend (whsec_...)
//
// Idempotency: each webhook payload has a svix-id header. We store the
// resend_id + event_type + occurred_at as a natural-key tuple. The events
// table is append-only — we don't dedupe, because Resend retries are rare
// and seeing the same event twice is harmless for analytics.

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, svix-id, svix-timestamp, svix-signature',
        },
      });
    }

    const url = new URL(request.url);

    // Health check / GET: returns service info, useful for verifying deploy
    if (request.method === 'GET') {
      return jsonResponse({
        service: 'gala-resend-webhook',
        version: '1.0.0',
        endpoints: {
          'POST /': 'Receive Resend webhook events',
          'GET /events?resend_id=<id>': 'List events for a given Resend message ID (admin-token required)',
          'GET /summary?send_id=<id>': 'Aggregate event counts for a marketing send (admin-token required)',
        },
      });
    }

    // Admin lookup endpoints (read-only, require X-Admin-Token header)
    if (request.method === 'GET' && url.pathname === '/events') {
      return await handleEventsLookup(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/summary') {
      return await handleSendSummary(request, env);
    }

    // POST / — webhook ingestion
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // Read body as text first — we need it for signature verification
    const rawBody = await request.text();

    // Svix signature verification.
    // Resend uses Svix under the hood. Headers: svix-id, svix-timestamp, svix-signature.
    // Signature format: "v1,<base64>" (may have multiple comma-separated entries).
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('[webhook] Missing svix-* headers');
      return jsonResponse({ error: 'Missing webhook headers' }, 401);
    }

    // Reject events older than 5 minutes (replay attack defense)
    const tsSeconds = parseInt(svixTimestamp, 10);
    if (!Number.isFinite(tsSeconds)) {
      return jsonResponse({ error: 'Invalid svix-timestamp' }, 401);
    }
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds);
    if (ageSeconds > 300) {
      console.warn(`[webhook] Stale event (${ageSeconds}s old), rejecting`);
      return jsonResponse({ error: 'Webhook timestamp too old' }, 401);
    }

    // Verify signature
    if (env.WEBHOOK_SECRET) {
      const valid = await verifySvixSignature(
        env.WEBHOOK_SECRET,
        svixId,
        svixTimestamp,
        rawBody,
        svixSignature
      );
      if (!valid) {
        console.warn(`[webhook] Signature verification failed for svix-id=${svixId}`);
        return jsonResponse({ error: 'Invalid signature' }, 401);
      }
    } else {
      // Worker is configured without secret — refuse to process.
      // We could allow this for dev but prod must always verify.
      console.error('[webhook] WEBHOOK_SECRET not configured — refusing to process');
      return jsonResponse({ error: 'Webhook secret not configured' }, 500);
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    // Resend webhook payload shape:
    // {
    //   type: "email.delivered",
    //   created_at: "2026-05-07T23:09:15.123Z",
    //   data: {
    //     email_id: "<resend-id>",
    //     to: ["recipient@example.com"],
    //     from: "...",
    //     subject: "...",
    //     // For opens: includes click_link, user_agent, ip_address (when available)
    //     // For bounces: includes bounce sub-object
    //   }
    // }
    const eventType = payload.type || payload.event_type;
    const data = payload.data || {};
    const resendId = data.email_id || data.id;
    const occurredAt = payload.created_at || data.created_at || new Date().toISOString();

    if (!resendId || !eventType) {
      console.warn('[webhook] Payload missing email_id or type:', JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ error: 'Invalid Resend payload' }, 400);
    }

    // Recipient — could be array or string
    const recipientEmail = Array.isArray(data.to) ? data.to[0] : (data.to || null);

    // Click event payload includes the clicked URL
    const clickLink = data.click_link || data.link || (data.click && data.click.link) || null;

    // Bounce payload includes bounce_type + reason
    const bounceType = data.bounce_type
      || (data.bounce && data.bounce.type)
      || null;
    const bounceReason = (data.bounce && data.bounce.reason) || data.reason || null;

    // Open event sometimes includes UA + IP
    const userAgent = data.user_agent
      || (data.opened && data.opened.user_agent)
      || (data.click && data.click.user_agent)
      || null;
    const ipAddress = data.ip_address
      || (data.opened && data.opened.ip_address)
      || (data.click && data.click.ip_address)
      || null;

    try {
      await env.GALA_DB.prepare(`
        INSERT INTO marketing_email_events (
          resend_id, event_type, recipient_email, click_link,
          bounce_type, bounce_reason, user_agent, ip_address,
          occurred_at, raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        resendId,
        eventType,
        recipientEmail,
        clickLink,
        bounceType,
        bounceReason,
        userAgent,
        ipAddress,
        occurredAt,
        JSON.stringify(payload).slice(0, 4000)  // cap raw payload
      ).run();
    } catch (e) {
      console.error('[webhook] D1 insert failed:', e.message);
      // Return 500 — Svix will retry. Better to retry than lose an event.
      return jsonResponse({ error: 'Database write failed', detail: e.message }, 500);
    }

    return jsonResponse({ ok: true, event_type: eventType, resend_id: resendId });
  },
};

// ── Svix signature verification ─────────────────────────────────────────────
//
// Svix signs `${svix_id}.${svix_timestamp}.${rawBody}` with HMAC-SHA256
// using the webhook secret (after stripping the "whsec_" prefix and
// base64-decoding it).
//
// The svix-signature header is "v1,<base64-sig>" — possibly multiple
// versions space-separated. We accept if ANY v1 signature matches.

async function verifySvixSignature(secret, svixId, svixTimestamp, body, signatureHeader) {
  // Strip "whsec_" prefix and base64-decode
  const secretRaw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const secretBytes = base64ToBytes(secretRaw);

  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign))
  );
  const expected = bytesToBase64(sigBytes);

  // Header: "v1,<sig> v1,<sig>" — split by space, then by comma
  const candidates = signatureHeader.split(' ').map(s => s.split(',')).filter(p => p.length === 2);
  for (const [version, sig] of candidates) {
    if (version === 'v1' && constantTimeEqual(sig, expected)) {
      return true;
    }
  }
  return false;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// ── Admin endpoints ─────────────────────────────────────────────────────────

async function handleEventsLookup(request, env) {
  const auth = request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || auth !== env.ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const resendId = url.searchParams.get('resend_id');
  if (!resendId) return jsonResponse({ error: 'Missing resend_id query param' }, 400);

  const result = await env.GALA_DB.prepare(`
    SELECT event_id, resend_id, event_type, recipient_email, click_link,
           bounce_type, bounce_reason, user_agent, ip_address,
           occurred_at, received_at
    FROM marketing_email_events
    WHERE resend_id = ?
    ORDER BY occurred_at ASC
  `).bind(resendId).all();

  return jsonResponse({ resend_id: resendId, events: result.results });
}

async function handleSendSummary(request, env) {
  const auth = request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || auth !== env.ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const sendId = url.searchParams.get('send_id');
  if (!sendId) return jsonResponse({ error: 'Missing send_id query param' }, 400);

  // Aggregate event counts for a send by joining marketing_send_log on resend_id
  const summary = await env.GALA_DB.prepare(`
    SELECT
      COUNT(DISTINCT msl.log_id) as total_sent,
      COUNT(DISTINCT CASE WHEN mee.event_type = 'email.delivered' THEN msl.resend_id END) as delivered,
      COUNT(DISTINCT CASE WHEN mee.event_type = 'email.opened' THEN msl.resend_id END) as opened,
      COUNT(DISTINCT CASE WHEN mee.event_type = 'email.clicked' THEN msl.resend_id END) as clicked,
      COUNT(DISTINCT CASE WHEN mee.event_type = 'email.bounced' THEN msl.resend_id END) as bounced,
      COUNT(DISTINCT CASE WHEN mee.event_type = 'email.complained' THEN msl.resend_id END) as complained
    FROM marketing_send_log msl
    LEFT JOIN marketing_email_events mee ON mee.resend_id = msl.resend_id
    WHERE msl.send_id = ?
  `).bind(sendId).first();

  return jsonResponse({ send_id: sendId, ...summary });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
