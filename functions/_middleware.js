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
//
// Note: Cloudflare Pages middleware does NOT intercept static asset
// requests, so the chat widget script tag is included directly in each
// HTML file (see commit history). This middleware only handles auth.

const PROTECTED_PREFIXES = ['/admin'];
const COOKIE_NAME = 'gala_session';
const MAX_AGE_SEC = 2592000; // 30 days — admin convenience, password-protected

// Phase 5.14 — /admin-signin/ is the public password page (not protected).
// _routes.json doesn't currently route it through middleware, so this
// guard is defense-in-depth: if someone later adds /admin-signin to
// _routes.json include[], the literal `startsWith('/admin')` check
// below would protect the sign-in page itself and cause a redirect
// loop. matchProtected ensures only path-segment matches count, so
// /admin-signin (different segment) never matches /admin.
function matchProtected(pathname) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

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
      // Phase 5.14 — admin sign-in moved from / to /admin-signin/ when
      // the public event page took over the root. Pass ?next= so the
      // sign-in page can bounce the user back to where they were going
      // (the admin-signin script reads URLSearchParams 'next' and uses
      // it as the post-auth destination; defaults to /admin if missing).
      const target = new URL('/admin-signin/', request.url);
      target.searchParams.set('next', url.pathname + url.search);
      return Response.redirect(target.toString(), 302);
    }
    return next();
  }

  // Listed protected prefixes: /admin (segment-aware so /admin-signin won't match)
  const protectedMatch = matchProtected(url.pathname);
  if (!protectedMatch) {
    return next();
  }

  const cookie = getCookie(request, COOKIE_NAME);
  const valid = await verifySession(cookie, env.GALA_DASH_SECRET);

  if (!valid) {
    // Phase 5.14 — admin sign-in moved from / to /admin-signin/. Same
    // ?next= contract as the /checkin path above.
    const target = new URL('/admin-signin/', request.url);
    target.searchParams.set('next', url.pathname + url.search);
    return Response.redirect(target.toString(), 302);
  }

  return next();
}
