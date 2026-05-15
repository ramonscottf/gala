import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Preview-only build. Produces a self-contained static page that mounts
// PortalShellV2 with mock data so we can screenshot the design without a
// live deploy. Output goes to /tmp/portal-v2-preview so it never lands in
// the production bundle.

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: '/tmp/portal-v2-preview',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'qa/preview-v2/index.html'),
      },
    },
  },
});
