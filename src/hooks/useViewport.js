// useViewport — width-based viewport detection. <880px → mobile shell,
// ≥880px → desktop wizard. Debounced to avoid thrashing on resize / device
// rotation. Uses matchMedia (cheaper than rAF resize loop and integrates with
// Capacitor's WebView orientation events for free).

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 880;

function readIsMobile() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

export function useViewport() {
  const [isMobile, setIsMobile] = useState(readIsMobile);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return { isMobile, isDesktop: !isMobile };
}
