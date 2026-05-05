const COOKIE_NAME = 'gala_session';
const MAX_AGE_SEC = 86400;

export async function createSession(secret) {
  const ts = String(Date.now());
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ts}.${hex}`;
}

export async function verifyGalaAuth(request, secret) {
  if (!secret) return false;
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  const cookie = match ? decodeURIComponent(match[1]) : null;
  if (!cookie) return false;

  const dot = cookie.indexOf('.');
  if (dot === -1) return false;
  const timestamp = cookie.substring(0, dot);
  const signature = cookie.substring(dot + 1);

  const age = Date.now() - Number(timestamp);
  if (isNaN(age) || age < 0 || age > MAX_AGE_SEC * 1000) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const expectedHex = [...new Uint8Array(expected)].map(b => b.toString(16).padStart(2, '0')).join('');

  if (signature.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}

export function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function jsonOk(data, cacheSec = 0) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheSec ? `public, max-age=${cacheSec}` : 'no-store',
    },
  });
}
