import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const STATUS_DASHBOARD_URL = process.env.STATUS_DASHBOARD_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'status-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/status' || req.url?.startsWith('/status/') || req.url?.startsWith('/status?')) {
            res.writeHead(302, { Location: STATUS_DASHBOARD_URL });
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/internal': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/relay': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
    }
  }
});
