// GET  /api/gala/chat/faq          — list all FAQ entries (public, used by widget for fast static search)
// POST /api/gala/chat/faq          — admin only, add/update/delete entry
//
// Admin auth: relies on _middleware.js cookie session (the same that protects /admin/*).
// This function lives outside /admin so the widget can read FAQ entries publicly,
// but POST requests require an admin cookie via simple inline check.

import { jsonResponse } from './_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.GALA_DB.prepare(
    `SELECT id, category, question, answer, keywords, priority, active
     FROM chat_faq WHERE active = 1 ORDER BY category, priority`
  ).all();
  return jsonResponse({ ok: true, faq: results });
}

async function isAdmin(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|; )gala_session=([^;]+)/);
  if (!match) return false;
  const value = decodeURIComponent(match[1]);
  const dot = value.indexOf('.');
  if (dot === -1) return false;
  const ts = value.substring(0, dot);
  const sig = value.substring(dot + 1);
  const age = Date.now() - Number(ts);
  if (isNaN(age) || age < 0 || age > 30 * 24 * 3600 * 1000) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.GALA_DASH_SECRET || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHex === sig;
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid_json' }, { status: 400 }); }
  const action = body.action;

  if (action === 'create') {
    const { category, question, answer, keywords = '', priority = 100 } = body;
    if (!category || !question || !answer) {
      return jsonResponse({ error: 'missing_fields' }, { status: 400 });
    }
    const r = await env.GALA_DB.prepare(
      `INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES (?, ?, ?, ?, ?)`
    ).bind(category, question, answer, keywords, priority).run();
    return jsonResponse({ ok: true, id: r.meta.last_row_id });
  }

  if (action === 'update') {
    const { id, category, question, answer, keywords, priority, active } = body;
    if (!id) return jsonResponse({ error: 'missing_id' }, { status: 400 });
    await env.GALA_DB.prepare(
      `UPDATE chat_faq SET category = COALESCE(?, category), question = COALESCE(?, question),
                            answer = COALESCE(?, answer), keywords = COALESCE(?, keywords),
                            priority = COALESCE(?, priority), active = COALESCE(?, active),
                            updated_at = datetime('now')
       WHERE id = ?`
    ).bind(category ?? null, question ?? null, answer ?? null, keywords ?? null,
            priority ?? null, active ?? null, id).run();
    return jsonResponse({ ok: true });
  }

  if (action === 'delete') {
    const { id } = body;
    if (!id) return jsonResponse({ error: 'missing_id' }, { status: 400 });
    await env.GALA_DB.prepare('UPDATE chat_faq SET active = 0 WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'unknown_action' }, { status: 400 });
}
