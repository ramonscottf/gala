// Vite config for the admin sponsors React island.
//
// Builds src/admin/sponsors/index.jsx into public/admin/assets/sponsors.js.
// CSS is injected at runtime by the entry point (index.jsx imports
// theme.css.js which is a JS module exporting the CSS string and
// injecting a <style> element on mount). This keeps the build to a
// single output file so the host page only needs ONE script tag.
//
//   <script src="/admin/assets/sponsors.js"></script>
//
// Pattern mirrors vite.admin.config.js (the Tiptap editor mount).

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
    outDir: 'public/admin/assets',
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/admin/sponsors/index.jsx'),
      name: 'GalaSponsors',
      formats: ['iife'],
      fileName: () => 'sponsors.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'sponsors.css';
          return 'sponsors.[ext]';
        },
      },
    },
  },
});
