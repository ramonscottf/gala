// /checkin and /checkin/{token} → public/checkin/index.html
//
// Cloudflare Pages serves /checkin/index.html for the bare /checkin path
// automatically, but /checkin/{token} would 404 against static files.
// This [[path]].js catches any subpath under /checkin and rewrites to
// the same index.html. The page's client-side JS reads the token from
// either the URL path or the ?t= query param and uses it as auth.
//
// _middleware.js already handles auth gating for this prefix (token
// bypass for sponsor self-checkin, cookie required for bare /checkin).

export async function onRequest(context) {
  // _middleware.js already ran. If we got here, request is allowed.
  const assetUrl = new URL('/checkin/index.html', context.request.url);
  const resp = await context.env.ASSETS.fetch(assetUrl.toString(), {
    redirect: 'manual',
  });

  return new Response(resp.body, {
    status: resp.status === 200 ? 200 : resp.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
