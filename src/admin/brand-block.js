// src/admin/brand-block.js
//
// Custom TipTap Node — "BrandBlock". Atomic, non-editable, round-trips its
// inner HTML verbatim. Used for the styled email components Kara loses when
// she edits in the admin TipTap editor — the gradient button, the choices
// checklist card, the red-gradient guests box, the FAQ line.
//
// Why this exists:
//   TipTap's StarterKit only models the basics: p, h2/h3, ul/ol/li, em,
//   strong, link, etc. When you setContent() HTML containing <table>, custom
//   <style> blocks, or inline-styled <a> buttons, the ProseMirror schema
//   either unwraps the tags or drops them entirely. Result: Kara saves and
//   the gradient masthead-style guests box collapses to plain <p> paragraphs.
//
// What this does:
//   Define a node `brandBlock` that's atomic in the document — TipTap treats
//   it as one opaque cell. The original HTML lives in a `html` attribute.
//   When the editor renders the document for display, it renders a
//   labeled placeholder card so Kara sees "🎨 Brand block: Guests box" with a
//   little preview. When she clicks Save, getHTML() emits a <brand-block>
//   wrapper with the original HTML inside.
//
// Two pieces this file ships:
//   1. The Node extension itself (exported `BrandBlock`)
//   2. A helper `wrapBrandBlocks(rawHtml)` that scans incoming body HTML
//      and converts our four signature blocks into <brand-block> wrappers
//      BEFORE handing to TipTap. Plus `unwrapBrandBlocks(html)` for after.
//
// Round-trip:
//   db.body  →  wrapBrandBlocks  →  TipTap setContent  →  Kara edits words
//             →  TipTap getHTML  →  unwrapBrandBlocks  →  back to db.body
//
//   Inside <brand-block> tags, the editor doesn't touch the inner HTML at
//   all — it's stored as an attribute and rendered through innerHTML in the
//   placeholder view (sandboxed by the atom: true flag).
//
// CSS-rendered placeholder, not React, so this works in the plain-JS
// editor-mount.js bundle without adding a new dep.

import { Node } from '@tiptap/core';

