import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const devProxyTarget = process.env.VITE_DEV_AI_GATEWAY_PROXY_TARGET
  || process.env.VITE_DEV_SUB2API_PROXY_TARGET
  || process.env.AI_GATEWAY_BASE_URL
  || process.env.SUB2API_BASE_URL
  || '';
const studioHistoryProxyTarget = process.env.VITE_STUDIO_HISTORY_PROXY_TARGET || process.env.STUDIO_HISTORY_BASE_URL || 'http://127.0.0.1:8787';
const devProxy = {
  '/studio-api': {
    target: studioHistoryProxyTarget,
    changeOrigin: true,
    secure: true
  },
  ...(devProxyTarget
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
    : {})
};

export default defineConfig({
  base: process.env.STUDIO_BASE_PATH || process.env.VITE_BASE_PATH,
  plugins: [react()],
  publicDir: 'public',
  server: { proxy: devProxy },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsDir: 'studio-assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio.html')
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react')) return 'vendor-react';
          if (id.includes('lucide-react') || id.includes('lucide')) return 'vendor-icons';
          return 'vendor';
        }
      }
    }
  }
});
