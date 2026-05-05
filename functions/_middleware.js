// Cloudflare Pages middleware — cookie-session gate for the gala repo
//
// Adapted from def-site/functions/_middleware.js. Same cookie format
// ({timestamp_ms}.{hmac_sha256_hex_of_timestamp}), same secret
// (GALA_DASH_SECRET), same MAX_AGE — sessions minted by either the
// legacy /gala-login form or the new /api/auth/verify endpoint are
// interchangeable.
//
// What's gated:
//   /admin/*   — admin dashboard (unchanged behavior, just new path)
//   /checkin   — night-of QR scanner; bypasses gate when ?t={token}
//                is present (sponsor self-checkin via their own QR)
//
// What's NOT gated (open):
//   /          — magic-link login landing
//   /sponsor/* — sponsor portal (token in URL is the auth)
//   /review/*  — marketing review (its own /api/gala/review/auth flow)
//   /volunteer — volunteer signup form
//   /api/auth/*— auth endpoints (request, verify, signout)
//   /api/gala/*— individual functions handle their own auth where needed

const PROTECTED_PREFIXES = ['/admin'];
const COOKIE_NAME = 'gala_session';
const MAX_AGE_SEC = 86400; // 24 hours — matches def-site

async function verifySession(cookie, secret) {
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
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(timestamp)
  );
  const expectedHex = [...new Uint8Array(expected)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // /checkin special case: scanner needs cookie auth, but sponsors
  // arriving at /checkin?t={token} or /checkin/{token} are authenticated
  // by the token itself.
  if (url.pathname === '/checkin' || url.pathname.startsWith('/checkin/')) {
    // Token in path: /checkin/{token}
    const pathToken = url.pathname.replace(/^\/checkin\/?/, '');
    const queryToken = url.searchParams.get('t');
    const hasToken =
      (pathToken && pathToken.length >= 10) ||
      (queryToken && queryToken.length >= 10);
    if (hasToken) {
      return next();
    }
    // Bare /checkin → require cookie
    const cookie = getCookie(request, COOKIE_NAME);
    const valid = await verifySession(cookie, env.GALA_DASH_SECRET);
    if (!valid) {
      return Response.redirect(new URL('/?from=checkin', request.url).toString(), 302);
    }
    return next();
  }

  // Listed protected prefixes: /admin
  const protectedMatch = PROTECTED_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (!protectedMatch) {
    return next();
  }

  const cookie = getCookie(request, COOKIE_NAME);
  const valid = await verifySession(cookie, env.GALA_DASH_SECRET);

  if (!valid) {
    return Response.redirect(new URL('/?from=admin', request.url).toString(), 302);
  }

  return next();
}
