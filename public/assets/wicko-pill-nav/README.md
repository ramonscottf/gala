# Wicko Pill Nav

The Foster ecosystem signature mobile navigation pattern.

A floating pill at the top of the page with a hamburger that morphs to X
in place. The menu drops below the pill as a card at the same width.
Optional accordion for sites with deep sub-page hierarchies.

## Files

- `wicko-pill-nav.css` — the component styles
- `wicko-pill-nav.js` — the toggle + accordion logic

## HTML structure

```html
<nav class="wpn" id="nav">
  <div class="wpn__inner">
    <a href="/" class="wpn__brand">
      <div class="wpn__brand-icon"><img src="/logo.svg" alt="Brand"></div>
    </a>

    <ul class="wpn__links">
      <!-- Flat link -->
      <li><a href="/about">About</a></li>

      <!-- Accordion group with sub-pages -->
      <li class="wpn__group">
        <div class="wpn__group-row">
          <a href="/impact">Impact</a>
          <button class="wpn__group-toggle" aria-label="Toggle Impact submenu">
            <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg>
          </button>
        </div>
        <ul class="wpn__sub">
          <li><a href="/impact/scholarships">Scholarships</a></li>
          <li><a href="/impact/grants">Grants</a></li>
        </ul>
      </li>

      <!-- Primary CTA (always last in the card on mobile) -->
      <li><a href="/donate" class="wpn__cta">Donate</a></li>
    </ul>

    <button class="wpn__toggle" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
```

## Theming per brand

Set the CSS variables on `:root` (or any ancestor):

```css
:root {
  /* DEF — navy + gold */
  --wpn-bg:           rgba(11, 27, 60, 0.85);
  --wpn-bg-scrolled:  rgba(11, 27, 60, 0.95);
  --wpn-fg:           #ffffff;
  --wpn-card-bg:      #f3f5f9;
  --wpn-cta-bg:       #f5a623;
  --wpn-cta-bg-hover: #e08e0e;
  --wpn-cta-fg:       #0b1b3c;
  --wpn-accent:       #f5a623;
}
```

Defaults match the Hires Big H cream + crimson palette.

## Install

```html
<link rel="stylesheet" href="/wicko-pill-nav.css?v=1">
<script src="/wicko-pill-nav.js?v=1" defer></script>
```

## Cache busting

Always purge Cloudflare's CDN cache for the CSS file when shipping
updates — the file is served `cache-control: immutable, max-age=1y` and
edges hold stale copies. Bump `?v=N` in the link tag *and* call the
zone purge API.

## Status

- v1.0 — built April 30, 2026 (Hires Big H is the reference implementation)
- DEF deployment: in progress
- Hires retro-fit to use this component: planned
