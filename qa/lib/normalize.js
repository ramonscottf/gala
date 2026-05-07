// qa/lib/normalize.js
//
// Canonicalizes a POST request body for shell-parity comparison.
//
// Strips fields that vary run-to-run on the same logical request:
//   - timestamps (ISO 8601 strings, epoch numbers in known time fields)
//   - UUIDs (RFC 4122 v4 — used for idempotency keys, request IDs)
//   - explicit time/id field names (created_at, updatedAt, request_id, etc.)
// Sorts object keys deeply so insertion order doesn't break equality.
//
// The stripped-key list matches the server's "vary per request" surface
// documented in qa/shell-parity.spec.js. Today the portal endpoints
// (/pick, /assign, /finalize) do NOT include any client-generated
// idempotency or request-id fields — all variation is server-side
// (created_at on inserted rows). The list is kept defensive in case a
// future endpoint adds them.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const STRIPPED_KEYS = new Set([
  'idempotency_key', 'idempotencyKey',
  'request_id', 'requestId',
  'created_at', 'createdAt',
  'updated_at', 'updatedAt',
  'timestamp', 'ts',
]);

function isStrippableValue(v) {
  if (typeof v !== 'string') return false;
  return UUID_RE.test(v) || ISO_TS_RE.test(v);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (STRIPPED_KEYS.has(key)) continue;
      const v = value[key];
      if (isStrippableValue(v)) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

export function normalizeBody(rawBody) {
  if (!rawBody) return '';
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return rawBody; }
  return JSON.stringify(canonicalize(parsed));
}
