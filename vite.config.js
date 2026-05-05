import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sponsor portal SPA. Production URL: gala.daviskids.org/sponsor/{token}
//
// `base: '/sponsor/'` means asset URLs in the served HTML reference
// /sponsor/assets/index-{hash}.js. The router uses basename: '/sponsor'
// to match. See src/portal/index.jsx.
//
// Build output goes to public/sponsor/ so the Pages CDN serves it
// alongside the other 4 static apps.
export default defineConfig({
  plugins: [react()],
  base: '/sponsor/',
  build: {
    outDir: 'public/sponsor',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
