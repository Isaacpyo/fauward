import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      SUPABASE_DB_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-16-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-16-chars'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'prisma/**',
        '**/*.d.ts',
        '**/index.ts',    // re-export barrel files
        'src/config/**',  // env config — no logic to test
        'src/server.ts',  // entry point — tested by integration
        'src/app.ts'      // app builder — tested by integration
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60
      }
    }
  },
  css: {
    postcss: {}
  }
});
