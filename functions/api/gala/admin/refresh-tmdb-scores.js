// Refresh TMDB scores for active movies. Idempotent — safe to call as often
// as needed; intended to run once on demand and then via weekly Cron Trigger.
//
// Auth: Bearer token in Authorization header, must match GALA_DASH_SECRET
// (re-using the dashboard secret rather than minting a third one).
//
// TMDB API: https://developer.themoviedb.org/reference/movie-details
// Returns vote_average (0-10) and vote_count. We store both, plus an
// updated_at ISO timestamp so the Pages function can decide whether to
// show "score from N days ago" if needed.

export async function onRequest({ request, env }) {
  // Auth — bearer token, dashboard secret
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.GALA_DASH_SECRET}`;
  if (!env.GALA_DASH_SECRET || auth !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.TMDB_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch active movies
  const moviesQ = await env.GALA_DB.prepare(
    `SELECT id, title, tmdb_id FROM movies WHERE active = 1 AND tmdb_id IS NOT NULL`
  ).all();
  const movies = moviesQ.results || [];

  const results = [];
  for (const m of movies) {
    try {
      // TMDB v3 with API key as query param. (If the key starts with "eyJ"
      // it's a v4 read token and goes in Authorization header instead.)
      let url, headers = { 'Accept': 'application/json' };
      if (env.TMDB_API_KEY.startsWith('eyJ')) {
        url = `https://api.themoviedb.org/3/movie/${m.tmdb_id}`;
        headers['Authorization'] = `Bearer ${env.TMDB_API_KEY}`;
      } else {
        url = `https://api.themoviedb.org/3/movie/${m.tmdb_id}?api_key=${env.TMDB_API_KEY}`;
      }
      const r = await fetch(url, { headers });
      if (!r.ok) {
        results.push({ id: m.id, title: m.title, ok: false, status: r.status });
        continue;
      }
      const data = await r.json();
      const score = data.vote_average ?? null;
      const count = data.vote_count ?? 0;
      const now = new Date().toISOString();

      await env.GALA_DB.prepare(
        `UPDATE movies SET tmdb_score=?, tmdb_vote_count=?, tmdb_score_updated_at=? WHERE id=?`
      ).bind(score, count, now, m.id).run();

      results.push({
        id: m.id,
        title: m.title,
        ok: true,
        score,
        count,
        updatedAt: now,
      });
    } catch (e) {
      results.push({ id: m.id, title: m.title, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
