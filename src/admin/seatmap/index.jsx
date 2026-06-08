// Admin Seat Mover v2 — React island entry.
//
// Builds (via vite.seatmap.config.js) into a single IIFE at
// public/admin/seatmap/assets/seatmap.js, mounted by the host page
// public/admin/seatmap/v2.html:
//
//   <div id="seatmap-mount"></div>
//   <script src="/admin/seatmap/assets/seatmap.js"></script>
//
// Mirrors the sponsors island pattern. The live vanilla tool
// (index.html + app.js) is left untouched until this reaches parity.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { SeatmapApp } from './SeatmapApp.jsx';

function mount(el) {
  if (!el) {
    console.error('[GalaSeatmap] mount() called with no element');
    return;
  }
  const root = createRoot(el);
  root.render(<SeatmapApp />);
  return root;
}

function autoMount() {
  const el = document.getElementById('seatmap-mount');
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

window.GalaSeatmap = { mount };
