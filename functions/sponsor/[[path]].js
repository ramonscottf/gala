// /sponsor and /sponsor/{token} and /sponsor/{token}/seats etc.
// → public/sponsor/index.html (the Vite-built SPA shell)
//
// The SPA's BrowserRouter (basename: '/sponsor') reads the rest of the
// URL and dispatches client-side. Asset URLs in index.html reference
// /sponsor/assets/index-{hash}.js, which Pages serves as static files
// directly (excluded from this function via _routes.json).

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Static assets pass through. _routes.json should already exclude
  // /sponsor/assets/*, but the file-extension check is a belt-and-braces.
  if (url.pathname.startsWith('/sponsor/assets/') || /\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    return context.env.ASSETS.fetch(context.request);
  }

  const assetUrl = new URL('/sponsor/index.html', context.request.url);
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
