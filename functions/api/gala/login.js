import { createSession, sessionCookie, jsonError } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.GALA_DASH_SECRET;
  const password = env.GALA_DASH_PASSWORD || 'gala2026';

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
