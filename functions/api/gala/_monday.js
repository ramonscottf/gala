// Shared helpers for Monday.com API and gala auth

const MONDAY_API = 'https://api.monday.com/v2';
const COOKIE_NAME = 'gala_session';
const MAX_AGE_SEC = 86400;

/**
 * Execute a Monday.com GraphQL query
 */
export async function queryMonday(apiKey, query, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Monday.com API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Monday.com GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
}

/**
 * Verify gala_session cookie (for API routes outside /gala-dashboard/)
 */
export async function verifyGalaAuth(request, secret) {
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
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const expectedHex = [...new Uint8Array(expected)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Standard JSON error response
 */
export function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Standard JSON success response with edge caching
 */
export function jsonOk(data, cacheSec = 300) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheSec}`,
    },
  });
}
