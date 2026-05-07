// /sponsor/{token} → public/sponsor/index.html (SPA shell)
//
// Why this is needed: Cloudflare Pages does not have automatic SPA
// fallback. /sponsor/{token} does not match a static file, and our
// previous attempt at _redirects rules did not fire reliably for the
// path-with-dynamic-segment case. Explicit function avoids ambiguity.
//
// To serve the SPA shell without infinite-looping (which we hit on May 5):
// _routes.json EXCLUDES /sponsor/index.html and /sponsor/assets/*, so
// when we ASSETS.fetch('/sponsor/index.html') the response comes from
// the static layer, not back through this function.
//
// Earlier loop diagnosis (cf821fa): the function called
// context.env.ASSETS.fetch(context.request) for the SAME URL, which
// re-triggered the function. The fix here is to fetch a DIFFERENT URL
// (/sponsor/index.html instead of /sponsor/{token}) so it lands on the
// excluded static path.

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Static assets pass through. Belt-and-braces — _routes.json should
  // already exclude /sponsor/assets/*, but if a request slips through
  // this catches it.
  if (url.pathname.startsWith('/sponsor/assets/') || /\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    return context.env.ASSETS.fetch(context.request);
  }

  // Branch QA preview page. Cloudflare Pages clean URLs redirect
  // /sponsor/qa/preview/sponsor-shell.html to the extensionless path, so
  // serve that path explicitly before falling through to the sponsor SPA.
  if (url.pathname === '/sponsor/qa/preview/sponsor-shell') {
    const previewUrl = new URL('/sponsor/qa/preview/sponsor-shell.html', url.origin);
    const preview = await context.env.ASSETS.fetch(previewUrl.toString());
    if (preview.ok) {
      return new Response(preview.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      });
    }
  }

  // Fetch the SPA shell by its real path (excluded from /sponsor/* in
  // _routes.json so this serves directly without re-entering the function).
  const indexUrl = new URL('/sponsor/index.html', url.origin);
  const resp = await context.env.ASSETS.fetch(indexUrl.toString());

  // If the static fetch failed (deploy issue, etc.), don't pretend success.
  if (!resp.ok) {
    return new Response('Sponsor portal is temporarily unavailable. Please try again in a moment.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
