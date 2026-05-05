// GET /api/gala/review/auth/verify?t=<token>
// Verifies the magic-link token, sets a 30-day session cookie, redirects to /gala-review/

import { jsonError } from '../../_auth.js';

const COOKIE_NAME = 'gala_review_session';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('t');

  if (!token) return errorPage('Missing token');
  if (!env.GALA_REVIEW_SECRET) return errorPage('Server not configured');

  // Token format: <b64url(payload)>.<sig>
  const dot = token.lastIndexOf('.');
  if (dot === -1) return errorPage('Bad token');
  const payloadB64 = token.substring(0, dot);
  const sig = token.substring(dot + 1);

  // Decode b64url
  let payload;
  try {
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    payload = atob(padded);
  } catch {
    return errorPage('Bad token');
  }

  const expectedSig = await hmacHex(env.GALA_REVIEW_SECRET, payload);
  if (!constantTimeEq(sig, expectedSig)) return errorPage('Invalid signature');

  const [email, expiresAtStr] = payload.split('|');
  const expiresAt = Number(expiresAtStr);
  if (!email || !expiresAt) return errorPage('Bad token');
  if (Date.now() > expiresAt) return errorPage('Link expired (15 min). Request a new one.');

  // Issue session cookie: email + new expiry, signed
  const sessionExpires = Date.now() + SESSION_TTL_SEC * 1000;
  const sessionPayload = `${email}|${sessionExpires}`;
  const sessionSig = await hmacHex(env.GALA_REVIEW_SECRET, sessionPayload);
  const sessionToken = btoa(sessionPayload).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') + '.' + sessionSig;

  const cookie = `${COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`;

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/gala-review/?signed_in=1',
      'Set-Cookie': cookie,
      'Cache-Control': 'no-store',
    },
  });
}

function errorPage(msg) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sign-in error</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;background:#0d1b3d;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
.card{background:#161616;border:1px solid #2a2a2a;border-radius:14px;padding:32px;max-width:420px;text-align:center;}
h1{margin:0 0 8px;font-size:20px;}
p{color:#a3a3a3;font-size:14px;margin:0 0 18px;}
a{display:inline-block;background:#d4af6a;color:#0a0a0a;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:13px;}</style>
</head><body>
<div class="card">
  <h1>Sign-in error</h1>
  <p>${msg}</p>
  <a href="/gala-review/">Try again &rarr;</a>
</div></body></html>`;
  return new Response(html, {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
