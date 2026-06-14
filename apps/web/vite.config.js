import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: import.meta.dirname,
  build: {
    outDir: '../../tmp/web-skeleton-dist',
    emptyOutDir: true
  }
});
