// Vite config for the Admin Seat Mover v2 React island.
//
// Builds src/admin/seatmap/index.jsx into a single IIFE at
// public/admin/seatmap/assets/seatmap.js. emptyOutDir is false so the
// existing live tool (public/admin/seatmap/app.js, index.html) is NOT
// wiped — v2 ships alongside it until it reaches parity.
//
//   npx vite build --config vite.seatmap.config.js
//
// Mirrors vite.sponsors.config.js.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'public/admin/seatmap/assets',
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/admin/seatmap/index.jsx'),
      name: 'GalaSeatmap',
      formats: ['iife'],
      fileName: () => 'seatmap.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'seatmap.css';
          return 'seatmap.[ext]';
        },
      },
    },
  },
});
