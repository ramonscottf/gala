// /api/gala/admin/healthcheck
//
// GET → secret/binding inventory for the gala app. Reports presence
// of every critical env var and binding without revealing any values.
// Intentionally NOT auth-gated: the whole point is to diagnose auth
// failures, and a 401-walled healthcheck for a broken auth system is
// useless. The endpoint exposes only booleans (present / missing /
// empty) — never values, never partial hashes, never lengths.
//
// Usage:
//   curl https://gala.daviskids.org/api/gala/admin/healthcheck
//
// Origin story: May 18 2026 — GALA_DASH_SECRET silently went empty
// (suspected CF Pages env-vars dashboard footgun: pencil-edit on any
// row submits redacted-empty values for all secrets and wipes them).
// Result was "Incorrect password" surfacing as HTTP 500, undiagnosable
// from the UI. Now anyone can hit this endpoint and see what's broken
// in 2 seconds.
//
// Run this as a sanity check after ANY change to Cloudflare Pages
// env vars / bindings, and as a smoke test after every production
// deploy. Wire it into uptime monitoring if Skippy ever adds one.

const REQUIRED_SECRETS = [
  // Admin auth chain — without these, login.js throws or no one can sign in.
  'GALA_DASH_SECRET',
  'GALA_DASH_PASSWORD',
  // Email pipeline (SkippyMail bearer token) — needed for every send,
  // including invites, marketing pushes, catch-up, and sponsor portal links.
  'GALA_MAIL_TOKEN',
  // Webhooks
  'GALA_SHEET_WEBHOOK_SECRET',
  // Chat
  'CHAT_COOKIE_SECRET',
  // Review queue (sponsor-side write protection)
  'GALA_REVIEW_SECRET',
];

const OPTIONAL_SECRETS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'TMDB_API_KEY',
  'OMDB_API_KEY',
  'GALA_TEST_PHONE_SCOTT',
  'GALA_TEST_PHONE_SHERRY',
  'GALA_TEST_PHONE_KARA',
];

const REQUIRED_BINDINGS = [
  { name: 'GALA_DB',     kind: 'd1' },
  { name: 'GALA_ASSETS', kind: 'r2' },
];

function status(val) {
  if (val === undefined || val === null) return 'missing';
  if (typeof val === 'string' && val.length === 0) return 'empty';
  return 'present';
}

export async function onRequestGet({ env }) {
  const secrets = {};
  let secretsOk = true;
  for (const name of REQUIRED_SECRETS) {
    const s = status(env[name]);
    secrets[name] = { required: true, status: s };
    if (s !== 'present') secretsOk = false;
  }
  for (const name of OPTIONAL_SECRETS) {
    secrets[name] = { required: false, status: status(env[name]) };
  }

  const bindings = {};
  let bindingsOk = true;
  for (const { name, kind } of REQUIRED_BINDINGS) {
    const present = !!env[name];
    bindings[name] = { kind, status: present ? 'present' : 'missing' };
    if (!present) bindingsOk = false;
  }

  // Also surface the auth chain specifically — most failures live here
  // and admins shouldn't have to scan the full secret list to find them.
  const authChain = {
    GALA_DASH_SECRET: secrets.GALA_DASH_SECRET.status,
    GALA_DASH_PASSWORD: secrets.GALA_DASH_PASSWORD.status,
    canSignIn: secrets.GALA_DASH_SECRET.status === 'present'
            && secrets.GALA_DASH_PASSWORD.status === 'present',
  };

  const ok = secretsOk && bindingsOk;

  return new Response(JSON.stringify({
    ok,
    checkedAt: new Date().toISOString(),
    authChain,
    bindings,
    secrets,
  }, null, 2), {
    status: ok ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
