// Magic-link auth — verify endpoint
//
// GET ?t={signed_jwt} → verifies HMAC signature + exp on the magic-link
// JWT, then mints a session cookie in the EXISTING format that
// _middleware.js already understands: {timestamp}.{hmac_hex_of_timestamp}.
//
// This means cookies minted by this endpoint are interchangeable with
// cookies minted by the legacy /gala-login form. Existing admin
// sessions remain valid; this is just a different way to mint them.

async function verifyMagicJWT(token, secret) {
  const enc = new TextEncoder();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  const data = enc.encode(`${h}.${p}`);
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const b64decode = (b64) => {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
    const bin = atob(padded);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  };

  const sigBytes = b64decode(s);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64decode(p)));
  } catch {
    return null;
  }

  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

// Mint a session cookie matching the format _middleware.js expects:
// {timestamp_ms}.{hmac_sha256_hex(secret, timestamp_ms)}
async function mintSessionCookie(secret) {
  const timestamp = String(Date.now());
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(timestamp));
  const sigHex = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${timestamp}.${sigHex}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('t');

  if (!token) {
    return Response.redirect(new URL('/?err=missing', request.url).toString(), 302);
  }
  if (!env.GALA_DASH_SECRET) {
    console.error('GALA_DASH_SECRET not configured');
    return Response.redirect(new URL('/?err=config', request.url).toString(), 302);
  }

  const payload = await verifyMagicJWT(token, env.GALA_DASH_SECRET);
  if (!payload || payload.role !== 'admin') {
    return Response.redirect(new URL('/?err=invalid', request.url).toString(), 302);
  }

  const cookieValue = await mintSessionCookie(env.GALA_DASH_SECRET);
  // 24h max-age matches MAX_AGE_SEC in _middleware.js
  const maxAge = 86400;

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin',
      'Set-Cookie': `gala_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    },
  });
}
