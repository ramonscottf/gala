/**
 * /api/gala/asset/{key}
 *
 * Streams objects from the GALA_ASSETS R2 bucket through the gala.daviskids.org
 * domain. Used by the admin dashboard for sponsor logos (white-on-transparent
 * PNGs in the "white logos/" prefix) and by anything else that needs to embed
 * R2 content without exposing the bucket via r2.dev.
 *
 * Public — no auth — because logos are not sensitive and need to load fast
 * inside the admin sponsor list. (Other admin views are gated by SSO; the
 * logo URLs render even when reused publicly.)
 *
 * Cache: 7 days at the edge. Logos rarely change. Bust by appending a
 * cache-buster query param if needed.
 */

export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.GALA_ASSETS) {
    return new Response(JSON.stringify({ error: 'R2 bucket not bound' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  // params.path is the catch-all segments. With [[path]].js routing
  // params.path is an array ["white logos", "aetna.png"] OR a single string
  // depending on how Pages serializes. Normalize.
  const segments = Array.isArray(params.path) ? params.path : [params.path];
  const key = segments.map(decodeURIComponent).join('/');

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing asset key' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const obj = await env.GALA_ASSETS.get(key);
  if (!obj) {
    return new Response(JSON.stringify({ error: 'Not found', key }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=604800, s-maxage=604800, immutable');
  headers.set('access-control-allow-origin', '*');
  if (!headers.get('content-type')) {
    // Fallback content-type by extension.
    if (key.endsWith('.png')) headers.set('content-type', 'image/png');
    else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) headers.set('content-type', 'image/jpeg');
    else if (key.endsWith('.svg')) headers.set('content-type', 'image/svg+xml');
    else if (key.endsWith('.webp')) headers.set('content-type', 'image/webp');
  }

  return new Response(obj.body, { headers });
}
