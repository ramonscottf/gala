// GET /api/gala/review/auth/whoami
// Returns { email } if signed in, 401 otherwise.

import { verifyReviewSession, jsonError, jsonOk } from '../_session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await verifyReviewSession(request, env.GALA_REVIEW_SECRET);
  if (!session) return jsonError('Not signed in', 401);
  return jsonOk({ email: session.email });
}
