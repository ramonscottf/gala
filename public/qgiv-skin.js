/*
 * qgiv-skin.js — companion to qgiv-skin.css.
 *
 * Paste into Qgiv admin:
 *   Form 1097071 → Advanced tab → Global Page Settings → Additional Footer Content
 *
 * Wrap it in a <script> tag:
 *   <script src="https://gala.daviskids.org/qgiv-skin.js" defer></script>
 *
 * OR paste the IIFE contents inline:
 *   <script>(function(){ ... })()</script>
 *
 * Purpose: hide Qgiv form chrome that CSS can't reliably hit because
 * Qgiv's React app emits dynamic class names that change across releases
 * (the bundle hash in event.c2c3172dc0e98253c564.js will roll on every
 * Qgiv deploy). Text-content matching is more durable than class hooks.
 *
 * What it kills:
 *   1. Anything containing "Powered by" / "Powered by bloomerang"
 *   2. "Transaction is secure and encrypted" mini-footer
 *   3. The event date-range display ("Monday, 5/18/2026 - Wednesday, 6/10/2026")
 *   4. "View Auction Items" / "Manage Ticket" / "Add to My Calendar" /
 *      "Print" / "Keep us on your schedule!" sections on the confirmation
 *      step — out of scope for the pre-event v1 flow.
 *   5. "My Account · Sign Out" header link on the confirmation step
 *      (we're our own auth surface; redirecting to Qgiv's account dashboard
 *      breaks the portal context).
 *
 * Strategy: walk the DOM, find elements whose own text matches one of the
 * target patterns AND whose direct text content (excluding children) is
 * short enough that hiding doesn't take a useful section with it. Run on
 * load AND on every DOM mutation so AJAX page transitions get cleaned.
 */

(function () {
  'use strict';

  // Patterns to find and hide. Each entry: [matcher, max_chars_in_match].
  // The max-chars guard prevents hiding entire pages when a target string
  // happens to appear inside long body copy.
  var KILL_PATTERNS = [
    { match: /powered by\s+bloomerang/i, maxLen: 80 },
    { match: /^\s*powered by\s*$/i,       maxLen: 30 },
    { match: /transaction is secure/i,    maxLen: 80 },
    // Event date-range like "Monday, 5/18/2026 - Wednesday, 6/10/2026"
    {
      match: /^\s*\w+,\s+\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\w+,\s+\d{1,2}\/\d{1,2}\/\d{4}\s*$/,
      maxLen: 80,
    },
    // Confirmation-step extras
    { match: /^\s*view auction items?\s*$/i, maxLen: 30 },
    { match: /^\s*manage ticket\s*$/i,       maxLen: 30 },
    { match: /^\s*add to my calendar\s*$/i,  maxLen: 40 },
    { match: /^\s*you'?re all set!?\s*$/i,   maxLen: 30 },
    { match: /^\s*keep us on your schedule!?\s*$/i, maxLen: 50 },
    { match: /need an event reminder/i,      maxLen: 80 },
    { match: /^\s*my account\s*[•·|]\s*sign out\s*$/i, maxLen: 40 },
  ];

  // Tags we never want to touch — root, head, scripts, etc.
  var SKIP_TAGS = {
    HTML: 1, HEAD: 1, BODY: 1, SCRIPT: 1, STYLE: 1, LINK: 1,
    META: 1, TITLE: 1, NOSCRIPT: 1,
  };

  // Get the element's direct text (not descendants' text).
  function directText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return t.trim();
  }

  // For confirmation-page sections that wrap a header + body + button:
  // walk up to find the visual "card" container and hide the whole thing.
  function findCardContainer(el) {
    var cur = el;
    for (var i = 0; i < 6; i++) {
      if (!cur || !cur.parentElement) break;
      cur = cur.parentElement;
      var bg = '';
      try {
        bg = window.getComputedStyle(cur).backgroundColor || '';
      } catch (e) {}
      // A card container generally has a non-transparent bg AND multiple
      // children. Stop when we find one.
      if (
        cur.children.length > 1 &&
        bg !== 'rgba(0, 0, 0, 0)' &&
        bg !== 'transparent' &&
        !SKIP_TAGS[cur.tagName]
      ) {
        return cur;
      }
    }
    return el;
  }

  function sweep(root) {
    var nodes = (root || document.body).querySelectorAll(
      'div, section, article, header, footer, aside, p, span, a, button, li, h1, h2, h3, h4'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (SKIP_TAGS[el.tagName]) continue;
      if (el.dataset && el.dataset.qgivSkinned === '1') continue;

      var direct = directText(el);
      if (!direct) continue;

      for (var p = 0; p < KILL_PATTERNS.length; p++) {
        var rule = KILL_PATTERNS[p];
        if (rule.match.test(direct) && direct.length <= rule.maxLen) {
          // For confirmation-page section headers (the "You're all set!" /
          // "Keep us on your schedule!" patterns), also hide the surrounding
          // card. For everything else, hide just the matched element.
          var target = /^you'?re all set|keep us on your schedule|need an event reminder/i.test(
            direct
          )
            ? findCardContainer(el)
            : el;
          target.style.display = 'none';
          target.dataset.qgivSkinned = '1';
          break;
        }
      }
    }
  }

  // Run once on initial load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      sweep();
    });
  } else {
    sweep();
  }

  // Watch for AJAX page transitions (Qgiv is a SPA — Step 1 → 2 → 3 doesn't
  // reload the page). Debounce so we don't sweep on every keystroke.
  var pending = null;
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      sweep();
    }, 80);
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
