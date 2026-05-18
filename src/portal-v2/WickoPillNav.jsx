// WickoPillNav — the Foster ecosystem signature floating pill nav,
// themed for portal-v2 navy. Adapted from `wicko-skills/brand/wicko-pill-nav.css`
// (the canonical Wicko pattern).
//
// Replaces the old BrandNav (top-left logo + "Annual Gala" + top-right SF
// monogram avatar). Top-left now carries the logo + "Lights · Camera · Take
// Action · 2026" wordmark; top-right is a hamburger that opens a drawer
// with Tickets / FAQ / Settings.
//
// Hamburger is always visible (mobile and desktop) per Scott's spec —
// the drawer is the single source of nav truth, not viewport-conditional.

import { useEffect, useState } from 'react';

export function WickoPillNav({ onOpenProfile, onOpenFaq }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close drawer on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const scrollToBrandTop = (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goTickets = (e) => {
    e.preventDefault();
    setOpen(false);
    // Defer scroll until the drawer-close transition begins so the
    // target rect is settled.
    requestAnimationFrame(() => {
      const el = document.getElementById('p2-tickets');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const goFaq = (e) => {
    e.preventDefault();
    setOpen(false);
    if (onOpenFaq) onOpenFaq();
  };

  const goSettings = (e) => {
    e.preventDefault();
    setOpen(false);
    if (onOpenProfile) onOpenProfile();
  };

  return (
    <nav className={`p2-wpn ${scrolled ? 'is-scrolled' : ''}`} aria-label="Portal navigation">
      <div className="wpn__inner">
        <a className="wpn__brand" href="#top" onClick={scrollToBrandTop} aria-label="To top">
          <span className="wpn__brand-icon">
            <img src="/assets/brand/def-logo-light.png" alt="Davis Education Foundation" />
          </span>
          <span className="wpn__brand-wordmark">Lights · Camera · Take Action · 2026</span>
        </a>
        <button
          className={`wpn__toggle ${open ? 'is-open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="p2-wpn-drawer"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <ul id="p2-wpn-drawer" className={`wpn__links ${open ? 'is-open' : ''}`}>
          <li><a href="#p2-tickets" onClick={goTickets}>Tickets</a></li>
          <li><a href="#faq" onClick={goFaq}>FAQ</a></li>
          <li><a href="#settings" onClick={goSettings}>Settings</a></li>
        </ul>
      </div>
    </nav>
  );
}
