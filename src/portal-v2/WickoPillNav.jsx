// WickoPillNav — the Foster ecosystem signature floating pill nav,
// themed for portal-v2 navy. Adapted from `wicko-skills/brand/wicko-pill-nav.css`
// (the canonical Wicko pattern).
//
// Layout: 3-column grid in the pill — [logo] [wordmark centered] [hamburger].
// Hamburger is always visible (mobile + desktop). The drawer items route to
// real pages (URL changes, back button works), not modals.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function WickoPillNav({ token }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const path = location.pathname || '';
  const onHome =
    !path.endsWith('/faq') &&
    !path.endsWith('/settings') &&
    !path.endsWith('/seats');

  const goHome = (e) => {
    if (e) e.preventDefault();
    if (onHome) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(`/${token}`);
    }
  };

  const goTickets = (e) => {
    e.preventDefault();
    setOpen(false);
    if (onHome) {
      requestAnimationFrame(() => {
        const el = document.getElementById('p2-tickets');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      navigate(`/${token}`);
      setTimeout(() => {
        const el = document.getElementById('p2-tickets');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const goFaq = (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(`/${token}/faq`);
  };

  const goSettings = (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(`/${token}/settings`);
  };

  return (
    <nav className={`p2-wpn ${scrolled ? 'is-scrolled' : ''}`} aria-label="Portal navigation">
      <div className="wpn__inner">
        <a className="wpn__brand" href="#top" onClick={goHome} aria-label="To top">
          <span className="wpn__brand-icon">
            <img src="/assets/brand/def-logo-light.png" alt="Davis Education Foundation" />
          </span>
        </a>
        <span className="wpn__wordmark" aria-hidden="true">
          Lights · Camera · Take Action · 2026
        </span>
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
          <li><a href={`/${token}/faq`} onClick={goFaq}>FAQ</a></li>
          <li><a href={`/${token}/settings`} onClick={goSettings}>Settings</a></li>
        </ul>
      </div>
    </nav>
  );
}
