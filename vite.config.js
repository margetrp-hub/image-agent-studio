import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const devProxyTarget = process.env.VITE_DEV_SUB2API_PROXY_TARGET || process.env.SUB2API_BASE_URL || '';
const devProxy = devProxyTarget
  ? {
    '/v1': {
      target: devProxyTarget,
      changeOrigin: true,
      secure: true
    },
    '/api': {
      target: devProxyTarget,
      changeOrigin: true,
      secure: true
    },
    '/login': {
      target: devProxyTarget,
      changeOrigin: true,
      secure: true
    }
  }
  : undefined;

export default defineConfig({
  base: process.env.STUDIO_BASE_PATH || process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  publicDir: 'public',
  server: devProxy ? { proxy: devProxy } : undefined,
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsDir: 'studio-assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio.html')
      }
    }
  }
});
