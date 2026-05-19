import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5176,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/admin': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/internal': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
