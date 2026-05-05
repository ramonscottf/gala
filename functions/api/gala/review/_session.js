// Shared helpers for /api/gala/review/* endpoints
// - verifyReviewSession: returns { email } or null
// - jsonError, jsonOk: re-exports

const COOKIE_NAME = 'gala_review_session';

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

export async function verifyReviewSession(request, secret) {
  if (!secret) return null;
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const payloadB64 = token.substring(0, dot);
  const sig = token.substring(dot + 1);

  let payload;
  try {
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    payload = atob(padded);
  } catch {
    return null;
  }

  const expectedSig = await hmacHex(secret, payload);
  if (!constantTimeEq(sig, expectedSig)) return null;

  const [email, expiresAtStr] = payload.split('|');
  const expiresAt = Number(expiresAtStr);
  if (!email || !expiresAt) return null;
  if (Date.now() > expiresAt) return null;

  return { email };
}

export function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
