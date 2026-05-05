// POST /api/gala/review/rewrite
// Body: { sendId, currentSubject, currentBody, notes, type: 'email'|'sms' }
// Returns: { subject, body, reasoning }
// Calls Anthropic via DEF API key.

import { verifyReviewSession, jsonError, jsonOk } from './_session.js';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `You are the senior copy editor for the Davis Education Foundation Gala 2026 marketing pipeline. Sherry Miggin (Executive Director), Kara Toone (DEF Director), or Scott Foster (Marketing Coordinator) are giving you instructions. Their notes are the brief. The current copy is what they want changed.

Voice rules:
- Sherry & Kara are warm, direct, never corporate. Read like a smart friend who organized the event.
- Em-dashes are fine. Smart quotes preferred. No marketing-speak ("Don't miss out", "act now", "dear friends").
- Sign-off: "— Sherry & Kara" or "— Sherry, Kara, and the entire DEF team" depending on send weight.
- Gala is Wednesday June 10, 2026 at Megaplex Centerville. Four films, two showings (early 4:30, late 7:00). Movies: Mandalorian & Grogu (IMAX), Breadwinner, Paddington 2, How to Train Your Dragon. 49ers Opportunity Drawing supports school lunch.
- Auction is on Qgiv (called "Givi" in copy). Bidding June 8–10.

Format rules:
- Email: HTML body with inline styles matching existing patterns. Keep <p>, <h3>, <ul>, <strong>, <a>. Don't invent new container divs unless asked. Preserve all <a href="..."> URLs and {TOKEN} placeholders verbatim. Keep the {DRAWING_CARD_LONG}, {SHOWING_BLOCK}, ${"$"}{BTN(...)} kind of template helpers if they exist in the original — DO NOT expand them.
- SMS: plain text only, ≤320 chars, no HTML. URL placeholders like https://gala.daviskids.org/sponsor/{TOKEN} should stay literal.
- Keep links functional. If you remove a CTA, replace it with another. Never strip the 49ers drawing reference unless explicitly told.

Your response MUST be valid JSON only, no preamble, no markdown fences:
{
  "subject": "<new subject — only if email type, else null>",
  "body": "<new body — full rewritten content>",
  "reasoning": "<one sentence explaining what you changed and why>"
}`;

export async function onRequestPost(context) {
  const { request, env } = context;

  // Auth gate
  const session = await verifyReviewSession(request, env.GALA_REVIEW_SECRET);
  if (!session) return jsonError('Not signed in', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { sendId, currentSubject, currentBody, notes, type } = body;
  if (!sendId || !currentBody) return jsonError('sendId + currentBody required', 400);
  if (!notes || !notes.trim()) return jsonError('Notes required — tell me what to change', 400);

  const userMessage = `Send ID: ${sendId}
Type: ${type || 'email'}
${type === 'email' ? `Current subject: ${currentSubject || '(no subject)'}` : ''}

Current ${type === 'sms' ? 'SMS body' : 'email body (HTML)'}:
"""
${currentBody}
"""

Editor's notes (this is the brief — apply these changes):
"""
${notes}
"""

Rewrite the ${type === 'sms' ? 'SMS body' : 'subject and body'} per the notes. Return JSON only.`;

  // Use existing anthropic-proxy worker so we don't need to add the API key
  // as a Pages secret. The proxy holds the DEF Anthropic key.
  const claudeResp = await fetch('https://anthropic-proxy.ramonscottf.workers.dev/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!claudeResp.ok) {
    const errText = await claudeResp.text();
    console.error('Anthropic error:', claudeResp.status, errText);
    return jsonError(`AI rewrite failed (${claudeResp.status})`, 502);
  }

  const claudeData = await claudeResp.json();
  const text = (claudeData.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Strip code fences if present
  let jsonText = text;
  const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error('JSON parse failed:', e.message, 'raw:', text.slice(0, 500));
    return jsonError('AI returned invalid JSON', 502);
  }

  return jsonOk({
    ok: true,
    subject: parsed.subject || null,
    body: parsed.body || '',
    reasoning: parsed.reasoning || '',
    by: session.email,
  });
}
