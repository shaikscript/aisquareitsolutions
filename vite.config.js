import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Production builds target shared PHP hosting (InfinityFree).
 *
 * `viteSingleFile` inlines every script, stylesheet and font into a single
 * `index.html`, so the finished site is one HTML file plus the brand images.
 * That avoids uploading hashed bundles (and the shared-host quirks that come
 * with them) and makes redeploys a single-file copy.
 */
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
});
