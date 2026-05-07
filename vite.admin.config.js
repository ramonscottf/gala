// Vite config for the admin marketing editor.
//
// Builds src/admin/editor-mount.js into public/admin/assets/editor.js as
// a self-contained IIFE so plain HTML scripts can do:
//
//   <script src="/admin/assets/editor.js"></script>
//
// and then call window.GalaEditor.mount(...) without any module loader.
//
// This is intentionally separate from vite.config.js (which builds the
// sponsor portal SPA into public/sponsor/). They write to different output
// dirs and never touch each other.

import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: false,                             // Don't copy public/* — outDir is inside it
  build: {
    outDir: 'public/admin/assets',
    emptyOutDir: false,                         // don't blow away other admin assets
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/admin/editor-mount.js'),
      name: 'GalaEditor',
      formats: ['iife'],
      fileName: () => 'editor.js',
    },
    rollupOptions: {
      output: {
        // Single self-contained file
        inlineDynamicImports: true,
      },
    },
  },
});