export const BrandBlock = Node.create({
  name: 'brandBlock',

  // Atomic: editor sees this as one unit. Cursor steps over it; you can't
  // place the caret inside. Backspace deletes the whole block.
  atom: true,

  // Block-level (lives between paragraphs, not inline inside a sentence).
  group: 'block',
  inline: false,

  // Don't allow content inside — the inner HTML lives in an attribute.
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      html: {
        default: '',
        // Parse: pull the inner HTML out of the <brand-block> wrapper.
        parseHTML: (el) => el.getAttribute('data-html') || el.innerHTML || '',
        // Render: stash on data-html (renderHTML below uses this).
        renderHTML: (attrs) => ({ 'data-html': attrs.html }),
      },
      label: {
        default: 'Brand block',
        parseHTML: (el) => el.getAttribute('data-label') || 'Brand block',
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
    };
  },

  parseHTML() {
    // We accept any <brand-block> custom element and any element with
    // class="brand-block". The renderer below emits <brand-block>.
    return [
      { tag: 'brand-block' },
      { tag: 'div.brand-block' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // What ends up in editor.getHTML(). We want the inner HTML on save to
    // be the original raw HTML (so the email keeps its styling). TipTap
    // renderHTML can't easily emit raw HTML strings, so we round-trip
    // through the data-html attribute and unwrapBrandBlocks() restores it.
    return ['brand-block', HTMLAttributes];
  },

  // In-editor view: a labeled card the user can see and click but not
  // type into. Click selects the whole node (TipTap handles that via
  // selectable: true). Drag handle is intentionally disabled.
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      const html = node.attrs.html || '';
      const label = node.attrs.label || 'Brand block';

      dom.contentEditable = 'false';
      dom.setAttribute('data-brand-block', '');
      dom.style.cssText = [
        'position:relative',
        'margin:14px 0',
        'padding:0',
        'border:2px dashed #c8102e',
        'border-radius:10px',
        'background:#fff',
        'overflow:hidden',
        'cursor:default',
        'user-select:none',
      ].join(';');

      // Header pill: indicates this is a locked styled block.
      const header = document.createElement('div');
      header.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:6px 10px',
        'background:linear-gradient(90deg,#c8102e 0%,#0066ff 100%)',
        'color:#fff',
        'font:600 11px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
        'letter-spacing:0.6px',
        'text-transform:uppercase',
      ].join(';');
      header.innerHTML = `<span>🎨 Styled block: ${escapeText(label)}</span><span style="font-weight:500;text-transform:none;letter-spacing:0;opacity:0.85;">Read-only · keep or delete</span>`;
      dom.appendChild(header);

      // Live HTML preview, scaled to fit the editor card. Sandboxed inside
      // an inert wrapper so user clicks don't navigate.
      const preview = document.createElement('div');
      preview.style.cssText = [
        'padding:10px 14px',
        'pointer-events:none', // hard-stop any click-through
        'background:#fff',
      ].join(';');
      preview.innerHTML = html;
      // Defensively neuter any anchors so a careless click can't navigate.
      preview.querySelectorAll('a').forEach((a) => {
        a.setAttribute('tabindex', '-1');
        a.removeAttribute('href');
      });
      dom.appendChild(preview);

      return { dom };
    };
  },
});

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Signature recognizers ───────────────────────────────────────────────
//
// Our six tier-open emails inject four known styled blocks. We detect them
// by structural signature in the raw HTML body and wrap each as a
// <brand-block> on load so TipTap preserves them. Run on every body that
// flows into the admin editor.
//
// Signatures used:
//   - Choices checklist:  a table containing the four checklist rows
//                         (Movie/Session/Seats/Meals)
//   - Gradient button:    table containing a link to /sponsor/{TOKEN}
//                         with the brand gradient inline style
//   - FAQ link line:      paragraph containing "Visit the FAQ"
//   - Guests box:         table with the "🎟️ Bringing guests?" eyebrow
//
// We match on a stable structural anchor (a string of HTML that's unique
// to that block) and then grow outward to find the enclosing element.

const SIGNATURES = [
  {
    // The checklist is a table-card. Its enclosing element starts at the
    // wrapper paragraph BEFORE the <table> ("Here's what you'll select")
    // so we anchor on a string unique to the meal row INSIDE the table,
    // then walk back to find the wrapper <p> that introduces the card.
    label: 'Choices checklist',
    anchor: 'French dip sandwich',
    extract: (html, idx) => {
      // Find the <table> ancestor of the anchor (the actual styled card),
      // then walk backward to include the lead-in <p>Here's what you'll
      // select:</p> so the editor lifts the header label too.
      const tableM = extractEnclosing(html, idx, '<table', '</table>');
      if (!tableM) return null;
      // Walk back from tableM.start over whitespace to find a leading <p>
      // that contains "Here's what you'll select". If present, expand the
      // capture window to include it.
      const headerNeedle = "Here's what you'll select";
      const headerIdx = html.lastIndexOf(headerNeedle, tableM.start);
      if (headerIdx < 0) return tableM;
      const pStart = html.lastIndexOf('<p', headerIdx);
      if (pStart < 0 || pStart > tableM.start) return tableM;
      return {
        start: pStart,
        end: tableM.end,
        slice: html.slice(pStart, tableM.end),
      };
    },
  },
  {
    label: 'Gradient CTA button',
    anchor: 'Make my selections',
    extract: (html, idx) => extractEnclosing(html, idx, '<table', '</table>'),
  },
  {
    label: 'FAQ link',
    anchor: 'Visit the FAQ',
    extract: (html, idx) => extractEnclosing(html, idx, '<p', '</p>'),
  },
  {
    label: 'Guests box',
    anchor: 'Bringing guests?',
    extract: (html, idx) => extractEnclosing(html, idx, '<table', '</table>'),
  },
];

