import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const STATUS_DASHBOARD_URL = process.env.STATUS_DASHBOARD_URL ?? 'http://localhost:4000';
// Console build info for the Releases page (platform.flags, WP-4.1). Vercel sets VERCEL_GIT_COMMIT_SHA.
// The build time is stamped only by `vite build`: a value that changes on every dev start would change Vite's
// dependency-optimiser hash and force a full re-bundle each time.
const GIT_COMMIT = process.env.VITE_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '';

export default defineConfig(({ command }) => ({
  define: {
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(GIT_COMMIT),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(process.env.VITE_BUILD_TIME ?? (command === 'build' ? new Date().toISOString() : ''))
  },
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
}));
