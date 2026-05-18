import { createSession, sessionCookie, jsonError } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.GALA_DASH_SECRET;
  const password = env.GALA_DASH_PASSWORD;

  // ── Config preflight ──────────────────────────────────────────────────
  // Both secrets MUST be present. Earlier behavior fell back to a
  // hardcoded password ('gala2026') and let createSession() throw on an
  // empty secret, surfacing as HTTP 500 with no explanation — invisible
  // failure mode. Be loud and explicit instead so the next time this
  // happens (likely a CF Pages env-vars dashboard footgun) it takes
  // 30 seconds to diagnose, not 30 minutes.
  if (!secret) {
    return jsonError(
      'Admin auth is misconfigured: GALA_DASH_SECRET is missing or empty. ' +
      'Set it via the Cloudflare Pages env vars and redeploy. ' +
      'Hit /api/gala/admin/healthcheck for a full secret-status report.',
      503
    );
  }
  if (!password) {
    return jsonError(
      'Admin auth is misconfigured: GALA_DASH_PASSWORD is missing or empty. ' +
      'Set it via the Cloudflare Pages env vars and redeploy. ' +
      'Hit /api/gala/admin/healthcheck for a full secret-status report.',
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request', 400);
  }

  if (!body.password || body.password !== password) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const token = await createSession(secret);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token),
      'Cache-Control': 'no-store',
    },
  });
}
