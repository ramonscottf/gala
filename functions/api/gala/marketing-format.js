// /api/gala/marketing-format
// POST { html: '...' }
//
// Takes raw or partially-formatted email body HTML, sends it to Sonnet
// through the Skippy AI Gateway, and returns polished HTML. The model
// is instructed to:
//   1. Fix typos and obvious grammar errors (light polish only — never
//      change meaning, never add new sentences)
//   2. Add formatting: paragraphs, bold for key phrases, bullet lists
//      where the source uses dashes or numbered phrasing
//   3. Strip Microsoft Office cruft (mso-* styles, VML, conditional
//      comments, font-family overrides)
//   4. Keep things compatible with email clients (no <style> blocks,
//      inline styles only on specific elements)
//
// Output goes back into the TipTap editor in the admin UI.
//
// Routes through gateway.ai.cloudflare.com/v1/.../skippy/anthropic so
// we get caching + logging.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';

const SYSTEM_PROMPT = `You are an email formatter for the Davis Education Foundation gala. You receive raw or partially-formatted HTML and return cleaner HTML.

RULES — non-negotiable:
1. PRESERVE THE AUTHOR'S WORDS. You may fix typos and obvious grammar mistakes (a missing period, "their/there" mixups, double spaces, plural agreement). You may NOT rewrite sentences, add new sentences, change tone, or paraphrase.
2. PRESERVE FACTS. Dates, names, dollar amounts, links, email addresses, phone numbers, sponsorship tier names — copy these verbatim. Never invent or correct factual content.
3. STRIP MS OFFICE CRUFT. Remove mso-* styles, VML elements, <o:p>, <!--[if mso]> blocks, font-family declarations from Word, empty <span> wrappers, Calibri/Times overrides.
4. ADD HELPFUL FORMATTING. Wrap discrete ideas in <p> tags. Bold key phrases (like dates, action items, or sponsorship tiers) with <strong>. Convert dash-prefixed or numbered lines into proper <ul>/<ol> lists. Use <h3> for section breaks if the source clearly has them.
5. NO INLINE STYLE OVERRIDES. The gala email wrapper supplies brand styles. Don't add color, font-family, or font-size styles to your output.
6. NO <style> BLOCKS, NO <script>, NO <html>/<head>/<body>. Return body fragment HTML only.
7. NO HEADERS OR FOOTERS. Don't add "Dear Sponsor," or "Best regards" — the wrapper handles personalization.

Return ONLY the cleaned HTML, no explanation, no markdown fences, no preamble.`;

export async function onRequestPost({ request, env }) {
  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { html } = body || {};
  if (!html || typeof html !== 'string') return jsonError('html required', 400);
  if (html.length > 60000) return jsonError('Body too long (max 60k chars)', 400);

  // Use the anthropic-proxy worker — it holds the key server-side, so we
  // don't need ANTHROPIC_API_KEY bound to this Pages project. The proxy
  // accepts standard Anthropic API requests at /v1/messages.
  const proxyUrl = 'https://anthropic-proxy.ramonscottf.workers.dev/v1/messages';

  const aiPayload = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Polish and format this email body:\n\n${html}` },
    ],
  };

  let aiRes;
  try {
    aiRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(aiPayload),
    });
  } catch (e) {
    return jsonError('AI proxy unreachable: ' + e.message, 502);
  }

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return jsonError(`AI proxy error ${aiRes.status}: ${errText.slice(0, 200)}`, 502);
  }

  let data;
  try { data = await aiRes.json(); } catch (e) { return jsonError('AI returned non-JSON', 502); }

  const blocks = data.content || [];
  const text = blocks
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  if (!text) return jsonError('AI returned empty content', 502);

  // Strip any code fences the model might have added despite instructions
  const cleaned = text
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return jsonOk({
    formattedHtml: cleaned,
    inputLength: html.length,
    outputLength: cleaned.length,
    usage: data.usage || null,
  });
}
