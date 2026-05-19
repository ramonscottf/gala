/**
 * POST /api/gala/sign-checklist/upload?id={sponsorId}&kind={color|white}
 *
 * Multipart form data with a single `file` field. Writes the binary to R2
 * under the canonical key
 *
 *     sponsor-signs/{sponsorId}/{kind}.{ext}
 *
 * and updates the corresponding column on the sponsors row:
 *
 *     kind=color → sponsors.logo_url
 *     kind=white → sponsors.logo_white_url
 *
 * The stored URL is the public /api/gala/asset/... path so anything else
 * on the site can fetch the same logo without an extra binding. Logos
 * are cached for 7 days at the edge by that endpoint; if Scott replaces
 * a logo and needs the new one immediately, the response includes a
 * cache-busting URL with ?v={ts}.
 *
 * Max file size: 5 MB. Allowed types: PNG / JPG / SVG / WebP.
 *
 * Idempotent — re-uploading replaces the existing object at the same key.
 * We always overwrite ext-by-kind too (e.g. a previous color.png becomes
 * color.svg if a new SVG is uploaded), so we delete the old object first
 * if the extension changed.
 */

import { verifyGalaAuth, jsonError, jsonOk } from '../_auth.js';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await verifyGalaAuth(request, env.GALA_DASH_SECRET))) {
    return jsonError('unauthorized', 401);
  }
  if (!env.GALA_DB) return jsonError('D1 not bound', 503);
  if (!env.GALA_ASSETS) return jsonError('R2 not bound', 503);

  const url = new URL(request.url);
  const idRaw = url.searchParams.get('id');
  const kind = (url.searchParams.get('kind') || '').toLowerCase();
  const id = Number(idRaw);

  if (!Number.isInteger(id) || id <= 0) return jsonError('bad id', 400);
  if (kind !== 'color' && kind !== 'white') {
    return jsonError("kind must be 'color' or 'white'", 400);
  }

  // Confirm sponsor exists — better error than a foreign key surprise later
  const row = await env.GALA_DB.prepare(
    'SELECT id, logo_url, logo_white_url FROM sponsors WHERE id = ? AND archived_at IS NULL'
  ).bind(id).first();
  if (!row) return jsonError('sponsor not found', 404);

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError('expected multipart/form-data', 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonError('missing file field', 400);

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return jsonError(
      `unsupported type: ${file.type || 'unknown'} (allow png, jpg, svg, webp)`,
      415
    );
  }
  if (file.size > MAX_BYTES) {
    return jsonError(`file too large: ${file.size} bytes (max ${MAX_BYTES})`, 413);
  }

  const key = `sponsor-signs/${id}/${kind}.${ext}`;
  const previousUrlField = kind === 'color' ? 'logo_url' : 'logo_white_url';
  const previousUrl = row[previousUrlField];

  // If the prior logo had a different extension, clean up the stale R2 object.
  // (R2 doesn't dedupe by content; leaving the old PNG behind when we replace
  // with an SVG would still show up in bucket listings and burn storage.)
  if (previousUrl && typeof previousUrl === 'string') {
    const m = previousUrl.match(/sponsor-signs\/\d+\/(color|white)\.([a-z0-9]+)/i);
    if (m && m[2].toLowerCase() !== ext) {
      const staleKey = `sponsor-signs/${id}/${kind}.${m[2].toLowerCase()}`;
      try { await env.GALA_ASSETS.delete(staleKey); } catch {}
    }
  }

  // Stream the upload directly into R2. file.stream() is the recommended
  // path for anything bigger than a few KB — formData() has already buffered
  // it once, so we can use arrayBuffer() here without a second copy concern
  // (we already enforced 5 MB above).
  const bytes = await file.arrayBuffer();
  await env.GALA_ASSETS.put(key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  const assetUrl = `/api/gala/asset/${key}`;
  const cacheBuster = `${assetUrl}?v=${Date.now()}`;

  // Update D1. Single-column write — no composite-key bug surface area, but
  // explicit-column-naming as a habit.
  const sql =
    kind === 'color'
      ? 'UPDATE sponsors SET logo_url = ?1, updated_at = datetime(\'now\') WHERE id = ?2'
      : 'UPDATE sponsors SET logo_white_url = ?1, updated_at = datetime(\'now\') WHERE id = ?2';
  await env.GALA_DB.prepare(sql).bind(assetUrl, id).run();

  return jsonOk({
    ok: true,
    id,
    kind,
    key,
    url: assetUrl,
    cacheBustUrl: cacheBuster,
    contentType: file.type,
    bytes: file.size,
  });
}
