import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    env: {
      SUPABASE_DB_URL: 'postgresql://test:test@localhost:5432/test',
      SUPABASE_DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-16-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-16-chars'
    }
  },
  css: {
    postcss: {}
  }
});
