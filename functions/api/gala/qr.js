// GET /api/gala/qr?t=TOKEN  or  ?data=URL
//
// Returns an SVG QR code. Self-hosted — no third-party services.
// Replaces the old api.qrserver.com dependency that was breaking
// email clients and mobile Gmail rendering.
//
// Usage in emails:
//   <img src="https://daviskids.org/api/gala/qr?t=SPONSOR_TOKEN" width="240" height="240"/>

import qrcode from './_qrcode.js';

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  const rawData = url.searchParams.get('data');
  const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '400', 10) || 400, 100), 1000);

  // Build the content to encode
  let content;
  if (token) {
    content = `https://daviskids.org/gala-checkin?t=${encodeURIComponent(token)}`;
  } else if (rawData) {
    content = rawData;
  } else {
    return new Response('Missing ?t= or ?data= parameter', { status: 400 });
  }

  // Generate QR matrix. Error correction 'M' = ~15% recovery, good balance for print+screen.
  // typeNumber 0 = auto-detect smallest QR that fits
  const qr = qrcode(0, 'M');
  qr.addData(content, 'Byte');
  qr.make();

  const moduleCount = qr.getModuleCount();
  const margin = 4;          // quiet zone modules each side
  const totalModules = moduleCount + margin * 2;
  const cellSize = size / totalModules;
  const viewBox = totalModules;

  // Build the dark-module path. Use one large "d" attribute — keeps SVG tiny.
  let path = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr.isDark(r, c)) {
        const x = c + margin;
        const y = r + margin;
        path += `M${x},${y}h1v1h-1z`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${viewBox}" height="${viewBox}" fill="#ffffff"/><path fill="#0b1b3c" d="${path}"/></svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',  // 24h — QR is deterministic per token
      'Access-Control-Allow-Origin': '*',
    },
  });
}
