import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.PIXEL_HARBOR_BASE || '/',
  server: {
    port: 5183,
    strictPort: true,
    open: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
