import React from 'react';
import { createRoot } from 'react-dom/client';
import { SponsorsView } from './SponsorsView.jsx';
import './theme.css';

/**
 * Mounts the Sponsors React island into the given DOM element.
 * Called from public/admin/index.html:
 *
 *   <div id="sponsors-mount"></div>
 *   <script src="/admin/assets/sponsors.js"></script>
 *   <script>
 *     window.GalaSponsors.mount(document.getElementById('sponsors-mount'));
 *   </script>
 */
function mount(el) {
  if (!el) {
    console.error('[GalaSponsors] mount() called with no element');
    return;
  }
  const root = createRoot(el);
  root.render(<SponsorsView />);
  return root;
}

// Auto-mount if the placeholder exists at script load time.
function autoMount() {
  const el = document.getElementById('sponsors-mount');
  if (el && !el.dataset.mounted) {
    el.dataset.mounted = '1';
    mount(el);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
}

// Also expose for manual mount from the host page.
if (typeof window !== 'undefined') {
  window.GalaSponsors = { mount };
}

export { mount };
