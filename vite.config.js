import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sponsor portal SPA. Production URL: gala.daviskids.org/sponsor/{token}
//
// The gala repo's public/ directory holds 4 OTHER apps (admin/, review/,
// volunteer/, checkin/) that this Vite build must NOT touch. publicDir:
// false prevents Vite from copying anything from public/ into the SPA
// build output. The SPA assets land at public/sponsor/assets/* via outDir.
//
// base: '/sponsor/' means built HTML references /sponsor/assets/...
// matching the routing scheme. The router uses basename: '/sponsor'
// (set in src/main.jsx).
export default defineConfig({
  plugins: [react()],
  base: '/sponsor/',
  publicDir: false,
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
    proxy: {
      // Dev proxy → live functions on production domain so the SPA can
      // call /api/gala/portal/{token} etc. without running wrangler locally.
      '/api': {
        target: 'https://gala.daviskids.org',
        changeOrigin: true,
        secure: true,
      },
      '/data': {
        target: 'https://gala.daviskids.org',
        changeOrigin: true,
        secure: true,
      },
      '/assets': {
        target: 'https://gala.daviskids.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
