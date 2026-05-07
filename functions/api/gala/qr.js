// GET /api/gala/qr?t=TOKEN  or  ?data=URL
//
// Returns a QR code. Self-hosted — no third-party services.
//
// Format selection:
//   ?format=svg   (default) — image/svg+xml — for emails, web pages, fast & small
//   ?format=png            — image/png      — for MMS (Twilio MediaUrl), printing
//
// MMS attachments require a raster format; SVG won't render.
//
// Usage in emails:
//   <img src="https://gala.daviskids.org/api/gala/qr?t=SPONSOR_TOKEN" width="240" height="240"/>
// Usage in MMS:
//   mediaUrl: "https://gala.daviskids.org/api/gala/qr?t=SPONSOR_TOKEN&format=png&size=600"

import qrcode from './_qrcode.js';

const COLOR_BG_HEX = '#ffffff';
const COLOR_FG_HEX = '#0b1b3c';

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  const rawData = url.searchParams.get('data');
  const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '400', 10) || 400, 100), 1000);
  const format = (url.searchParams.get('format') || 'svg').toLowerCase();

  // Build the content to encode
  let content;
  if (token) {
    content = `https://gala.daviskids.org/checkin?t=${encodeURIComponent(token)}`;
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

  if (format === 'png') {
    const png = renderPng(qr, moduleCount, margin, totalModules, size);
    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Default: SVG
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${totalModules}" height="${totalModules}" fill="${COLOR_BG_HEX}"/><path fill="${COLOR_FG_HEX}" d="${path}"/></svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// PNG renderer
// ---------------------------------------------------------------------------
// We rasterize the QR matrix into a `size`x`size` 8-bit grayscale image and
// write a valid PNG using a hand-rolled encoder. The encoder uses uncompressed
// DEFLATE blocks (BTYPE=00) so we don't need a zlib library — output is a few
// KB larger than a compressed PNG but still small (~20-30 KB at size=600).
//
// Pure JS, zero deps, runs fine in Cloudflare Workers.

function renderPng(qr, moduleCount, margin, totalModules, size) {
  // Build the pixel grid. Each row is `size` bytes (grayscale 0=black, 255=white)
  // prefixed with a filter byte (0x00 = none).
  const cellPx = size / totalModules; // may be fractional; use floor-mapping
  const stride = size + 1;             // +1 for the filter byte
  const raw = new Uint8Array(stride * size);

  // Fast path: precompute per-pixel module index by integer math
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter byte
    const moduleY = Math.floor(y / cellPx);  // 0..totalModules-1
    const qrR = moduleY - margin;
    for (let x = 0; x < size; x++) {
      const moduleX = Math.floor(x / cellPx);
      const qrC = moduleX - margin;
      let dark = false;
      if (qrR >= 0 && qrR < moduleCount && qrC >= 0 && qrC < moduleCount) {
        dark = qr.isDark(qrR, qrC);
      }
      raw[y * stride + 1 + x] = dark ? 11 : 255; // ~#0b1b3c approx as gray 11; close enough
    }
  }

  // Write PNG: signature + IHDR + IDAT + IEND
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth, color type, compression, filter, interlace
  const ihdrData = new Uint8Array(13);
  writeU32(ihdrData, 0, size);
  writeU32(ihdrData, 4, size);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 0;   // color type: grayscale
  ihdrData[10] = 0;  // compression: deflate
  ihdrData[11] = 0;  // filter: standard
  ihdrData[12] = 0;  // interlace: none
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT: zlib-wrapped uncompressed DEFLATE stream
  const idatData = makeIdat(raw);
  const idat = makeChunk('IDAT', idatData);

  // IEND
  const iend = makeChunk('IEND', new Uint8Array(0));

  // Concatenate
  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let p = 0;
  out.set(sig, p); p += sig.length;
  out.set(ihdr, p); p += ihdr.length;
  out.set(idat, p); p += idat.length;
  out.set(iend, p);
  return out;
}

function writeU32(buf, off, v) {
  buf[off] = (v >>> 24) & 0xff;
  buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff;
  buf[off + 3] = v & 0xff;
}

function makeChunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(4 + 4 + len + 4);
  writeU32(out, 0, len);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  // CRC32 over type + data
  const crcBuf = new Uint8Array(4 + len);
  crcBuf[0] = out[4]; crcBuf[1] = out[5]; crcBuf[2] = out[6]; crcBuf[3] = out[7];
  crcBuf.set(data, 4);
  writeU32(out, 8 + len, crc32(crcBuf));
  return out;
}

// Build IDAT payload: zlib stream wrapping uncompressed DEFLATE blocks.
// Adler32 is computed over the raw bytes.
function makeIdat(raw) {
  // Uncompressed DEFLATE blocks: 65535-byte chunks. Each block has 5-byte header.
  const MAX = 65535;
  const blocks = [];
  for (let off = 0; off < raw.length; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const isLast = (off + len) >= raw.length;
    const header = new Uint8Array(5);
    header[0] = isLast ? 1 : 0;        // BFINAL (and BTYPE=00 stored)
    header[1] = len & 0xff;
    header[2] = (len >>> 8) & 0xff;
    header[3] = (~len) & 0xff;
    header[4] = ((~len) >>> 8) & 0xff;
    blocks.push(header, raw.subarray(off, off + len));
  }
  // Compute total deflate length
  let totalLen = 0;
  for (const b of blocks) totalLen += b.length;

  // zlib header: 0x78 0x01 (FLEVEL=fastest, no preset dict)
  // Then DEFLATE stream
  // Then Adler32 (big-endian) over the raw input
  const adler = adler32(raw);
  const out = new Uint8Array(2 + totalLen + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let p = 2;
  for (const b of blocks) { out.set(b, p); p += b.length; }
  writeU32(out, p, adler);
  return out;
}

// CRC32 with reversed polynomial 0xEDB88320 — standard PNG/zlib CRC.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Adler-32 checksum (RFC 1950)
function adler32(buf) {
  let a = 1, b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}
