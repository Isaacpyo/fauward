import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      all: false,
      exclude: [
        'src/modules/agent/**',
        'src/modules/notifications/**',
        'src/modules/tracking/history/**',
        'src/modules/tracking/ws/**',
        'src/modules/tracking/tracking.websocket.ts'
      ],
      thresholds: { lines: 60, functions: 60 }
    },
    env: {
      SUPABASE_DB_URL: 'postgresql://test:test@localhost:5432/test',
      SUPABASE_DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-16-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-16-chars',
      VERCEL_API_TOKEN: 'test-vercel-token',
      VERCEL_PORTAL_PROJECT_ID: 'prj_test_portal',
      VERCEL_API_BASE: 'https://api.vercel.test',
      RESERVED_DOMAINS: 'fauward.com,www.fauward.com,api.fauward.com,app.fauward.com'
    }
  },
  css: {
    postcss: {}
  }
});
