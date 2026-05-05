// useTheme — detect prefers-color-scheme so JS-controlled surfaces (the
// portal background gradient on mobile + desktop, the FullScreenMessage
// states) can swap to the light token set. CSS variables in styles.css
// already handle html/body and the simple cases; this hook is for the
// stylistic gradients that aren't expressible as a single CSS var.
//
// Does NOT swap the boarding-pass card (TicketHero) — that stays dark
// navy in both modes by design (it's an Apple Wallet-style ticket, not
// a chrome surface).

import { useEffect, useState } from 'react';

function readIsLight() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function useTheme() {
  const [isLight, setIsLight] = useState(readIsLight);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setIsLight(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return { isLight, isDark: !isLight };
}