// Given an index inside `html`, walk backwards to find the most recent
// `<open` tag start, and forwards from there to find the matching `</close`
// tag end. Returns { start, end, slice } or null.
function extractEnclosing(html, idx, openTag, closeTag) {
  // Walk back from idx to find the most recent occurrence of `openTag`
  // that hasn't already been closed in between.
  let start = html.lastIndexOf(openTag, idx);
  if (start < 0) return null;

  // Now walk forward from `start`, tracking nesting depth, to find the
  // matching closeTag.
  const len = html.length;
  let depth = 0;
  let i = start;
  while (i < len) {
    const nextOpen = html.indexOf(openTag, i + 1);
    const nextClose = html.indexOf(closeTag, i + 1);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen;
    } else {
      if (depth === 0) {
        const end = nextClose + closeTag.length;
        return { start, end, slice: html.slice(start, end) };
      }
      depth--;
      i = nextClose;
    }
  }
  return null;
}

export function wrapBrandBlocks(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return rawHtml || '';
  let out = rawHtml;

  // Process signatures in order. Each substitution shrinks the original
  // HTML and replaces it with a much smaller <brand-block> wrapper, so we
  // re-search after each round.
  for (const sig of SIGNATURES) {
    let safety = 0;
    while (safety++ < 20) {
      const idx = out.indexOf(sig.anchor);
      if (idx < 0) break;
      // If the match is already inside a brand-block wrapper, skip past it.
      const enclosingBlock = lastIndexBefore(out, '<brand-block', idx);
      const closingBlock = out.indexOf('</brand-block>', enclosingBlock);
      if (enclosingBlock >= 0 && closingBlock > idx) {
        // Move our search start past this brand-block.
        out = out.slice(0, idx) + out.slice(idx).replace(sig.anchor, sig.anchor + '\u0000');
        continue;
      }
      const m = sig.extract(out, idx);
      if (!m) break;
      const wrapped = makeBrandBlockWrapper(m.slice, sig.label);
      out = out.slice(0, m.start) + wrapped + out.slice(m.end);
    }
    // Clean up the sentinel \u0000 we used to skip already-wrapped matches.
    out = out.replace(/\u0000/g, '');
  }

  return out;
}

function lastIndexBefore(s, needle, before) {
  return s.lastIndexOf(needle, before);
}

function makeBrandBlockWrapper(innerHtml, label) {
  // We encode the original HTML on a data-html attribute. Use encodeURIComponent
  // because the inner HTML can contain quotes / newlines / >, all of which
  // would break a naive attribute serialization. unwrapBrandBlocks decodes
  // on the way out.
  const encoded = encodeURIComponent(innerHtml);
  const safeLabel = String(label).replace(/"/g, '&quot;');
  return `<brand-block data-label="${safeLabel}" data-html="${encoded}"></brand-block>`;
}

// On save, walk Tiptap's emitted HTML, find each <brand-block> tag, and
// replace it with the original inner HTML (decoded from data-html). This
// is what makes the round-trip lossless across multiple edits.
export function unwrapBrandBlocks(editorHtml) {
  if (!editorHtml || typeof editorHtml !== 'string') return editorHtml || '';
  // Match <brand-block ...attrs...></brand-block> with attribute order
  // tolerance. TipTap may also self-close it as <brand-block ... />.
  const pattern = /<brand-block\b[^>]*?(?:\/>|><\/brand-block>)/gi;
  return editorHtml.replace(pattern, (tag) => {
    const dataHtmlMatch = tag.match(/data-html=(?:"([^"]*)"|'([^']*)')/i);
    if (!dataHtmlMatch) return ''; // unrecognized — drop
    const encoded = dataHtmlMatch[1] || dataHtmlMatch[2] || '';
    try {
      return decodeURIComponent(encoded);
    } catch (_) {
      // If encoding got mangled somehow, do nothing rather than corrupt.
      return '';
    }
  });
}
